import { Injectable, UnauthorizedException } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { type Actor, SessionService } from './session.service.js';

export interface PublicUser { id: string; email: string; name: string; role: 'CUSTOMER' | 'ADMIN'; verified: boolean }
export interface Credentials { email: string; password: string }
export interface Registration extends Credentials { name: string }
const hashOptions = { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
export const normalizedEmail = (email: string): string => email.trim().toLowerCase();
export const publicUser = (user: User): PublicUser => ({ id: user.id, email: user.email, name: user.name, role: user.role, verified: user.verifiedAt !== null });

@Injectable()
export class IdentityService {
  constructor(private readonly db: PrismaService, private readonly sessions: SessionService, private readonly csrf: CsrfGuard) {}

  async register(input: Registration): Promise<void> {
    const email = normalizedEmail(input.email);
    const passwordHash = await hash(input.password, hashOptions);
    try {
      await this.db.user.create({ data: { email, name: input.name.trim(), passwordHash, role: 'CUSTOMER' } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }

  async login(input: Credentials): Promise<{ rawSession: string; csrfToken: string; user: PublicUser }> {
    const user = await this.db.user.findUnique({ where: { email: normalizedEmail(input.email) } });
    if (!user) {
      await hash(input.password, hashOptions);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    const valid = await verify(user.passwordHash, input.password);
    if (!valid || user.status !== 'ACTIVE') throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    const { rawSession, csrfSecret } = await this.sessions.create(user);
    return { rawSession, csrfToken: this.csrf.sessionToken(csrfSecret), user: publicUser(user) };
  }

  async assertActiveActor(tx: Prisma.TransactionClient, actor: Actor): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ status: string; authVersion: number }>>`
      SELECT status, "authVersion" FROM users WHERE id = ${actor.id}::uuid FOR UPDATE
    `;
    const user = rows[0];
    if (!user || user.status !== 'ACTIVE' || user.authVersion !== actor.authVersion) {
      throw new UnauthorizedException('Sign in to continue.');
    }
  }
}
