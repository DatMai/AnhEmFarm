import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatVnd } from '../../lib/money'
import {
  AccountNav,
  Pager,
  usePrivate,
  type Address,
  type Page
} from './shared'
export type Order = {
  id: string
  version: number
  status: string
  collectionState: string
  recipient: Address
  subtotalVnd: number
  shippingVnd: number
  totalVnd: number
  tracking?: string
  items: {
    variantId: string
    optionGroupLabel: string | null
    optionLabel: string | null
    name: string
    label: string
    sku: string
    quantity: number
    priceVnd: number
  }[]
  events: {
    id: string
    toStatus: string
    reason: string | null
    createdAt: string
  }[]
}
export const statusLabel = (status: string) =>
  ({
    PENDING: 'Pending confirmation',
    CONFIRMED: 'Confirmed',
    SHIPPING: 'Shipping',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
    RETURNED: 'Returned'
  })[status] ?? status
export function OrdersPage() {
  const [page, setPage] = useState(1),
    query = usePrivate<Page<Order>>(`/orders?page=${page}`)
  return (
    <section className="container section commerce">
      <AccountNav />
      <h1>Your orders</h1>
      {query.isPending && <p>Loading orders…</p>}
      {query.isError && (
        <button onClick={() => void query.refetch()}>Retry orders</button>
      )}
      {query.data?.items.length === 0 && <p>No orders yet.</p>}
      {query.data?.items.map((order) => (
        <article className="commerce-card" key={order.id}>
          <Link to={`/account/orders/${order.id}`}>Order {order.id}</Link>
          <p>
            {statusLabel(order.status)} · {formatVnd(order.totalVnd)}
          </p>
        </article>
      ))}
      <Pager page={page} total={query.data?.total ?? 0} change={setPage} />
    </section>
  )
}
