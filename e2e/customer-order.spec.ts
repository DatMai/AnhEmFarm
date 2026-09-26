import { expect, test } from '@playwright/test'
const variantId = '11111111-1111-4111-8111-111111111111'
const address = {
  recipient: 'Test Recipient',
  phone: '0900000000',
  zoneId: '22222222-2222-4222-8222-222222222222',
  line1: 'Test fixture address'
}
const line = {
  variantId,
  quantity: 1,
  productName: 'Test coffee',
  variantLabel: 'Test pack',
  priceVnd: 10000,
  available: true,
  restricted18: false
}
const order = {
  id: '33333333-3333-4333-8333-333333333333',
  version: 1,
  status: 'PENDING',
  collectionState: 'DUE',
  recipient: address,
  items: [
    { ...line, name: line.productName, label: line.variantLabel, sku: 'TEST' }
  ],
  events: [],
  subtotalVnd: 10000,
  shippingVnd: 2000,
  totalVnd: 12000
}
test('COD quote retry retains key after lost response and confirmation survives reload (mocked transport)', async ({
  page
}) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const keys: string[] = []
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          user: {
            id: 'test-user',
            name: 'Test',
            verified: true,
            role: 'CUSTOMER'
          }
        }
      })
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'test-csrf' } })
    if (path.endsWith('/cart'))
      return route.fulfill({ json: { version: 1, items: [line] } })
    if (path.endsWith('/shipping-zones'))
      return route.fulfill({
        json: {
          items: [
            { id: address.zoneId, displayName: 'Test zone', feeVnd: 2000 }
          ],
          total: 1
        }
      })
    if (path.endsWith('/account/addresses'))
      return route.fulfill({ json: { items: [], total: 0 } })
    if (path.endsWith('/quotes'))
      return route.fulfill({
        json: {
          id: 'test-quote',
          cartVersion: 1,
          address,
          items: [line],
          subtotalVnd: 10000,
          shippingVnd: 2000,
          totalVnd: 12000
        }
      })
    if (path.endsWith('/orders') && route.request().method() === 'POST') {
      keys.push(route.request().headers()['idempotency-key'])
      if (keys.length === 1) return route.abort('failed')
      return route.fulfill({ json: { order, cartPreserved: false } })
    }
    if (path.endsWith(`/orders/${order.id}`))
      return route.fulfill({ json: order })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/checkout')
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeInViewport()
  await expect(
    page.getByRole('heading', { name: 'Checkout', exact: true })
  ).toBeVisible()
  await page.getByLabel('Recipient', { exact: true }).fill(address.recipient)
  await page.getByLabel('Phone').fill(address.phone)
  await page.getByLabel('Address line 1').fill(address.line1)
  await page.getByLabel('Delivery zone').selectOption(address.zoneId)
  await expect(page.getByLabel('I am at least 18 years old')).toHaveCount(0)
  await page.getByRole('button', { name: 'Review quote' }).click()
  await page.getByRole('button', { name: 'Place COD order' }).click()
  await expect(page.getByRole('alert')).toContainText('Connection failed')
  await page.reload()
  await page.getByRole('button', { name: 'Recover COD order' }).click()
  await expect(
    page.getByRole('heading', { name: 'Order confirmed' })
  ).toBeVisible()
  expect(keys[0]).toBeTruthy()
  expect(keys[1]).toBe(keys[0])
  await page.reload()
  await expect(
    page.getByText('Pending confirmation', { exact: true })
  ).toBeVisible()
})

// Real PostgreSQL/API + local Mailpit; fixture setup and restart use a child IPC channel.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { Scenario } from '../server/test/fixtures'
let backend: ChildProcess
async function control(action: string, email?: string) {
  const response = once(backend, 'message')
  backend.send!({ action, email })
  const [message] = await response
  if (message.failed || message.done !== action)
    throw new Error('Local test server control failed')
}
test('real registration, SMTP verification, guest merge, two-tab cart, COD persistence and account isolation', async ({
  page,
  context,
  request
}) => {
  test.setTimeout(120000)
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'],
    { cwd: 'server', stdio: 'pipe' }
  )
  backend = spawn(process.execPath, ['dist/test/browser-server.js'], {
    cwd: 'server',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  })
  try {
    const [ready] = await Promise.race([
      once(backend, 'message'),
      once(backend, 'exit').then(() => {
        throw new Error('Local test backend failed to start')
      })
    ])
    const s = ready.fixture as Scenario
    const email = `browser-${crypto.randomUUID()}@example.test`,
      password = 'Browser-test-password-2026!'
    await page.goto('/register')
    await page.getByLabel('Name', { exact: true }).fill('Browser Test')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('status')).toContainText('Mailpit')
    await control('email', email)
    const inbox = await (
      await request.get('http://127.0.0.1:8025/api/v1/messages')
    ).json()
    const message = inbox.messages.find((m: { To: { Address: string }[] }) =>
      m.To.some((to) => to.Address === email)
    )
    expect(Boolean(message)).toBe(true)
    const mail = await (
      await request.get(`http://127.0.0.1:8025/api/v1/message/${message.ID}`)
    ).json()
    const verificationUrl = (mail.Text as string).match(
      /http[^\s]+verify-email\?token=[^\s]+/
    )?.[0]
    if (!verificationUrl)
      throw new Error('Verification link missing from local inbox')
    await page.goto(verificationUrl)
    await expect(page.getByRole('status')).toContainText(
      'Your email is verified'
    )
    await page.goto(`/products/${s.product.slug}`)
    await page
      .getByRole('button', { name: 'Add Test 250 g pack to cart' })
      .click()
    await page.goto('/login?next=/cart')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Test Robusta coffee' })
    ).toBeVisible()
    const quantity = page.getByLabel('Quantity for Test Robusta coffee')
    await quantity.fill('2')
    await quantity.press('Tab')
    await expect(quantity).toHaveValue('2')
    await page.goto('/account')
    await page.getByLabel('Name', { exact: true }).fill('Browser Updated')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(
      page.getByRole('link', { name: 'Browser Updated', exact: true })
    ).toBeVisible()
    await page.goto('/account/addresses')
    await page
      .getByLabel('Recipient', { exact: true })
      .fill('Browser Recipient')
    await page.getByLabel('Phone').fill('0900000000')
    await page
      .getByLabel('Address line 1')
      .fill('Test fixture delivery address')
    await page.getByLabel('Delivery zone').selectOption(s.zone.id)
    await page.route('**/api/v1/account/addresses', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const body = route.request().postDataJSON(); delete body.line2; delete body.postalCode
      await route.continue({ postData: JSON.stringify(body) })
    }, { times: 1 })
    await page.getByRole('button', { name: 'Save address' }).click()
    await expect(
      page.getByRole('heading', { name: 'Browser Recipient' })
    ).toBeVisible()
    await page.goto('/checkout')
    await page.getByLabel('Saved address').selectOption({
      label: 'Browser Recipient · Test fixture delivery address'
    })
    await expect(page.getByLabel('Recipient', { exact: true })).toHaveValue(
      'Browser Recipient'
    )
    await page.getByRole('button', { name: 'Review quote' }).click()
    await expect(
      page.getByRole('heading', { name: 'Review your order' })
    ).toBeVisible()
    const other = await context.newPage()
    await other.goto('/cart')
    const otherQuantity = other.getByLabel('Quantity for Test Robusta coffee')
    await otherQuantity.fill('3')
    const edited = other.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.status() === 200
    )
    await otherQuantity.press('Tab')
    await edited
    await expect(otherQuantity).toHaveValue('3')
    await page.route(
      '**/api/v1/orders',
      async (route) => {
        await route.fetch()
        await route.abort('failed')
      },
      { times: 1 }
    )
    await page.getByRole('button', { name: 'Place COD order' }).click()
    await expect(page.getByRole('alert')).toContainText('Connection failed')
    let failSessionRead = true
    await page.route('**/api/v1/auth/me', route => failSessionRead
      ? route.fulfill({ status: 503, json: {} })
      : route.continue())
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    failSessionRead = false
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible()
    await page.goto('/checkout')
    await page.getByRole('button', { name: 'Recover COD order' }).click()
    await expect(
      page.getByRole('heading', { name: 'Order confirmed' })
    ).toBeVisible()
    await expect(
      page.getByText(
        'Your cart changed during checkout and was preserved. Review it before ordering again.'
      )
    ).toBeVisible()
    const orderUrl = page.url()
    await control('restart')
    await page.reload()
    await expect(
      page.getByText('Pending confirmation', { exact: true })
    ).toBeVisible()
    await page.getByLabel('Cancellation reason').fill('Test cancellation')
    await page
      .getByRole('button', { name: 'Cancel order', exact: true })
      .click()
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
    await page.goto('/account/addresses')
    await page.getByRole('button', { name: 'Edit address', exact: true }).click()
    await expect(page.getByLabel('Delivery zone')).toHaveValue(s.zone.id)
    await page.getByRole('button', { name: 'Save address' }).click()
    await expect(page.getByRole('heading', { name: 'Add address', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Log out' }).first().click()
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
    await page.goto('/login')
    await page.getByLabel('Email').fill(s.otherCustomer.email)
    await page
      .getByLabel('Password', { exact: true })
      .fill(s.otherCustomer.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(
      page.getByRole('link', { name: 'Other Customer', exact: true })
    ).toBeVisible()
    await page.goto(orderUrl)
    await expect(
      page.getByRole('heading', { name: 'Order unavailable' })
    ).toBeVisible()
    await expect(page.getByText('Browser Recipient')).toHaveCount(0)
    await page.goto('/checkout')
    await expect(page.getByText('Your cart is empty.')).toBeVisible()
  } finally {
    if (backend.exitCode === null && backend.signalCode === null) {
      const exited = once(backend, 'exit')
      backend.kill('SIGTERM')
      await exited
    }
  }
})

test('quote conflicts preserve address and request review; restricted cart alone shows age confirmation (mocked)', async ({
  page
}) => {
  let attempts = 0
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: { user: { id: 'u', name: 'Test', verified: true } }
      })
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf' } })
    if (path.endsWith('/cart'))
      return route.fulfill({
        json: { version: 1, items: [{ ...line, restricted18: true }] }
      })
    if (path.endsWith('/account/addresses'))
      return route.fulfill({ json: { items: [], total: 0 } })
    if (path.endsWith('/shipping-zones'))
      return route.fulfill({
        json: {
          items: [{ id: address.zoneId, displayName: 'Test zone' }],
          total: 1
        }
      })
    if (path.endsWith('/quotes')) {
      attempts++
      return route.fulfill({
        json: {
          id: 'q',
          address,
          items: [line],
          subtotalVnd: 10000,
          shippingVnd: 2000,
          totalVnd: 12000
        }
      })
    }
    if (path.endsWith('/orders'))
      return route.fulfill({ status: 409, json: { code: 'QUOTE_CHANGED' } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/checkout')
  await page.getByLabel('Recipient', { exact: true }).fill(address.recipient)
  await page.getByLabel('Phone').fill(address.phone)
  await page.getByLabel('Address line 1').fill(address.line1)
  await page.getByLabel('Delivery zone').selectOption(address.zoneId)
  await page.getByLabel('I am at least 18 years old').check()
  await page.getByRole('button', { name: 'Review quote' }).click()
  await page.getByRole('button', { name: 'Place COD order' }).click()
  await expect(page.getByRole('alert')).toContainText('Please review')
  await expect(page.getByLabel('Recipient', { exact: true })).toHaveValue(
    address.recipient
  )
  expect(attempts).toBe(1)
})

test('unverified checkout and sale-disabled product cannot submit (mocked)', async ({
  page
}) => {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: { user: { id: 'u', name: 'Test', verified: false } }
      })
    if (path.endsWith('/cart'))
      return route.fulfill({ json: { version: 1, items: [] } })
    if (path.endsWith('/account/addresses'))
      return route.fulfill({ json: { items: [], total: 0 } })
    if (path.endsWith('/products/test'))
      return route.fulfill({
        json: {
          name: 'Test coffee',
          images: [],
          category: { name: 'Coffee' },
          startingPriceVnd: 10000,
          confirmed: true,
          purchasable: false,
          variants: [
            {
              id: variantId,
              label: 'Pack',
              priceVnd: 10000,
              saleEnabled: true,
              inStock: true
            }
          ]
        }
      })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/checkout')
  await expect(
    page.getByText('Verify your email before checkout.')
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Place COD order' })
  ).toHaveCount(0)
  await page.goto('/products/test')
  await expect(
    page.getByRole('button', { name: 'Add Pack to cart' })
  ).toBeDisabled()
})


test('password change invalidates private state in a second tab (mocked)', async ({ page, context }) => {
 let signedIn = true
 await context.route('**/api/v1/**', route => {
   const path = new URL(route.request().url()).pathname
   if (path.endsWith('/auth/me')) return route.fulfill({ json: { user: signedIn ? { id: 'first-account', name: 'Private Account', email: 'test@example.test', verified: true } : null } })
   if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'csrf' } })
   if (path.endsWith('/auth/change-password')) { signedIn = false; return route.fulfill({ status: 204 }) }
   return route.fulfill({ json: {} })
 })
 await page.goto('/account'); const other = await context.newPage(); await other.goto('/account')
 await expect(other.getByRole('heading', { name: 'Your account' })).toBeVisible()
 await other.evaluate(() => sessionStorage.setItem('quote:old', 'old-key'))
 await page.getByLabel('Current password').fill('old-password-test')
 await page.getByLabel('New password').fill('new-password-test')
 await page.getByRole('button', { name: 'Change password', exact: true }).click()
 await expect(other.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
 await expect(other.getByRole('link', { name: 'Private Account', exact: true })).toHaveCount(0)
 expect(await other.evaluate(() => sessionStorage.getItem('quote:old'))).toBeNull()
})
