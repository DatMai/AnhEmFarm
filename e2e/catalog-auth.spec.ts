import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/auth/me') return route.fulfill({ json: { user: null } })
    if (path === '/api/v1/categories') return route.fulfill({ json: { items: [], page: 1, pageSize: 100, total: 0 } })
    if (path === '/api/v1/products') return route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } })
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } })
  })
})
test('catalog URL keeps search and sorting across reload', async ({ page }) => {
  await page.goto('/products?q=coffee&sort=name')
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('name')
  await page.reload()
  await expect(page.getByRole('searchbox')).toHaveValue('coffee')
})
test('menu closes with Escape and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Open menu' })
  await trigger.focus()
  await trigger.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
