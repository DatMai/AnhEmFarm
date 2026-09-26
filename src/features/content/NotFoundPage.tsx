import { Link } from 'react-router-dom'
export function NotFoundPage() { return <section className="container section"><h1>Page not found</h1><p>The page may have moved or is no longer available.</p><Link className="button button-primary" to="/products">Browse products</Link></section> }
