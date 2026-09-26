# Order status email follow-up verification — 2026-09-27

Scope: `feat/order-status-emails` from merged `origin/main` `8a143ad`. The owner requested immediate Superpowers execution, authorized best-practice choices without repeated approval questions, and asked for a real-user evaluation. This record describes local evidence, not production email delivery or launch approval.

## Design and implementation

The bounded specification and plan additions are in the commerce design and plan documents. Each committed status transition creates one encrypted `ORDER_STATUS_CHANGED` outbox job inside the order transaction, keyed by the event ID. The worker verifies the current owner email and matching event before rendering. The English email has a short order reference, status heading, order link and optional carrier tracking; tracking is escaped in HTML. COD collection changes do not queue a status email. No migration or new external integration was required.

The storefront motion pass had a contrast regression: the entry animation faded whole content blocks while accessibility scanning began. The fade on text-bearing page, dialog and toast content was removed; translation remains, and reduced-motion preferences still apply.

## Test and review evidence

- TDD RED: five new focused integration cases failed because no order status jobs existed. After implementation, all five passed. A later email presentation assertion failed against the raw-UUID, unstyled HTML; the updated template passed it.
- Focused order/outbox suite: 60/60 passed before the final owner-mismatch exhaustion assertion. That additional case passed after asserting six failed attempts, exhaustion and payload erasure.
- Final `npm run verify`: frontend and SSR builds, API build, 17 frontend tests, and 159 PostgreSQL backend tests passed.
- First full browser run: 22/23 passed; axe reported serious contrast violations during the page opacity animation. After removing text opacity, the focused accessibility case passed and final `npm run test:e2e` passed 23/23.
- The real-browser COD journey logged in as a fixture customer, placed an order, logged in as a fixture seller, confirmed, shipped, delivered and recorded COD collection. The test drove the worker and checked Mailpit for exactly the three matching status subjects and correct order URLs, with no collection status email. Integration tests also cover customer cancellation, return, replay, HTML escaping, ownership, and rollback.
- A separate read-only code reviewer found no Critical or Important issue. Its Minor finding about owner-mismatch exhaustion was addressed by the final focused test. The reviewer did not edit files or run tests.
- Manual Mailpit inspection of a fixture email on desktop and phone preview confirmed a readable heading, short reference, red action button and no horizontal clipping. Mailpit's HTML compatibility estimate is not a substitute for testing real email clients.
- Initial GitHub CI on PR #4 passed the pull-request workflow but failed the push workflow in the existing seller-fulfillment E2E case (22/23 passed). The test clicked customer sign-in and immediately navigated to the order, allowing navigation to interrupt the pending login. The corresponding seller login and the new fixture shopping journey already waited for the authenticated account link. The test now waits for the fixture customer link before navigating. The focused case, `npm run verify` (17 frontend and 159 backend tests), and `npm run test:e2e` (23/23) passed locally after this correction. Both GitHub checks passed on fix commit `b052c83`.

## Limits

Mailpit and fixture accounts were used. External SMTP credentials, real inbox delivery, production worker operation, and real carrier tracking were not verified. Browser cases that mock the API can log Vite proxy connection refusals while still passing; these did not affect the fixture-backed checkout journey. The release checklist and real business data remain launch gates.
