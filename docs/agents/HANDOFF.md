# AnhEmFarm handoff

Updated: 2026-09-27.

## Guest checkout and account linking — 2026-09-27

PR #6 was merged into `main` at `3e6fbcf`. The owner then approved an immediate guest checkout with later account synchronization, explicitly authorizing autonomous implementation decisions and no further questions. Work is isolated in the managed worktree on `feat/guest-checkout-account-linking`; the owner's `main` preview remains untouched. The discovery, written design and inline implementation plan are `docs/superpowers/discovery/2026-09-27-guest-checkout-account-linking.md`, `docs/superpowers/specs/2026-09-27-guest-checkout-account-linking-design.md`, and `docs/superpowers/plans/2026-09-27-guest-checkout-account-linking.md`. This records advance owner authorization, not a separate response to each document review.

The implementation adds server-priced anonymous COD checkout with an opaque, time-limited guest cookie, guest quote and receipt routes, seller order visibility, and account linking only after the matching email is verified. An existing verified account claims later guest orders on successful login. Names and phone numbers never grant access. Both account and guest placements use the same atomic stock, commercial revalidation and order status machinery. A targeted RED test exposed the historical `orders(userId,idempotencyKey)` uniqueness blocking verified linkage when two guest sessions used the same key; the new migration removes that redundant constraint while retaining the authoritative account and guest placement-key tables. Guest status emails now link to the guest receipt while the order remains unclaimed.

Final local evidence: `npm run verify` passed frontend/SSR/API builds, 19 frontend tests and 171 PostgreSQL backend tests; `npm run test:e2e` passed 21/21 real Chromium cases including anonymous cart, quote, COD placement, seller view, Mailpit verification and linked account order. Root and server high-severity npm audits reported zero vulnerabilities; `git diff --check` passed. The isolated test database contains synthetic fixtures only. The local ignored `.local-ui-map/guest-checkout-2026-09-27/` stores six synthetic browser screenshots and route/control notes in both the worktree and owner's main checkout; `.gitignore` excludes them from the PR. See the guest verification record for RED→GREEN and browser details.

No production prices, stock, legal policies, external SMTP or live payments were configured. The production sales gate remains in force.

## Seller portal and product choices — 2026-09-27

The owner approved implementing a seller action queue, moving all admin routes into a separate backend-owned MPA opened in a new tab, fixing checkout orders missing from seller views, and adding a simple customer product choice/quantity flow. Work is isolated on `feat/seller-admin-product-options` from `main` at `6fa3faf`; it has not been merged. The implementation is being prepared as one PR to `main` for the owner's review and merge.

The portal uses active-admin session authorization, same-origin and CSRF checks, server-rendered HTML, and server-side form validation. Product/category/variant/choice forms parse the existing strict catalog schemas. One independent review initially caught a missing CSRF token on product creation and DTO validation bypasses; both were fixed, and regression tests now verify product creation and reject malformed/over-limit inputs. The portal shows accessible grouped navigation, order status counts and a pending-over-24-hour queue, paginated/searchable orders, categories, products, inventory, customers, reports, settings, content, audit, and email jobs. Orders made in checkout are searched in a real separate-tab browser journey. Product choices persist through cart/quote/COD order item snapshots; later seller edits do not rewrite existing orders. Quantities are 1–99.

Fresh verification after the review fixes: `npm run verify` passed (client/SSR/API builds, 19 frontend tests, 166 server tests); `npm run test:e2e` passed 20/20; focused admin E2E passed 4/4; admin portal integration passed 2/2; root and server `npm audit --audit-level=high` each reported zero vulnerabilities; `git diff --check` passed before final doc updates. The test database was isolated as `anhemfarm_seller_admin_20260927_test`, derived from the configured `_dev` database URL and never reset. Browser E2E screenshots use synthetic test customers/orders only.

The private ignored map at `.local-ui-map/` has been refreshed in the primary checkout with backend portal screenshots, customer product option/quantity/cart/quote/confirmation captures, updated route/control notes, and revised browser journeys. It remains local-only and is excluded by `.git/info/exclude`; none of the screenshots or map files are part of this PR. Screenshots show synthetic fixture data and are not a record of production orders.

The independent review is complete with no remaining material findings. The implementation was committed in English as `d3e4aad`; the branch is pushed and attached to [PR #6](https://github.com/DatMai/AnhEmFarm/pull/6), titled **feat: Add backend seller portal, action queue, and product choices**, targeting `main`. The PR is open for the owner to review and merge; it has not been merged.

Production catalog, stock, pricing, payment integrations, policies, external SMTP, real media storage and operational launch gates remain unverified.

## Current repository state — 2026-09-27

[PR #4](https://github.com/DatMai/AnhEmFarm/pull/4) merged into `main` at `6d131ee`. Transactional customer order-status emails and admin order search/filtering are integrated alongside the earlier commerce and UI work. Commit `ba90f44` was the final PR head; its push and pull-request `verify` checks both passed. This repository state does not imply production SMTP delivery or live sales readiness.

Post-merge audit: the owner asked for a code, spec, process and documentation check after PR #4. The order email/search diff was reviewed against the approved design; no correctness finding required a behavior change. The Orders page was formatted for easier maintenance. The design already described search and notifications, while this handoff, the Superpowers stage, seller guide and README needed to reflect the merge and the worker requirement. On the audit branch, `npm run verify` passed the client/SSR/API builds, 17 frontend tests and 160 server tests; `npm run test:e2e` passed 23/23 browser cases. The development API was restored and `/health/ready` returned `ok`. See `docs/superpowers/reviews/2026-09-27-post-merge-sync-verification.md` for scope and limits.

## Current state

The local preview now runs the separate email worker alongside API/Vite. Registration queues verification mail; the worker delivers it to Mailpit at `http://127.0.0.1:8025`, not an external inbox. The registration page links to Mailpit in Vite development mode. This addresses the missing worker in the prior preview; two queued local messages were delivered after it started.

An explicit local shopping fixture is now available with `DEMO_SHOPPING=true` alongside `ALLOW_DEMO_SEED=true`. It assigns fictional VND prices and demo stock to the ten local listings, a demo delivery zone, demo information pages, and enables development COD orders; wine stays unavailable. The fixture is guarded by `_dev`/`_test` database names and is never automatic. A single real-browser E2E case checks customer login, catalog, cart, quote, COD placement, seller login, order fulfillment and customer delivery status against PostgreSQL.
The local shopping verification record is `docs/superpowers/reviews/2026-09-26-demo-shopping-verification.md`. Its fresh suite result is 17 frontend and 153 backend tests plus 5 catalog browser cases and the one combined shopping/admin browser case.

The follow-up public preview pass added ten explicitly seeded local/test product concepts across mulberries, coffee, provisional tea and honey, with category browsing, useful detail pages, related products and complete pending states for unpublished public information pages. It stays non-saleable until a seller confirms actual data and launch prerequisites. The seed requires `ALLOW_DEMO_SEED=true`, rejects production mode and databases outside `_dev`/`_test`, and preserves seller edits on reruns. Implementation and review evidence are in `docs/superpowers/reviews/2026-09-26-demo-content-verification.md`.

The 17-task commerce implementation is merged into repository `main` at `4200038`. It includes a React/Vite storefront and seller UI, server-rendered public HTML, a NestJS/Prisma/PostgreSQL API, account registration and verification, sessions, server-authorized administration, catalog/inventory, COD quotes and orders, fulfillment, reports, approved content, SMTP outbox, media storage, deployment and recovery scripts. Production sales are deliberately disabled until real catalog, policy, business, shipping and integration inputs are configured. No live order, payment or external service is claimed.

The owner approved React + Node.js/TypeScript + PostgreSQL, COD first, English-only app and repository text, and the original obra/superpowers workflow. Django was explicitly rejected. The approved design is `docs/superpowers/specs/2026-09-25-commerce-design.md`; the implementation plan is `docs/superpowers/plans/2026-09-25-commerce.md`. Tasks 1–14 used the approved subagent method; the owner then requested inline work using GPT-6-sol or below. Tasks 15–17 and the final fix pass were inline. A single read-only GPT-6-sol whole-branch review found six Important and one Minor issue; all were addressed before integration. Details and verification limits are in `docs/superpowers/reviews/2026-09-25-commerce-verification.md`. Historical execution evidence is in `.superpowers/sdd/2026-09-25-commerce/progress.md` when that ignored local directory is present.

## Earlier verification — 2026-09-26

The 2026-09-26 PR-preparation rerun passed `npm run verify` (client/SSR/API builds, 17 frontend and 153 PostgreSQL backend tests), the final `npm run test:e2e` (23/23 Chromium cases), and root/server dependency audits (zero vulnerabilities at all severity levels). Two preceding full browser runs each had one failure caused by a stale Mailpit text expectation and an address-zone loading race in the test; the corrected focused suite passed 5/5 before the final full run. See `docs/superpowers/reviews/2026-09-26-pr-readiness.md` for the exact scope and limits. GitHub [PR #2](https://github.com/DatMai/AnhEmFarm/pull/2) was merged into `main` at `4200038`; it replaced PR #1 at the owner's request.

The first GitHub CI runs on PR #1 failed three media integration cases because those tests hard-coded port 5173 while CI configured `APP_ORIGIN` on port 4278. A local RED run reproduced the three 403 failures; using the harness's configured origin produced 9/9 focused passes, a full 17/153 `verify` pass and a 23/23 E2E pass under CI's origin. Both GitHub `verify` checks (push and pull request) completed successfully on fix commit `5438612`. See the CI origin correction in `docs/superpowers/reviews/2026-09-26-pr-readiness.md`.

## UI polish follow-up — 2026-09-27

The owner approved removing decorative arrow icons and adding restrained motion for navigation, dialogs, toasts, and button feedback. The change was on `feat/ui-motion-polish`, based on merged `main` commit `4200038`. Functional icons remain, and `prefers-reduced-motion` is honored. `npm ci` and `npm run build` passed in the feature worktree; tests were not run for this UI-only pass. GitHub [PR #3](https://github.com/DatMai/AnhEmFarm/pull/3) was merged into `main` at `8a143ad`.

## Order status email follow-up — 2026-09-27

The owner authorized immediate work on order status emails and best-practice choices without repeated approval requests, with a real-user evaluation. The work was developed on `feat/order-status-emails` from merged `origin/main` `8a143ad` and is now part of `main`. The approved commerce design and implementation plan record the bounded notification behavior and execution steps. The backend queues an owner-only status email in the order transaction and sends it through the existing encrypted outbox worker. Status changes cover confirmation, shipping, delivery, cancellation and return; shipping can include carrier tracking as escaped text. COD collection edits do not queue status mail. The email has a readable short reference and responsive red action button. A prior page-entry fade briefly reduced text contrast during accessibility scans, so text-bearing content now moves without fading.

The pre-merge local verification passed `npm run verify` (client/SSR/API builds, 17 frontend and 159 PostgreSQL backend tests) and `npm run test:e2e` (23/23 browser cases) after a 22/23 run exposed transient contrast. The fixture customer/seller journey delivered three status emails into Mailpit and verified their subjects and order links; desktop and phone email previews were inspected. A read-only reviewer found no Critical or Important issue, and its one Minor test gap was addressed. Initial push CI exposed a login/navigation race in one E2E test; the test now waits for the customer session. Both GitHub checks passed on fix commit `b052c83` and on final PR head `ba90f44`. Full evidence and limits: `docs/superpowers/reviews/2026-09-27-order-status-email-verification.md`. External SMTP and production delivery remain unverified.

Earlier verification history follows.

## Admin order search follow-up — 2026-09-27

The owner approved adding order search to PR #4: short order-reference prefix, customer name/email, carrier tracking, status, and inclusive Vietnam-date filters. The server validates the query and performs bounded, stable database pagination behind authorization; customer searches are scoped to the signed-in customer's orders. No schema migration was needed. Focused PostgreSQL integration coverage passed (53 tests), the real seller browser flow passed (2 cases), the full browser suite passed (23 cases), and pre-merge `npm run verify` passed (17 frontend and 160 server tests plus client/SSR/API builds). The change is on `main` via merge commit `6d131ee`; see `docs/superpowers/reviews/2026-09-27-admin-order-search-verification.md` for evidence and limits.

For the preview pass, `npm run verify` passed with 17 frontend and 152 backend tests; `npm run test:e2e` passed 21 browser cases. The development seed created ten browseable listings, and direct server-rendered navigation to a pending shipping page returned an explanatory HTTP 404 without a hydration exception. See the new review record for exact limits.

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
npm --prefix server run worker
npm run verify
npm run test:e2e
```

Integration tests require `TEST_DATABASE_URL` to name a database ending `_test`. `docs/operations/deployment.md`, `backup-restore.md`, and `release-checklist.md` document launch and recovery gates. Never commit credentials, private customer exports or fixture data as live business data.

## Next product inputs

The owner must supply confirmed product names, SKUs, prices, stock and real images; tea and honey are still provisional. Also required are business/support details, delivery zones and fees, approved policies, domain/TLS, SMTP, production media storage, encrypted offsite backup credentials and retention. Configure these outside Git, complete the release checklist, and only then enable the environment and seller sales switches. Vietnamese localization is deferred by owner request.
