import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { MediaService } from '../src/media/media.service.js';
import { LocalStorage, type Storage } from '../src/media/storage.js';

const fixture = (name: string) => readFile(resolve('test/fixtures/media', name));

describe('media upload', () => {
  let h: Harness;
  let scenario: Scenario;
  beforeAll(async () => { h = await startHarness(); scenario = await seedScenario(h.db); });
  afterAll(async () => { await h?.close(); });

  async function session(email: string, password: string) {
    const csrf = await h.request('GET', '/api/v1/auth/csrf');
    const anonymousCookie = csrf.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const login = await h.request('POST', '/api/v1/auth/login', { email, password },
      { Cookie: anonymousCookie, Origin: 'http://127.0.0.1:5173', 'X-CSRF-Token': csrf.body.token });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).find(value => value.startsWith('aef_session='))!;
    const token = await h.request('GET', '/api/v1/auth/csrf', undefined, { Cookie: cookie });
    return { cookie, token: token.body.token };
  }

  async function upload(bytes: Buffer, credentials?: { cookie: string; token: string }, mime = 'image/png') {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), 'image.png');
    const response = await fetch(`${h.baseUrl}/api/v1/admin/media`, { method: 'POST', body: form,
      headers: { Origin: 'http://127.0.0.1:5173', ...(credentials ? { Cookie: credentials.cookie,
        'X-CSRF-Token': credentials.token } : {}) } });
    return { status: response.status, body: await response.json() };
  }

  it('requires a session and ADMIN before reading multipart content', async () => {
    const valid = await fixture('valid.png');
    const csrf = await h.request('GET', '/api/v1/auth/csrf');
    const anonymousCookie = csrf.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    expect((await upload(valid, { cookie: anonymousCookie, token: csrf.body.token })).status).toBe(401);
    const customer = await session(scenario.customer.email, scenario.customer.password);
    expect((await upload(valid, customer)).status).toBe(403);
    const admin = await session(scenario.admin.email, scenario.admin.password);
    expect((await upload(valid, { ...admin, token: '0'.repeat(64) })).status).toBe(403);
  });

  it('rejects over 5 MB while streaming and ignores claimed MIME', async () => {
    const admin = await session(scenario.admin.email, scenario.admin.password);
    expect((await upload(Buffer.alloc(5 * 1024 * 1024 + 1), admin)).status).toBe(413);
    expect((await upload(await fixture('malformed.bin'), admin)).status).toBe(422);
  });

  it('rejects enormous dimensions before storage or DB writes', async () => {
    const media = h.resolve(MediaService);
    const before = await h.db.media.count();
    await expect(media.upload({ id: scenario.admin.id, role: 'ADMIN', authVersion: 1 }, await fixture('pixel-bomb.png')))
      .rejects.toMatchObject({ status: 422 });
    expect(await h.db.media.count()).toBe(before);
  });

  it('accepts PNG and WebP bytes and rejects animated WebP', async () => {
    const media = h.resolve(MediaService);
    const actor = { id: scenario.admin.id, role: 'ADMIN' as const, authVersion: 1 };
    const before = await h.db.media.count();
    const png = await media.upload(actor, await fixture('valid.png'));
    const webp = await media.upload(actor, await sharp(await fixture('valid.png')).webp().toBuffer());
    expect([png.width, png.height, webp.width, webp.height]).toEqual([2, 2, 2, 2]);
    await expect(media.upload(actor, await fixture('animated.webp'))).rejects.toMatchObject({ status: 422 });
    expect(await h.db.media.count()).toBe(before + 2);
  });

  it('reencodes JPEG without EXIF and persists generated object metadata', async () => {
    const admin = await session(scenario.admin.email, scenario.admin.password);
    const result = await upload(await fixture('exif.jpg'), admin, 'image/jpeg');
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ width: 2, height: 2, illustrative: false });
    const row = await h.db.media.findUniqueOrThrow({ where: { id: result.body.id } });
    expect(row.objectKey).toMatch(/^products\/[0-9a-f-]{36}\.webp$/);
    expect(row.mime).toBe('image/webp');
    const image = await fetch(new URL(result.body.url, h.baseUrl));
    expect(image.status).toBe(200);
    const processed = sharp(Buffer.from(await image.arrayBuffer()));
    const metadata = await processed.metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects stale admin actor before storage writes', async () => {
    const media = h.resolve(MediaService);
    const user = await h.db.user.findUniqueOrThrow({ where: { id: scenario.admin.id } });
    const stale = await h.db.user.create({ data: { email: `media-${randomUUID()}@example.test`,
      passwordHash: user.passwordHash, name: 'Stale media admin', role: 'ADMIN', status: 'SUSPENDED' } });
    await expect(media.upload({ id: stale.id, role: 'ADMIN', authVersion: stale.authVersion }, await fixture('valid.png')))
      .rejects.toMatchObject({ status: 401 });
  });

  it('deletes an object if the database rejects publication and retries old orphans', async () => {
    const media = h.resolve(MediaService);
    const storage = (media as unknown as { storage: Storage }).storage;
    const user = await h.db.user.findUniqueOrThrow({ where: { id: scenario.admin.id } });
    const actorUser = await h.db.user.create({ data: { email: `media-orphan-${randomUUID()}@example.test`,
      passwordHash: user.passwordHash, name: 'Media orphan admin', role: 'ADMIN', status: 'ACTIVE' } });
    const actor = { id: actorUser.id, role: 'ADMIN' as const, authVersion: actorUser.authVersion };
    const originalPut = storage.put.bind(storage);
    const originalDelete = storage.delete.bind(storage);
    const written: string[] = [];
    const deleted: string[] = [];
    storage.put = async (key, bytes, type) => {
      await originalPut(key, bytes, type);
      written.push(key);
      await h.db.user.update({ where: { id: actor.id }, data: { status: 'SUSPENDED' } });
    };
    storage.delete = async key => { deleted.push(key); await originalDelete(key); };
    const before = await h.db.media.count();
    try {
      await expect(media.upload(actor, await fixture('valid.png'))).rejects.toMatchObject({ status: 401 });
      expect(written).toHaveLength(1);
      expect(deleted).toEqual(written);
      expect(await h.db.media.count()).toBe(before);
      await expect(storage.read(written[0])).rejects.toThrow();
      const orphan = `products/${randomUUID()}.webp`;
      await originalPut(orphan, await sharp(await fixture('valid.png')).webp().toBuffer(), 'image/webp');
      expect(await media.cleanupOrphans(new Date(Date.now() + 61 * 60_000))).toBeGreaterThanOrEqual(1);
      await expect(storage.read(orphan)).rejects.toThrow();
    } finally {
      storage.put = originalPut;
      storage.delete = originalDelete;
    }
  });

  it('accepts only generated local keys and refuses a symlinked media directory', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'aef-media-'));
    const outside = await mkdtemp(resolve(tmpdir(), 'aef-outside-'));
    const storage = new LocalStorage(root);
    try {
      await expect(storage.put('../escape.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow('Invalid media key');
      await symlink(outside, resolve(root, 'products'));
      await expect(storage.put(`products/${randomUUID()}.webp`, Buffer.from('x'), 'image/webp'))
        .rejects.toThrow('Invalid media directory');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
