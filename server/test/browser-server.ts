// Test-only child process: never exposed as an HTTP setup endpoint.
import { config as dotenv } from 'dotenv'
import { createApp } from '../src/main.js'
import { readConfig } from '../src/config.js'
import { PrismaService } from '../src/db/prisma.service.js'
import { EmailWorker } from '../src/email/email.worker.js'
import { seedScenario } from './fixtures.js'
import { randomUUID } from 'node:crypto'
import { CartService } from '../src/cart/cart.service.js'
import { QuoteService } from '../src/checkout/quote.service.js'
import { CheckoutService } from '../src/checkout/checkout.service.js'
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
const port = Number(process.env.TEST_API_PORT ?? 4279)
let app = await createApp(config)
const fixture = await seedScenario(app.get(PrismaService))
await app.listen(port, '127.0.0.1')
process.send?.({ ready: true, fixture })
process.on('message', async (message: { action: string; email?: string }) => {
  try {
    if (message.action === 'options') {
      const group = await app.get(PrismaService).productChoiceGroup.create({ data: { productId: fixture.product.id, label: 'Sweetness', choices: { create: [
        { label: 'Original', sortPosition: 0 }, { label: 'Less sweet', sortPosition: 1 },
      ] } } });
      process.send?.({ done: message.action, groupId: group.id });
      return;
    }
    if (message.action === 'order') {
      const actor = { id: fixture.customer.id, role: 'CUSTOMER' as const, authVersion: 1 }
      const cart = app.get(CartService), current = await cart.get(actor)
      await cart.set(actor, fixture.variant.id, 1, current.version)
      const { note: _note, ...address } = fixture.address
      const quote = await app.get(QuoteService).create(actor, { address, ageConfirmed: false })
      const placed = await app.get(CheckoutService).place(actor, quote.id, randomUUID())
      process.send?.({ done: message.action, orderId: placed.order.id })
      return
    }
    if (message.action === 'restart') {
      await app.close()
      app = await createApp(config)
      await app.listen(port, '127.0.0.1')
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
