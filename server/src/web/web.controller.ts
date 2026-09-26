import { Injectable, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { productQuery, parse } from '../catalog/catalog.schemas.js';
import { ContentService } from '../content/content.service.js';
import { PrismaService } from '../db/prisma.service.js';
import { renderPage } from './render-page.js';

const contentPaths = new Set(['about', 'contact', 'shipping', 'returns', 'privacy', 'terms']);
@Injectable()
export class WebController {
  constructor(private readonly catalog: CatalogService, private readonly content: ContentService,
    private readonly db: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async publicPage(request: Request, response: Response) {
    const url = new URL(request.originalUrl, this.config.origin);
    const path = url.pathname;
    const slug = String(request.params.slug ?? '');
    const data: { products?: unknown; categories?: unknown; product?: unknown; content?: unknown } = {};
    try {
      if (path === '/') data.products = await this.catalog.list(parse(productQuery, { pageSize: '12' }));
      else if (path === '/products') {
        data.products = await this.catalog.list(parse(productQuery, Object.fromEntries(url.searchParams)));
        data.categories = await this.catalog.categories(1, 100);
      } else if (path.startsWith('/products/')) data.product = await this.catalog.detail(slug);
      else {
        const key = path === '/about' ? 'about' : path === '/contact' ? 'contact' : slug;
        if (contentPaths.has(key)) data.content = await this.content.publicPage(key);
      }
    } catch (error) {
      if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error;
    }
    const page = await renderPage(request.originalUrl, this.config.origin, data);
    response.status(page.status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' }).send(page.html);
  }

  robots(response: Response) {
    response.type('text/plain').send('User-agent: *\nDisallow: /account\nDisallow: /admin\nDisallow: /checkout\nSitemap: ' + new URL('/sitemap.xml', this.config.origin));
  }
  async sitemap(response: Response) {
    const [products, pages] = await Promise.all([
      this.db.product.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true } }),
      this.db.contentPage.findMany({ where: { status: 'PUBLISHED', approvedAt: { not: null } }, select: { slug: true } }),
    ]);
    const paths = ['/', '/products', ...products.map(p => `/products/${encodeURIComponent(p.slug)}`),
      ...pages.map(p => p.slug === 'about' || p.slug === 'contact' ? `/${p.slug}` : `/policies/${p.slug}`)];
    response.type('application/xml').set('Cache-Control', 'public, max-age=300').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${new URL(path, this.config.origin)}</loc></url>`).join('')}</urlset>`);
  }
  async privateShell(response: Response) {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const { webRoot } = await import('./render-page.js');
    const template = await readFile(resolve(webRoot(), 'dist/index.html'), 'utf8');
    response.type('html').set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }).send(template.replace('</head>', '<meta name="robots" content="noindex" /></head>'));
  }
  async notFound(request: Request, response: Response) {
    const page = await renderPage(request.originalUrl, this.config.origin, {});
    response.status(404).type('html').set({ 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Robots-Tag': 'noindex' }).send(page.html);
  }
}

export function webRouter(web: WebController) {
  const router = Router();
  const handle = (promise: Promise<unknown>, next: (error?: unknown) => void) => { void promise.catch(next); };
  router.get(['/', '/products', '/products/:slug', '/about', '/contact', '/policies/:slug'], (req, res, next) => handle(web.publicPage(req, res), next));
  router.get('/robots.txt', (_req, res) => web.robots(res));
  router.get('/sitemap.xml', (_req, res, next) => handle(web.sitemap(res), next));
  router.get(['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/cart', '/checkout', '/account', '/account/addresses', '/account/orders', '/account/orders/:id', '/admin', '/admin/*path'], (_req, res, next) => handle(web.privateShell(res), next));
  router.get(/.*/, (req, res, next) => {
    if (/^\/(api|health|assets|images)(\/|$)/.test(req.path) || /\.[a-z0-9]{2,6}$/i.test(req.path)) return next();
    handle(web.notFound(req, res), next);
  });
  return router;
}
