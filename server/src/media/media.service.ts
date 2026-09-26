import { randomUUID } from 'node:crypto';
import { Inject, Injectable, PayloadTooLargeException, UnprocessableEntityException, ForbiddenException,
  NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../db/prisma.service.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import { MEDIA_STORAGE, type Storage, validMediaKey } from './storage.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;

@Injectable()
export class MediaService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService,
    @Inject(MEDIA_STORAGE) private readonly storage: Storage) {}

  private async assertAdmin(actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    await this.db.$transaction(async tx => {
      await this.identity.assertActiveActor(tx, actor);
      const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } });
      if (user?.role !== 'ADMIN') throw new ForbiddenException();
    });
  }

  async upload(actor: Actor, input: Buffer): Promise<{ id: string; url: string; width: number; height: number; illustrative: boolean }> {
    await this.assertAdmin(actor);
    if (input.length > MAX_IMAGE_BYTES) throw new PayloadTooLargeException();
    let bytes: Buffer;
    let width: number;
    let height: number;
    try {
      const source = sharp(input, { limitInputPixels: MAX_PIXELS, animated: false, failOn: 'error' });
      const metadata = await source.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1 ||
        !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) {
        throw new UnprocessableEntityException('Use a single JPEG, PNG, or WebP image under 25 million pixels.');
      }
      const output = await source.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      bytes = output.data;
      width = output.info.width;
      height = output.info.height;
    } catch {
      throw new UnprocessableEntityException('Use a valid JPEG, PNG, or WebP image under 25 million pixels.');
    }
    await this.assertAdmin(actor);
    const key = `products/${randomUUID()}.webp`;
    await this.storage.put(key, bytes, 'image/webp');
    try {
      const row = await this.db.$transaction(async tx => {
        await this.identity.assertActiveActor(tx, actor);
        const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } });
        if (user?.role !== 'ADMIN') throw new ForbiddenException();
        return tx.media.create({ data: { objectKey: key, mime: 'image/webp', width, height, illustrative: false } });
      });
      return { id: row.id, url: this.storage.publicUrl(key), width, height, illustrative: row.illustrative };
    } catch (error) {
      try { await this.storage.delete(key); }
      catch { process.stderr.write(JSON.stringify({ level: 'error', event: 'media_orphan_cleanup_failed', objectKey: key }) + '\n'); }
      throw error;
    }
  }

  async read(key: string, actor?: Actor): Promise<{ bytes: Buffer; public: boolean }> {
    if (!validMediaKey(key)) throw new NotFoundException();
    const row = await this.db.media.findUnique({ where: { objectKey: key }, select: { id: true,
      products: { where: { product: { status: 'PUBLISHED' } }, select: { id: true }, take: 1 } } });
    if (!row) throw new NotFoundException();
    const isPublic = row.products.length > 0;
    if (!isPublic) {
      if (!actor || actor.role !== 'ADMIN') throw new NotFoundException();
      await this.assertAdmin(actor);
    }
    try { return { bytes: await this.storage.read(key), public: isPublic }; }
    catch { throw new NotFoundException(); }
  }

  /** Retry cleanup for unreferenced objects after an upload/database failure. Run from the worker. */
  async cleanupOrphans(now = new Date()): Promise<number> {
    const threshold = now.getTime() - 60 * 60_000;
    let removed = 0;
    for (const object of await this.storage.list()) {
      if (object.modifiedAt.getTime() > threshold) continue;
      if (await this.db.media.findUnique({ where: { objectKey: object.key }, select: { id: true } })) continue;
      try { await this.storage.delete(object.key); removed++; }
      catch { process.stderr.write(JSON.stringify({ level: 'error', event: 'media_orphan_cleanup_failed', objectKey: object.key }) + '\n'); }
    }
    return removed;
  }
}
