import { api } from '../../lib/api'
import { clearMergedGuestCart, prepareGuestMerge } from './guest-cart'

export type CartView = { version: number; items: Array<{ variantId: string; optionId: string | null; optionGroupLabel: string | null; optionLabel: string | null; quantity: number; productName: string; variantLabel: string; priceVnd: number | null; restricted18: boolean; available: boolean }> }
export const getCart = () => api<CartView>('/cart')
export const setCartItem = (variantId: string, quantity: number, version: number, optionId: string | null = null) => api<CartView>(`/cart/items/${encodeURIComponent(variantId)}`, { method: 'PUT', body: { quantity, optionId, version } })
export const removeCartItem = (variantId: string, version: number, optionId: string | null = null) => api<CartView>(`/cart/items/${encodeURIComponent(variantId)}`, { method: 'DELETE', body: { optionId, version } })
export async function mergeGuestCart(): Promise<CartView> {
  const merge = prepareGuestMerge()
  if (!merge) return getCart()
  const result = await api<CartView>('/cart/merge', { method: 'POST', body: merge })
  clearMergedGuestCart(merge)
  return result
}
