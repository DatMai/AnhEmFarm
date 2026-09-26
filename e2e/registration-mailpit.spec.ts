import { expect, test } from '@playwright/test'

test('local registration points to the captured verification email', async ({ page }) => {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { user: null } })
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'test-csrf' } })
    if (path.endsWith('/auth/register')) return route.fulfill({ status: 202, json: { status: 'accepted' } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Demo Buyer')
  await page.getByLabel('Email', { exact: true }).fill('demo-buyer@example.test')
  await page.getByLabel('Password', { exact: true }).fill('Example-password-2026!')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('status')).toContainText('Mailpit')
  await expect(page.getByRole('link', { name: 'Open Mailpit inbox' })).toHaveAttribute('href', 'http://127.0.0.1:8025/')
})
