# Admin order search verification — 2026-09-27

Scope: the owner approved adding this function to open PR #4, `feat/order-status-emails`. The branch is based on merged `main` commit `8a143ad`. Search and filters extend the existing order queue; they do not change order state transitions or the database schema.

## Behavior

- Search matches a case-insensitive short order UUID prefix, customer name/email, or carrier tracking substring.
- Search combines with order status, collection state, and inclusive `from`/`to` dates. Date boundaries use Asia/Ho_Chi_Minh calendar days.
- Query strings, real calendar dates, ordered ranges up to 365 calendar days, and pagination are validated server-side. Invalid values return 422.
- SQL values are parameterized. Search predicates, customer ownership scope, filters, stable newest-first ordering, and page limits are applied in PostgreSQL. A separate count query supplies the total for pagination; customer search is scoped to that customer's orders.
- The admin UI exposes labeled search/status/date controls, a clear action, Vietnam-time guidance, short order references, and direct order detail links.

## Test and review evidence

- TDD RED: the new integration request initially received 422 because the endpoint did not accept search and date parameters. UUID reference filtering required a parameterized PostgreSQL cast because Prisma's UUID field does not support string-prefix operations.
- Focused PostgreSQL order integration suite: 53/53 passed. Coverage includes name/email/reference/tracking, combined filters, bounded pagination and accurate totals, invalid dates, reversed/overlong ranges, and 365-calendar-day boundary validation.
- Focused seller browser flow: 2/2 passed. The real seller case searches a fixture order by short reference, applies status and Vietnam date filters, clears them, and proceeds through the existing COD fulfillment journey.
- Full browser suite: 23/23 passed. One later run had 22/23 because an unrelated admin inventory test timed out waiting for Vite page load; that case passed alone, and the next full run passed 23/23. The order search test now scopes its status assertion to the searched order's row, avoiding ambiguity from existing fixture orders.
- Final `npm run verify`: client, SSR and API builds passed; 17 frontend tests and 160 server tests passed.
- `git diff --check` passed. Manual review confirmed parameterized SQL, server-side page bounds, server authorization, and customer ownership scoping. No migration was introduced.

## Limits

The browser and database checks use local fixture accounts and a test database. Carrier systems, production data volume, and production deployment were not exercised. Name, email, and tracking substring search scans rows matching the other filters; the feature does not add trigram indexes or external search infrastructure.
