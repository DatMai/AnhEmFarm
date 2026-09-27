import { expect, test } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { Scenario } from '../server/test/fixtures'
import AxeBuilder from '@axe-core/playwright'

test('one real COD purchase is fulfilled by the seller in the browser', async ({ page, browser }) => {
  test.setTimeout(90000)
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: 'server', stdio: 'pipe' })
  const backend: ChildProcess = spawn(process.execPath, ['dist/test/browser-server.js'], {
    cwd: 'server', env: { ...process.env, TEST_API_PORT: '4279' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  })
  try {
    const [ready] = await Promise.race([once(backend, 'message'), once(backend, 'exit').then(() => {
      throw new Error('Local test backend failed to start')
    })])
    const fixture = ready.fixture as Scenario
    const optionsReady = once(backend, 'message')
    backend.send({ action: 'options' })
    await optionsReady
    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.customer.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.customer.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Test Customer', exact: true })).toBeVisible()
    await page.goto(`/products/${fixture.product.slug}`)
    await expect(page.getByRole('heading', { name: 'Test Robusta coffee' })).toBeVisible()
    const addButton = page.getByRole('button', { name: 'Add 1 to cart' })
    await expect(addButton).toBeDisabled()
    await page.getByRole('radio', { name: 'Less sweet' }).check()
    await page.getByRole('button', { name: 'Increase quantity' }).click()
    await page.screenshot({ path: test.info().outputPath('customer-product-detail.png'), fullPage: true })
    await page.getByRole('button', { name: 'Add 2 to cart' }).click()
    await expect(page.getByRole('status')).toContainText('Added to cart')
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Test Robusta coffee' })).toBeVisible()
    await expect(page.getByText('Sweetness: Less sweet')).toBeVisible()
    await expect(page.getByLabel('Quantity for Test Robusta coffee')).toHaveValue('2')
    await page.screenshot({ path: test.info().outputPath('customer-cart-options.png'), fullPage: true })
    await page.goto('/checkout')
    await page.getByLabel('Recipient', { exact: true }).fill('Demo Buyer')
    await page.getByLabel('Phone').fill('0900000000')
    await page.getByLabel('Address line 1').fill('Demo delivery address')
    await page.getByLabel('Delivery zone').selectOption(fixture.zone.id)
    await page.getByRole('button', { name: 'Review quote' }).click()
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible()
    await expect(page.getByText('Sweetness: Less sweet')).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('customer-checkout-quote-options.png'), fullPage: true })
    await page.getByRole('button', { name: 'Place COD order' }).click()
    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('customer-order-confirmation-options.png'), fullPage: true })
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
      await seller.goto('/')
      await expect(seller.getByRole('link', { name: 'Admin', exact: true })).toBeVisible()
      const [adminTab] = await Promise.all([
        seller.waitForEvent('popup', { timeout: 10_000 }),
        seller.getByRole('link', { name: 'Admin', exact: true }).click()
      ])
      await expect(adminTab.getByRole('heading', { name: 'Seller dashboard' })).toBeVisible()
      const accessibility = await new AxeBuilder({ page: adminTab }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(accessibility.violations.filter(item => item.impact === 'critical' || item.impact === 'serious').map(item => item.id)).toEqual([])
      await adminTab.screenshot({ path: test.info().outputPath('admin-dashboard.png'), fullPage: true })
      await adminTab.getByRole('link', { name: 'Orders', exact: true }).click()
      await expect(adminTab.locator('h1')).toHaveText('Orders')
      const orderRow = adminTab.getByRole('row').filter({ has: adminTab.getByRole('link', { name: orderId.slice(0, 8).toUpperCase() }) })
      await expect(orderRow.getByRole('cell', { name: 'Demo Buyer' })).toBeVisible()
      await adminTab.getByLabel('Search orders').fill(orderId.slice(0, 8))
      await adminTab.getByRole('button', { name: 'Apply filters' }).click()
      await expect(adminTab.getByRole('link', { name: orderId.slice(0, 8).toUpperCase() })).toBeVisible()
      await adminTab.screenshot({ path: test.info().outputPath('admin-orders.png'), fullPage: true })
      await adminTab.goto(`/admin/orders/${orderId}`)
      await expect(adminTab.getByText('Sweetness: Less sweet')).toBeVisible()
      await adminTab.getByRole('button', { name: 'Confirm order' }).click()
      await adminTab.getByRole('button', { name: 'Start store delivery' }).click()
      await adminTab.getByRole('button', { name: 'Mark delivered' }).click()
      await adminTab.getByRole('button', { name: 'Mark COD collected' }).click()
      await expect(adminTab.getByRole('button', { name: 'Correct COD to due' })).toBeVisible()
      await adminTab.goto(`/admin/products/${fixture.product.id}`)
      await adminTab.getByLabel('Choice group name').fill('Sweetness preference')
      await adminTab.getByRole('button', { name: 'Save product options' }).click()
      await expect(adminTab.getByLabel('Choice group name')).toHaveValue('Sweetness preference')
      await adminTab.screenshot({ path: test.info().outputPath('admin-product-options.png'), fullPage: true })
      await adminTab.goto(`/admin/orders/${orderId}`)
      await expect(adminTab.getByText('Sweetness: Less sweet')).toBeVisible()
      await page.reload()
      await expect(page.getByText('Delivered', { exact: true })).toBeVisible()

      const delivered = once(backend, 'message')
      backend.send({ action: 'email', email: fixture.customer.email })
      expect((await delivered)[0]).toMatchObject({ done: 'email' })
      const inboxResponse = await fetch('http://127.0.0.1:8025/api/v1/messages?limit=1000')
      expect(inboxResponse.ok).toBe(true)
      const inbox = await inboxResponse.json() as { messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }> }
      const updates = inbox.messages.filter(message => message.To.some(recipient => recipient.Address === fixture.customer.email)
        && message.Subject.startsWith('Your AnhEmFarm order is '))
      expect(updates.map(message => message.Subject).sort()).toEqual([
        'Your AnhEmFarm order is confirmed', 'Your AnhEmFarm order is delivered', 'Your AnhEmFarm order is shipping',
      ])
      for (const update of updates) {
        const messageResponse = await fetch(`http://127.0.0.1:8025/api/v1/message/${update.ID}`)
        expect(messageResponse.ok).toBe(true)
        const message = await messageResponse.json() as { Text: string }
        expect(message.Text).toContain(`/account/orders/${orderId}`)
      }
    } finally {
      await sellerContext.pages().at(-1)?.close().catch(() => {})
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
