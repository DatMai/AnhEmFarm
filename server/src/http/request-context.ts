import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import type { AppConfig } from '../config.js';

export function requestIp(request: Request, config: AppConfig): string {
  const socketIp = request.socket.remoteAddress ?? 'unknown';
  const forwarded = request.header('x-forwarded-for');
  // A single trusted reverse proxy must append the IP it observed (or overwrite the header).
  // Earlier X-Forwarded-For entries may have been supplied by the client and are never trusted.
  if (forwarded && config.trustedProxyAddress && socketIp === config.trustedProxyAddress) {
    const observed = forwarded.split(',').at(-1)?.trim();
    if (observed && isIP(observed)) return observed;
  }
  return socketIp;
}

export function rateKey(config: AppConfig, scope: string, identifier: string): string {
  return `${scope}:${createHmac('sha256', config.sessionSecret).update(identifier).digest('hex')}`;
}
