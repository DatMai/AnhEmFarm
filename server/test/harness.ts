import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { INestApplication, Type } from '@nestjs/common';
import { config as loadDotEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createApp } from '../src/main.js';
import { readConfig } from '../src/config.js';

export interface Harness {
  baseUrl: string;
  db: PrismaClient;
  resolve<T>(token: Type<T>): T;
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: any; headers: Headers }>;
  close(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  loadDotEnv({ path: resolve(process.cwd(), '../.env.dev'), quiet: true });
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.slice(1).endsWith('_test')) {
    throw new Error('Integration tests require a database ending in _test');
  }
  const config = { ...readConfig(), mode: 'test' as const, databaseUrl };
  const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 5000 })) });
  let app: INestApplication | undefined;
  try {
    app = await createApp(config);
    await app.listen(0, '127.0.0.1');
  } catch (error) {
    await app?.close();
    await db.$disconnect();
    throw error;
  }
  if (!app) throw new Error('Application did not initialize');
  const server = app.getHttpServer() as Server;
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    db,
    resolve<T>(token: Type<T>): T { return app.get(token); },
    async request(method, path, body, headers = {}) {
      const response = await fetch(new URL(path, baseUrl), {
        method,
        headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      const raw = await response.text();
      let parsed: unknown = null;
      if (raw) {
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
      }
      return { status: response.status, body: parsed, headers: response.headers };
    },
    async close() {
      await app.close();
      if (server.listening) {
        await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      }
      await db.$disconnect();
    },
  };
}
