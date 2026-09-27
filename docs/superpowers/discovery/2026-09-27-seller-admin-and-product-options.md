# Seller administration and product choices — discovery — 2026-09-27

## Owner intent and approval

The owner explicitly approved the seller action queue, then authorized all implementation decisions and asked not to be asked for further approval. He also reported that admin should open in a new tab as a backend-owned non-SPA, requested a coherent seller sidebar and appropriate data views, reported a completed checkout missing from admin Orders, and asked for product detail quantity and simple per-product choices that sellers can manage.

That blanket authorization is the approval evidence for the design and implementation plan in this change. The implementation stays within the requested first simple version of product choices; advanced option matrices and per-choice pricing are excluded.

## Existing state

- React Router currently renders all `/admin/*` pages inside the customer storefront SPA. `AdminLayout` uses a horizontal navigation row.
- NestJS serves the same SPA shell for `/admin/*`; the JSON admin APIs already enforce server-side admin access.
- Orders have a server-derived `attention` boolean for PENDING orders older than 24 hours, but the dashboard has no queue and Orders has no attention filter.
- The real-browser seller journey creates a customer COD order and opens its admin detail, but does not assert the order is visible in the seller list. This leaves the reported list failure untested.
- Products, cart lines, quotes and order items are variant-only. Product pages add one unit at a time and there is no customization snapshot in checkout.
- The admin product list, customer history, settings, content, audit and email screens are currently rendered in the storefront SPA.

## Approaches considered

1. **Recommended: backend-owned server-rendered admin MPA.** NestJS returns complete HTML for admin GET routes; standard forms POST to backend handlers and redirect. Reuse domain services and server-side authorization, add a grouped sidebar, tables/forms and an SVG dashboard chart. The storefront link opens `/admin` in a new tab. This satisfies the explicit non-SPA/backend requirement and keeps the API authoritative.
2. Separate React admin SPA. It could provide a separate tab and sidebar quickly, but still leaves admin as an SPA and does not meet the requested backend-owned multi-page behavior.
3. Keep the existing SPA and only restyle the sidebar. This leaves the reported architecture concern unresolved.

## Product choice boundary

V1 supports one optional single-select choice group per product, such as Sweetness with Original, Less sweet and Unsweetened. Sellers set the group label and add, rename or remove choices in the product editor. Choices add no surcharge in v1. The selected choice and displayed label are validated server-side, carried through customer and guest carts and quotes, and snapshotted onto order items. Quantity is selectable from 1 to 99 per selected variant. Existing orders remain unchanged when a seller later edits product choices.

## Reported order visibility issue

Do not assume the cause. Add a browser assertion that places a customer order and verifies its short reference, status and customer are visible through the admin list's unfiltered and filtered views. Inspect and fix the real cause if this assertion fails. Keep pagination and server-side admin authorization in force.

## Acceptance outcomes

- `/admin` and every admin link resolve to full backend-rendered HTML, open in a new tab from the storefront, and do not load the customer SPA bundle or run client-side route navigation.
- All admin routes revalidate the active ADMIN session and every changing form has same-origin and CSRF protection. Responses are private/no-store and noindex.
- Admin has a fixed left sidebar grouped as Overview, Orders, Catalog, Customers, Store content, and Operations. Use tables for record-heavy screens, forms for edits, cards and a labelled server-rendered SVG chart for dashboard summaries.
- Dashboard and Orders provide an overdue PENDING queue based on the exact 24-hour threshold; resolving the order removes it from the queue without auto-cancelling it.
- A customer COD order appears in admin Orders after checkout and remains available by search/pagination.
- Product choice and quantity are visible, validated, reviewable in cart and quote, immutable as a snapshot in order history, and editable by admin at product level.

## Approval basis

User message on 2026-09-27: “ANH DUYỆT NGAY TẤT CẢ CÁC QUYẾT ĐỊNH CỦA EM ... EM KHÔNG ĐƯỢC HỎI LẠI ANH”. Record this as blanket approval; do not invent a separate review response.
