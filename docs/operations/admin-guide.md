# Seller guide

Use an account provisioned by the admin CLI. Sign in and open `/admin`. Every seller action is authorized again on the server; a hidden button is not an access control.

- **Products:** create a draft, set category, description and variants, upload images, confirm the real SKU/pack size/price, receive stock, then publish. Draft and archived products are absent from the public catalog. Tea and honey stay provisional until their details are confirmed.
- **Inventory:** record each adjustment with a reason. A failed or ambiguous response should be resolved by reloading the stock and checking the audit trail before another adjustment.
- **Orders:** confirm, start shipping, mark delivered or cancel according to the available transition buttons. Record tracking and delivery details. A returned order requires physical receipt and a restock quantity for every line, including zero for damaged goods. COD collection is separate from delivery; corrections require a reason.
- **Customers:** view a customer's bounded order history; suspend/reactivate with a reason. Suspension invalidates existing sessions.
- **Store settings and pages:** enter real business/support contacts, delivery zones/fees, and reviewed About/Contact/Shipping/Returns/Privacy/Terms pages. Publishing a page is an explicit action. Live sales require both the production `SALES_ENABLED` environment switch and the seller confirmation with all launch prerequisites. Wine needs a separate confirmation and must comply with applicable requirements.
- **Audit and email jobs:** inspect activity and failed messages. Diagnose SMTP failures, then use a controlled retry; do not copy private order/email payloads into tickets or logs.

Never use demo fixtures as production product data. The dashboard labels delivered order value, COD collected and COD due; they are not profit figures.
