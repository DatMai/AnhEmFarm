# AnhEmFarm

The current site is a visual storefront and interest list for mulberries, coffee, and proposed tea and honey ranges. English is the language of the app and all project documentation. Vietnamese localization is planned for a later phase.

Read [AGENTS.md](AGENTS.md), the [handoff](docs/agents/HANDOFF.md), and the [original Superpowers reference](docs/agents/SUPERPOWERS.md) before continuing work. The React + Node.js/TypeScript + PostgreSQL direction and cash on delivery were approved. The [commerce design specification](docs/superpowers/specs/2026-09-25-commerce-design.md) has been advanced into the [implementation plan](docs/superpowers/plans/2026-09-25-commerce.md). The plan awaits review and execution-method selection. The backend has not been built.

## Run locally

Use Node.js 20.19+ or 22.12+ for the current Vite frontend.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To check the static build:

```bash
npm run build
npm run preview
```

The static output is in `dist/`.

## Current content and limitations

- Edit product names, descriptions, images, and statuses in `src/catalog.ts`.
- Illustrative images created for this project are in `public/images/`.
- Prices, pack sizes, inventory, and official contact details have not been provided. The site does not invent them.
- Tea and honey are proposed ranges. They cannot be added to the interest list.
- The interest list uses browser `localStorage` and can be copied. The current site does not accept orders or online payments.

Before live sales, confirm prices, SKUs, inventory, real product photos, business and support information, shipping rates, and approved policies. Mulberry wine requires confirmed product details and an appropriate age-control flow before online sales are enabled.

## Technology

The existing frontend uses React, TypeScript, Vite, and plain CSS. Product data is separate from the interface so it can later be served by the planned API.
