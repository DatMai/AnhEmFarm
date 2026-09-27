import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { parseCookie } from 'cookie';
import type { Actor } from '../identity/session.service.js';
import { clearSessionCookie, SESSION_COOKIE, SessionService } from '../identity/session.service.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { CsrfGuard } from '../identity/csrf.guard.js';
import { PrismaService } from '../db/prisma.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { CustomersService } from '../admin/customers.service.js';
import { SettingsService } from '../admin/settings.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ContentService } from '../content/content.service.js';
import { ReportsService } from '../admin/reports.service.js';
import { MediaService } from '../media/media.service.js';
import { categoryCreate, categoryPatch, choiceGroupUpdate, idSchema, parse, productCreate, productPatch, variantCreate, variantPatch } from '../catalog/catalog.schemas.js';

const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const date = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
const money = (value: number) => new Intl.NumberFormat('en-US').format(value) + ' VND';
const first = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? '' : value ?? '';
type AdminContext = { actor: Actor; csrf: string };

@Injectable()
export class AdminWebController {
  constructor(private readonly sessions: SessionService, private readonly csrf: CsrfGuard, private readonly db: PrismaService,
    private readonly catalog: CatalogService, private readonly orders: OrdersService, private readonly customersService: CustomersService,
    private readonly settingsService: SettingsService, private readonly inventoryService: InventoryService, private readonly contentService: ContentService,
    private readonly reportsService: ReportsService, private readonly mediaService: MediaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  router(): Router {
    const router = Router();
    router.get('/admin.css', (_req, res) => res.type('text/css').set('Cache-Control', 'private, max-age=300').send(this.css()));
    const protect = (handler: (req: Request, res: Response, ctx: AdminContext) => Promise<void>) =>
      (req: Request, res: Response, next: NextFunction) => { void this.handle(req, res, next, handler); };
    router.get('/', protect(async (_req, res, ctx) => this.dashboard(res, ctx)));
    router.get('/orders', protect(async (req, res, ctx) => this.orderList(req, res, ctx)));
    router.get('/orders/:id', protect(async (req, res, ctx) => this.orderDetail(req, res, ctx)));
    router.post('/orders/:id/status', protect(async (req, res, ctx) => this.transition(req, res, ctx)));
    router.post('/orders/:id/collection', protect(async (req, res, ctx) => this.updateCollection(req, res, ctx)));
    router.post('/logout', protect(async (req, res) => {
      const raw = parseCookie(req.header('cookie') ?? '')[SESSION_COOKIE];
      if (raw) await this.sessions.revoke(raw);
      clearSessionCookie(res, this.config);
      res.redirect(303, '/login');
    }));
    router.get('/products', protect(async (req, res, ctx) => this.productList(req, res, ctx)));
    router.post('/products', protect(async (req, res, ctx) => this.createProduct(req, res, ctx)));
    router.get('/products/:id', protect(async (req, res, ctx) => this.productDetail(req, res, ctx)));
    router.post('/products/:id/save', protect(async (req, res, ctx) => this.saveProduct(req, res, ctx)));
    router.post('/products/:id/choices', protect(async (req, res, ctx) => this.saveChoices(req, res, ctx)));
    router.post('/products/:id/images', protect(async (req, res, ctx) => this.uploadProductImage(req, res, ctx)));
    router.post('/products/:id/variants', protect(async (req, res, ctx) => this.createVariant(req, res, ctx)));
    router.post('/variants/:id', protect(async (req, res, ctx) => this.saveVariant(req, res, ctx)));
    router.post('/categories', protect(async (req, res, ctx) => this.saveCategory(req, res, ctx)));
    router.post('/inventory/:id/adjustments', protect(async (req, res, ctx) => this.adjustInventory(req, res, ctx)));
    router.post('/settings', protect(async (req, res, ctx) => this.saveSettings(req, res, ctx)));
    router.post('/settings/zones', protect(async (req, res, ctx) => this.addZone(req, res, ctx)));
    router.post('/settings/zones/:id', protect(async (req, res, ctx) => this.toggleZone(req, res, ctx)));
    router.get('/customers/:id', protect(async (req, res, ctx) => this.customerDetail(req, res, ctx)));
    router.post('/customers/:id/status', protect(async (req, res, ctx) => this.changeCustomerStatus(req, res, ctx)));
    router.post('/content/:slug', protect(async (req, res, ctx) => this.saveContent(req, res, ctx)));
    router.get('/categories', protect(async (req, res, ctx) => this.categories(req, res, ctx)));
    router.get('/customers', protect(async (req, res, ctx) => this.customers(req, res, ctx)));
    router.get('/inventory', protect(async (req, res, ctx) => this.inventory(req, res, ctx)));
    router.get('/settings', protect(async (_req, res, ctx) => this.settings(res, ctx)));
    router.get('/reports', protect(async (req, res, ctx) => this.reports(req, res, ctx)));
    router.get('/audit', protect(async (_req, res, ctx) => this.audit(res, ctx)));
    router.get('/email-jobs', protect(async (_req, res, ctx) => this.emailJobs(res, ctx)));
    router.get('/content', protect(async (_req, res, ctx) => this.content(res, ctx)));
    router.get(/.*/, protect(async (_req, res, ctx) => this.page(res, ctx, 'Admin page', '<p>This administration page is not available.</p>', '')));
    return router;
  }

  private async handle(req: Request, res: Response, next: NextFunction, handler: (req: Request, res: Response, ctx: AdminContext) => Promise<void>) {
    try {
      const raw = parseCookie(req.header('cookie') ?? '')[SESSION_COOKIE];
      if (!raw) { res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`); return; }
      const session = await this.sessions.findValid(raw);
      if (session.actor.role !== 'ADMIN') { res.status(403).type('html').set(this.privateHeaders()).send(this.document('Access denied', '<h1>Administrator access required</h1><p>Your account cannot open this workspace.</p>', '')); return; }
      res.set(this.privateHeaders());
      await handler(req, res, { actor: session.actor, csrf: this.csrf.sessionToken(session.csrfSecret) });
    } catch (error) {
      const status = typeof (error as { getStatus?: unknown })?.getStatus === 'function' ? (error as { getStatus(): number }).getStatus() : 500;
      if (status >= 500) { next(error); return; }
      const message = status === 409 ? 'This record changed. Reload the page and try again.' : status === 422 ? 'Some submitted information is invalid. Review the form and try again.' : 'The requested record is unavailable.';
      res.status(status).type('html').set(this.privateHeaders()).send(this.document('Request could not be completed', `<h1>Request could not be completed</h1><p role="alert">${message}</p><p><a href="/admin">Return to dashboard</a></p>`, ''));
    }
  }

  private privateHeaders() { return { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }; }
  private document(title: string, content: string, active: string, ctx?: AdminContext): string {
    const groups = [
      ['Overview', [['Dashboard', '/admin']]],
      ['Orders', [['Orders', '/admin/orders']]],
      ['Catalog', [['Products', '/admin/products'], ['Categories', '/admin/categories'], ['Inventory', '/admin/inventory']]],
      ['Customers', [['Customers', '/admin/customers']]],
      ['Store', [['Settings', '/admin/settings'], ['Reports', '/admin/reports'], ['Content', '/admin/content']]],
      ['Operations', [['Audit log', '/admin/audit'], ['Email jobs', '/admin/email-jobs']]],
    ] as const;
    const nav = groups.map(([group, items]) => `<section class="nav-group"><h2>${group}</h2>${items.map(([label, href]) => `<a${active === href ? ' aria-current="page"' : ''} href="${href}">${label}</a>`).join('')}</section>`).join('');
    const token = ctx ? `<input type="hidden" name="_csrf" value="${escape(ctx.csrf)}">` : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} · AnhEmFarm</title><link rel="stylesheet" href="/admin/admin.css"></head><body><div class="admin-shell"><aside class="sidebar"><a class="brand" href="/admin">AnhEmFarm <small>Seller workspace</small></a><nav aria-label="Admin navigation">${nav}</nav><a class="back-store" href="/">Open storefront</a>${ctx ? `<form class="logout-form" method="post" action="/admin/logout">${token}<button type="submit">Log out</button></form>` : ''}</aside><main class="admin-main"><header class="page-top"><span>SELLER WORKSPACE</span><a href="/admin">Dashboard</a></header><div class="page-content">${content}</div></main></div></body></html>`;
  }
  private page(res: Response, ctx: AdminContext, title: string, content: string, active: string) {
    const notices: Record<string, string> = { productCreated: 'Product created.', productSaved: 'Product saved.', variantCreated: 'Format added.', variantSaved: 'Format saved.', choicesSaved: 'Product choices saved.', categorySaved: 'Category saved.', orderSaved: 'Order updated.', codSaved: 'COD collection updated.', inventorySaved: 'Inventory adjusted.', settingsSaved: 'Store settings saved.', zoneSaved: 'Delivery zone saved.', customerSaved: 'Customer status updated.', contentSaved: 'Content saved.', imageSaved: 'Product image uploaded.' };
    const notice = typeof res.req.query.saved === 'string' ? notices[res.req.query.saved] : undefined;
    res.type('html').send(this.document(title, `${notice ? `<p class="flash" role="status">${notice}</p>` : ''}${content}`, active, ctx));
  }
  private saved(path: string, code: string) { return `${path}${path.includes('?') ? '&' : '?'}saved=${encodeURIComponent(code)}`; }
  private async dashboard(res: Response, ctx: AdminContext) {
    const [totalOrders, pending, attention, delivered, grouped] = await Promise.all([
      this.db.order.count(), this.db.order.count({ where: { status: 'PENDING' } }),
      this.db.order.count({ where: { status: 'PENDING', createdAt: { lte: new Date(Date.now() - 24 * 3600000) } } }),
      this.db.order.count({ where: { status: 'DELIVERED' } }),
      this.db.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const queue = await this.orders.list(ctx.actor, { status: 'PENDING', attentionOnly: 'true', page: 1, pageSize: 8 });
    const counts = new Map(grouped.map(item => [item.status, item._count._all]));
    const statuses: Array<(typeof grouped)[number]['status']> = ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED'];
    const max = Math.max(1, ...statuses.map(status => counts.get(status) ?? 0));
    const chartRows = statuses.map((status, index) => {
      const count = counts.get(status) ?? 0;
      const y = index * 32 + 8;
      const width = Math.round(count / max * 270);
      return `<text x="0" y="${y + 14}">${status}</text><rect x="105" y="${y}" width="270" height="20" rx="5" fill="#eee6de"/><rect x="105" y="${y}" width="${width}" height="20" rx="5" fill="#a9273b"/><text x="385" y="${y + 14}">${count}</text>`;
    }).join('');
    const chart = `<figure class="chart"><svg viewBox="0 0 410 210" role="img" aria-labelledby="chart-title"><title id="chart-title">Order counts by status</title>${chartRows}</svg><figcaption>Current order counts by status</figcaption></figure>`;
    const rows = queue.items.map(order => `<tr><td><a href="/admin/orders/${order.id}">${order.id.slice(0, 8).toUpperCase()}</a></td><td>${escape(order.status)}</td><td>${money(order.totalVnd)}</td><td>${date(order.createdAt)}</td></tr>`).join('');
    this.page(res, ctx, 'Seller dashboard', `<h1>Seller dashboard</h1><p class="lede">Orders and work that need seller attention.</p><section class="metrics"><a href="/admin/orders"><span>All orders</span><strong>${totalOrders}</strong></a><a href="/admin/orders?status=PENDING"><span>Pending</span><strong>${pending}</strong></a><a href="/admin/orders?attentionOnly=true"><span>Needs attention</span><strong>${attention}</strong></a><a href="/admin/orders?status=DELIVERED"><span>Delivered</span><strong>${delivered}</strong></a></section>${chart}<section class="panel"><div class="panel-heading"><div><h2>Needs attention</h2><p>Pending for at least 24 hours. Orders are never cancelled automatically.</p></div><a href="/admin/orders?attentionOnly=true">View queue</a></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Status</th><th>Total</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>No overdue pending orders.</p>'}</section>`, '/admin');
  }
  private async orderList(req: Request, res: Response, ctx: AdminContext) {
    const statusValue = first(req.query.status as string | string[] | undefined);
    const status = ['PENDING','CONFIRMED','SHIPPING','DELIVERED','CANCELLED','RETURNED'].includes(statusValue) ? statusValue as 'PENDING'|'CONFIRMED'|'SHIPPING'|'DELIVERED'|'CANCELLED'|'RETURNED' : undefined;
    const collectionValue = first(req.query.collectionState as string | string[] | undefined);
    const collectionState = ['DUE', 'COLLECTED'].includes(collectionValue) ? collectionValue as 'DUE' | 'COLLECTED' : undefined;
    const attentionOnly = req.query.attentionOnly === 'true';
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const result = await this.orders.list(ctx.actor, { page, pageSize: 20, ...(status ? { status } : {}), ...(collectionState ? { collectionState } : {}), ...(attentionOnly ? { attentionOnly: 'true' } : {}), ...(q ? { q } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
    const filters = Object.fromEntries(Object.entries({ q, status, collectionState, from, to, attentionOnly: attentionOnly ? 'true' : undefined }).filter((entry): entry is [string, string] => Boolean(entry[1])));
    const rows = result.items.map(order => { const recipient = order.recipient as { recipient?: unknown } | null; return `<tr><td><a href="/admin/orders/${order.id}">${order.id.slice(0, 8).toUpperCase()}</a></td><td>${escape(recipient?.recipient ?? '')}</td><td>${escape(order.status)}</td><td>${escape(order.collectionState)}</td><td>${money(order.totalVnd)}</td><td>${date(order.createdAt)}</td><td>${order.attention ? '<strong>Needs attention</strong>' : '—'}</td></tr>`; }).join('');
    this.page(res, ctx, 'Orders', `<h1>Orders</h1><p class="lede">Review customer orders and take the next fulfilment action.</p><form class="filters" method="get"><label>Search orders<input name="q" value="${escape(q ?? '')}" maxlength="120"></label><label>Status<select name="status"><option value="">All statuses</option>${['PENDING','CONFIRMED','SHIPPING','DELIVERED','CANCELLED','RETURNED'].map(item => `<option${status === item ? ' selected' : ''}>${item}</option>`).join('')}</select></label><label>COD collection<select name="collectionState"><option value="">All</option>${['DUE','COLLECTED'].map(item => `<option${collectionState === item ? ' selected' : ''}>${item}</option>`).join('')}</select></label><label>From (Vietnam date)<input type="date" name="from" value="${escape(from ?? '')}"></label><label>To (Vietnam date)<input type="date" name="to" value="${escape(to ?? '')}"></label><label class="check"><input type="checkbox" name="attentionOnly" value="true"${attentionOnly ? ' checked' : ''}> Needs attention</label><button type="submit">Apply filters</button></form><p>${result.total} orders</p><div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>COD</th><th>Total</th><th>Created</th><th>Attention</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No matching orders.</td></tr>'}</tbody></table></div>${this.pager('/admin/orders', page, result.pageSize, result.total, filters)}`, '/admin/orders');
  }
  private async orderDetail(req: Request, res: Response, ctx: AdminContext) {
    const order = await this.orders.get(ctx.actor, first(req.params.id));
    const record = await this.db.order.findUniqueOrThrow({ where: { id: order.id }, include: { user: { select: { name: true, email: true } } } });
    const items = order.items.map(item => `<tr><td>${escape(item.name)}</td><td>${escape(item.label)}</td><td>${item.optionLabel ? `${escape(item.optionGroupLabel)}: ${escape(item.optionLabel)}` : '—'}</td><td>${item.quantity}</td><td>${money(item.priceVnd)}</td></tr>`).join('');
    const next: Record<string, string> = { PENDING: 'CONFIRMED', CONFIRMED: 'SHIPPING', SHIPPING: 'DELIVERED' };
    const to = next[order.status];
    const transitionFields = `<input type="hidden" name="version" value="${order.version}"><input type="hidden" name="operationKey" value="${randomUUID()}"><input type="hidden" name="to" value="${to}">`;
    const form = to === 'SHIPPING'
      ? `<form method="post" action="/admin/orders/${order.id}/status">${this.token(ctx)}${transitionFields}<input type="hidden" name="deliveryMode" value="STORE"><button type="submit">Start store delivery</button></form><form method="post" action="/admin/orders/${order.id}/status">${this.token(ctx)}${transitionFields}<input type="hidden" name="deliveryMode" value="CARRIER"><label>Carrier<input name="carrier" maxlength="200" required></label><label>Tracking<input name="tracking" maxlength="200" required></label><button type="submit">Ship with carrier</button></form>`
      : to ? `<form method="post" action="/admin/orders/${order.id}/status">${this.token(ctx)}${transitionFields}<button type="submit">${to === 'CONFIRMED' ? 'Confirm order' : 'Mark delivered'}</button></form>` : '<p>No further fulfilment action is available.</p>';
    const cancellation = ['PENDING', 'CONFIRMED'].includes(order.status) ? `<form method="post" action="/admin/orders/${order.id}/status">${this.token(ctx)}<input type="hidden" name="version" value="${order.version}"><input type="hidden" name="operationKey" value="${randomUUID()}"><input type="hidden" name="to" value="CANCELLED"><label>Cancellation reason<input name="reason" maxlength="500" required></label><button>Cancel order</button></form>` : '';
    const restockItems = new Map<string, number>();
    for (const item of order.items) restockItems.set(item.variantId, (restockItems.get(item.variantId) ?? 0) + item.quantity);
    const returnFields = [...restockItems].map(([variantId, quantity]) => `<label>Sellable units to restock (maximum ${quantity})<input type="hidden" name="restockId" value="${variantId}"><input type="number" name="restockQuantity" min="0" max="${quantity}" value="0" required></label>`).join('');
    const returnForm = order.status === 'SHIPPING' ? `<form method="post" action="/admin/orders/${order.id}/status">${this.token(ctx)}<input type="hidden" name="version" value="${order.version}"><input type="hidden" name="operationKey" value="${randomUUID()}"><input type="hidden" name="to" value="RETURNED"><label>Return reason<input name="reason" maxlength="500" required></label><label class="check"><input type="checkbox" name="received" value="true" required> Returned items physically received</label>${returnFields}<button>Record return</button></form>` : '';
    const collectionForm = order.status === 'DELIVERED' && (order.collectionState === 'DUE' || order.collectionState === 'COLLECTED')
      ? `<form method="post" action="/admin/orders/${order.id}/collection">${this.token(ctx)}<input type="hidden" name="version" value="${order.version}"><input type="hidden" name="operationKey" value="${randomUUID()}"><input type="hidden" name="state" value="${order.collectionState === 'DUE' ? 'COLLECTED' : 'DUE'}">${order.collectionState === 'COLLECTED' ? '<label>Correction reason<input name="reason" maxlength="500" required></label>' : ''}<button type="submit">${order.collectionState === 'DUE' ? 'Mark COD collected' : 'Correct COD to due'}</button></form>` : '';
    const recipient = record.recipientJson as { recipient?: string };
    const customer = record.user ? `${escape(record.user.name)} · ${escape(record.user.email)}` : `Guest checkout · ${escape(recipient.recipient ?? 'Guest')} · ${escape(record.guestEmail ?? '')}`;
    this.page(res, ctx, `Order ${order.id.slice(0,8)}`, `<p><a href="/admin/orders">Orders</a> / ${order.id.slice(0,8).toUpperCase()}</p><h1>Order ${order.id.slice(0,8).toUpperCase()}</h1><section class="panel"><h2>Customer</h2><p>${customer}</p><p>${escape(order.status)} · COD ${escape(order.collectionState)}</p><p>Created ${date(order.createdAt)}</p></section><section class="panel"><h2>Items</h2><div class="table-wrap"><table><thead><tr><th>Product</th><th>Format</th><th>Option</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>${items}</tbody></table></div><p>Total ${money(order.totalVnd)}</p></section><section class="panel"><h2>Fulfilment</h2>${form}${cancellation}${returnForm}${collectionForm}</section>`, '/admin/orders');
  }
  private token(ctx: AdminContext) { return `<input type="hidden" name="_csrf" value="${escape(ctx.csrf)}">`; }
  private pager(path: string, page: number, pageSize: number, total: number, filters: Record<string, string> = {}) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages <= 1) return '';
    const href = (target: number) => `${path}?${new URLSearchParams({ ...filters, page: String(target) })}`;
    return `<nav class="pagination" aria-label="Pagination">${page > 1 ? `<a href="${href(page - 1)}">Previous</a>` : '<span>Previous</span>'}<span>Page ${page} of ${pages}</span>${page < pages ? `<a href="${href(page + 1)}">Next</a>` : '<span>Next</span>'}</nav>`;
  }
  private async transition(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string | string[]>;
    const to = body.to;
    const id = first(req.params.id);
    await this.orders.transition(ctx.actor, id, { version: Number(body.version), operationKey: first(body.operationKey) || randomUUID(), to: first(to),
      ...(first(to) === 'SHIPPING' ? { delivery: first(body.deliveryMode) === 'STORE' ? { mode: 'STORE' } : { mode: 'CARRIER', carrier: first(body.carrier), tracking: first(body.tracking) } } : {}),
      ...(first(to) === 'CANCELLED' || first(to) === 'RETURNED' ? { reason: first(body.reason) } : {}),
      ...(first(to) === 'RETURNED' ? { received: first(body.received) === 'true', restock: (Array.isArray(body.restockId) ? body.restockId : [first(body.restockId)]).filter(Boolean).map((variantId, index) => ({ variantId, quantity: Number((Array.isArray(body.restockQuantity) ? body.restockQuantity : [first(body.restockQuantity)])[index]) })) } : {}) } as never);
    res.redirect(303, this.saved(`/admin/orders/${encodeURIComponent(id)}`, 'orderSaved'));
  }
  private async updateCollection(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    const id = first(req.params.id);
    await this.orders.collect(ctx.actor, id, { version: Number(body.version), operationKey: first(body.operationKey) || randomUUID(), state: first(body.state) as 'DUE' | 'COLLECTED', ...(first(body.reason).trim() ? { reason: first(body.reason).trim() } : {}) });
    res.redirect(303, this.saved(`/admin/orders/${encodeURIComponent(id)}`, 'codSaved'));
  }
  private async productList(req: Request, res: Response, ctx: AdminContext) {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const q= typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : undefined;
    const statusValue = first(req.query.status as string | string[] | undefined);
    const status = ['DRAFT','PUBLISHED','ARCHIVED'].includes(statusValue) ? statusValue as 'DRAFT'|'PUBLISHED'|'ARCHIVED' : undefined;
    const data = await this.catalog.adminList({ page, pageSize: 20, ...(q ? { q } : {}), ...(status ? { status } : {}) });
    const categories = await this.catalog.adminCategories(1, 100);
    const rows = data.items.map(item => `<tr><td><a href="/admin/products/${item.id}">${escape(item.name)}</a></td><td>${escape(item.status)}</td><td>${escape(item.category.name)}</td><td>${item.variants.length}</td><td>${item.choiceGroup?.active ? escape(item.choiceGroup.label) : 'No choices'}</td></tr>`).join('');
    const categoryOptions = categories.items.map(category => `<option value="${category.id}">${escape(category.name)}</option>`).join('');
    this.page(res, ctx, 'Products', `<h1>Products</h1><p class="lede">Catalog records and customer-facing product choices.</p><details class="panel"><summary>Create product</summary><form method="post" action="/admin/products">${this.token(ctx)}<label>Name<input name="name" maxlength="160" required></label><label>Slug<input name="slug" pattern="[a-z0-9-]+" required></label><label>Description<textarea name="description" required></textarea></label><label>Category<select name="categoryId" required><option value="">Choose category</option>${categoryOptions}</select></label><label class="check"><input type="checkbox" name="confirmed" value="true"> Product details confirmed</label><label class="check"><input type="checkbox" name="restricted18" value="true"> Age restricted</label><button>Create product</button></form></details><form class="filters" method="get"><label>Search products<input name="q" value="${escape(q ?? '')}"></label><label>Status<select name="status"><option value="">All</option>${['DRAFT','PUBLISHED','ARCHIVED'].map(value => `<option${status === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label><button>Apply filters</button></form><div class="table-wrap"><table><thead><tr><th>Product</th><th>Status</th><th>Category</th><th>Formats</th><th>Customer options</th></tr></thead><tbody>${rows}</tbody></table></div>${this.pager('/admin/products', page, data.pageSize, data.total, { ...(q ? { q } : {}), ...(status ? { status } : {}) })}`, '/admin/products');
  }
  private async createProduct(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    const product = await this.catalog.createProduct(ctx.actor, parse(productCreate, { name: first(body.name), slug: first(body.slug), description: first(body.description), categoryId: first(body.categoryId), confirmed: body.confirmed === 'true', restricted18: body.restricted18 === 'true' }));
    res.redirect(303, this.saved(`/admin/products/${product.id}`, 'productCreated'));
  }
  private async saveProduct(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    const id = parse(idSchema, first(req.params.id));
    await this.catalog.updateProduct(ctx.actor, id, parse(productPatch, { expectedVersion: Number(body.expectedVersion), name: first(body.name), slug: first(body.slug), description: first(body.description), categoryId: first(body.categoryId), status: first(body.status), confirmed: body.confirmed === 'true', restricted18: body.restricted18 === 'true' }));
    res.redirect(303, this.saved(`/admin/products/${encodeURIComponent(id)}`, 'productSaved'));
  }
  private async createVariant(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    const id = parse(idSchema, first(req.params.id));
    await this.catalog.createVariant(ctx.actor, id, parse(variantCreate, { sku: first(body.sku), label: first(body.label), packDetails: first(body.packDetails), priceVnd: first(body.priceVnd) ? Number(body.priceVnd) : null, saleEnabled: body.saleEnabled === 'true' }));
    res.redirect(303, this.saved(`/admin/products/${encodeURIComponent(id)}`, 'variantCreated'));
  }
  private async saveVariant(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    const productId = parse(idSchema, first(body.productId));
    await this.catalog.updateVariant(ctx.actor, parse(idSchema, first(req.params.id)), parse(variantPatch, { expectedVersion: Number(body.expectedVersion), sku: first(body.sku), label: first(body.label), packDetails: first(body.packDetails), priceVnd: first(body.priceVnd) ? Number(body.priceVnd) : null, saleEnabled: body.saleEnabled === 'true' }));
    res.redirect(303, this.saved(`/admin/products/${encodeURIComponent(productId)}`, 'variantSaved'));
  }
  private async saveCategory(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    const id = first(body.id);
    if (id) await this.catalog.updateCategory(ctx.actor, parse(idSchema, id), parse(categoryPatch, { name: first(body.name), slug: first(body.slug), expectedVersion: Number(body.version) }));
    else await this.catalog.createCategory(ctx.actor, parse(categoryCreate, { name: first(body.name), slug: first(body.slug) }));
    res.redirect(303, this.saved('/admin/categories', 'categorySaved'));
  }
  private async productDetail(req: Request, res: Response, ctx: AdminContext) {
    const id = parse(idSchema, first(req.params.id));
    const product = await this.catalog.adminDetail(id);
    const categories = await this.catalog.adminCategories(1, 100);
    const categoryOptions = categories.items.map(category => `<option value="${category.id}"${product.categoryId === category.id ? ' selected' : ''}>${escape(category.name)}</option>`).join('');
    const variantRows = product.variants.map(variant => `<tr><td colspan="5"><form class="row-form" method="post" action="/admin/variants/${variant.id}">${this.token(ctx)}<input type="hidden" name="productId" value="${product.id}"><input type="hidden" name="expectedVersion" value="${variant.version}"><label>SKU<input name="sku" value="${escape(variant.sku)}" required></label><label>Format<input name="label" value="${escape(variant.label)}" required></label><label>Pack details<input name="packDetails" value="${escape(variant.packDetails)}"></label><label>Price (VND)<input type="number" min="1" name="priceVnd" value="${variant.priceVnd ?? ''}"></label><label class="check"><input type="checkbox" name="saleEnabled" value="true"${variant.saleEnabled ? ' checked' : ''}> Sale enabled</label><span>Stock ${variant.stock}</span><button>Save format</button></form></td></tr>`).join('');
    const group = product.choiceGroup;
    const choices = group?.choices ?? [];
    const rows = choices.map(choice => `<label class="choice-row"><input type="hidden" name="choiceId" value="${choice.id}"><input name="choiceLabel" maxlength="80" value="${escape(choice.label)}"><input type="checkbox" name="choiceActive" value="${choice.id}"${choice.active ? ' checked' : ''}><span>Active</span></label>`).join('');
    const form = `<form method="post" action="/admin/products/${product.id}/choices">${this.token(ctx)}<input type="hidden" name="expectedVersion" value="${product.version}"><label>Choice group name<input name="groupLabel" maxlength="80" value="${escape(group?.active ? group.label : '')}" placeholder="Example: Sweetness"></label><fieldset><legend>Choices</legend>${rows || '<p>No choices configured.</p>'}<label>Add choice<input name="newChoices" placeholder="One option per line"></label></fieldset><p>One active option is required when this group is enabled. Choices never change the product price.</p><button>Save product options</button></form>`;
    const editProduct = `<section class="panel"><h2>Product details</h2><form method="post" action="/admin/products/${product.id}/save">${this.token(ctx)}<input type="hidden" name="expectedVersion" value="${product.version}"><label>Name<input name="name" maxlength="160" value="${escape(product.name)}" required></label><label>Slug<input name="slug" pattern="[a-z0-9-]+" value="${escape(product.slug)}" required></label><label>Description<textarea name="description" required>${escape(product.description)}</textarea></label><label>Category<select name="categoryId" required>${categoryOptions}</select></label><label>Status<select name="status">${['DRAFT','PUBLISHED','ARCHIVED'].map(value => `<option${product.status === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label><label class="check"><input type="checkbox" name="confirmed" value="true"${product.confirmed ? ' checked' : ''}> Product details confirmed</label><label class="check"><input type="checkbox" name="restricted18" value="true"${product.restricted18 ? ' checked' : ''}> Age restricted</label><button>Save product</button></form></section>`;
    const images = product.images.map(image => { const filename = image.objectKey.split('/').at(-1) ?? ''; return `<figure><img src="/api/v1/media/products/${encodeURIComponent(filename)}" alt="${escape(product.name)}" width="${image.width}" height="${image.height}" loading="lazy"><figcaption>${image.width} × ${image.height}${image.illustrative ? ' · Illustrative' : ''}</figcaption></figure>`; }).join('');
    const imagePanel = `<section class="panel"><h2>Product images</h2><div class="image-list">${images || '<p>No images uploaded.</p>'}</div><form method="post" enctype="multipart/form-data" action="/admin/products/${product.id}/images">${this.token(ctx)}<label>Upload image<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required></label><p>JPEG, PNG or WebP. Maximum 5 MB and 25 million pixels.</p><button>Upload image</button></form></section>`;
    const variants = `<section class="panel"><h2>Formats and prices</h2><div class="table-wrap"><table><thead><tr><th colspan="5">Product variants</th></tr></thead><tbody>${variantRows}</tbody></table></div><details><summary>Add format</summary><form method="post" action="/admin/products/${product.id}/variants">${this.token(ctx)}<label>SKU<input name="sku" required></label><label>Format<input name="label" required></label><label>Pack details<input name="packDetails"></label><label>Price (VND)<input type="number" min="1" name="priceVnd"></label><label class="check"><input type="checkbox" name="saleEnabled" value="true"> Sale enabled</label><button>Add format</button></form></details></section>`;
    this.page(res, ctx, product.name, `<p><a href="/admin/products">Products</a> / ${escape(product.name)}</p><h1>${escape(product.name)}</h1><p>${escape(product.status)} · version ${product.version}</p>${editProduct}${imagePanel}${variants}<section class="panel"><h2>Customer choices</h2>${form}</section>`, '/admin/products');
  }
  private async uploadProductImage(req: Request, res: Response, ctx: AdminContext) {
    const id = parse(idSchema, first(req.params.id));
    const buffer = (req as Request & { adminImage?: Buffer }).adminImage;
    if (!buffer) { res.status(422).type('html').send(this.document('Image upload required', '<h1>Choose one image to upload.</h1><p><a href="/admin/products">Return to products</a></p>', '/admin/products', ctx)); return; }
    const media = await this.mediaService.upload(ctx.actor, buffer);
    await this.catalog.addImage(ctx.actor, id, media.id);
    res.redirect(303, this.saved(`/admin/products/${encodeURIComponent(id)}`, 'imageSaved'));
  }
  private async saveChoices(req: Request, res: Response, ctx: AdminContext) {
    const id = parse(idSchema, first(req.params.id));
    const product = await this.catalog.adminDetail(id);
    const body = req.body as Record<string, string | string[] | undefined>;
    const ids = Array.isArray(body.choiceId) ? body.choiceId : body.choiceId ? [body.choiceId] : [];
    const labels = Array.isArray(body.choiceLabel) ? body.choiceLabel : body.choiceLabel ? [body.choiceLabel] : [];
    const activeIds = new Set(Array.isArray(body.choiceActive) ? body.choiceActive : body.choiceActive ? [body.choiceActive] : []);
    const choices: Array<{ id?: string; label: string; active: boolean }> = ids.map((choiceId, index) => ({ id: choiceId, label: first(labels[index]), active: activeIds.has(choiceId) }));
    const extra = first(body.newChoices).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    choices.push(...extra.map(label => ({ label, active: true })));
    const label = first(body.groupLabel).trim();
    await this.catalog.updateChoiceGroup(ctx.actor, id, parse(choiceGroupUpdate, { expectedVersion: Number(body.expectedVersion), label: label || null, choices: label ? choices : [] }));
    res.redirect(303, this.saved(`/admin/products/${encodeURIComponent(id)}`, 'choicesSaved'));
  }
  private async categories(req: Request, res: Response, ctx: AdminContext) {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const data = await this.catalog.adminCategories(page, 20);
    const rows = data.items.map(item => `<tr><td colspan="3"><form class="row-form" method="post" action="/admin/categories">${this.token(ctx)}<input type="hidden" name="id" value="${item.id}"><input type="hidden" name="version" value="${item.version}"><label>Name<input name="name" value="${escape(item.name)}" maxlength="160" required></label><label>Slug<input name="slug" value="${escape(item.slug)}" pattern="[a-z0-9-]+" required></label><button>Save</button></form></td></tr>`).join('');
    this.page(res, ctx, 'Categories', `<h1>Categories</h1><p class="lede">Product classification.</p><section class="panel"><h2>Add category</h2><form class="row-form" method="post" action="/admin/categories">${this.token(ctx)}<label>Name<input name="name" maxlength="160" required></label><label>Slug<input name="slug" pattern="[a-z0-9-]+" required></label><button>Create category</button></form></section><div class="table-wrap"><table><thead><tr><th colspan="3">Category records</th></tr></thead><tbody>${rows}</tbody></table></div>${this.pager('/admin/categories', page, data.pageSize, data.total)}`, '/admin/categories');
  }
  private async customers(req: Request, res: Response, ctx: AdminContext) {
    const page = Math.max(1, Number(req.query.page) || 1); const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '';
    const data = await this.customersService.list(ctx.actor, { page, pageSize: 50, ...(q ? { q } : {}) });
    const rows = data.items.map(item => `<tr><td><a href="/admin/customers/${item.id}">${escape(item.name)}</a></td><td>${escape(item.status)}</td><td>${item.id}</td></tr>`).join('');
    this.page(res, ctx, 'Customers', `<h1>Customers</h1><p class="lede">Customer accounts and registration status.</p><form class="filters" method="get"><label>Search customers<input name="q" value="${escape(q)}" maxlength="120"></label><button>Search</button></form><p>${data.total} customers</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Record</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No customers found.</td></tr>'}</tbody></table></div>${this.pager('/admin/customers', page, data.pageSize, data.total, { ...(q ? { q } : {}) })}`, '/admin/customers');
  }
  private async customerDetail(req: Request, res: Response, ctx: AdminContext) {
    const data = await this.customersService.get(ctx.actor, first(req.params.id));
    const rows = data.orders.items.map(order => `<tr><td><a href="/admin/orders/${order.id}">${order.id.slice(0, 8).toUpperCase()}</a></td><td>${escape(order.status)}</td><td>${money(order.totalVnd)}</td><td>${date(order.createdAt.toISOString())}</td></tr>`).join('');
    const status = data.customer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    this.page(res, ctx, data.customer.name, `<p><a href="/admin/customers">Customers</a></p><h1>${escape(data.customer.name)}</h1><p>${escape(data.customer.email)} · ${escape(data.customer.status)}</p><section class="panel"><h2>Account access</h2><form method="post" action="/admin/customers/${data.customer.id}/status">${this.token(ctx)}<input type="hidden" name="version" value="${data.customer.version}"><input type="hidden" name="status" value="${status}"><label>Reason<input name="reason" maxlength="500" required></label><button>${status === 'SUSPENDED' ? 'Suspend account' : 'Reactivate account'}</button></form></section><section class="panel"><h2>Orders</h2><div class="table-wrap"><table><thead><tr><th>Order</th><th>Status</th><th>Total</th><th>Created</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No orders.</td></tr>'}</tbody></table></div></section>`, '/admin/customers');
  }
  private async changeCustomerStatus(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    await this.customersService.setStatus(ctx.actor, first(req.params.id), { version: Number(body.version), status: first(body.status) as 'ACTIVE' | 'SUSPENDED', reason: first(body.reason) });
    res.redirect(303, this.saved(`/admin/customers/${encodeURIComponent(first(req.params.id))}`, 'customerSaved'));
  }
  private async inventory(req: Request, res: Response, ctx: AdminContext) {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const pageSize = 50;
    const [items, total] = await Promise.all([this.db.variant.findMany({ include: { product: true }, orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }), this.db.variant.count()]);
    const rows = items.map(item => `<tr><td>${escape(item.product.name)}</td><td>${escape(item.sku)}</td><td>${escape(item.label)}</td><td>${item.stock}</td><td><form class="row-form" method="post" action="/admin/inventory/${item.id}/adjustments">${this.token(ctx)}<input type="hidden" name="version" value="${item.version}"><input type="hidden" name="operationKey" value="${randomUUID()}"><label>Units<input type="number" name="delta" step="1" required></label><label>Reason<input name="reason" maxlength="500" required></label><button>Adjust</button></form></td></tr>`).join('');
    this.page(res, ctx, 'Inventory', `<h1>Inventory</h1><p class="lede">Current stock by product format. Adjustments are audited and require a reason.</p><div class="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Format</th><th>Stock</th><th>Adjustment</th></tr></thead><tbody>${rows}</tbody></table></div>${this.pager('/admin/inventory', page, pageSize, total)}`, '/admin/inventory');
  }
  private async adjustInventory(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    await this.inventoryService.adjust(ctx.actor, first(req.params.id), { delta: Number(body.delta), reason: first(body.reason), version: Number(body.version), operationKey: first(body.operationKey) });
    res.redirect(303, this.saved('/admin/inventory', 'inventorySaved'));
  }
  private async settings(res: Response, ctx: AdminContext) {
    const [settings, zonePage] = await Promise.all([this.settingsService.get(ctx.actor), this.settingsService.zones(ctx.actor, { page: 1, pageSize: 100 })]);
    const rows = zonePage.items.map(zone => `<tr><td>${escape(zone.displayName)}</td><td>${escape(zone.code)}</td><td>${money(zone.feeVnd)}</td><td>${zone.enabled ? 'Enabled' : 'Disabled'}</td><td><form method="post" action="/admin/settings/zones/${zone.id}">${this.token(ctx)}<input type="hidden" name="version" value="${zone.version}"><input type="hidden" name="enabled" value="${!zone.enabled}"><button>Set ${zone.enabled ? 'disabled' : 'enabled'}</button></form></td></tr>`).join('');
    const form = `<form method="post" action="/admin/settings">${this.token(ctx)}<input type="hidden" name="version" value="${settings.version}"><label>Business name<input name="businessName" value="${escape(settings.businessName ?? '')}" maxlength="200"></label><label>Support email<input type="email" name="supportEmail" value="${escape(settings.supportEmail ?? '')}" maxlength="254"></label><label>Support phone<input name="supportPhone" value="${escape(settings.supportPhone ?? '')}" maxlength="30"></label><label class="check"><input type="checkbox" name="salesEnabled" value="true"${settings.salesEnabled ? ' checked' : ''}> Sales enabled</label><label class="check"><input type="checkbox" name="wineEnabled" value="true"${settings.wineEnabled ? ' checked' : ''}> Age-restricted products enabled</label><label class="check"><input type="checkbox" name="confirmLaunch" value="true"> Confirm launch prerequisites</label><label class="check"><input type="checkbox" name="confirmWine" value="true"> Confirm age-restricted catalogue review</label><button>Save settings</button></form>`;
    this.page(res, ctx, 'Store settings', `<h1>Store settings</h1><p class="lede">Store launch gates and delivery setup. Production sales remain controlled by deployment configuration.</p><section class="panel"><h2>Business and sales</h2>${form}</section><section class="panel"><h2>Delivery zones</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Code</th><th>Fee</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div><form class="row-form" method="post" action="/admin/settings/zones">${this.token(ctx)}<label>Code<input name="code" pattern="[A-Z0-9_-]{2,40}" required></label><label>Name<input name="displayName" maxlength="120" required></label><label>Fee (VND)<input type="number" name="feeVnd" min="0" max="1000000000" required></label><label class="check"><input type="checkbox" name="enabled" value="true"> Enabled</label><button>Add zone</button></form></section>`, '/admin/settings');
  }
  private async saveSettings(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string | undefined>;
    await this.settingsService.update(ctx.actor, { version: Number(body.version), salesEnabled: body.salesEnabled === 'true', wineEnabled: body.wineEnabled === 'true', businessName: first(body.businessName).trim() || null, supportEmail: first(body.supportEmail).trim() || null, supportPhone: first(body.supportPhone).trim() || null, confirmLaunch: body.confirmLaunch === 'true', confirmWine: body.confirmWine === 'true' });
    res.redirect(303, this.saved('/admin/settings', 'settingsSaved'));
  }
  private async addZone(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    await this.settingsService.addZone(ctx.actor, { code: first(body.code).toUpperCase(), displayName: first(body.displayName), feeVnd: Number(body.feeVnd), enabled: body.enabled === 'true' });
    res.redirect(303, this.saved('/admin/settings', 'zoneSaved'));
  }
  private async toggleZone(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    await this.settingsService.patchZone(ctx.actor, first(req.params.id), { version: Number(body.version), enabled: body.enabled === 'true' });
    res.redirect(303, this.saved('/admin/settings', 'zoneSaved'));
  }
  private async reports(req: Request, res: Response, ctx: AdminContext) {
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const from = typeof req.query.from === 'string' ? req.query.from : today;
    const to = typeof req.query.to === 'string' ? req.query.to : today;
    const totals = await this.reportsService.summary({ from, to }, ctx.actor);
    const statuses = await this.db.order.groupBy({ by: ['status'], _count: { _all: true } });
    const rows = statuses.map(item => `<tr><td>${escape(item.status)}</td><td>${item._count._all}</td></tr>`).join('');
    this.page(res, ctx, 'Reports', `<h1>Reports</h1><p class="lede">Delivered order value and COD collection totals, grouped by Vietnam delivery or collection date. These figures are not profit.</p><form class="filters" method="get"><label>From (Vietnam date)<input type="date" name="from" value="${escape(from)}" required></label><label>To (Vietnam date)<input type="date" name="to" value="${escape(to)}" required></label><button>Apply date range</button></form><section class="metrics"><div><span>Delivered order value</span><strong>${money(totals.deliveredOrderValueVnd)}</strong></div><div><span>COD collected</span><strong>${money(totals.codCollectedVnd)}</strong></div><div><span>COD due</span><strong>${money(totals.codDueVnd)}</strong></div><div><span>Delivered orders</span><strong>${totals.orderCount}</strong></div></section><section class="panel"><h2>Orders by status</h2><div class="table-wrap"><table><thead><tr><th>Status</th><th>Orders</th></tr></thead><tbody>${rows}</tbody></table></div></section>`, '/admin/reports');
  }
  private async audit(res: Response, ctx: AdminContext) {
    const rows = await this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    this.page(res, ctx, 'Audit log', `<h1>Audit log</h1><p class="lede">Recent administrator and commerce changes.</p><div class="table-wrap"><table><thead><tr><th>Action</th><th>Record</th><th>Time</th></tr></thead><tbody>${rows.map(item => `<tr><td>${escape(item.action)}</td><td>${escape(item.targetType)} · ${escape(item.targetId)}</td><td>${date(item.createdAt.toISOString())}</td></tr>`).join('')}</tbody></table></div>`, '/admin/audit');
  }
  private async emailJobs(res: Response, ctx: AdminContext) {
    const rows = await this.db.emailOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, template: true, attempts: true, availableAt: true, sentAt: true, exhaustedAt: true, lastErrorCode: true } });
    this.page(res, ctx, 'Email jobs', `<h1>Email jobs</h1><p class="lede">Delivery attempts and retry state.</p><div class="table-wrap"><table><thead><tr><th>Template</th><th>Attempts</th><th>Available</th><th>Sent</th><th>State</th></tr></thead><tbody>${rows.map(item => `<tr><td>${escape(item.template)}</td><td>${item.attempts}</td><td>${date(item.availableAt.toISOString())}</td><td>${item.sentAt ? date(item.sentAt.toISOString()) : '—'}</td><td>${item.sentAt ? 'Sent' : item.exhaustedAt ? 'Exhausted' : escape(item.lastErrorCode ?? 'Queued')}</td></tr>`).join('')}</tbody></table></div>`, '/admin/email-jobs');
  }
  private async content(res: Response, ctx: AdminContext) {
    const items = await this.db.contentPage.findMany({ orderBy: { slug: 'asc' } });
    this.page(res, ctx, 'Content', `<h1>Store content</h1><p class="lede">Policy and information pages. Publishing requires approved English content and required launch policies.</p>${items.map(item => `<section class="panel"><h2>${escape(item.title)} · ${escape(item.slug)}</h2><p>${escape(item.status)} · ${item.approvedAt ? `Approved ${date(item.approvedAt.toISOString())}` : 'Not approved'} · version ${item.version}</p><details><summary>Edit page</summary><form method="post" action="/admin/content/${encodeURIComponent(item.slug)}">${this.token(ctx)}<input type="hidden" name="version" value="${item.version}"><label>Title<input name="title" maxlength="160" value="${escape(item.title)}" required></label><label>Source<textarea name="source" maxlength="20000" required>${escape(item.source)}</textarea></label><label>Status<select name="status"><option${item.status === 'DRAFT' ? ' selected' : ''}>DRAFT</option><option${item.status === 'PUBLISHED' ? ' selected' : ''}>PUBLISHED</option></select></label><button>Save page</button></form></details></section>`).join('')}`, '/admin/content');
  }
  private async saveContent(req: Request, res: Response, ctx: AdminContext) {
    const body = req.body as Record<string, string>;
    await this.contentService.save(ctx.actor, first(req.params.slug), { title: first(body.title), source: first(body.source), status: first(body.status) as 'DRAFT' | 'PUBLISHED', version: Number(body.version) });
    res.redirect(303, this.saved('/admin/content', 'contentSaved'));
  }
  private css() { return `:root{font-family:Arial,sans-serif;color:#302725;background:#f7f4f1;font-size:14px}*{box-sizing:border-box}body{margin:0}.admin-shell{min-height:100vh;display:grid;grid-template-columns:250px 1fr}.sidebar{background:#fff;border-right:1px solid #e9e1db;padding:24px 18px;display:flex;flex-direction:column}.brand{color:#a9273b;font-size:20px;font-weight:800;text-decoration:none}.brand small{display:block;color:#766860;font-size:11px;margin-top:4px}.sidebar nav{margin-top:24px}.nav-group{margin:0 0 20px}.nav-group h2{font-size:10px;color:#65574f;text-transform:uppercase;letter-spacing:.1em;margin:0 0 8px}.nav-group a,.back-store{display:block;padding:9px 10px;border-radius:5px;color:#514541;text-decoration:none;font-weight:700;font-size:13px}.nav-group a[aria-current=page]{background:#faeef0;color:#a9273b}.back-store{margin-top:auto;border-top:1px solid #eee;padding-top:16px}.logout-form{margin:0}.logout-form button{width:100%;border:0;background:transparent;color:#514541;text-align:left;padding:9px 10px;border-radius:5px;font:700 13px Arial,sans-serif;cursor:pointer}.logout-form button:hover,.logout-form button:focus-visible{background:#faeef0;color:#a9273b}.admin-main{min-width:0}.page-top{height:58px;background:#fff;border-bottom:1px solid #e9e1db;padding:0 32px;display:flex;align-items:center;justify-content:space-between;font-size:11px;letter-spacing:.12em;color:#786961}.page-top a{color:#a9273b;letter-spacing:0}.page-content{max-width:1250px;margin:auto;padding:34px}.page-content h1{font-size:30px;margin:0 0 8px}.lede{color:#786961;margin:0 0 24px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:20px 0}.metrics>a,.metrics>div{display:block;background:#fff;padding:18px;border:1px solid #eee5de;border-radius:8px;color:#594b45;text-decoration:none}.metrics span{display:block;color:#65574f;font-size:12px}.metrics strong{display:block;font-size:24px;margin-top:10px;color:#a9273b}.panel{background:#fff;border:1px solid #eee5de;border-radius:8px;padding:20px;margin:18px 0}.panel h2{margin:0 0 14px;font-size:18px}.panel-heading{display:flex;justify-content:space-between;gap:16px}.panel-heading p{color:#65574f;font-size:12px}.panel-heading a,a{color:#a9273b}.chart{background:#fff;border:1px solid #eee5de;border-radius:8px;padding:18px}.chart svg{width:100%;max-height:210px}.chart text{font-size:12px;fill:#574a43}.chart figcaption{font-size:11px;color:#65574f}.table-wrap{width:100%;overflow:auto}table{width:100%;border-collapse:collapse;background:#fff;font-size:13px}th,td{text-align:left;padding:12px;border-bottom:1px solid #eee7e1;vertical-align:top}th{font-size:11px;color:#5f534c;text-transform:uppercase;white-space:nowrap}.filters{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:20px 0}.filters label,.panel form>label{display:grid;gap:6px;font-weight:700;font-size:12px}.filters input,.filters select,.panel input:not([type=hidden]),.panel textarea{height:40px;padding:8px;border:1px solid #d8cdc5;border-radius:5px;background:#fff}.filters .check{display:flex;align-items:center;padding:10px}.filters button,.panel button{height:40px;border:0;border-radius:5px;background:#a9273b;color:#fff;padding:0 16px;font-weight:700;cursor:pointer}.panel form{display:grid;gap:14px}.panel fieldset{border:1px solid #eee5de;border-radius:6px;padding:12px}.panel legend{font-weight:700}.choice-row{display:grid!important;grid-template-columns:1fr 2fr auto auto;align-items:center;gap:8px;margin:8px 0}.choice-row input{width:auto}.row-form{display:flex;align-items:end;gap:10px;flex-wrap:wrap}.row-form label{display:grid;gap:5px;font-size:12px;font-weight:700}.row-form input:not([type=hidden]){height:38px;min-width:120px;padding:8px;border:1px solid #d8cdc5;border-radius:5px}.row-form button{height:38px;border:0;border-radius:5px;background:#a9273b;color:#fff;padding:0 14px;font-weight:700;cursor:pointer}.check{display:flex!important;align-items:center;gap:8px}.pagination{display:flex;justify-content:flex-end;align-items:center;gap:16px;padding:16px 0}.pagination span{color:#65574f}.image-list{display:flex;flex-wrap:wrap;gap:16px}.image-list figure{margin:0}.image-list img{display:block;max-width:220px;height:auto;object-fit:contain}.flash{margin:16px 34px;background:#fff0ee;padding:12px;color:#8c1f30}@media(max-width:800px){.admin-shell{grid-template-columns:1fr}.sidebar{padding:12px;position:static}.sidebar nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:12px}.nav-group{margin:0}.nav-group a{padding:7px}.back-store{margin-top:8px}.page-content{padding:20px}.page-top{padding:0 20px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.choice-row{grid-template-columns:1fr 2fr auto auto}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}`; }
}
