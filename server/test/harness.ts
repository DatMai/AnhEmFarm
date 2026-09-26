import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { INestApplication, Type } from '@nestjs/common';
import { config as loadDotEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createApp } from '../src/main.js';
import { readConfig, type AppConfig } from '../src/config.js';

export interface Harness {
  baseUrl: string;
  origin: string;
  db: PrismaClient;
  resolve<T>(token: Type<T>): T;
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: any; headers: Headers }>;
  client(): Client;
  close(): Promise<void>;
}

export interface Client { request: Harness['request'] }

export async function startHarness(overrides: Partial<AppConfig> = {}): Promise<Harness> {
  loadDotEnv({ path: resolve(process.cwd(), '../.env.dev'), quiet: true });
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.slice(1).endsWith('_test')) {
    throw new Error('Integration tests require a database ending in _test');
  }
  const config: AppConfig = { ...readConfig(), mode: 'test', ...overrides, databaseUrl };
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
  const harness: Harness = {
    baseUrl,
    origin: config.origin,
    db,
    resolve<T>(token: Type<T>): T { return app.get(token); },
    client() {
      const cookies = new Map<string, string>();
      let csrfToken = '';
      const capture = (headers: Headers) => {
        for (const cookie of headers.getSetCookie()) {
          const pair = cookie.split(';', 1)[0];
          const index = pair.indexOf('=');
          if (index < 0) continue;
          const name = pair.slice(0, index);
          const value = pair.slice(index + 1);
          if (value) cookies.set(name, value);
          else {
            cookies.delete(name);
            if (name === 'aef_session') csrfToken = '';
          }
        }
      };
      const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
      const refreshCsrf = async () => {
        const result = await harness.request('GET', '/api/v1/auth/csrf', undefined, cookies.size ? { Cookie: cookieHeader() } : {});
        capture(result.headers);
        csrfToken = result.status === 200 ? result.body.token : '';
      };
      return { async request(method, path, body, headers = {}) {
        const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
        if (unsafe && !csrfToken) await refreshCsrf();
        const finalHeaders = { ...(cookies.size ? { Cookie: cookieHeader() } : {}),
          ...(unsafe ? { Origin: config.origin, 'X-CSRF-Token': csrfToken } : {}), ...headers };
        const result = await harness.request(method, path, body, finalHeaders);
        capture(result.headers);
        if (method.toUpperCase() === 'GET' && path === '/api/v1/auth/csrf') csrfToken = result.status === 200 ? result.body.token : '';
        if (unsafe && ['/api/v1/auth/login', '/api/v1/auth/logout'].includes(path) && result.status < 300) {
          csrfToken = '';
          await refreshCsrf();
        }
        return result;
      } };
    },
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
  return harness;
}
