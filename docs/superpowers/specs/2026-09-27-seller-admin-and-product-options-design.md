# Seller administration and product choices — design — 2026-09-27

Status: approved under the owner's explicit blanket authorization of all implementation decisions in his 2026-09-27 request. The initial release is a reviewable implementation behind a pull request; it does not enable live sales or invent live catalog content.

## Goal

Give sellers a separate, backend-owned administration workspace that makes orders and store operations easy to manage, exposes orders immediately after successful checkout, and lets customers choose a simple product-specific option and quantity before placing COD orders.

## Architecture decision

The storefront remains React/Vite. NestJS owns `/admin` and `/admin/*` as a server-rendered multi-page application (MPA): each navigation is a normal document request, and mutations use HTML forms with Post/Redirect/Get. Do not mount React, hydrate the admin, or ship the storefront JavaScript bundle on admin pages. Route admin requests before the public/private storefront router. Vite development proxies `/admin` to the API; the production reverse proxy already sends the site origin to the API.

The admin page layer calls existing domain services for writes, plus narrowly scoped read queries for tables and dashboard summaries. It must not duplicate order, catalog, inventory or settings rules. Every request resolves the session from the HttpOnly cookie and checks the current active ADMIN role. Every form mutation validates same-origin and the session CSRF token using the existing session/CSRF primitives. Escape all HTML values, use stable safe links, set `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`, and never log form bodies or customer details.

## Admin workspace and presentation

- The storefront's Admin action opens `/admin` with `target="_blank"` and `rel="noopener"`; the backend portal is the only admin route. Direct customer/admin navigation stays protected by the same server guard.
- A fixed, responsive left sidebar groups: **Overview** (Dashboard); **Orders** (All orders, Needs attention); **Catalog** (Products, Categories, Inventory); **Customers**; **Store** (Settings, Reports, Content); **Operations** (Audit, Email jobs). Narrow screens keep the grouped links visible in a compact grid so every destination is immediately discoverable and keyboard reachable without JavaScript.
- Dashboard uses order summary cards and one accessible inline SVG chart of orders by status, plus an overdue-order count and the oldest pending orders. Reports separately shows delivered order value and COD collection/due totals by Vietnam date range; neither page labels revenue as profit.
- Orders and customers use semantic tables with search/status/date filters, stable server pagination and detail links. Products, categories, inventory and audit use tables where records repeat and focused forms for create/update operations. Settings and content use labelled forms. Email jobs use a status summary and failure table.
- Every page includes useful empty, invalid-input, unauthorized and success/error states. Mutations redirect to a stable GET view with a short English status message. Preserve operation keys when the result could be uncertain.

## Seller action queue and order visibility

An order needs attention exactly when it is still `PENDING` and `createdAt <= now - 24 hours`. This is an elapsed-time threshold, not a Vietnam calendar-day filter. The queue is a view/filter only; it never changes order status automatically. Dashboard shows the count and a bounded list ordered oldest first. Orders includes an explicit Needs attention filter that composes with search and pagination. Existing admin API authorization and the existing `attention` semantics remain server-side.

The browser acceptance journey must create a real fixture customer order, then open the backend admin portal as a separate context and prove that the short order reference and customer appear in its table. Add regression coverage for the unfiltered list, search and pagination so a committed order cannot silently disappear from seller operations.

## Product choices and quantity

V1 adds one optional single-select choice group to each product. An active group has an English label and 1–12 active choices; each choice has a stable UUID and a 1–80 character label. A product with a configured group requires exactly one active choice for each new cart line and quote. Products with no active group require no choice. No choice affects price in v1. Admin can set/rename the group and add/remove choices; removing a choice makes it unavailable to new cart updates and quotes, while old order snapshots remain unchanged. Set the group label to empty to deactivate the group.

Persist choices as product-owned records with stable identifiers and an active flag. Store the selected choice ID on each cart line and preserve distinct lines when the same variant has different choices. Keep guest-cart JSON versioned and strict; upgrade valid v1 lines in place to v2 with no selection, preserving an in-flight merge key. A legacy no-choice cart line for a product that now requires a choice remains visible and recoverable but cannot be quoted until the customer removes it and selects an active choice. Quote creation resolves the active choice from the database, snapshots its group/choice label, and binds the product version; placement rechecks product version and choice identity under the same locks as other commercial data. Order items store the option labels as immutable text snapshots and include the selected choice in their stable uniqueness key. Choice labels never add a client-controlled price. Quantity remains an integer from 1 to 99; checkout totals and inventory still come from the server.

The product page renders one accessible radio group and a quantity input next to variant selection. Add-to-cart writes the selected variant, option and quantity for both guest and signed-in carts. Cart, quote, customer order detail, seller order detail and order email state show the choice snapshot where relevant. A stale/removed choice produces a recoverable message and requires the customer to select an active option again; it cannot be silently substituted.

## Database and compatibility

Use a forward-only Prisma migration. Add the product choice group/choice models and relation, cart-line choice relation and `selectionKey` uniqueness, and nullable order-item choice label snapshots plus a non-null stable key for uniqueness. Update product `version` whenever group/choices change so any outstanding quote becomes stale. No existing order is rewritten. Existing carts migrate to the no-choice key and continue to work. Do not destructively delete referenced choices; deactivate them and preserve referential integrity.

Update catalog and cart API schemas/representations, guest-cart schema version and merge digests. Keep old guest cart IDs/quantities readable and upgrade them to the new version. The server rejects duplicate/unknown/inactive choices, more than 50 lines, invalid quantity, a choice from another product, and stale quotes. Admin routes continue to use server authorization and audit logging.

## Verification and review

Use TDD for choice validation, ownership/authorization, cart mutation, quote totals, inventory and order persistence. PostgreSQL integration tests cover migrations, distinct choice lines, stale/deactivated choices, idempotent placement, order snapshots, and admin visibility. Playwright covers customer option/quantity selection through COD checkout, seller visibility/fulfillment, full-page admin navigation, CSRF rejection, role denial, dashboard queue, and responsive keyboard-accessible sidebar. Run the existing build/unit/integration/E2E and dependency-audit gates; inspect desktop and mobile in a real browser before reporting completion.

Production launch remains gated on owner-supplied real catalog, prices, stock, business details, policies, delivery settings and external services.
