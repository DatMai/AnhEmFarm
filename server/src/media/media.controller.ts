import { Controller, Get, Header, Module, Param, Post, Req, Res, UseGuards, PayloadTooLargeException,
  UnprocessableEntityException } from '@nestjs/common';
import Busboy from 'busboy';
import type { Request, Response } from 'express';
import type { ActorRequest } from '../identity/auth.guard.js';
import { AdminGuard } from '../identity/admin.guard.js';
import { MAX_IMAGE_BYTES, MediaService } from './media.service.js';
import { IdentityModule } from '../identity/identity.module.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { createStorage, MEDIA_STORAGE } from './storage.js';

async function readMultipart(request: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Allow a small envelope for multipart headers, but never buffer an unbounded body.
    const maxBodyBytes = MAX_IMAGE_BYTES + 64 * 1024;
    if (Number(request.header('content-length')) > maxBodyBytes) {
      reject(new PayloadTooLargeException('Image exceeds 5 MB.'));
      return;
    }
    let parser: ReturnType<typeof Busboy>;
    try { parser = Busboy({ headers: request.headers, limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } }); }
    catch { reject(new UnprocessableEntityException('Submit one image file.')); return; }
    const chunks: Buffer[] = [];
    let files = 0;
    let tooLarge = false;
    let invalid = false;
    let received = 0;
    request.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBodyBytes && !tooLarge) {
        tooLarge = true;
        chunks.length = 0;
        request.unpipe(parser);
        parser.destroy();
        request.resume();
        reject(new PayloadTooLargeException('Image exceeds 5 MB.'));
      }
    });
    parser.on('file', (field, file) => {
      files++;
      if (field !== 'file') invalid = true;
      file.on('data', chunk => { if (!tooLarge && !invalid) chunks.push(chunk); });
      file.on('limit', () => { tooLarge = true; chunks.length = 0; });
    });
    parser.on('filesLimit', () => { invalid = true; });
    parser.on('fieldsLimit', () => { invalid = true; });
    parser.on('partsLimit', () => { invalid = true; });
    parser.on('error', () => reject(new UnprocessableEntityException('Malformed image upload.')));
    request.on('aborted', () => reject(new UnprocessableEntityException('Incomplete image upload.')));
    parser.on('close', () => {
      if (tooLarge) reject(new PayloadTooLargeException('Image exceeds 5 MB.'));
      else if (invalid || files !== 1) reject(new UnprocessableEntityException('Submit one image file.'));
      else resolve(Buffer.concat(chunks));
    });
    request.pipe(parser);
  });
}

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('admin/media')
  @UseGuards(AdminGuard)
  async upload(@Req() request: ActorRequest) {
    return this.media.upload(request.actor!, await readMultipart(request));
  }

  @Get('media/products/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async get(@Param('filename') filename: string, @Res() response: Response): Promise<void> {
    const bytes = await this.media.read(`products/${filename}`);
    response.type('image/webp').send(bytes);
  }
}

@Module({ imports: [IdentityModule], controllers: [MediaController], providers: [MediaService,
  { provide: MEDIA_STORAGE, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createStorage(config) }],
  exports: [MediaService] })
export class MediaModule {}
