// Test-only child process: never exposed as an HTTP setup endpoint.
import { config as dotenv } from 'dotenv'
import { createApp } from '../src/main.js'
import { readConfig } from '../src/config.js'
import { PrismaService } from '../src/db/prisma.service.js'
import { EmailWorker } from '../src/email/email.worker.js'
import { seedScenario } from './fixtures.js'
dotenv({ path: '../.env.dev', quiet: true })
const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('Test database required')
const config = {
  ...readConfig(),
  mode: 'development' as const,
  origin: 'http://127.0.0.1:4278',
  databaseUrl,
  smtp: { host: '127.0.0.1', port: 1025, from: 'test@example.test' }
}
let app = await createApp(config)
const fixture = await seedScenario(app.get(PrismaService))
await app.listen(3000, '127.0.0.1')
process.send?.({ ready: true, fixture })
process.on('message', async (message: { action: string; email?: string }) => {
  try {
    if (message.action === 'restart') {
      await app.close()
      app = await createApp(config)
      await app.listen(3000, '127.0.0.1')
    }
    if (message.action === 'email') {
      await app
        .get(PrismaService)
        .emailOutbox.updateMany({
          where: { recipient: message.email, sentAt: null },
          data: { availableAt: new Date(0) }
        })
      await app.get(EmailWorker).tick()
    }
    if (message.action === 'disable')
      await app
        .get(PrismaService)
        .storeSettings.updateMany({ data: { salesEnabled: false } })
    if (message.action === 'enable')
      await app
        .get(PrismaService)
        .storeSettings.updateMany({ data: { salesEnabled: true } })
    process.send?.({ done: message.action })
  } catch {
    process.send?.({ failed: message.action })
  }
})
process.on('SIGTERM', () => {
  void app.close().finally(() => process.exit(0))
})
