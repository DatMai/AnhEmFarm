# Guest checkout implementation plan

Base: merged `origin/main` at `3e6fbcf`. Execution: inline in the managed worktree on `feat/guest-checkout-account-linking`, as authorized by the owner; no subagent execution requested. Record RED and GREEN checks in the progress record.

1. **Persistence and ownership.** Add guest session, nullable quote/order account owner, guest email/session, guest idempotency keys, database constraints and indexes. Generate Prisma client and apply migration to an isolated test database. Test that an unverified account cannot claim orders and a verified matching account can.
2. **Guest quote and COD placement.** Add strict request schemas and opaque-cookie session handling. Reuse the account quote/placement validation and transaction invariants for guest orders. Test quote totals, options, stale data, stock race, request replay and cross-session access before implementing each behavior.
3. **Seller and email integration.** Include guest orders in seller lists/search/detail and notify the checkout address for creation and status changes. Cover with integration tests.
4. **Storefront.** Let anonymous shoppers use cart → guest checkout → review → COD receipt. Keep account checkout intact. Add a browser E2E journey and test a later registration/verification displaying that order. Capture local ignored UI map evidence when the browser is available.
5. **Finish.** Run full `npm run verify`, `npm run test:e2e`, focused security checks and diff review. Update handoff, Superpowers stage, and verification record with actual results. Commit in English, push this descriptive `feat/...` branch, and open a clear PR for the owner to merge.

Review focus: forged guest cookies, quoted cart tampering, CSRF/rate bypass, stock and idempotency races, email ownership confusion, seller visibility and guest notification recipient after account linking.
