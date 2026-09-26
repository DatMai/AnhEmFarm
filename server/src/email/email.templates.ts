import type { AppConfig } from '../config.js';

export type EmailTemplate = 'VERIFY' | 'RESET';
export interface EmailMessage { to: string; subject: string; text: string; html: string }

export function renderEmail(config: AppConfig, to: string, template: EmailTemplate, payload: { token: string }): EmailMessage {
  const path = template === 'VERIFY' ? '/verify-email' : '/reset-password';
  const url = new URL(path, config.origin);
  url.searchParams.set('token', payload.token);
  const subject = template === 'VERIFY' ? 'Verify your AnhEmFarm email' : 'Reset your AnhEmFarm password';
  const action = template === 'VERIFY' ? 'Verify your email' : 'Reset your password';
  const text = `${action}: ${url.toString()}\nIf you did not request this, you can ignore this email.`;
  const html = `<p>${action}</p><p><a href="${url.toString().replaceAll('&', '&amp;')}">${action}</a></p><p>If you did not request this, you can ignore this email.</p>`;
  return { to, subject, text, html };
}
