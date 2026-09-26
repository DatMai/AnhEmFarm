# AnhEmFarm

AnhEmFarm is a React storefront and Node.js/TypeScript commerce API for mulberry products, Robusta and Arabica coffee, and provisional tea and honey ranges. All app and repository content is English. Cash on delivery (COD) is the initial checkout method.

Customers can register, verify email, sign in, browse published products, manage a cart and addresses, place COD orders, and follow their order history. Sellers can manage catalog, images, stock, customers, fulfillment, COD collection, shipping zones, store settings, approved pages, audits, and failed email jobs. PostgreSQL holds accounts, stock and orders; the browser is never the business record.

The site is **not enabled for real sales by this repository alone**. Confirmed product data, approved policies, business details, real delivery zones, domain, SMTP, object storage, backup destination and deployment credentials are needed. The sales switch is guarded by server checks.

## Local development

Use Node.js 24, Docker and PostgreSQL 17. See [local development](docs/operations/local-development.md) for setup. Once `.env.dev` is configured:

```sh
docker compose -f deploy/compose.dev.yml --env-file .env.dev up -d
npm ci
npm --prefix server ci
npm --prefix server run db:migrate
npm --prefix server run dev
npm run dev
```

The API runs on `127.0.0.1:3000` and Vite on the URL it prints. The local SMTP viewer is Mailpit at `127.0.0.1:8025`. Development records are separate from test fixtures.

## Verification

```sh
npm run verify
npm run test:e2e
```

`verify` builds client/SSR/API and runs frontend/backend tests against a migrated test database ending in `_test`. The browser suite needs PostgreSQL and Mailpit. CI uses Node 24 and PostgreSQL 17. Review [deployment](docs/operations/deployment.md), [backup and restore](docs/operations/backup-restore.md), and the [release checklist](docs/operations/release-checklist.md) before any live launch.

## Agent workflow

Read [AGENTS.md](AGENTS.md), [handoff](docs/agents/HANDOFF.md), the [original Superpowers provenance](docs/agents/SUPERPOWERS.md), the [approved design](docs/superpowers/specs/2026-09-25-commerce-design.md), and the [implementation plan](docs/superpowers/plans/2026-09-25-commerce.md). Test fixtures and illustrative images are labeled; do not copy them into live catalog data.
