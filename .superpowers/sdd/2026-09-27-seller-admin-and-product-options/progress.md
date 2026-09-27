# SDD ledger — plan: docs/superpowers/plans/2026-09-27-seller-admin-and-product-options.md

## Setup

- Approval: owner explicitly authorized all decisions in his 2026-09-27 request; use that as design, plan and execution-method approval. Inline execution selected.
- Isolation: managed worktree `/Users/daemonthetarnished/.codex/worktrees/commerce-pr-rename/AnhEmFarm`, branch `feat/seller-admin-product-options`, base `6fa3faf`.
- Baseline: `npm run verify` passed (builds, 17 frontend tests, 160 server tests).
- Artifact commits: `2f5f73c` spec/discovery; `e781d57` plan/process; later plan corrections `d363c4a`, `8010433`.
- Skills: brainstorming, writing-plans, using-git-worktrees, executing-plans, TDD, verification-before-completion.
- Tool adaptation: installed SDD package has `sdd-workspace`, `task-brief`, and `review-package`, but no `task-start` or `task-done`; use fresh per-task briefs plus this ledger, and run the listed commands directly.

## Pre-flight interface scan

- Task 1 produces the public/admin product choice-group shape and product version bump consumed by Task 2. Contract: public active choices, admin includes inactive; `CatalogService.updateChoiceGroup` and `PUT /api/v1/admin/products/:id/choice-group`. Consistent with Task 2's active choice validation and Task 3's version check.
- Task 2 produces validated quote lines `{ optionId, optionGroupLabel, optionLabel }` consumed by Task 3 checkout snapshot. Consistent with nullable no-choice selection and server-sourced labels.
- Task 5 produces a protected MPA shell and dashboard/order links consumed by Task 6 page handlers. Task 6 uses the same authentication, CSRF, escaping and layout helpers.
- Ruling: product-choice migration split into separate catalog, cart, and order snapshot migrations so no committed migration is edited later; matches forward-only schema evolution and reduces review/rollback ambiguity.

## Progress

- Task 1: complete. PostgreSQL catalog integration: 13/13 pass; server typecheck passes. Focused new test: 1 pass. The first focused rerun exposed stale `_test` login buckets (429); catalog suite now clears only its fixture IP and pair buckets before/after, matching existing identity/security test isolation. Production rate limits were not changed. Two independent commands initially raced while regenerating Prisma Client; rerunning generate/typecheck sequentially passed.
- Task 1 commit: pending until final rerun after admin-detail response assertion.
