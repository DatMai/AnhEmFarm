# Demo catalog and public page verification

Date: 2026-09-26. Scope: local browseable fixtures and public page completion on `codex/demo-content`, based on the approved commerce design and plan. This is a development preview, not a production launch.

## Review and fixes

A read-only GPT-6-sol review found three issues. Each was fixed before integration:

1. Demo slug artwork and preview language persisted after a seller confirmed a product. Product summaries now include `confirmed`; artwork and preview claims depend on the current product state. A browser case checks the confirmed transition.
2. Repeating the seed reset seller edits and store switches. Seeding now creates only missing fixtures and never updates existing categories, products, variants, or settings. An integration test first failed against the resetting behavior and then passed with the fix.
3. Server-rendered unpublished information pages hydrated as loading pages. The server now serializes a missing-content marker; both server and browser cache the same pending state. A direct browser load of `/policies/shipping` returned HTTP 404 with the intended heading and no hydration exception.

## Fresh verification

- `npm run verify`: client and SSR builds, API build, 17 frontend tests, 152 PostgreSQL integration tests passed.
- `npm run test:e2e`: 21 Playwright cases passed, including catalog browse, seller workflow, customer checkout and order, responsive/accessibility checks, and preview-to-confirmed messaging. The API watcher briefly restarted during this combined verification and Vite logged connection refusals for background auth requests; the final API was restarted without the watcher and `/health/ready` returned 200.
- `ALLOW_DEMO_SEED=true npm --prefix server run db:seed:demo`: local `_dev` database received ten preview products across four families. Public list reported ten, detail returned 200. All fixture variants have null prices, zero stock and sales disabled.
- Direct Playwright navigation to the API-rendered shipping route returned HTTP 404 and the explanatory content with no page exception or hydration console error. One expected HTTP 404 resource message was observed.

Production readiness still depends on confirmed business/catalog information, policies, credentials and the release checklist in `docs/operations/release-checklist.md`.
