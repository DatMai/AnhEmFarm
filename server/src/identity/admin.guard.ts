import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard, type ActorRequest } from './auth.guard.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthGuard) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.auth.canActivate(context);
    if (context.switchToHttp().getRequest<ActorRequest>().actor?.role !== 'ADMIN') throw new ForbiddenException();
    return true;
  }
}
