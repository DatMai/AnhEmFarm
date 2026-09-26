import { expect, test } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { Scenario } from '../server/test/fixtures'

test('one real COD purchase is fulfilled by the seller in the browser', async ({ page, browser }) => {
  test.setTimeout(90000)
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: 'server', stdio: 'pipe' })
  const backend: ChildProcess = spawn(process.execPath, ['dist/test/browser-server.js'], {
    cwd: 'server', stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  })
  try {
    const [ready] = await Promise.race([once(backend, 'message'), once(backend, 'exit').then(() => {
      throw new Error('Local test backend failed to start')
    })])
    const fixture = ready.fixture as Scenario
    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.customer.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.customer.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Test Customer', exact: true })).toBeVisible()
    await page.goto(`/products/${fixture.product.slug}`)
    await expect(page.getByRole('heading', { name: 'Test Robusta coffee' })).toBeVisible()
    await page.getByRole('button', { name: 'Add Test 250 g pack to cart' }).click()
    await expect(page.getByRole('status')).toContainText('Added to cart')
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Test Robusta coffee' })).toBeVisible()
    await page.goto('/checkout')
    await page.getByLabel('Recipient', { exact: true }).fill('Demo Buyer')
    await page.getByLabel('Phone').fill('0900000000')
    await page.getByLabel('Address line 1').fill('Demo delivery address')
    await page.getByLabel('Delivery zone').selectOption(fixture.zone.id)
    await page.getByRole('button', { name: 'Review quote' }).click()
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible()
    await page.getByRole('button', { name: 'Place COD order' }).click()
    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible()
    const orderId = new URL(page.url()).pathname.split('/').at(-1)!
    expect(orderId).toMatch(/^[0-9a-f-]{36}$/)

    const sellerContext = await browser.newContext()
    try {
      const seller = await sellerContext.newPage()
      await seller.goto('/login')
      await seller.getByLabel('Email').fill(fixture.admin.email)
      await seller.getByLabel('Password', { exact: true }).fill(fixture.admin.password)
      await seller.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(seller.getByRole('link', { name: 'Test Admin', exact: true })).toBeVisible()
      await seller.goto('/admin')
      await expect(seller.getByRole('heading', { name: 'Seller dashboard' })).toBeVisible()
      await seller.getByRole('link', { name: 'Orders', exact: true }).click()
      await expect(seller.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
      await seller.goto(`/admin/orders/${orderId}`)
      await seller.getByRole('button', { name: 'Confirm order' }).click()
      await seller.getByRole('button', { name: 'Start shipping' }).click()
      await seller.getByRole('button', { name: 'Mark delivered' }).click()
      await seller.getByRole('button', { name: 'Mark COD collected' }).click()
      await expect(seller.getByRole('button', { name: 'Correct COD to due' })).toBeVisible()
      await page.reload()
      await expect(page.getByText('Delivered', { exact: true })).toBeVisible()
    } finally {
      await sellerContext.close()
    }
  } finally {
    if (backend.exitCode === null && backend.signalCode === null) {
      const exited = once(backend, 'exit')
      backend.kill('SIGTERM')
      await exited
    }
  }
})
