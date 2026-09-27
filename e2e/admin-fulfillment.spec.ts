import { expect, test } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { Scenario } from '../server/test/fixtures'

test('seller dashboard and fulfillment flow show delivered value and COD collection', async ({ page }) => {
  let state: 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' = 'PENDING'
  let collected = false
  const orderId = '33333333-3333-4333-8333-333333333333'
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { user: { id: 'admin', name: 'Seller', role: 'ADMIN', verified: true } } })
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'csrf' } })
    if (path.endsWith('/admin/products')) return route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } })
    if (path.endsWith('/admin/reports')) return route.fulfill({ json: { deliveredOrderValueVnd: state === 'DELIVERED' ? 120000 : 0,
      codCollectedVnd: collected ? 120000 : 0, codDueVnd: state === 'DELIVERED' && !collected ? 120000 : 0, orderCount: state === 'DELIVERED' ? 1 : 0 } })
    const order = { id: orderId, version: ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED'].indexOf(state) + (collected ? 2 : 1),
      status: state, collectionState: collected ? 'COLLECTED' : 'DUE', totalVnd: 120000, subtotalVnd: 100000, shippingVnd: 20000,
      recipient: { recipient: 'Buyer', phone: '0900000000', line1: 'Test address' }, items: [{ variantId: '11111111-1111-4111-8111-111111111111', name: 'Coffee', sku: 'TEST', label: '250 g', quantity: 1, priceVnd: 100000 }], events: [] }
    if (path.endsWith('/admin/orders')) return route.fulfill({ json: { items: [order], page: 1, pageSize: 20, total: 1 } })
    if (path.endsWith(`/admin/orders/${orderId}`)) return route.fulfill({ json: order })
    if (path.endsWith(`/admin/orders/${orderId}/transitions`)) { state = route.request().postDataJSON().to; return route.fulfill({ json: { ...order, status: state } }) }
    if (path.endsWith(`/admin/orders/${orderId}/collection`)) { collected = true; return route.fulfill({ json: { ...order, collectionState: 'COLLECTED' } }) }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Seller dashboard' })).toBeVisible()
  await page.getByRole('link', { name: 'Orders', exact: true }).click()
  await page.getByRole('link', { name: 'View order' }).click()
  await page.getByRole('button', { name: 'Confirm order' }).click()
  await page.getByRole('button', { name: 'Start shipping' }).click()
  await page.getByRole('button', { name: 'Mark delivered' }).click()
  await page.getByRole('button', { name: 'Mark COD collected' }).click()
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByText('Delivered order value')).toBeVisible()
  await expect(page.getByText('COD collected')).toBeVisible()
  await expect(page.getByRole('article').filter({ hasText: 'COD collected' })).toContainText('120,000')
})

test('real seller fulfillment updates customer order and collected dashboard value', async ({ page }) => {
  test.setTimeout(120000)
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: 'server', stdio: 'pipe' })
  const backend: ChildProcess = spawn(process.execPath, ['dist/test/browser-server.js'], { cwd: 'server', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  try {
    const [ready] = await Promise.race([once(backend, 'message'), once(backend, 'exit').then(() => { throw new Error('Local test backend failed to start') })])
    const fixture = ready.fixture as Scenario
    const orderReady = once(backend, 'message'); backend.send!({ action: 'order' })
    const [created] = await orderReady
    if (created.done !== 'order' || !created.orderId) throw new Error('Local order fixture failed')
    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.admin.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.admin.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Test Admin', exact: true })).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Seller dashboard' })).toBeVisible()
    await page.goto('/admin/orders')
    const reference = created.orderId.slice(0, 8).toUpperCase()
    const vietnamDate = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await page.getByLabel('Search by order reference, customer name/email, or tracking number').fill(reference)
    await page.getByLabel('Status').selectOption('PENDING')
    await page.getByLabel('From').fill(vietnamDate)
    await page.getByLabel('To', { exact: true }).fill(vietnamDate)
    await page.getByRole('button', { name: 'Search orders' }).click()
    const filteredOrder = page.getByRole('listitem').filter({
      has: page.getByRole('link', { name: `View order ${reference}` })
    })
    await expect(filteredOrder.getByText('PENDING', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await page.goto('/admin')
    const collectedCard = page.getByRole('article').filter({ hasText: 'COD collected' })
    const amount = (text: string) => Number(text.replace(/[^0-9]/g, ''))
    const before = amount(await collectedCard.innerText())
    await page.goto(`/admin/orders/${created.orderId}`)
    await page.getByRole('button', { name: 'Confirm order' }).click()
    await expect(page.getByRole('button', { name: 'Start shipping' })).toBeVisible()
    await page.getByRole('button', { name: 'Start shipping' }).click()
    await expect(page.getByRole('button', { name: 'Mark delivered' })).toBeVisible()
    await page.getByRole('button', { name: 'Mark delivered' }).click()
    await expect(page.getByRole('button', { name: 'Mark COD collected' })).toBeVisible()
    await page.getByRole('button', { name: 'Mark COD collected' }).click()
    await expect(page.getByRole('button', { name: 'Correct COD to due' })).toBeVisible()
    await page.goto('/admin')
    await expect(collectedCard).toBeVisible()
    expect(amount(await collectedCard.innerText())).toBe(before + fixture.variant.priceVnd + 30000)
    const deliveredCard = page.getByRole('article').filter({ hasText: 'Delivered order value' })
    const deliveredAfterFirst = amount(await deliveredCard.innerText())
    await page.goto(`/admin/orders/${created.orderId}`)
    await page.getByRole('textbox', { name: /Reason/ }).fill('Collection recorded by mistake')
    await page.getByRole('button', { name: 'Correct COD to due' }).click()
    await expect(page.getByRole('button', { name: 'Mark COD collected' })).toBeVisible()
    await page.goto('/admin')
    expect(amount(await collectedCard.innerText())).toBe(before)
    const nextOrder = async () => { const response = once(backend, 'message'); backend.send!({ action: 'order' }); const [message] = await response
      if (message.done !== 'order' || !message.orderId) throw new Error('Local order fixture failed'); return message.orderId as string }
    const cancelledId = await nextOrder()
    await page.goto(`/admin/orders/${cancelledId}`)
    await page.getByRole('textbox', { name: /Reason/ }).fill('Customer requested cancellation')
    await page.getByRole('button', { name: 'Cancel order' }).click()
    await expect(page.locator('main p').filter({ hasText: 'Status:' })).toContainText('CANCELLED')
    const returnedId = await nextOrder()
    await page.goto(`/admin/orders/${returnedId}`)
    await page.getByRole('button', { name: 'Confirm order' }).click()
    await page.getByRole('button', { name: 'Start shipping' }).click()
    await expect(page.getByText('shipping saved.')).toBeVisible()
    await page.getByRole('textbox', { name: /Reason/ }).fill('Damaged in delivery')
    await page.getByRole('checkbox', { name: 'Returned items physically received' }).check()
    await page.getByRole('button', { name: 'Record return' }).click()
    await expect(page.locator('main p').filter({ hasText: 'Status:' })).toContainText('RETURNED')
    await page.goto('/admin')
    expect(amount(await deliveredCard.innerText())).toBe(deliveredAfterFirst)
    await page.getByRole('button', { name: 'Log out' }).first().click()
    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.customer.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.customer.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Test Customer', exact: true })).toBeVisible()
    await page.goto(`/account/orders/${created.orderId}`)
    await expect(page.getByText('Delivered', { exact: true })).toBeVisible()
  } finally {
    if (backend.exitCode === null && backend.signalCode === null) { const exited = once(backend, 'exit'); backend.kill('SIGTERM'); await exited }
  }
})
