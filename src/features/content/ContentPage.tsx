import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PageState } from '../../components/PageState'
import { api, ApiError } from '../../lib/api'
import { publicKey } from '../../lib/query-client'

export type PublicContent = { slug: string; title: string; html: string }

const pendingPages: Record<string, { title: string; intro: string; detail: string }> = {
  about: { title: 'About AnhEmFarm', intro: 'A growing home for everyday farm flavors.',
    detail: 'Explore the mulberry and coffee ranges while we prepare verified product details. Tea and honey are proposed ranges. Every preview listing is marked, and ordering stays unavailable until product information is confirmed.' },
  contact: { title: 'Contact AnhEmFarm', intro: 'Our official contact details are being prepared.',
    detail: 'We will publish a verified support channel here before accepting orders. Please do not send personal or order information through unofficial channels.' },
  shipping: { title: 'Shipping information', intro: 'Official shipping details are being prepared.',
    detail: 'Delivery areas, fees, timing, and handling information will appear here after review. Ordering is unavailable until the approved shipping policy is published.' },
  returns: { title: 'Returns information', intro: 'Official returns details are being prepared.',
    detail: 'Return eligibility, time limits, and support steps will appear here after review. No preview text on this page is a sales policy.' },
  privacy: { title: 'Privacy information', intro: 'The official privacy notice is being prepared.',
    detail: 'The approved notice will explain how customer information is handled. Please wait for that notice before relying on this page for privacy terms.' },
  terms: { title: 'Terms information', intro: 'The official terms are being prepared.',
    detail: 'Terms for placing and fulfilling orders will appear here after review. Ordering remains unavailable until approved terms are published.' },
}

export function PendingContent({ slug }: { slug: string }) {
  const page = pendingPages[slug]
  if (!page) return <section className="container section"><PageState title="Page not found"><Link to="/products">Browse products</Link></PageState></section>
  return <article className="container section pending-content"><div className="pending-content-main"><span className="section-kicker">ANHEMFARM INFORMATION</span><h1>{page.title}</h1><p className="pending-lead">{page.intro}</p><p>{page.detail}</p><div className="pending-actions"><Link className="button button-primary" to="/products">Browse products</Link><Link className="text-link" to="/">Back to home →</Link></div></div><aside className="pending-content-aside"><span className="pending-status">Content pending review</span><h2>What is available now?</h2><p>You can browse preview product pages and see which details still need confirmation. Prices and ordering will appear only when the store is ready.</p><nav aria-label="Information pages"><Link to="/about">About</Link><Link to="/contact">Contact</Link><Link to="/policies/shipping">Shipping</Link><Link to="/policies/returns">Returns</Link><Link to="/policies/privacy">Privacy</Link><Link to="/policies/terms">Terms</Link></nav></aside></article>
}

export function ContentPage({ slug: fixedSlug }: { slug?: string }) {
  const params = useParams()
  const slug = fixedSlug ?? params.slug ?? ''
  const query = useQuery({
    queryKey: publicKey('content', slug),
    queryFn: ({ signal }) => api<PublicContent>(`/content/${encodeURIComponent(slug)}`, { signal }),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1
  })
  if (query.isPending) return <section className="container section"><PageState title="Loading page" /></section>
  if (query.isError && query.error instanceof ApiError && query.error.status === 404) return <PendingContent slug={slug} />
  if (query.isError) return <section className="container section"><PageState title="Page unavailable"><Link to="/products">Browse products</Link></PageState></section>
  return <article className="container section content-page"><span className="section-kicker">ANHEMFARM</span><h1>{query.data.title}</h1><div className="content-body" dangerouslySetInnerHTML={{ __html: query.data.html }} /></article>
}
