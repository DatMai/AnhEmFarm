# Seller Administration and Product Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a separate server-rendered seller portal with an actionable order queue and reliable order visibility, plus simple customer-selected product options and quantity that remain authoritative and immutable in checkout records.

**Architecture:** Keep the customer storefront in React/Vite and serve `/admin/*` as a NestJS-owned MPA with authenticated, CSRF-protected HTML forms and normal page navigation. Store product choices in PostgreSQL, carry their IDs through carts and quotes, snapshot labels into order items, and make the server authoritative for choice validity, price and stock.

**Tech Stack:** NestJS, Express, TypeScript, React storefront, Prisma, PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-seller-admin-and-product-options-design.md`

## Global Constraints

- Use English for all repository docs and app-visible text.
- Use PostgreSQL as the persistent source of truth; never trust client price, total, option label, role or stock.
- Require an active ADMIN session for every admin read/write; mutating forms require same-origin and CSRF checks.
- Keep COD as the only payment mode and preserve current stock, order, audit and outbox invariants.
- Preserve old orders and accept/upgrade existing guest carts without losing lines.
- Use fixture data only in databases ending `_dev` or `_test`; do not invent live business data.
- Open admin from the storefront in a new tab and do not run the React SPA on any admin page.

## Review Focus

- A selected option must belong to the selected product and still be active at cart update, quote and placement.
- One variant with two option choices must persist as two independently addressable cart/order lines.
- Existing no-option carts and old versioned guest carts must upgrade without quantity loss.
- A product choice edit must invalidate a pending quote but leave old order snapshots intact.
- An order just placed by a customer must appear in admin after a separate-tab navigation and after search/pagination.

---

### Task 1: Persistent product choices and catalog administration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260927090000_product_choice_catalog/migration.sql`
- Modify: `server/src/catalog/catalog.schemas.ts`, `server/src/catalog/catalog.service.ts`, `server/src/catalog/admin-catalog.controller.ts`
- Modify: `server/test/catalog.integration.test.ts`

**Interfaces:**
- Produce a product choice-group read shape `{ id, label, choices: [{ id, label, active }] }`.
- Admin writes the complete group through `PUT /api/v1/admin/products/:id/choice-group` with `{ expectedVersion, label: string | null, choices: [{ id?: string, label, active }] }`; null label deactivates the group and all its choices.
- `CatalogService.updateChoiceGroup(actor: Actor, productId: string, input: ChoiceGroupInput)` locks the product, enforces active ADMIN, validates ownership/labels/count, updates product.version and writes an audit entry.
- Public detail includes only an active group and active choices; admin detail includes inactive choices for recovery/reactivation.

- [x] Add PostgreSQL integration tests for choice CRUD, foreign-product IDs, validation (1–12 active choices), quote-relevant version increments and ADMIN-only access; confirm the original missing route failed before implementation.
- [x] Add the schema and forward migration with safe defaults for products without choices.
- [x] Implement strict group/choice DTOs (one group, at most 12 active choices, exact normalized labels and product-owned IDs) and the `CatalogService.updateChoiceGroup` transaction.
- [x] Extend public product detail and admin product detail responses with the choice group; public data uses the same detail shape consumed by SSR.
- [x] Run `npm --prefix server run test:integration -- test/catalog.integration.test.ts` and `npm --prefix server run typecheck`; both pass.
- [x] Commit: `feat: add product customization choices`.

### Task 2: Carry choices through cart and quote safely

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260927093000_product_choice_cart/migration.sql`
- Modify: `server/src/cart/cart.controller.ts`, `server/src/cart/cart.service.ts`, `server/src/checkout/checkout.schemas.ts`, `server/src/checkout/quote.service.ts`
- Modify: `src/features/cart/cart-api.ts`, `src/features/cart/guest-cart.ts`, `src/features/cart/guest-cart.test.ts`
- Modify: `server/test/cart-quote.integration.test.ts`

**Interfaces:**
- Cart mutation accepts `{ variantId, quantity, optionId: string | null, version }`; choice identity is server-validated.
- Cart merge line accepts `{ variantId, quantity, optionId: string | null }`; canonical digest includes optionId.
- Quote lines include `{ optionId, optionGroupLabel, optionLabel }` sourced from PostgreSQL.

- [ ] Add failing PostgreSQL tests for add/update/remove with choices, distinct lines for same variant/different choices, cross-product IDs, removed choices, no-choice products and stale quote after option edit.
- [ ] Add cart selection key uniqueness and preserve no-choice legacy rows with key `none`.
- [ ] Upgrade strict guest cart storage from v1 to v2, retaining valid v1 items and merge idempotency.
- [ ] Implement transactional validation and snapshot option labels into quote lines; preserve server-calculated totals.
- [ ] Run focused cart/quote integration tests and guest-cart tests; expect all pass.
- [ ] Commit: `feat: persist product choices in customer carts`.

### Task 3: Snapshot choices into orders and protect checkout invariants

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260927094500_product_choice_order_snapshots/migration.sql`
- Modify: `server/src/checkout/checkout.service.ts`, `server/src/orders/orders.service.ts`, `server/src/email/email.templates.ts`
- Modify: `server/test/checkout.integration.test.ts`, `server/test/orders.integration.test.ts`, `e2e/demo-shop-admin.spec.ts`

**Interfaces:**
- Order item views add nullable `optionGroupLabel` and `optionLabel`; totals remain `variant price × quantity + shipping`.
- New order item uniqueness is `(orderId, variantId, selectionKey)`, where `selectionKey` is `none` or the validated choice UUID.

- [ ] Add failing integration tests for invalidated quote, tampered option, two same-variant choices, one-time placement, immutable label snapshots after product edit, and unchanged stock/totals on rejection.
- [ ] Implement locked placement validation and immutable order-item choice snapshots in the existing transaction.
- [ ] Expose labels consistently in customer/seller order views and escaped email template output.
- [ ] Add E2E assertion that a committed buyer order is returned by admin list and is findable by short reference across pages.
- [ ] Run focused checkout/order tests and the demo shopping E2E; expect all pass.
- [ ] Commit: `feat: snapshot product choices on cod orders`.

### Task 4: Customer product choice and quantity experience

**Files:**
- Modify: `src/features/catalog/types.ts`, `src/features/catalog/ProductPage.tsx`, `src/features/cart/CartPage.tsx`, `src/features/checkout/CheckoutPage.tsx`, `src/features/account/OrderDetailPage.tsx`
- Modify: `src/features/cart/guest-cart.test.ts`, `e2e/customer-order.spec.ts`, `e2e/demo-shop-admin.spec.ts`

- [ ] Add failing UI/E2E coverage for required radio choice, quantity bounds, add-to-cart payload, guest/cart migration, quote review labels and order history snapshots.
- [ ] Implement accessible single-select options and a quantity control (1–99) on product detail; disable add until any configured choice is selected.
- [ ] Display choice labels in cart, quote, confirmation and order details; show a recoverable state if an option became inactive.
- [ ] Run focused frontend/E2E tests and inspect product detail/cart/checkout at mobile and desktop widths.
- [ ] Commit: `feat: let customers choose product options and quantity`.

### Task 5: Backend-owned admin portal foundation and seller queue

**Files:**
- Create: `server/src/admin-web/admin-web.controller.ts`, `server/src/admin-web/admin-web.html.ts`, `server/src/admin-web/admin-web.css`
- Modify: `server/src/main.ts`, `server/src/app.module.ts`, `server/src/orders/orders.service.ts`, `server/src/orders/order-rules.ts`
- Modify: `vite.config.ts`, `src/components/Layout.tsx`, `src/app/router.tsx`
- Modify: `server/test/orders.integration.test.ts`, `server/test/admin-web.integration.test.ts`, `e2e/demo-shop-admin.spec.ts`

**Interfaces:**
- Backend route handler resolves the existing session, asserts ADMIN and renders complete HTML; all forms use same-origin, CSRF, HTML escaping, domain-service calls and Post/Redirect/Get.
- Admin MPA reads orders through `OrdersService`; the JSON admin API remains available with the same server-side filters and authorization. Add a validated `attentionOnly=true` filter and overdue summary read.
- Admin portal uses ordinary `<a>` navigation and native forms; no React bundle or hydration.

- [ ] Add failing HTTP/E2E tests for admin HTML with no scripts, role/session denial, CSRF rejection, separate-tab route, sidebar grouping, exact 24-hour attention threshold, action resolving from queue, and successful order listing/search.
- [ ] Implement the backend MPA shell, responsive grouped sidebar, semantic tables/forms, safe flash messages, no-store/noindex headers, and admin error pages.
- [ ] Route `/admin/*` before the storefront shell; proxy `/admin` to the API in Vite; make storefront Admin link open a protected new tab.
- [ ] Implement dashboard action count/list and composable server-side Orders “Needs attention” filter; never auto-cancel.
- [ ] Run focused integration and E2E suites; inspect separate-tab behavior and keyboard/mobile sidebar.
- [ ] Commit: `feat: add backend seller portal and overdue order queue`.

### Task 6: Port admin screens and product choice management to the MPA

**Files:**
- Create/modify: `server/src/admin-web/*`
- Modify: `server/src/catalog/admin-catalog.controller.ts`, `server/src/admin/settings.controller.ts`, `server/src/admin/customers.controller.ts`, `server/src/admin/reports.controller.ts`, `server/src/content/content.controller.ts`, `server/src/inventory/inventory.controller.ts`, `server/src/media/media.controller.ts`, `server/src/orders/admin-orders.controller.ts`
- Modify/remove: `src/features/admin/*`, `src/app/router.tsx`, `.local-ui-map/screen-map.md`, `docs/operations/admin-guide.md`
- Modify: `server/test/admin-web.integration.test.ts`, E2E admin specs

- [ ] Add browser tests for products/options/categories/inventory/customer/settings/content/audit/email-job screens and mutation success/error states; first run must fail because admin SPA currently owns these routes.
- [ ] Implement grouped navigation: Overview; Orders; Catalog; Customers; Store; Operations. Use summary cards/SVG on Dashboard, tables for repeated records and forms for edits.
- [ ] Port each current admin capability without removing server-side validation, audit entries, optimistic versions, image constraints, operation keys or retry guidance.
- [ ] Implement product option group/choice add/rename/deactivate controls in the backend product editor. Preserve old orders and reject stale customer quotes.
- [ ] Remove admin SPA route components and update the ignored UI screen map to show MPA pages/controls.
- [ ] Run `npm run verify`, `npm run test:e2e`, root/server `npm audit --audit-level=high`; expect success and no high/critical advisories.
- [ ] Commit: `feat: move seller operations to server-rendered admin pages`.

### Task 7: Full journey review, docs and handoff

**Files:**
- Modify: `docs/operations/admin-guide.md`, `docs/agents/HANDOFF.md`, `docs/agents/SUPERPOWERS.md`, this plan, `.local-ui-map/screen-map.md`
- Create: `docs/superpowers/reviews/2026-09-27-seller-admin-product-options-verification.md`

- [ ] Review branch against every acceptance in the approved design and this plan; repair all important findings.
- [ ] Run full verification after fixes and save exact commands/results. Exercise guest and signed-in checkout, seller queue, product option changes, wrong-role access, CSRF, reload persistence, new-tab navigation, reduced motion and responsive layouts.
- [ ] Update admin runbook, screen map, handoff and plan progress with actual results, PR link and limits. Do not claim production readiness or fake live data.
- [ ] Run `git diff --check`, review `git status --short`, push branch and open one explicit PR to `main` for owner review.
- [ ] Preserve PR for the owner to merge.

## Execution choice and progress

Execution method: inline in this Codex session, as explicitly directed by the owner to execute independently and not ask further approval questions. Isolation: existing managed worktree at `/Users/daemonthetarnished/.codex/worktrees/commerce-pr-rename/AnhEmFarm`, branch `feat/seller-admin-product-options`, based on `6fa3faf`.

Approval evidence: user request on 2026-09-27 explicitly approves the seller action queue and grants blanket approval for all decisions; see discovery and spec. Baseline `npm run verify` passed before implementation (17 frontend and 160 server tests, client/SSR/API builds).

Progress:
- [x] Baseline repository verification.
- [x] Task 1: Persistent product choices and catalog administration.
- [ ] Task 2–7: pending.
