# Guest checkout discovery

The current `/checkout` route is inside `CustomerBoundary`; anonymous carts can only lead to sign-in. Quotes and COD orders require a user ID and read the persistent account cart. Seller search joins `users`, so it would hide orders without a user.

The owner approved immediate implementation and autonomous decisions on 2026-09-27, explicitly without further questions. The architecture affects ownership, inventory, email and account verification, so the design and plan below record the decision before product code.

Options considered:

1. Attach orders to an account by entered email at placement: rejected because an email typed into a checkout form does not prove mailbox control.
2. Separate guest-order tables: rejected because stock, status, seller views, notifications and reports would diverge.
3. Keep one order model, with a separate opaque guest session and nullable account ownership: chosen. Only verified account email can claim unowned orders.

Existing COD, sales gates, choice snapshots, stock locks, CSRF, origin checks and idempotency must remain authoritative. The guest cookie grants temporary order access, not account identity. Email matching uses the application's canonical trim-and-lowercase rule. Names and phone numbers never grant access. Research: OWASP Email Validation and Verification Cheat Sheet and Business Logic Security Cheat Sheet; Shopify's customer object documents orders placed without an account.
