import type { AppConfig } from '../config.js';

export type OrderStatusEmailStatus = 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
export type OrderStatusEmailPayload = { orderId: string; eventId: string; status: OrderStatusEmailStatus; tracking: string | null };
export type EmailTemplate = 'VERIFY' | 'RESET' | 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED';
export type EmailPayload = { token: string } | { orderId: string; totalVnd: number } | OrderStatusEmailPayload;
export interface EmailMessage { to: string; subject: string; text: string; html: string }

const statusLabels: Record<OrderStatusEmailStatus, string> = {
  CONFIRMED: 'confirmed', SHIPPING: 'shipping', DELIVERED: 'delivered',
  CANCELLED: 'cancelled', RETURNED: 'returned',
};
const statusCopy: Record<OrderStatusEmailStatus, { heading: string; detail: string }> = {
  CONFIRMED: { heading: 'Order confirmed', detail: 'We have confirmed your order.' },
  SHIPPING: { heading: 'Delivery in progress', detail: 'Your order is on its way.' },
  DELIVERED: { heading: 'Order delivered', detail: 'Your order has been marked as delivered.' },
  CANCELLED: { heading: 'Order cancelled', detail: 'Your order has been cancelled.' },
  RETURNED: { heading: 'Order returned', detail: 'Your order has been marked as returned.' },
};
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export function renderEmail(config: AppConfig, to: string, template: EmailTemplate, payload: EmailPayload): EmailMessage {
  if (template === 'ORDER_CREATED') {
    if (!('totalVnd' in payload) || !/^[0-9a-f-]{36}$/i.test(payload.orderId) || !Number.isSafeInteger(payload.totalVnd) || payload.totalVnd < 0) throw new Error('Invalid order email payload');
    const text = `Your order ${payload.orderId} was placed.\nTotal: ${payload.totalVnd} VND.\nCash on delivery: payment is due when your order arrives.`;
    return { to, subject: 'Your AnhEmFarm order was placed', text, html: `<p>${text.replaceAll('\n', '</p><p>')}</p>` };
  }
  if (template === 'ORDER_STATUS_CHANGED') {
    if (!('status' in payload) || !/^[0-9a-f-]{36}$/i.test(payload.orderId) || !/^[0-9a-f-]{36}$/i.test(payload.eventId)
      || !(payload.status in statusLabels) || (payload.tracking !== null && (typeof payload.tracking !== 'string' || payload.tracking.length > 200))) {
      throw new Error('Invalid order status email payload');
    }
    const label = statusLabels[payload.status];
    const copy = statusCopy[payload.status];
    const reference = payload.orderId.slice(0, 8).toUpperCase();
    const url = new URL(`/account/orders/${payload.orderId}`, config.origin).toString();
    const tracking = payload.status === 'SHIPPING' ? payload.tracking : null;
    const text = `AnhEmFarm\n\n${copy.heading}\n${copy.detail}\nOrder reference: ${reference}\n${tracking ? `Tracking: ${tracking}\n` : ''}\nView order: ${url}\n\nSign in to view your order history.`;
    const html = `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#2b2522;line-height:1.5">`
      + `<p style="margin:0 0 24px;color:#a9273b;font-size:18px;font-weight:700">AnhEmFarm</p>`
      + `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">${copy.heading}</h1>`
      + `<p style="margin:0 0 20px">${copy.detail}</p>`
      + `<p style="margin:0 0 12px">Order reference: <strong>${reference}</strong></p>`
      + (tracking ? `<p style="margin:0 0 20px">Tracking: ${escapeHtml(tracking)}</p>` : '')
      + `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#a9273b;color:#ffffff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:700">View order</a></p>`
      + `<p style="margin:24px 0 0;color:#675a52;font-size:13px">Sign in to view your order history.</p></div>`;
    return { to, subject: `Your AnhEmFarm order is ${label}`, text, html };
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
