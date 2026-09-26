import { expect, test } from '@playwright/test'

const categoryId = '11111111-1111-4111-8111-111111111111'
const productId = '22222222-2222-4222-8222-222222222222'
const variantId = '33333333-3333-4333-8333-333333333333'

test('admin creates, stocks and publishes a product through the UI', async ({ page }) => {
  let product: any = null
  await page.route('**/api/v1/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : {}
    const respond = (json: unknown, status = 200) => route.fulfill({ status, json })
    if (path === '/api/v1/auth/me') return respond({ user: { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'ADMIN', verified: true } })
    if (path === '/api/v1/auth/csrf') return respond({ token: 'test-csrf' })
    if (path === '/api/v1/admin/categories') return respond({ items: [{ id: categoryId, name: 'Coffee', slug: 'coffee', version: 1 }], page: 1, pageSize: 100, total: 1 })
    if (path === '/api/v1/admin/products' && request.method() === 'GET') return respond({ items: product ? [product] : [], page: 1, pageSize: 100, total: product ? 1 : 0 })
    if (path === '/api/v1/admin/products' && request.method() === 'POST') { product = { ...body, id: productId, version: 1, status: 'DRAFT', variants: [], images: [] }; return respond(product, 201) }
    if (path === `/api/v1/admin/products/${productId}` && request.method() === 'GET') return respond(product)
    if (path === `/api/v1/admin/products/${productId}` && request.method() === 'PATCH') { product = { ...product, ...body, version: product.version + 1 }; return respond(product) }
    if (path === `/api/v1/admin/products/${productId}/variants`) { product.variants.push({ ...body, id: variantId, stock: 0, version: 1 }); return respond(product.variants[0], 201) }
    if (path === `/api/v1/admin/variants/${variantId}/inventory`) { product.variants[0].stock += body.delta; product.variants[0].version++; return respond({ stock: product.variants[0].stock, version: product.variants[0].version }, 201) }
    if (path === '/api/v1/admin/media') return respond({ id: '44444444-4444-4444-8444-444444444444', url: '/api/v1/media/products/test.webp' }, 201)
    if (path === `/api/v1/admin/products/${productId}/images`) { product.images.push({ id: body.mediaId, objectKey: 'products/44444444-4444-4444-8444-444444444444.webp', illustrative: false }); return respond({ id: body.mediaId }, 201) }
    if (path === '/api/v1/products/test-coffee') return respond({ ...product, category: { id: categoryId, name: 'Coffee', slug: 'coffee' }, purchasable: true })
    return respond({ code: 'NOT_FOUND' }, 404)
  })
  await page.goto('/admin/products/new')
  await expect(page.getByRole('heading', { name: 'Create product' })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Test coffee')
  await page.getByLabel('Slug').fill('test-coffee')
  await page.getByLabel('Description').fill('Test fixture')
  await page.getByLabel('Category').selectOption(categoryId)
  await page.getByRole('button', { name: 'Save product' }).click()
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible()
  await page.getByLabel('SKU').fill('TEST-250')
  await page.getByLabel('Label', { exact: true }).fill('250 g')
  await page.getByLabel('Pack details').fill('250 g')
  await page.getByLabel('Price in VND').fill('100000')
  await page.getByLabel('Sale enabled').last().check()
  await page.getByRole('button', { name: 'Add variant' }).click()
  await expect(page.getByText('TEST-250', { exact: false })).toBeVisible()
  await page.getByLabel('Upload image').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('test') })
  await expect(page.getByRole('status').getByText('Image added.')).toBeVisible()
  await page.getByRole('link', { name: 'Adjust stock' }).click()
  await page.getByRole('button', { name: 'Adjust' }).click()
  await page.getByLabel('Change in units').fill('3')
  await page.getByLabel('Reason').fill('Initial count')
  await page.getByRole('button', { name: 'Apply adjustment' }).click()
  await expect(page.getByText('Stock: 3', { exact: true })).toBeVisible()
  await page.goto(`/admin/products/${productId}`)
  await page.getByLabel('Product details confirmed').check()
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('Status: PUBLISHED')).toBeVisible()
  await page.goto('/products/test-coffee')
  await expect(page.getByRole('heading', { name: 'Test coffee' })).toBeVisible()
})

test('customer sees forbidden admin navigation', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { user: { id: 'customer', name: 'Customer', email: 'customer@example.test', role: 'CUSTOMER', verified: true } } }))
  await page.goto('/admin/products')
  await expect(page.getByRole('heading', { name: 'Access forbidden' })).toBeVisible()
})
