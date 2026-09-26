import { describe, expect, it } from 'vitest'
import { renderPublicPage } from './entry-server'

describe('public server rendering', () => {
  it('renders the real product name and canonical without private data', async () => {
    const page = await renderPublicPage('/products/test-coffee', {
      product: { id: 'p1', slug: 'test-coffee', name: 'Test coffee', description: 'Fresh coffee', category: { id: 'c1', slug: 'coffee', name: 'Coffee' }, images: [], startingPriceVnd: null, purchasable: false, confirmed: false, restricted18: false, variants: [] }
    })
    expect(page.status).toBe(200)
    expect(page.html).toContain('Test coffee')
    expect(page.canonical).toBe('/products/test-coffee')
    expect(page.html).not.toContain('passwordHash')
  })
  it('marks missing products as 404', async () => {
    const page = await renderPublicPage('/products/missing', {})
    expect(page.status).toBe(404)
  })
  it('renders helpful content for an unpublished policy while keeping 404 status', async () => {
    const page = await renderPublicPage('/policies/shipping', {})
    expect(page.status).toBe(404)
    expect(page.html).toContain('Shipping information')
    expect(page.html).toContain('Official shipping details are being prepared')
  })
})
