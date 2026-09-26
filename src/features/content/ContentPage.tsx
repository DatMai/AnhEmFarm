import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PageState } from '../../components/PageState'
import { api, ApiError } from '../../lib/api'
import { publicKey } from '../../lib/query-client'

export type PublicContent = { slug: string; title: string; html: string }

export function ContentPage({ slug: fixedSlug }: { slug?: string }) {
  const params = useParams()
  const slug = fixedSlug ?? params.slug ?? ''
  const query = useQuery({
    queryKey: publicKey('content', slug),
    queryFn: ({ signal }) => api<PublicContent>(`/content/${encodeURIComponent(slug)}`, { signal }),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1
  })
  if (query.isPending) return <section className="container section"><PageState title="Loading page" /></section>
  if (query.isError) return <section className="container section"><PageState title={query.error instanceof ApiError && query.error.status === 404 ? 'Page not published yet' : 'Page unavailable'}><Link to="/products">Browse products</Link></PageState></section>
  return <article className="container section content-page"><span className="section-kicker">ANHEMFARM</span><h1>{query.data.title}</h1><div className="content-body" dangerouslySetInnerHTML={{ __html: query.data.html }} /></article>
}
