# Guest checkout and verified account linking

Status: owner-authorized design decision, 2026-09-27. The owner explicitly approved implementation without further questions; no separate document-review response is claimed.

## Experience

An anonymous shopper can keep items in the local cart, proceed to checkout, enter an email and delivery address, review a short-lived server quote, and place a COD order. The page explains that no online payment is collected and that registering and verifying the same email later places earlier guest orders in the account order list. The receipt and order status remain accessible in the current browser through an opaque guest cookie. A signed-in checkout keeps its present flow.

## Data and trust

Quotes and orders share the existing commerce tables. A quote belongs to exactly one account or one guest session. An unclaimed guest order has a normalized `guestEmail` and guest session; after verified account linking it retains those audit fields and gains `userId`. A random 256-bit cookie secret is stored only as a digest, uses HttpOnly, SameSite=Lax and Secure in production, and expires after 30 days. The cookie only grants access to guest orders from that session. It is not used to infer account ownership.

The server validates a bounded cart, active product choices, age confirmation, shipping, prices and stock. Quote creation uses current authoritative data; placement rechecks all commercial versions, stock and sales settings in one transaction, with the same idempotency and inventory guarantees as account orders. CSRF, same-origin checks and rate limits apply to guest mutations. Duplicate line selections are rejected. No payment is taken online.

The verification transaction claims only unclaimed guest orders whose canonical email equals the verified user's canonical email. Existing verified accounts can claim later guest orders after successful login. A typed name or phone number never grants ownership. Guest access is independent of email and guest order IDs alone reveal nothing. Seller lists, search, detail and status email must include unclaimed guest orders. The order receipt goes to the checkout email.

## Boundaries

Expired guest sessions lose browser receipt access; the email receipt still records the reference. Existing live data must remain valid through the migration. The release sales gate still prevents unconfigured live sales. No confirmed prices, stock or external SMTP are introduced.

## Acceptance

Automated and browser tests cover anonymous quote and placement, replay, ownership isolation, stale price and stock, seller visibility, status email, receipt and account linking only after verification. The main preview checkout stays untouched until the owner merges the PR.
