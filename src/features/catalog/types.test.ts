import { expect, test } from 'vitest'
import { previewImage, variantAvailable, type ProductDetail } from './types'
test('mixed variants only label the individually purchasable one available', () => {
  const product = { purchasable: true, confirmed: true } as ProductDetail
  expect(variantAvailable(product, { id: '1', label: 'Ready', packDetails: '250 g', priceVnd: 100_000, inStock: true, saleEnabled: true })).toBe(true)
  expect(variantAvailable(product, { id: '2', label: 'No price', packDetails: '250 g', priceVnd: null, inStock: true, saleEnabled: true })).toBe(false)
  expect(variantAvailable(product, { id: '3', label: 'No pack', packDetails: ' ', priceVnd: 100_000, inStock: true, saleEnabled: true })).toBe(false)
})
test('illustrative artwork is available only for explicit demo slugs', () => {
  expect(previewImage('demo-mulberry-jam')).toBe('/images/jam.jpg')
  expect(previewImage('demo-floral-honey')).toBe('/images/honey.jpg')
  expect(previewImage('real-mulberry-jam')).toBeUndefined()
})
