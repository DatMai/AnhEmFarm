# Seller administration and product choices — verification — 2026-09-27

## Scope

This review covers the backend-owned seller portal, overdue order queue, admin order visibility, customer product choices and quantity, and the end-to-end path that creates a COD order and processes it in the seller portal. The feature branch is `feat/seller-admin-product-options`, based on merged `main` commit `6fa3faf`.

The admin portal is a NestJS/Express MPA at `/admin/*`. It checks the active server-side ADMIN session on each route; state-changing forms pass same-origin and session CSRF checks. Catalog forms parse the same strict DTO schemas as the JSON API, including product, category, variant, choice, and resource IDs. Product image routes validate the product UUID before media persistence. Product choices are stored by stable ID through cart and quote and snapshotted on COD order items; later product edits do not rewrite order history.

## Independent review

A read-only whole-branch review found two Important issues and one Minor issue:

1. The create-product form lacked its CSRF token. Added the token and an integration regression that submits a valid create.
2. Native MPA catalog writes bypassed shared DTO validation. Added strict schema/UUID parsing and regressions for malformed product data, more than 12 active choices, and a malformed image product ID that must not create a Media row.
3. Successful Post/Redirect/Get mutations did not show feedback. Added short accessible `role="status"` notices and assertions for create and choice saves.

The reviewer rechecked the first fixes and caught the image UUID validation ordering issue. After the fix and no-write regression, the reviewer approved with no remaining material findings. The mobile nav was also changed from a hidden-checkbox accordion to an always-visible compact grid after Axe reported a hidden-label violation. Sidebar category headings now meet contrast requirements. The complete Axe run reports no serious or critical violations on covered admin/storefront pages.

## Verification

All tests used a dedicated `anhemfarm_seller_admin_20260927_test` database derived from the configured development URL only after verifying the source database ended in `_dev`. No development database was reset. Fixtures and screenshot recipients are synthetic.

- `npm run verify` — passed: client, SSR and NestJS builds; 19 frontend tests; 166 server tests.
- `npm run test:e2e` — passed: 20/20 Chromium tests, including a real browser COD checkout, new-tab seller admin visit, order lookup by short reference, fulfillment, COD collection/correction, choice snapshot persistence, role denial, reduced motion and accessibility.
- `npm run test:e2e -- e2e/admin-catalog.spec.ts e2e/admin-fulfillment.spec.ts e2e/demo-shop-admin.spec.ts` — passed: 4/4 focused seller flows.
- `npm run test:integration -- test/admin-web.integration.test.ts` — passed: 2/2 portal tests, including CSRF-protected creation, schema rejection, status feedback, and malformed upload path without media writes.
- `npm run test:e2e -- e2e/admin-catalog.spec.ts` — passed: 2/2 after adding customer-detail screenshot coverage.
- Root and server `npm audit --audit-level=high` — both reported zero vulnerabilities.
- `git diff --check` — passed before final documentation/PR updates.

The private ignored `.local-ui-map/` in the primary checkout now has refreshed MPA screenshots, customer option/quantity/cart/quote/order screenshots, the mobile Orders view, and updated route/control descriptions. The directory is excluded by the checkout's `.git/info/exclude` and is not part of the feature branch.

## Limits

This is not a production-readiness declaration. Live catalog details, prices, stock, real media storage, external SMTP delivery, payment integrations, approved policies and launch controls still require owner and operations inputs. No real order or external payment was involved.

## PR

Opened [PR #6](https://github.com/DatMai/AnhEmFarm/pull/6), **feat: Add backend seller portal, action queue, and product choices**, from `feat/seller-admin-product-options` into `main`. The PR is open and attached to the task for the owner to review and merge; it has not been merged.
