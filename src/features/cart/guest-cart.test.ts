import { beforeEach, describe, expect, it } from 'vitest'
import { clearMergedGuestCart, loadGuestCart, prepareGuestMerge, saveGuestCart } from './guest-cart'

const id = '84ac8049-54e5-43c2-9a55-8d60934797cf'
describe('guest cart storage', () => {
  beforeEach(() => localStorage.clear())
  it('rejects malformed or unbounded data', () => {
    localStorage.setItem('anhemfarm.guestCart', '{bad')
    expect(loadGuestCart().items).toEqual([])
    localStorage.setItem('anhemfarm.guestCart', JSON.stringify({ version: 1, items: Array.from({ length: 51 }, () => ({ variantId: id, quantity: 1 })) }))
    expect(loadGuestCart().items).toEqual([])
    localStorage.setItem('anhemfarm.guestCart', JSON.stringify({ version: 1, items: [{ variantId: id, quantity: 100 }] }))
    expect(loadGuestCart().items).toEqual([])
  })
  it('retries the same snapshot and key, then clears only after success', () => {
    saveGuestCart([{ variantId: id, quantity: 2 }])
    const first = prepareGuestMerge()
    expect(prepareGuestMerge()).toEqual(first)
    expect(loadGuestCart().items).toHaveLength(1)
    saveGuestCart([{ variantId: id, quantity: 3 }])
    expect(prepareGuestMerge()?.key).not.toBe(first?.key)
    clearMergedGuestCart(first!)
    expect(loadGuestCart().items[0].quantity).toBe(3)
    clearMergedGuestCart(prepareGuestMerge()!)
    expect(loadGuestCart().items).toEqual([])
  })
})
