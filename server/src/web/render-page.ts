import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type PublicPageData = { products?: unknown; categories?: unknown; product?: unknown; content?: unknown };
type RenderedPage = { html: string; status: number; title: string; description: string; canonical: string; structuredData?: object };
const escapeAttribute = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const webRoot = () => process.env.WEB_ROOT ?? (existsSync(resolve(process.cwd(), 'dist/index.html')) ? process.cwd() : resolve(process.cwd(), '..'));

export async function renderPage(url: string, origin: string, data: PublicPageData) {
  const root = webRoot();
  const [template, module] = await Promise.all([
    readFile(resolve(root, 'dist/index.html'), 'utf8'),
    import(pathToFileURL(resolve(root, 'dist-ssr/entry-server.js')).href) as Promise<{ renderPublicPage: (url: string, data: PublicPageData) => Promise<RenderedPage> }>,
  ]);
  const page = await module.renderPublicPage(url, data);
  const canonical = new URL(page.canonical, origin).toString();
  // JSON is public catalog/content only. Escaping '<' prevents script termination and HTML injection.
  const initial = JSON.stringify(data).replace(/</g, '\\u003c');
  const structured = page.structuredData ? `<script type="application/ld+json">${JSON.stringify(page.structuredData).replace(/</g, '\\u003c')}</script>` : '';
  const html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeAttribute(page.description)}" />`)
    .replace('</head>', `<link rel="canonical" href="${escapeAttribute(canonical)}" />${structured}</head>`)
    .replace('<div id="root"></div>', `<div id="root">${page.html}</div><script id="public-data" type="application/json">${initial}</script>`);
  return { html, status: page.status };
}
