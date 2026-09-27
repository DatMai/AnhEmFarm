import { expect, test } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { Scenario } from '../server/test/fixtures'
import sharp from '../server/node_modules/sharp/dist/index.mjs'

test('seller manages product choices through the backend portal and navigates its admin sections', async ({ page }) => {
  test.setTimeout(120000)
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: 'server', stdio: 'pipe' })
  const backend: ChildProcess = spawn(process.execPath, ['dist/test/browser-server.js'], { cwd: 'server', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  try {
    const [ready] = await Promise.race([once(backend, 'message'), once(backend, 'exit').then(() => { throw new Error('Local test backend failed to start') })])
    const fixture = ready.fixture as Scenario
    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.admin.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.admin.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Test Admin', exact: true })).toBeVisible()
    await page.goto(`/admin/products/${fixture.product.id}`)
    await page.getByLabel('Choice group name').fill('Sweetness')
    await page.getByLabel('Add choice').fill('Original\nLess sweet')
    await page.getByRole('button', { name: 'Save product options' }).click()
    await expect(page.getByLabel('Choice group name')).toHaveValue('Sweetness')
    await expect(page.getByRole('status')).toHaveText('Product choices saved.')
    await expect(page.getByLabel('Add choice')).toHaveValue('')
    const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#a9273b' } }).png().toBuffer()
    await page.getByLabel('Upload image').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: image })
    const uploadResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/images'))
    await page.locator('button').filter({ hasText: 'Upload image' }).click()
    const upload = await uploadResponse
    expect(upload.status()).toBe(303)
    await expect(page.getByRole('img', { name: 'Test Robusta coffee' })).toBeVisible()
    for (const [label, path, heading] of [
      ['Products', '/admin/products', 'Products'],
      ['Categories', '/admin/categories', 'Categories'],
      ['Inventory', '/admin/inventory', 'Inventory'],
      ['Customers', '/admin/customers', 'Customers'],
      ['Settings', '/admin/settings', 'Store settings'],
      ['Reports', '/admin/reports', 'Reports'],
      ['Content', '/admin/content', 'Store content'],
      ['Audit log', '/admin/audit', 'Audit log'],
      ['Email jobs', '/admin/email-jobs', 'Email jobs'],
    ]) {
      await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('link', { name: label, exact: true }).click()
      await expect(page.locator('h1')).toHaveText(heading)
      expect(new URL(page.url()).pathname).toBe(path)
      if (label === 'Customers') {
        await page.getByLabel('Search customers').fill(fixture.customer.email)
        await page.getByRole('button', { name: 'Search', exact: true }).click()
        await expect(page.getByRole('link', { name: 'Test Customer', exact: true })).toBeVisible()
      }
      await page.screenshot({ path: test.info().outputPath(`admin-${label.toLowerCase().replaceAll(' ', '-')}.png`), fullPage: true })
    }
    await page.goto(`/admin/customers/${fixture.customer.id}`)
    await expect(page.locator('h1')).toHaveText('Test Customer')
    await page.screenshot({ path: test.info().outputPath('admin-customer-detail.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin/categories')
    const navigation = page.getByRole('navigation', { name: 'Admin navigation' })
    await expect(navigation).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Orders', exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('admin-orders-mobile.png'), fullPage: true })
  } finally {
    if (backend.exitCode === null && backend.signalCode === null) { const exited = once(backend, 'exit'); backend.kill('SIGTERM'); await exited }
  }
})

test('customer session is denied access to the backend admin portal', async ({ page }) => {
  test.setTimeout(120000)
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: 'server', stdio: 'pipe' })
  const backend: ChildProcess = spawn(process.execPath, ['dist/test/browser-server.js'], { cwd: 'server', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  try {
    const [ready] = await Promise.race([once(backend, 'message'), once(backend, 'exit').then(() => { throw new Error('Local test backend failed to start') })])
    const fixture = ready.fixture as Scenario
    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.customer.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.customer.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Test Customer', exact: true })).toBeVisible()
    const response = await page.goto('/admin/products')
    expect(response?.status()).toBe(403)
    await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible()
  } finally {
    if (backend.exitCode === null && backend.signalCode === null) { const exited = once(backend, 'exit'); backend.kill('SIGTERM'); await exited }
  }
})
