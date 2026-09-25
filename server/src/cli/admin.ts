import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { Pool } from 'pg';
import { argon2id, hash } from 'argon2';
import { readConfig } from '../config.js';
import { normalizedEmail } from '../identity/identity.service.js';

type Options = { command: 'create' | 'grant'; email: string; name?: string; actorEmail?: string; passwordFile?: string };

export function parseAdminArgs(argv: string[]): Options {
  const [command, ...rest] = argv;
  if (command !== 'create' && command !== 'grant') throw new Error('Usage: admin create|grant --email ADDRESS [--name NAME] [--actor-email ADDRESS] [--password-file PATH]');
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!flag || !['--email', '--name', '--actor-email', '--password-file'].includes(flag) ||
      !rest[index + 1] || rest[index + 1].startsWith('--') || values.has(flag)) throw new Error('Invalid admin arguments; passwords are never accepted on the command line.');
    values.set(flag, rest[index + 1]);
  }
  const email = values.get('--email');
  if (!email) throw new Error('Email is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    (values.get('--actor-email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.get('--actor-email')!))) throw new Error('Valid email addresses are required.');
  if (command === 'create' && (!values.get('--name') || values.has('--actor-email'))) throw new Error('Create requires a name and no actor email.');
  if (command === 'grant' && (!values.get('--actor-email') || values.has('--password-file') || values.has('--name'))) throw new Error('Grant requires an actor email.');
  return { command, email: normalizedEmail(email), name: values.get('--name'), actorEmail: values.get('--actor-email'), passwordFile: values.get('--password-file') };
}

export function validateAdminPassword(password: string): void {
  if (password.length < 12 || password.length > 128 ||
    ['password', 'admin', 'changeme', 'example-test-password-2026!'].includes(password.toLowerCase()) ||
    /^(.)(\1){11,}$/.test(password)) throw new Error('Choose a unique password of 12–128 characters.');
}

async function readHiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Use a hidden TTY or --password-file.');
  const input = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write('Admin password: ');
  execFileSync('stty', ['-echo'], { stdio: ['inherit', 'ignore', 'ignore'] });
  try { return (await input.question('')).trimEnd(); }
  finally { execFileSync('stty', ['echo'], { stdio: ['inherit', 'ignore', 'ignore'] }); process.stdout.write('\n'); input.close(); }
}

export async function executeAdmin(db: PrismaClient, options: Options, password?: string): Promise<void> {
  if (options.command === 'create') {
    if (!password) throw new Error('Password is required.');
    validateAdminPassword(password);
    const passwordHash = await hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    await db.$transaction(async tx => {
      // Bootstrap is allowed exactly once. Subsequent elevation uses audited grant.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(417, 1)`;
      const admins = await tx.user.count({ where: { role: 'ADMIN' } });
      if (admins !== 0) throw new Error('An administrator already exists; use grant.');
      const user = await tx.user.create({ data: { email: options.email, name: options.name!, passwordHash, role: 'ADMIN', verifiedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'ADMIN_BOOTSTRAP', targetType: 'User', targetId: user.id,
        changesJson: { role: 'ADMIN', method: 'operational_cli' } } });
    });
    return;
  }
  await db.$transaction(async tx => {
    const actorBeforeLock = await tx.user.findUnique({ where: { email: normalizedEmail(options.actorEmail!) } });
    const targetBeforeLock = await tx.user.findUnique({ where: { email: options.email } });
    if (!actorBeforeLock || !targetBeforeLock) throw new Error('Accounts not found.');
    const ids = [actorBeforeLock.id, targetBeforeLock.id].sort();
    await tx.$queryRaw`SELECT id FROM users WHERE id::text IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: actorBeforeLock.id } });
    if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw new Error('Active administrator required.');
    const target = await tx.user.findUnique({ where: { id: targetBeforeLock.id } });
    if (!target || target.status !== 'ACTIVE') throw new Error('Active target account required.');
    if (target.role === 'ADMIN') throw new Error('Account is already an administrator.');
    await tx.user.update({ where: { id: target.id }, data: { role: 'ADMIN', authVersion: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'ADMIN_GRANTED', targetType: 'User', targetId: target.id,
      changesJson: { fromRole: 'CUSTOMER', toRole: 'ADMIN', method: 'operational_cli' } } });
  });
}

async function main(): Promise<void> {
  const options = parseAdminArgs(process.argv.slice(2));
  const config = readConfig();
  const password = options.command === 'create' ? options.passwordFile
    ? (await readFile(options.passwordFile, 'utf8')).trimEnd() : await readHiddenPassword() : undefined;
  const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: config.databaseUrl })) });
  try { await executeAdmin(db, options, password); process.stdout.write('Administrator operation completed.\n'); }
  finally { await db.$disconnect(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Administrator operation failed.'}\n`); process.exitCode = 1; });
}
