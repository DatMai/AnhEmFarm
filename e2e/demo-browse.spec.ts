import { expect, test } from '@playwright/test'

const demo = { id: 'demo-1', slug: 'demo-mulberry-jam', name: 'Mulberry jam',
  category: { id: 'mulberries', slug: 'mulberries', name: 'Mulberries' }, images: [],
  startingPriceVnd: null, purchasable: false, confirmed: false }

test('preview listing has illustrative artwork and a useful product detail', async ({ page }) => {
  await page.route('**/api/v1/products?*', route => route.fulfill({ json: { items: [demo], page: 1, pageSize: 20, total: 1 } }))
  await page.route('**/api/v1/categories?*', route => route.fulfill({ json: { items: [demo.category], page: 1, pageSize: 100, total: 1 } }))
  await page.route('**/api/v1/products/demo-mulberry-jam', route => route.fulfill({ json: { ...demo,
    description: 'A preview of the planned mulberry jam range.', confirmed: false, restricted18: false,
    variants: [{ id: 'variant-1', label: 'Jar', packDetails: 'Details pending', priceVnd: null, inStock: false, saleEnabled: false }] } }))
  await page.goto('/products')
  await expect(page.getByRole('link', { name: 'Mulberry jam', exact: true })).toBeVisible()
  await expect(page.locator('.product-card img')).toHaveAttribute('src', '/images/jam.jpg')
  await page.getByRole('link', { name: 'Mulberry jam', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mulberry jam' })).toBeVisible()
  await expect(page.locator('.detail-image img')).toHaveAttribute('src', '/images/jam.jpg')
  await expect(page.locator('.preview-notice')).toContainText('Preview listing')
  await expect(page.getByRole('button', { name: /add jar to cart/i })).toBeDisabled()
})

test('a confirmed former preview no longer claims ordering is unavailable', async ({ page }) => {
  const confirmed = { ...demo, confirmed: true, startingPriceVnd: 75_000, purchasable: true }
  await page.route('**/api/v1/products?*', route => route.fulfill({ json: { items: [confirmed], page: 1, pageSize: 20, total: 1 } }))
  await page.route('**/api/v1/categories?*', route => route.fulfill({ json: { items: [demo.category], page: 1, pageSize: 100, total: 1 } }))
  await page.route('**/api/v1/products/demo-mulberry-jam', route => route.fulfill({ json: { ...confirmed,
    description: 'Confirmed product details.', restricted18: false,
    variants: [{ id: 'variant-1', label: 'Jar', packDetails: '250 g', priceVnd: 75_000, inStock: true, saleEnabled: true }] } }))
  await page.goto('/products')
  await expect(page.locator('.product-card .product-badge')).toHaveCount(0)
  await page.getByRole('link', { name: 'Mulberry jam', exact: true }).click()
  await expect(page.locator('.preview-notice')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /add jar to cart/i })).toBeEnabled()
})

test('unpublished information pages explain their status and offer navigation', async ({ page }) => {
  await page.route('**/api/v1/content/*', route => route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } }))
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'About AnhEmFarm' })).toBeVisible()
  await expect(page.getByRole('link', { name: /browse products/i })).toBeVisible()
  await page.goto('/policies/shipping')
  await expect(page.getByRole('heading', { name: 'Shipping information' })).toBeVisible()
  await expect(page.getByText(/official shipping details are being prepared/i)).toBeVisible()
})

test('home has routes to all four product families', async ({ page }) => {
  await page.route('**/api/v1/products?*', route => route.fulfill({ json: { items: [], page: 1, pageSize: 4, total: 0 } }))
  await page.goto('/')
  for (const family of ['Mulberries', 'Coffee', 'Tea', 'Honey'])
    await expect(page.locator('.category-grid').getByRole('link', { name: new RegExp(family, 'i') })).toBeVisible()
})

test('a category URL reads as its own browse page', async ({ page }) => {
  await page.route('**/api/v1/products?*', route => route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } }))
  await page.route('**/api/v1/categories?*', route => route.fulfill({ json: { items: [{ id: 'tea', slug: 'tea', name: 'Tea' }], page: 1, pageSize: 100, total: 1 } }))
  await page.goto('/products?category=tea')
  await expect(page.getByRole('heading', { name: 'Tea', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /All products/ })).toBeVisible()
})
