import { expect, test } from '@playwright/test'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import type { Scenario } from '../server/test/fixtures'
import AxeBuilder from '@axe-core/playwright'

test('published product is readable without JavaScript and hydrates for navigation', async ({ browser }) => {
  test.setTimeout(120000)
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: 'server', stdio: 'pipe' })
  const backend = spawn(process.execPath, ['dist/test/browser-server.js'], { cwd: 'server', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  try {
    const [ready] = await Promise.race([once(backend, 'message'), once(backend, 'exit').then(() => { throw new Error('Local test backend failed to start') })])
    const fixture = ready.fixture as Scenario
    const plain = await browser.newContext({ javaScriptEnabled: false })
    const noJs = await plain.newPage()
    const response = await noJs.goto(`http://127.0.0.1:4279/products/${fixture.product.slug}`)
    expect(response?.status()).toBe(200)
    await expect(noJs.getByRole('heading', { name: 'Test Robusta coffee' })).toBeVisible()
    await expect(noJs.locator('link[rel="canonical"]')).toHaveCount(1)
    await plain.close()

    const interactive = await browser.newContext()
    const page = await interactive.newPage()
    const hydrationErrors: string[] = []
    page.on('console', message => { if (message.type() === 'error' && /hydrat/i.test(message.text())) hydrationErrors.push(message.text()) })
    await page.goto(`http://127.0.0.1:4279/products/${fixture.product.slug}`)
    await expect(page.getByRole('button', { name: /add 1 to cart/i })).toBeVisible()
    expect(hydrationErrors).toEqual([])
    await interactive.close()
  } finally { backend.kill('SIGTERM'); await once(backend, 'exit').catch(() => {}) }
})

test('pages stay within small viewports and honor reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  }
  const duration = await page.locator('body').evaluate(node => getComputedStyle(node).animationDuration)
  expect(duration === '0s' || duration === '1e-05s' || duration === '0.00001s').toBe(true)
})

test('core storefront and seller pages have no serious automated accessibility violations', async ({ page }) => {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { user: { id: 'admin', name: 'Seller', role: 'ADMIN', verified: true } } })
    if (path.endsWith('/admin/reports')) return route.fulfill({ json: { deliveredOrderValueVnd: 0, codCollectedVnd: 0, codDueVnd: 0, orderCount: 0 } })
    if (path.endsWith('/cart')) return route.fulfill({ json: { items: [], version: 1 } })
    if (path.endsWith('/products')) return route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } })
    if (path.endsWith('/categories')) return route.fulfill({ json: { items: [], page: 1, pageSize: 100, total: 0 } })
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } })
  })
  for (const path of ['/', '/login', '/cart']) {
    await page.goto(path)
    await page.locator('h1').first().waitFor()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const serious = results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious')
    expect(serious.map(item => `${path}: ${item.id} ${item.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([])
  }
})
