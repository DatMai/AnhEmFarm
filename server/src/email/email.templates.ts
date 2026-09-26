import type { AppConfig } from '../config.js';

export type EmailTemplate = 'VERIFY' | 'RESET' | 'ORDER_CREATED';
export type EmailPayload = { token: string } | { orderId: string; totalVnd: number };
export interface EmailMessage { to: string; subject: string; text: string; html: string }

export function renderEmail(config: AppConfig, to: string, template: EmailTemplate, payload: EmailPayload): EmailMessage {
  if (template === 'ORDER_CREATED') {
    if (!('orderId' in payload) || !/^[0-9a-f-]{36}$/i.test(payload.orderId) || !Number.isSafeInteger(payload.totalVnd) || payload.totalVnd < 0) throw new Error('Invalid order email payload');
    const text = `Your order ${payload.orderId} was placed.\nTotal: ${payload.totalVnd} VND.\nCash on delivery: payment is due when your order arrives.`;
    return { to, subject: 'Your AnhEmFarm order was placed', text, html: `<p>${text.replaceAll('\n', '</p><p>')}</p>` };
  }
  if (!('token' in payload)) throw new Error('Invalid token email payload');
  const path = template === 'VERIFY' ? '/verify-email' : '/reset-password';
  const url = new URL(path, config.origin);
  url.searchParams.set('token', payload.token);
  const subject = template === 'VERIFY' ? 'Verify your AnhEmFarm email' : 'Reset your AnhEmFarm password';
  const action = template === 'VERIFY' ? 'Verify your email' : 'Reset your password';
  const text = `${action}: ${url.toString()}\nIf you did not request this, you can ignore this email.`;
  const html = `<p>${action}</p><p><a href="${url.toString().replaceAll('&', '&amp;')}">${action}</a></p><p>If you did not request this, you can ignore this email.</p>`;
  return { to, subject, text, html };
}
