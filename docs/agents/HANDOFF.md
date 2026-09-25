# AnhEmFarm handoff

Updated: 2026-09-25.

## Current objective

Build a complete production commerce website: customer registration/login, browsable products, purchase flow, seller product/user management, sales and order tracking. Apply original obra/superpowers and maintain instructions usable across agent tools.

## Verified starting point

- Baseline commit: `afa0b56`.
- React + TypeScript + Vite frontend; product data in `src/catalog.ts`.
- No backend, database, real accounts, checkout, order storage, admin authorization, or payment integration.
- Browser-local interest list only. Product images are generated illustrations; prices and real inventory have not been supplied.
- Tea and honey are provisional. Existing `available` means selectable in the interest list, not confirmed stock.
- No automated test script exists in package.json.
- Previous turn recorded a passing build and browser checks; these are historical evidence, not verification of future changes.

## Work in this stage

- Checked the requested upstream repository and recorded its commit in `SUPERPOWERS.md`.
- Added shared agent guidance, thin tool entry points, and discovery notes.
- No product behavior was changed in this documentation stage.
- Owner approved the commerce direction and COD, then explicitly chose Node.js as his professional stack and confirmed approval. React + Node.js/TypeScript + PostgreSQL is approved; Django is rejected.
- Owner later required English for every repository document and all text inside the app; Vietnamese localization is deferred.
- Spec written and self-reviewed at `docs/superpowers/specs/2026-09-25-commerce-design.md`; its concrete technical and business rules await written-spec approval.
- No implementation plan or execution method is approved. No backend code has been written. The existing storefront and written specification have been translated to English without changing the approved commerce direction.
- After the language change, `npm run build` passed. Browser checks showed the English catalog, Coffee filter returning two items, an item added to and removed from the interest list, and English search for Arabica returning one item. These checks cover the current visual storefront only.

## Next action

Ask the owner to review the written spec. After approval, invoke upstream writing-plans and create the implementation plan; obtain plan review and execution-method selection before coding. Earlier direction approval does not approve the document written afterward.

## External inputs for a real launch

Confirm product prices/SKUs/inventory, business and support details, shipping regions/fees, approved policy content, domain/hosting, email delivery and any chosen payment/shipping provider accounts. Missing production inputs must not be replaced by live-looking invented data. These inputs need not prevent isolated development and test fixtures after design approval.
