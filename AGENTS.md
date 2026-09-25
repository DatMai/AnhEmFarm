# AnhEmFarm — shared agent instructions

## Read before working

1. Read `docs/agents/HANDOFF.md` for the current stage and verified state.
2. Read `docs/agents/SUPERPOWERS.md` for the original upstream workflow and pinned reference.
3. Read the current discovery document, then the approved spec and plan when they exist.
4. Inspect `git status --short` and relevant code before editing. Preserve other contributors' changes.

These are project instructions. They do not install Superpowers or replace a harness's system instructions. Follow the user's explicit instructions and the actual tools exposed by the harness.

## Working with the owner

- Communicate in Vietnamese, briefly and concretely. Address the owner as “anh”, call him “Lisan al Gaib”, and refer to yourself as “em”.
- This project is both a personal business and a learning project; explain consequential programming decisions clearly.
- If the owner writes or speaks an English sentence that is unclear or incorrect, give a concise correction and ask him to repeat the corrected sentence before answering its content. Vietnamese sentences containing technical English terms do not require this interruption.

## Superpowers workflow

- Use the original `obra/superpowers` workflow, with its required design and plan approvals. Do not silently treat a general request to build as approval of a document that does not exist.
- For architecture changes, complete brainstorming, written-spec review, implementation-plan review, and execution-method selection before product implementation.
- Use isolated work for implementation according to the upstream worktree skill; do not move or overwrite the owner's active checkout without considering the preview and other agents.
- Use TDD for authentication, authorization, inventory, checkout, payments, and order transitions. Record the failing test, fix, and passing verification truthfully.
- Review implementation against the approved spec and plan. Fix important findings before completion.
- Only mark work complete with fresh verification evidence. A successful frontend build does not prove production readiness.

## Product constraints

- Approved direction: Node.js + TypeScript backend, React frontend, PostgreSQL, COD first. Do not implement Django; the owner explicitly rejected it. The written spec proposes NestJS/Prisma and awaits document review.
- Brand: AnhEmFarm; Vietnamese customer interface; red identity; responsive and keyboard-accessible UI.
- Product families: mulberry, Robusta/Arabica coffee, provisional tea and honey.
- Never invent confirmed prices, stock, sourcing, certifications, contact information, legal policies, or successful payments. Separate test fixtures from live data.
- Server-side authorization is required for every admin operation and customer-owned resource.
- Server-side prices and inventory are authoritative; client totals are untrusted.
- Persistent customer accounts and orders require a database; browser storage is not the business record.
- Keep credentials, tokens, customer data, and private order exports out of Git, logs, screenshots, and agent handoffs.
- Credentials for production integrations are configured outside source control. Document missing external prerequisites instead of claiming an integration is live.

## Multi-agent collaboration

- Follow the execution method approved for the current plan. Dispatch bounded tasks with spec/plan paths, file ownership, interfaces, and acceptance checks.
- Avoid concurrent edits to the same files. Use separate branches/worktrees where appropriate and have one integration owner.
- Agents must report files changed, tests actually run and results, remaining limitations, and review findings. Do not manufacture reviews by other models.
- Before handing off, update `docs/agents/HANDOFF.md` and the plan progress record. Record approval evidence and unresolved questions accurately.

## Current commands

The project is currently a React/TypeScript/Vite storefront only.

```sh
npm ci
npm run dev
npm run build
```

There is currently no automated test command or backend. Update this section when those are implemented and verified.
