import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import { parseBody } from '../http/schemas.js';
import { adminPageSchema, contentSaveSchema } from '../admin/settings.schemas.js';
import type { z } from 'zod';

const publicSlugs = new Set(['about', 'contact', 'shipping', 'returns', 'privacy', 'terms']);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function renderSafeMarkdown(source: string): string {
  const renderLine = (line: string) => {
    const links = /\[([^\]]{1,200})\]\(([^)\s]+)\)/g;
    let html = '', offset = 0;
    for (const match of line.matchAll(links)) {
      const position = match.index ?? 0;
      html += escapeHtml(line.slice(offset, position));
      const url = new URL(match[2]);
      html += `<a href="${escapeHtml(url.toString())}" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`;
      offset = position + match[0].length;
    }
    return html + escapeHtml(line.slice(offset));
  };
  return source.split(/\n\s*\n/).map(block => `<p>${block.split('\n').map(renderLine).join('<br>')}</p>`).join('');
}
function validateLinks(source: string) {
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    try { const url = new URL(match[1]); if (url.protocol === 'http:' || url.protocol === 'https:') continue; }
    catch { /* Invalid links are rejected below. */ }
    throw new UnprocessableEntityException({ code: 'UNSAFE_LINK' });
  }
}

@Injectable()
export class ContentService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService) {}
  private slug(value: string) {
    if (!publicSlugs.has(value)) throw new NotFoundException();
    return value;
  }
  private async admin(tx: Prisma.TransactionClient, actor: Actor) {
    await this.identity.assertActiveActor(tx, actor);
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } });
    if (user?.role !== 'ADMIN') throw new ForbiddenException();
  }
  private view(row: { slug: string; title: string; source: string; status: string; version: number; approvedAt: Date | null }) {
    return { slug: row.slug, title: row.title, source: row.source, html: renderSafeMarkdown(row.source),
      status: row.status, version: row.version, approvedAt: row.approvedAt?.toISOString() ?? null };
  }
  async publicPage(slug: string) {
    this.slug(slug);
    const page = await this.db.contentPage.findUnique({ where: { slug } });
    if (!page || page.status !== 'PUBLISHED' || !page.approvedAt) throw new NotFoundException();
    const { source: _source, status: _status, version: _version, approvedAt: _approvedAt, ...view } = this.view(page);
    return view;
  }
  async list(actor: Actor, raw: unknown) {
    const f = parseBody(adminPageSchema, raw);
    return withTransaction(this.db, async tx => { await this.admin(tx, actor);
      const [rows, total] = await Promise.all([tx.contentPage.findMany({ orderBy: { slug: 'asc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }), tx.contentPage.count()]);
      return { items: rows.map(row => this.view(row)), ...f, total };
    });
  }
  async save(actor: Actor, slug: string, raw: z.infer<typeof contentSaveSchema>) {
    this.slug(slug);
    const input = parseBody(contentSaveSchema, raw);
    validateLinks(input.source);
    return withTransaction(this.db, async tx => { await this.admin(tx, actor);
      if (['shipping', 'privacy', 'terms', 'returns'].includes(slug)) {
        await tx.$queryRaw`SELECT id FROM store_settings ORDER BY id LIMIT 1 FOR UPDATE`;
        if (input.status !== 'PUBLISHED') {
          const settings = await tx.storeSettings.findFirst({ select: { salesEnabled: true } });
          if (settings?.salesEnabled) throw new UnprocessableEntityException({ code: 'POLICY_REQUIRED_FOR_SALES' });
        }
      }
      await tx.$queryRaw`SELECT id FROM content_pages WHERE slug = ${slug} FOR UPDATE`;
      const current = await tx.contentPage.findUnique({ where: { slug } });
      if ((!current && input.version !== 1) || (current && current.version !== input.version))
        throw new ConflictException({ code: 'VERSION_CONFLICT' });
      const data = { title: input.title, source: input.source, status: input.status,
        approvedAt: input.status === 'PUBLISHED' ? new Date() : null } as const;
      const page = current ? await tx.contentPage.update({ where: { slug }, data: { ...data, version: { increment: 1 } } })
        : await tx.contentPage.create({ data: { slug, ...data } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'CONTENT_UPDATED', targetType: 'ContentPage', targetId: page.id,
        changesJson: { slug, status: page.status, version: page.version } } });
      return this.view(page);
    });
  }
}
