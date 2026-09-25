import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import type { AppConfig } from '../config.js';

export function requestIp(request: Request, config: AppConfig): string {
  const socketIp = request.socket.remoteAddress ?? 'unknown';
  const forwarded = request.header('x-forwarded-for');
  // The configured address must identify the directly connected reverse proxy.
  if (forwarded && config.trustedProxyAddress && socketIp === config.trustedProxyAddress) {
    const first = forwarded.split(',')[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  return socketIp;
}

export function rateKey(config: AppConfig, scope: string, identifier: string): string {
  return `${scope}:${createHmac('sha256', config.sessionSecret).update(identifier).digest('hex')}`;
}
