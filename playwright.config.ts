import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './e2e', use: { baseURL: 'http://127.0.0.1:4278' }, webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4278', url: 'http://127.0.0.1:4278', reuseExistingServer: false }, timeout: 30_000 })
