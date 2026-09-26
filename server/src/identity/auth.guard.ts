import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { parseCookie } from 'cookie';
import type { Request } from 'express';
import { type Actor, SESSION_COOKIE, SessionService } from './session.service.js';

export interface ActorRequest extends Request { actor?: Actor }

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    request.actor = await this.sessions.authenticate(parseCookie(request.header('cookie') ?? '')[SESSION_COOKIE] ?? '');
    return true;
  }
}
