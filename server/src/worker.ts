import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readConfig } from './config.js';
import { EmailWorker } from './email/email.worker.js';

const app = await NestFactory.createApplicationContext(AppModule.register(readConfig()), { logger: false });
const worker = app.get(EmailWorker);
let running = true;
process.on('SIGTERM', () => { running = false; });
process.on('SIGINT', () => { running = false; });
try {
  while (running) {
    await worker.tick();
    if (running) await new Promise(resolve => setTimeout(resolve, 5000));
  }
} finally { await app.close(); }
