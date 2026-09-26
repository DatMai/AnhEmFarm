export type GuestLine = { variantId: string; quantity: number }
export type GuestMerge = { key: string; items: GuestLine[] }
type Stored = { version: 1; items: GuestLine[]; pendingMerge?: GuestMerge }
const storageKey = 'anhemfarm.guestCart'
// 50 two-digit quantity lines appear twice while a merge is pending (6,795 serialized characters).
const maxStoredChars = 6800
const empty = (): Stored => ({ version: 1, items: [] })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validLines = (value: unknown): value is GuestLine[] => Array.isArray(value) && value.length <= 50 &&
  value.every(line => line && typeof line === 'object' && Object.keys(line).sort().join(',') === 'quantity,variantId' &&
    typeof line.variantId === 'string' && uuid.test(line.variantId) && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99) &&
  new Set(value.map(line => line.variantId)).size === value.length
const canonical = (items: GuestLine[]) => [...items].sort((a, b) => a.variantId.localeCompare(b.variantId))
export function loadGuestCart(): Stored {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw || raw.length > maxStoredChars) return empty()
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return empty()
    const record = data as Record<string, unknown>
    if (record.version !== 1 || !validLines(record.items) || Object.keys(record).some(key => !['version', 'items', 'pendingMerge'].includes(key))) return empty()
    if (record.pendingMerge !== undefined) {
      const pending = record.pendingMerge as GuestMerge
      if (!pending || typeof pending.key !== 'string' || !uuid.test(pending.key) || !validLines(pending.items) ||
        JSON.stringify(canonical(pending.items)) !== JSON.stringify(canonical(record.items)) || Object.keys(pending).sort().join(',') !== 'items,key') return empty()
    }
    return { version: 1, items: canonical(record.items), ...(record.pendingMerge ? { pendingMerge: record.pendingMerge as GuestMerge } : {}) }
  } catch { return empty() }
}
export function saveGuestCart(items: GuestLine[]): void {
  if (!validLines(items)) throw new Error('Invalid guest cart')
  const old = loadGuestCart()
  const sorted = canonical(items)
  const pendingMerge = JSON.stringify(sorted) === JSON.stringify(old.items) ? old.pendingMerge : undefined
  localStorage.setItem(storageKey, JSON.stringify({ version: 1, items: sorted, ...(pendingMerge ? { pendingMerge } : {}) }))
}
export function prepareGuestMerge(): GuestMerge | null {
  const cart = loadGuestCart()
  if (!cart.items.length) return null
  if (cart.pendingMerge) return cart.pendingMerge
  const pendingMerge = { key: crypto.randomUUID(), items: cart.items }
  localStorage.setItem(storageKey, JSON.stringify({ ...cart, pendingMerge }))
  return pendingMerge
}
export function clearMergedGuestCart(merge: GuestMerge): void {
  const current = loadGuestCart()
  if (current.pendingMerge?.key === merge.key && JSON.stringify(current.items) === JSON.stringify(merge.items))
    localStorage.removeItem(storageKey)
}
