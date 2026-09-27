export type GuestLine = { variantId: string; quantity: number; optionId: string | null }
export type GuestMerge = { key: string; items: GuestLine[] }
type Stored = { version: 2; items: GuestLine[]; pendingMerge?: GuestMerge }
const storageKey = 'anhemfarm.guestCart'
// Fifty lines can appear twice while a merge is pending; keep storage bounded.
const maxStoredChars = 9000
const empty = (): Stored => ({ version: 2, items: [] })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validLines = (value: unknown, legacy = false): value is Array<Omit<GuestLine, 'optionId'> & { optionId?: string | null }> => Array.isArray(value) && value.length <= 50 &&
  value.every(line => line && typeof line === 'object' &&
    Object.keys(line).sort().join(',') === (legacy ? 'quantity,variantId' : 'optionId,quantity,variantId') &&
    typeof line.variantId === 'string' && uuid.test(line.variantId) && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99 &&
    (legacy || line.optionId === null || typeof line.optionId === 'string' && uuid.test(line.optionId))) &&
  new Set(value.map(line => `${line.variantId}:${line.optionId ?? 'none'}`)).size === value.length
const canonical = (items: GuestLine[]) => [...items].sort((a, b) => `${a.variantId}:${a.optionId ?? 'none'}`.localeCompare(`${b.variantId}:${b.optionId ?? 'none'}`))
const normalize = (items: Array<{ variantId: string; quantity: number; optionId?: string | null }>): GuestLine[] => canonical(items.map(line => ({ variantId: line.variantId, quantity: line.quantity, optionId: line.optionId ?? null })))
export function loadGuestCart(): Stored {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw || raw.length > maxStoredChars) return empty()
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return empty()
    const record = data as Record<string, unknown>
    if (record.version === 1 && validLines(record.items, true)) {
      const items = normalize(record.items)
      let pendingMerge: GuestMerge | undefined
      if (record.pendingMerge !== undefined) {
        const pending = record.pendingMerge as Record<string, unknown>
        if (!pending || typeof pending.key !== 'string' || !uuid.test(pending.key) || !validLines(pending.items, true) ||
          Object.keys(pending).sort().join(',') !== 'items,key' || JSON.stringify(normalize(pending.items)) !== JSON.stringify(items)) return empty()
        pendingMerge = { key: pending.key, items: normalize(pending.items) }
      }
      if (Object.keys(record).some(key => !['version', 'items', 'pendingMerge'].includes(key))) return empty()
      const upgraded = { version: 2 as const, items, ...(pendingMerge ? { pendingMerge } : {}) }
      localStorage.setItem(storageKey, JSON.stringify(upgraded))
      return upgraded
    }
    if (record.version !== 2 || !validLines(record.items) || Object.keys(record).some(key => !['version', 'items', 'pendingMerge'].includes(key))) return empty()
    if (record.pendingMerge !== undefined) {
      const pending = record.pendingMerge as GuestMerge
      if (!pending || typeof pending.key !== 'string' || !uuid.test(pending.key) || !validLines(pending.items) ||
        JSON.stringify(canonical(pending.items as GuestLine[])) !== JSON.stringify(canonical(record.items as GuestLine[])) || Object.keys(pending).sort().join(',') !== 'items,key') return empty()
    }
    return { version: 2, items: canonical(record.items as GuestLine[]), ...(record.pendingMerge ? { pendingMerge: record.pendingMerge as GuestMerge } : {}) }
  } catch { return empty() }
}
export function saveGuestCart(items: Array<{ variantId: string; quantity: number; optionId?: string | null }>): void {
  const normalized = normalize(items)
  if (!validLines(normalized)) throw new Error('Invalid guest cart')
  const old = loadGuestCart()
  const pendingMerge = JSON.stringify(normalized) === JSON.stringify(old.items) ? old.pendingMerge : undefined
  localStorage.setItem(storageKey, JSON.stringify({ version: 2, items: normalized, ...(pendingMerge ? { pendingMerge } : {}) }))
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
  if (current.pendingMerge?.key === merge.key && JSON.stringify(current.items) === JSON.stringify(merge.items)) localStorage.removeItem(storageKey)
}
