import { expect, test } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { Scenario } from '../server/test/fixtures'

test('guest buys COD, seller sees order, verified account claims it', async ({ page, browser, request }) => {
  test.setTimeout(120000)
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: 'server', stdio: 'pipe' })
  const backend: ChildProcess = spawn(process.execPath, ['dist/test/browser-server.js'], {
    cwd: 'server', env: { ...process.env, TEST_API_PORT: '4279' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  })
  try {
    const [ready] = await Promise.race([once(backend, 'message'), once(backend, 'exit').then(() => { throw new Error('Test backend exited') })])
    const fixture = ready.fixture as Scenario
    const email = `guest-browser-${crypto.randomUUID()}@example.test`
    const password = 'Browser-test-password-2026!'
    await page.goto(`/products/${fixture.product.slug}`)
    await page.getByRole('button', { name: 'Add 1 to cart' }).click()
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Test Robusta coffee' })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('guest-cart.png'), fullPage: true })
    await page.getByRole('link', { name: 'Continue to guest checkout' }).click()
    await expect(page.getByRole('heading', { name: 'Guest checkout' })).toBeVisible()
    await page.getByLabel('Email for your order receipt').fill(email)
    await page.getByLabel('Recipient', { exact: true }).fill('Guest Browser')
    await page.getByLabel('Phone').fill('0900000000')
    await page.getByLabel('Address line 1').fill('Browser test delivery address')
    await page.getByLabel('Delivery zone').selectOption(fixture.zone.id)
    await page.screenshot({ path: test.info().outputPath('guest-checkout-form.png'), fullPage: true })
    await page.getByRole('button', { name: 'Review quote' }).click()
    await expect(page.getByRole('heading', { name: 'Review your COD order' })).toBeVisible()
    await expect(page.getByText('130,000', { exact: false })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('guest-quote.png'), fullPage: true })
    await page.getByRole('button', { name: 'Place COD order' }).click()
    await expect(page.getByRole('heading', { name: 'COD order placed' })).toBeVisible()
    const orderId = new URL(page.url()).pathname.split('/').at(-1)!
    await page.screenshot({ path: test.info().outputPath('guest-receipt.png'), fullPage: true })
    await page.reload()
    await expect(page.getByText(orderId)).toBeVisible()

    const sellerContext = await browser.newContext()
    try {
      const seller = await sellerContext.newPage()
      await seller.goto('/login')
      await seller.getByLabel('Email').fill(fixture.admin.email)
      await seller.getByLabel('Password', { exact: true }).fill(fixture.admin.password)
      await seller.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(seller.getByRole('link', { name: 'Test Admin', exact: true })).toBeVisible()
      await seller.goto(`/admin/orders/${orderId}`)
      await expect(seller.getByText(`Guest checkout · Guest Browser · ${email}`)).toBeVisible()
      await seller.screenshot({ path: test.info().outputPath('seller-guest-order.png'), fullPage: true })
    } finally { await sellerContext.close() }

    await page.goto('/register')
    await page.getByLabel('Name', { exact: true }).fill('Guest Browser')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('status')).toContainText('Mailpit')
    const delivered = once(backend, 'message')
    backend.send({ action: 'email', email })
    expect((await delivered)[0]).toMatchObject({ done: 'email' })
    const inbox = await (await request.get('http://127.0.0.1:8025/api/v1/messages?limit=1000')).json()
    const message = inbox.messages.find((item: { Subject: string; To: { Address: string }[] }) => item.Subject === 'Verify your AnhEmFarm email' && item.To.some(to => to.Address === email))
    if (!message) throw new Error('Verification email missing')
    const mail = await (await request.get(`http://127.0.0.1:8025/api/v1/message/${message.ID}`)).json()
    const verificationUrl = (mail.Text as string).match(/http[^\s]+verify-email\?token=[^\s]+/)?.[0]
    if (!verificationUrl) throw new Error('Verification link missing')
    await page.goto(verificationUrl)
    await expect(page.getByRole('status')).toContainText('Your email is verified')
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Guest Browser', exact: true })).toBeVisible()
    await page.goto(`/account/orders/${orderId}`)
    await expect(page.getByRole('heading', { name: 'Order details' })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('linked-account-order.png'), fullPage: true })
  } finally {
    if (backend.exitCode === null && backend.signalCode === null) {
      const exited = once(backend, 'exit')
      backend.kill('SIGTERM')
      await exited
    }
  }
})
