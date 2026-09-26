# AnhEmFarm handoff

Updated: 2026-09-26.

## Current state

The 17-task commerce implementation is integrated into the owner's `main` checkout at `/Users/daemonthetarnished/Me/code/AnhEmFarm`. It includes a React/Vite storefront and seller UI, server-rendered public HTML, a NestJS/Prisma/PostgreSQL API, account registration and verification, sessions, server-authorized administration, catalog/inventory, COD quotes and orders, fulfillment, reports, approved content, SMTP outbox, media storage, deployment and recovery scripts. Production sales are deliberately disabled until real catalog, policy, business, shipping and integration inputs are configured. No live order, payment or external service is claimed.

The owner approved React + Node.js/TypeScript + PostgreSQL, COD first, English-only app and repository text, and the original obra/superpowers workflow. Django was explicitly rejected. The approved design is `docs/superpowers/specs/2026-09-25-commerce-design.md`; the implementation plan is `docs/superpowers/plans/2026-09-25-commerce.md`. Tasks 1–14 used the approved subagent method; the owner then requested inline work using GPT-6-sol or below. Tasks 15–17 and the final fix pass were inline. A single read-only GPT-6-sol whole-branch review found six Important and one Minor issue; all were addressed before integration. Details and verification limits are in `docs/superpowers/reviews/2026-09-25-commerce-verification.md`. Historical execution evidence is in `.superpowers/sdd/2026-09-25-commerce/progress.md` when that ignored local directory is present.

## Fresh verification

On the main checkout after integration: `npm ci`, `npm --prefix server ci`, and `npm run verify` passed (client/SSR/API builds, 15 frontend tests, 149 PostgreSQL backend tests). The final worktree browser rerun passed 16/16 Playwright tests; a preceding run failed 3 cases because its local backend failed to start after a two-minute first-case timeout, and the isolated first case passed before the clean rerun. The main checkout's development API reported `/health/ready` 200 and its Vite `/products` page returned 200. The server and Vite development processes were started from the main checkout for preview. A local mocked backup/media drill retrieved and verified one independent media copy; real age encryption, remote S3 permissions and retention remain unverified.

Node 24 production image, isolated PostgreSQL 17 Compose migration/API/worker smoke, synthetic plaintext restore drill, and 0 high/critical npm audit vulnerabilities were verified before the final fix pass. They have not been rerun against real external services. Do not infer production readiness from the local checks.

## Commands

Read `docs/operations/local-development.md` for ignored `.env.dev`, PostgreSQL 17 and Mailpit setup. Then run:

```sh
npm ci
npm --prefix server ci
npm --prefix server run db:migrate
npm run dev
npm --prefix server run dev
npm run verify
npm run test:e2e
```

Integration tests require `TEST_DATABASE_URL` to name a database ending `_test`. `docs/operations/deployment.md`, `backup-restore.md`, and `release-checklist.md` document launch and recovery gates. Never commit credentials, private customer exports or fixture data as live business data.

## Next product inputs

The owner must supply confirmed product names, SKUs, prices, stock and real images; tea and honey are still provisional. Also required are business/support details, delivery zones and fees, approved policies, domain/TLS, SMTP, production media storage, encrypted offsite backup credentials and retention. Configure these outside Git, complete the release checklist, and only then enable the environment and seller sales switches. Vietnamese localization is deferred by owner request.
