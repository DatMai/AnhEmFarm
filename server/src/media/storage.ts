import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AppConfig } from '../config.js';

const KEY = /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
export function validMediaKey(key: string): boolean { return KEY.test(key); }
function checkKey(key: string): void { if (!validMediaKey(key)) throw new Error('Invalid media key'); }
export interface StoredObject { key: string; modifiedAt: Date }
export interface Storage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  list(): Promise<StoredObject[]>;
  publicUrl(key: string): string;
}

export class LocalStorage implements Storage {
  private readonly root: string;
  constructor(directory: string) { this.root = resolve(directory); }
  private path(key: string): string {
    checkKey(key);
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid media path');
    return path;
  }
  private async checkDirectory(): Promise<void> {
    const directory = join(this.root, 'products');
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid media directory');
  }
  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    if (contentType !== 'image/webp') throw new Error('Invalid media type');
    const path = this.path(key);
    await mkdir(join(this.root, 'products'), { recursive: true });
    await this.checkDirectory();
    await writeFile(path, bytes, { flag: 'wx', mode: 0o644 });
  }
  async delete(key: string): Promise<void> { await this.checkDirectory(); await rm(this.path(key), { force: true }); }
  async read(key: string): Promise<Buffer> {
    await this.checkDirectory();
    if (!(await lstat(this.path(key))).isFile()) throw new Error('Invalid media object');
    return readFile(this.path(key));
  }
  async list(): Promise<StoredObject[]> {
    const directory = join(this.root, 'products');
    let names: string[];
    try { await this.checkDirectory(); names = await readdir(directory); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const objects: StoredObject[] = [];
    for (const name of names) {
      const key = `products/${name}`;
      if (!validMediaKey(key)) continue;
      const info = await lstat(this.path(key));
      if (info.isFile()) objects.push({ key, modifiedAt: info.mtime });
    }
    return objects;
  }
  publicUrl(key: string): string { checkKey(key); return `/api/v1/media/${key}`; }
}

export class S3Storage implements Storage {
  private readonly client: S3Client;
  constructor(private readonly bucket: string, endpoint?: string) {
    this.client = new S3Client({ ...(endpoint ? { endpoint, forcePathStyle: true } : {}) });
  }
  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    checkKey(key);
    if (contentType !== 'image/webp') throw new Error('Invalid media type');
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }));
  }
  async delete(key: string): Promise<void> {
    checkKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async read(key: string): Promise<Buffer> {
    checkKey(key);
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error('Media object is empty');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async list(): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let continuationToken: string | undefined;
    do {
      const result = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: 'products/', ContinuationToken: continuationToken }));
      for (const item of result.Contents ?? []) {
        if (item.Key && item.LastModified && validMediaKey(item.Key)) objects.push({ key: item.Key, modifiedAt: item.LastModified });
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
  }
  publicUrl(key: string): string { checkKey(key); return `/api/v1/media/${key}`; }
}

export const MEDIA_STORAGE = 'MEDIA_STORAGE';
export function createStorage(config: AppConfig): Storage {
  return config.mode === 'production'
    ? new S3Storage(config.storage.bucket, config.storage.endpoint || undefined)
    : new LocalStorage(config.storage.localDir || resolve(process.cwd(), 'uploads'));
}
