import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';
import type { RatePolicies } from './http/security.middleware.js';

export const APP_CONFIG = 'APP_CONFIG';

const environment = z.object({
  APP_MODE: z.enum(['development', 'test', 'production']).default('development'),
  APP_ORIGIN: z.url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().default(''),
  EMAIL_PAYLOAD_KEY: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_FROM: z.string().default(''),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  STORAGE_BUCKET: z.string().default(''),
  STORAGE_ENDPOINT: z.string().default(''),
  STORAGE_LOCAL_DIR: z.string().default(''),
  SALES_ENABLED: z.enum(['true', 'false']).default('false'),
  DEMO_ENABLED: z.enum(['true', 'false']).default('false'),
  TRUSTED_PROXY_ADDRESS: z.string().default(''),
  RATE_LOGIN_PAIR: z.coerce.number().int().positive().default(10),
  RATE_LOGIN_IP: z.coerce.number().int().positive().default(60),
  RATE_REGISTRATION_IP: z.coerce.number().int().positive().default(10),
  RATE_EMAIL_ACCOUNT: z.coerce.number().int().positive().default(3),
  RATE_EMAIL_IP: z.coerce.number().int().positive().default(20),
});

export interface AppConfig {
  mode: 'development' | 'test' | 'production';
  origin: string;
  databaseUrl: string;
  sessionSecret: string;
  emailPayloadKey: string;
  smtp: { host: string; port: number; from?: string; user?: string; password?: string };
  storage: { bucket: string; endpoint: string; localDir?: string };
  salesEnabled: boolean;
  demoEnabled: boolean;
  trustedProxyAddress?: string;
  ratePolicies?: Partial<RatePolicies>;
}

const applicationConfig = z.object({
  mode: z.enum(['development', 'test', 'production']),
  origin: z.url(),
  databaseUrl: z.url().refine(value => value.startsWith('postgres://') || value.startsWith('postgresql://')),
  sessionSecret: z.string(),
  emailPayloadKey: z.string(),
  smtp: z.object({ host: z.string(), port: z.number().int().min(1).max(65535), from: z.string().optional(),
    user: z.string().optional(), password: z.string().optional() }),
  storage: z.object({ bucket: z.string(), endpoint: z.string(), localDir: z.string().optional() }),
  salesEnabled: z.boolean(),
  demoEnabled: z.boolean(),
  trustedProxyAddress: z.string().optional(),
  ratePolicies: z.record(z.string(), z.object({ limit: z.number().int().positive(), windowMs: z.number().int().min(1000) })).optional(),
});

export function validateConfig(config: AppConfig): AppConfig {
  if (!applicationConfig.safeParse(config).success) {
    throw new Error('Invalid configuration');
  }
  if (Boolean(config.smtp.user) !== Boolean(config.smtp.password)) throw new Error('Invalid SMTP credentials');
  if (config.mode === 'production' &&
    (!config.origin.startsWith('https://') || config.demoEnabled ||
     config.sessionSecret.length < 32 || config.emailPayloadKey.length < 32 ||
     !config.smtp.host || !config.smtp.from || !config.storage.bucket || !isIP(config.trustedProxyAddress ?? ''))) {
    throw new Error('Invalid production configuration');
  }
  return config;
}

export function readConfig(): AppConfig {
  loadDotEnv({ path: resolve(process.cwd(), '../.env.dev'), quiet: true });
  const env = environment.parse(process.env);
  return validateConfig({
    mode: env.APP_MODE,
    origin: env.APP_ORIGIN,
    databaseUrl: env.DATABASE_URL,
    sessionSecret: env.SESSION_SECRET,
    emailPayloadKey: env.EMAIL_PAYLOAD_KEY,
    smtp: { host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.SMTP_FROM,
      user: env.SMTP_USER, password: env.SMTP_PASSWORD },
    storage: { bucket: env.STORAGE_BUCKET, endpoint: env.STORAGE_ENDPOINT, localDir: env.STORAGE_LOCAL_DIR || undefined },
    salesEnabled: env.SALES_ENABLED === 'true',
    demoEnabled: env.DEMO_ENABLED === 'true',
    trustedProxyAddress: env.TRUSTED_PROXY_ADDRESS || undefined,
    ratePolicies: {
      loginPair: { limit: env.RATE_LOGIN_PAIR, windowMs: 15 * 60_000 },
      loginIp: { limit: env.RATE_LOGIN_IP, windowMs: 15 * 60_000 },
      registrationIp: { limit: env.RATE_REGISTRATION_IP, windowMs: 60 * 60_000 },
      emailAccount: { limit: env.RATE_EMAIL_ACCOUNT, windowMs: 60 * 60_000 },
      emailIp: { limit: env.RATE_EMAIL_IP, windowMs: 60 * 60_000 },
    },
  });
}
