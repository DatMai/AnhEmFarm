# AnhEmFarm — Commerce Website v1 Design Specification

Status: implemented in the local `main` checkout. The owner's continuation request advanced this English specification into planning; the plan records that interpretation rather than a separate quoted document approval. The 17-task implementation, subsequent demo preview, demo shopping fixture, and local Mailpit flow are documented in the plan, handoff, and dated verification records. Production launch remains gated by confirmed business data and external integrations.

## 1. Approved direction and goal

The owner approved the complete storefront direction and cash on delivery (COD), then selected Node.js because it is the stack used in his professional work and confirmed approval. The core stack is React, Node.js + TypeScript, and PostgreSQL. Django is excluded. The owner subsequently required English for every repository document and all text inside the app; Vietnamese localization will follow in a later phase.

Acceptance goal: a customer can register, sign in, select products, place a COD order, and track that order. An administrator can manage products, customers, inventory, sales, and order fulfillment. Business records survive server restarts. The interface retains the AnhEmFarm brand, red palette, and mobile usability.

Version 1 serves one store, one warehouse, VND amounts, and domestic delivery. Online payment, carrier synchronization, multiple sellers, coupons, and loyalty points are outside this release. Actual business details and policy text require the owner's confirmation before accepting live orders.

## 2. Proposed architecture

- Frontend: retain React + TypeScript + Vite; add routing and API data handling, and split the existing `App.tsx` by feature.
- Backend: Node.js 24 LTS + TypeScript, NestJS using the Express adapter. Use one modular application, without microservices.
- Database: PostgreSQL. Prisma owns schema, migrations, and ordinary queries. Order and inventory changes use transactions; any database-specific locking query is parameterized.
- REST API under `/api/v1`. Frontend and API share one origin behind a reverse proxy. Authentication uses server-side sessions; login tokens do not go into localStorage.
- Product images use a storage adapter: a persistent local volume for development and S3-compatible object storage in production. PostgreSQL holds metadata and object keys.
- Email uses SMTP, a local test inbox during development, a PostgreSQL outbox, and a worker that retries delivery. Redis is not required in v1.
- Repository layout retains `src/` for the frontend and adds `server/`, `e2e/`, `deploy/`, and `docs/operations/`. The implementation plan pins dependency versions and lockfiles.

Node 24 is an LTS release according to the [official Node.js schedule](https://nodejs.org/en/about/previous-releases). The [NestJS documentation](https://docs.nestjs.com/) describes modules, guards, validation, and testing. NestJS and Prisma are choices proposed by this specification, rather than requirements imposed by Superpowers.

## 3. Modules and data ownership

| Module | Responsibility | Primary records |
| --- | --- | --- |
| Identity | Accounts, email verification, passwords, sessions, permissions | User, Session, AccountToken |
| Catalog | Categories, products, SKU variants, images | Category, Product, Variant, Media |
| Inventory | Available stock and adjustment history | Variant stock, InventoryMovement |
| Cart | Carts and guest-cart merge | Cart, CartItem |
| Orders | Quotes, checkout, orders, COD fulfillment | CheckoutQuote, Order, OrderItem, OrderEvent |
| Operations | Admin workflows, reports, audits, settings, content | AuditLog, StoreSettings, ShippingZone, ContentPage |
| Infrastructure | Email, storage, health checks, configuration | EmailOutbox |

All order status and stock changes pass through business services. Controllers and admin tools cannot bypass these rules by directly updating records.

## 4. Pages and customer experience

| Group | Proposed routes | Behavior |
| --- | --- | --- |
| Public shop | `/`, `/products`, `/products/:slug` | Search, category filter, sort, pagination, details, variant selection |
| Authentication | `/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` | Forms, validation, submission state, errors, recovery guidance |
| Purchase | `/cart`, `/checkout` | Quantities, delivery address, quote, shipping fee, COD confirmation |
| Account | `/account`, `/account/addresses`, `/account/orders`, `/account/orders/:id` | Profile, addresses, confirmation, own orders and status history |
| Content | `/about`, `/contact`, `/policies/:slug` | Approved content, a dedicated 404 page, recoverable errors |
| Administration | `/admin` and child pages | Dashboard, products, categories, stock, orders, customers, content/settings |

Guests may browse and build a device-local cart. Checkout requires an active account and verified email. After login, merge a guest cart once using a request key so a refresh cannot add items again. Logout removes account data from frontend memory; a server cart remains attached only to its owner.

Every page has loading, empty, error, and success states as applicable. Filters appear in the URL. Forms show field errors and preserve valid entries on retry. Dialogs manage focus, Escape, and return focus. Motion respects `prefers-reduced-motion`. Validate widths of 360px, 768px, and 1440px without horizontal overflow.

Product pages have product-specific metadata and content available to crawlers without JavaScript, through server rendering or prerendering. This requirement does not change the selected backend stack. Private account/admin pages must not be publicly cached or included in the sitemap.

## 5. Accounts and authorization

- Roles are CUSTOMER and ADMIN. Public registration always creates CUSTOMER; a privileged role submitted by the client is ignored or rejected.
- Normalize email and enforce uniqueness in PostgreSQL. Passwords are 12–128 characters and hashed with Argon2id through a maintained library. Passwords and tokens never enter logs.
- Email-verification tokens expire after 24 hours; password-reset tokens after one hour. Tokens are random, stored as digests, usable once, and a newly issued token invalidates an older token for the same purpose.
- Session cookies are HttpOnly, Secure in production, and SameSite=Lax. Customer session TTL is seven days; admin TTL is 12 hours. Server-side revocation is required. Logout revokes the current session. A password change/reset or account suspension revokes all sessions.
- Mutations require origin and CSRF checks, including login. Every request checks active account state, role, and resource ownership. Ordinary API responses exclude password hashes, session secrets, and tokens.
- Login errors are generic. Reset and resend responses do not disclose whether an address exists. Rate limits use shared counters across API processes and return HTTP 429 with `Retry-After`.
- Defaults: 10 login attempts per 15 minutes per IP/email pair and 60 per 15 minutes per IP; 10 registrations per hour per IP; three verification/reset emails per hour per account and 20 per hour per IP. Make limits configurable and test them.
- Provision the first admin with an operational command, without a default password in source control. Admin UI manages CUSTOMER accounts. Further ADMIN grants require an audited operational command, not a registration or customer-edit form.

## 6. Products, variants, and media

Product fields include a unique slug, name, description, category, images, and DRAFT/PUBLISHED/ARCHIVED status. A Variant has a unique SKU, label, positive integer VND price, nonnegative integer stock, sale status, and data version. Customers buy a specific SKU, such as whole-bean or ground Robusta when those variants are configured.

An order snapshots the product name, SKU, variant label, and price. Editing a product does not rewrite an existing order. Products with order history are archived rather than deleted. List endpoints use bounded page sizes, allowlisted sort fields, and a stable tie-breaker.

Proposed tea/honey products, products without confirmed pricing or pack details, and out-of-stock SKUs cannot be checked out. Demo seeds run only with an explicit development/test flag, never automatically in production. Current photos remain labeled illustrative until replaced with real photos. Mulberry wine remains blocked for sale by default; the owner must confirm product and sales requirements before enabling it, with an 18+ confirmation in checkout.

Only ADMIN may upload. Limit images to 5 MB, validate actual JPEG/PNG/WebP content and pixel count, re-encode to remove metadata, and generate random object names. Do not fetch arbitrary client-supplied URLs. Publish an image only after processing succeeds.

## 7. Cart, quote, and COD checkout

Amounts use integer VND. The order total equals each server-side SKU price times its quantity, plus the configured delivery fee. Displayed prices are final product prices; no unannounced taxes or fees are added. Client-supplied prices and totals are never authoritative.

1. Quantities are integers from 1 to 99 per SKU, with at most 50 cart lines. Reject SKUs that do not exist or are not for sale.
2. Collect recipient name, phone, a province/city in a served zone, detailed address, and an optional note of at most 500 characters. Server validation must not rely on a hard-coded, outdated administrative-area list.
3. Store a quote in PostgreSQL for 15 minutes, tied to the user, lines, address, and delivery fee. An inactive or unconfigured ShippingZone cannot accept orders; admin configures delivery fees.
4. Submit quote ID and `Idempotency-Key`. If price, sale status, or fee changed, return HTTP 409 and require the customer to review a fresh quote.
5. Within one transaction, lock SKU rows in stable order, check and deduct available stock, create Order/OrderItem/OrderEvent, and mark the quote used. One quote creates at most one order even if a new idempotency key is submitted.
6. The key is unique per user. The same key and payload returns the existing order; the same key with a different payload returns 409. Retries and concurrent requests cannot deduct stock twice.
7. The cart has a version. Quote creation records the version and line quantities. After checkout, remove purchased lines only if the cart version remains unchanged; if the cart changed, preserve it and ask the customer to review. Do not erase an item added during checkout.
8. Create an email-outbox record in the order transaction and send the email afterward. An SMTP failure cannot erase a committed order. Roll back the whole transaction on failure. Retry deadlocks/serialization errors a bounded number of times, then return a retryable error.

Do not hold a database transaction open during an external call. API errors have stable codes, English messages, and field-level details, without stack traces. Snapshot recipient data on the order so editing an address book entry cannot change an old order.

## 8. Order states, stock, and COD collection

| From | To | Permission and condition |
| --- | --- | --- |
| PENDING | CONFIRMED | ADMIN accepts the order for processing |
| PENDING | CANCELLED | Order owner or ADMIN, with a reason |
| CONFIRMED | CANCELLED | ADMIN, before shipping, with a reason |
| CONFIRMED | SHIPPING | ADMIN records carrier/tracking or explicitly marks store delivery |
| SHIPPING | DELIVERED | ADMIN confirms delivery |
| SHIPPING | RETURNED | ADMIN confirms failed delivery and physical receipt of returned items |

Skipping or reversing a transition is rejected. Customers cannot change order totals, state, or recipient details after creation. To change an address before confirmation, cancel and place a new order. Mark PENDING orders older than 24 hours for attention; do not cancel them automatically.

CANCELLED restores stock exactly once in the same status-change transaction. RETURNED records restock quantity per SKU from zero to the delivered quantity; damaged goods do not increase available stock. Every stock movement includes actor, reason, and order reference. Admin stock adjustments also use locking/version checks to avoid overwriting checkout changes. Stock cannot become negative.

COD has separate DUE/COLLECTED states. Only ADMIN may mark it COLLECTED after the order is DELIVERED and collection is confirmed. A repeated action creates no second collection record. Reverting a mistaken collection to DUE needs a reason and audit history. V1 does not perform automatic refunds or a post-delivery customer-return workflow; exceptions are handled manually and noted without inventing a monetary transaction.

## 9. Administration and reporting

Use a separate React admin layout. All `/api/v1/admin` endpoints enforce ADMIN on the server. Admin capabilities: category/product/variant/image management, publish/archive, reasoned stock adjustments, customer search and purchase history, customer suspension/reactivation, order filtering and fulfillment, and delivery-fee/content editing.

Audit product, stock, customer, order, COD, delivery-fee, and content changes with actor, time, target, and the necessary change details. Minimize sensitive fields. The API cannot edit or delete audit entries.

Dashboard dates use Asia/Ho_Chi_Minh. A date range includes both end dates and is converted to UTC for queries. “Delivered order value” totals DELIVERED orders by delivery date. “COD collected” is money currently marked COLLECTED by collection time; correcting a mistaken collection removes it from this metric while preserving audit history. “COD due” includes DELIVERED/DUE orders. CANCELLED and RETURNED orders do not count toward delivered order value. Do not label these figures profit. Paginate lists and bound report ranges.

## 10. Content and production operations

- Admin edits about/contact/policy pages as sanitized text or Markdown. Draft status is explicit; unapproved content must not appear as a policy already in force.
- Docker/Compose supports local and staging use. Production serves a single HTTPS origin through a frontend/reverse proxy, API and worker, persistent PostgreSQL, and object storage. Do not use the Vite development server in production.
- `.env.example` contains names and non-sensitive examples only. Production fails fast without the required origin, DB, session secret, SMTP, or storage configuration, or when demo settings are enabled.
- Use versioned migrations before routing traffic. Never reset or push a destructive schema to production. Document application rollback and test data restoration.
- Liveness checks the process; readiness checks database/schema requirements. Public health responses reveal no credentials or infrastructure topology.
- Logs carry request IDs, latency, and error severity; redact cookies, tokens, passwords, email addresses, and postal addresses. UI error boundaries offer safe retry.
- Back up PostgreSQL daily and before migrations, store backups off the application host for at least 30 days, and version/back up images correspondingly. Test restoration in an isolated environment, checking orders, stock, images, and session invalidation after restoration.
- The email worker uses recoverable leases, bounded retries with backoff, and reports exhausted jobs. An SMTP timeout might duplicate an email, but must never duplicate an order.
- Accept live orders only after the owner confirms real prices/SKUs/stock, delivery zones/fees, business and support details, approved policies, domain/HTTPS, and working email. Development and tests may use clearly separated fixtures; missing inputs must not be replaced with invented live-looking data.

## 11. Required verification

Use TDD for authentication, authorization, pricing, checkout, inventory, and order states. Unit tests cover pure rules; integration tests use real PostgreSQL for constraints and transactions; browser E2E covers customer and admin journeys. SQLite cannot substitute for PostgreSQL in stock-concurrency tests.

1. Register, verify, log in, change/reset password, and log out. Expired/reused tokens fail; account suspension revokes sessions.
2. CUSTOMER cannot call admin endpoints or read/modify another person's order or address; a submitted role cannot grant privilege.
3. Draft, unpriced, and out-of-stock SKUs cannot check out. Validation and rate limits work. Special input is not executed as HTML or SQL.
4. Tampered client totals do not affect server totals; changes after a quote require customer confirmation.
5. Two customers race for the final unit: only one order succeeds. Repeated requests/used quotes create no duplicate; a failed transaction leaves neither a partial order nor partial inventory change.
6. Cancellation restores stock once; invalid status transitions fail; return restock cannot exceed shipped quantity; concurrent stock adjustment and purchase do not lose updates.
7. Mutations without valid session/CSRF fail; invalid or oversized images fail; SMTP failure does not lose the order.
8. Browser journey: customer buys COD, admin confirms/ships/records collection, customer sees the right state. Refresh/server restart preserves records; logout does not leak account cache.
9. Build, typecheck, tests, and CI pass. Check mobile layout, keyboard, reduced motion, metadata, and backup restoration before making a production-readiness claim.

Every verification report includes the command, environment, and actual result. A green frontend build does not prove that backend or deployment works.

## 12. Work groups for planning after approval

A. Foundation: Node/TypeScript, database/migrations, CI, auth/session/email, and permissions.
B. Catalog: public pages, SKUs/media, admin, and inventory.
C. Commerce: cart, quotes/COD/orders, admin fulfillment, reporting, and audit.
D. Completion: content, accessibility/responsiveness/SEO, deployment, backup/restore, and final review.

These are dependent groups within a release, not an implementation plan. After approval, the plan must specify file paths, API contracts, expected failing tests, implementation steps, and verification commands for each task. Agents read this specification with the plan and update the handoff. Do not fabricate approval, review, deployment, or test results.

## 13. Self-review

Checked: Node.js replaces Django; prototype and live business data are distinct; roles and ownership are explicit; VND amounts, stock locks, quotes, idempotency, cancellation/returns, email outside transactions, and separate COD collection metrics are defined. Operational inputs are separate from development fixtures. No unresolved technical placeholder is presented as a finished requirement. The subsequent continuation request was interpreted as permission to advance this presented specification into planning; no implementation approval is fabricated.
