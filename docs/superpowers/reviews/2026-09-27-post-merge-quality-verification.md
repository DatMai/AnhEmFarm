# Post-merge quality verification — 2026-09-27

## Scope and baseline

The owner merged PR #10 at `6a80875` and requested a full check before naming the next feature. This review is based on that merged `main`, isolated on `feat/post-merge-quality-sync`. The approved seller/product-option and guest-checkout specifications and plans were checked against the current routes and E2E coverage; their product requirements were not changed. The local `.superpowers/sdd/` and `.local-ui-map/` directories are ignored by Git.

## Code and browser findings

- The separate NestJS admin portal opens from the storefront in a new browser tab. Manual Chrome inspection found its dashboard, grouped sidebar and Orders table. The table contained the synthetic development orders created during local checks.
- On a product detail page, increasing quantity from one to two changed the action to “Add 2 to cart”; the cart showed quantity two, and removal emptied it.
- The admin sidebar Log out control appeared with default browser button styling. A scoped CSS rule now gives it the same navigation affordance and visible keyboard focus as the sidebar links.
- The Orders table used an “Action” header for a column that only marks overdue orders. Its header now says “Attention”, matching the data and filter.
- A previously supplied local QA login was described as a customer, but a read-only development-database check showed its role is ADMIN. The implementation's registration path creates CUSTOMER accounts; the E2E tests use distinct synthetic buyer and seller identities. No credentials or customer details are kept in this review.

## Verification

- After the sidebar style correction, `npm run verify` passed client, SSR and API builds, 20 frontend tests, and 172 backend tests.
- After the sidebar style correction, `npm run test:e2e` passed 21/21 Chromium cases, including guest checkout, account linking and seller operations. The final heading change receives a focused admin browser rerun below.
- After the Orders heading correction, `npm --prefix server run build` passed and focused admin/browser coverage passed 3/3: product choices and portal navigation, customer access denial, and real COD purchase visible to the seller.
- Root and server `npm audit --audit-level=high` each reported zero vulnerabilities.
- The local API readiness endpoint returned `ok`; Vite served the storefront; Mailpit and the outbox worker were running.
- The ignored local UI map was refreshed with 23 public/mobile screenshots and 25 synthetic fixture screenshots, including six guest-checkout stages. Its route/control descriptions and capture provenance were updated.

The local map was refreshed once more after the final browser rerun. Its admin Orders screenshot now shows the styled Log out control and the “Attention” column heading. `git diff --check` passed, and the Git review confirmed that screenshots, local ledgers, credentials and private records were not staged. The change is proposed in [PR #11](https://github.com/DatMai/AnhEmFarm/pull/11) for the owner's merge.

## Limits

The browser data is local or synthetic. These checks do not establish live product prices, inventory, legal content, external SMTP delivery, production media storage or launch readiness. The release checklist remains the production gate.
