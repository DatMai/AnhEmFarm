import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readConfig } from './config.js';
import { EmailWorker } from './email/email.worker.js';
import { MediaService } from './media/media.service.js';
import { RateLimitService } from './identity/rate-limit.service.js';

const app = await NestFactory.createApplicationContext(AppModule.register(readConfig()), { logger: false });
const worker = app.get(EmailWorker);
const media = app.get(MediaService);
const rateLimit = app.get(RateLimitService);
let nextMediaCleanup = 0;
let running = true;
process.on('SIGTERM', () => { running = false; });
process.on('SIGINT', () => { running = false; });
try {
  while (running) {
    await worker.tick();
    if (Date.now() >= nextMediaCleanup) {
      try { await media.cleanupOrphans(); }
      catch { process.stderr.write(JSON.stringify({ level: 'error', event: 'media_orphan_scan_failed' }) + '\n'); }
      try { await rateLimit.pruneExpired(); }
      catch { process.stderr.write(JSON.stringify({ level: 'error', event: 'rate_bucket_cleanup_failed' }) + '\n'); }
      nextMediaCleanup = Date.now() + 60 * 60_000;
    }
    if (running) await new Promise(resolve => setTimeout(resolve, 5000));
  }
} finally { await app.close(); }
