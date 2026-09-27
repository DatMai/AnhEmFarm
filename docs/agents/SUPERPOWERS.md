# Superpowers provenance and workflow

Source: https://github.com/obra/superpowers

Reference commit observed on 2026-09-25: `5bf4e78011075bcfc0dc295f0724994cd123ee71`.
This pins the workflow used for discovery. It is not a claim that every harness has this version installed. The current Codex skill catalog exposes plugin version 6.4.2; compare relevant installed instructions with the pinned upstream source instead of assuming equivalence.

## Original sources

- [Repository and installation guide](https://github.com/obra/superpowers/tree/5bf4e78011075bcfc0dc295f0724994cd123ee71)
- [Using Superpowers](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/using-superpowers/SKILL.md)
- [Brainstorming](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/brainstorming/SKILL.md)
- [Writing plans](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/writing-plans/SKILL.md)
- [Git worktrees](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/using-git-worktrees/SKILL.md)
- [Subagent execution](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/subagent-driven-development/SKILL.md)
- [Inline execution](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/executing-plans/SKILL.md)
- [TDD](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/test-driven-development/SKILL.md)
- [Code review](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/requesting-code-review/SKILL.md)
- [Verification](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/verification-before-completion/SKILL.md)
- [Finishing a branch](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/finishing-a-development-branch/SKILL.md)

Read the actual skill and its referenced files before applying that stage; this index is not a replacement. If unavailable, report the missing source and do not silently substitute an invented workflow. Use the real harness tool capabilities when an upstream tool example is incompatible.

## Artifact lifecycle

1. Record findings and undecided options in `docs/superpowers/discovery/` (project convention).
2. Discuss and approve the design, then write `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit it, as upstream requires.
3. Request the owner's review of that written spec. Record the actual response; do not prefill approval.
4. After spec approval, use writing-plans to create `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`.
5. Obtain plan review and execution-method selection before implementation. Use the applicable upstream workspace/progress mechanism and preserve useful handoff information in tracked documentation without secrets.
6. Execute TDD, review, verification, and branch-finishing stages. Store factual review/verification evidence with the plan or handoff.

Current stage: [PR #10](https://github.com/DatMai/AnhEmFarm/pull/10) merged into `main` at `6a80875`, removing a stale SDD execution ledger from Git and ignoring `.superpowers/sdd/`. The owner requested a post-merge code, browser, E2E, spec/process, and private UI-map audit, isolated on `feat/post-merge-quality-sync`. The approved feature specs remain the source of product requirements; this audit records implementation evidence in `docs/superpowers/reviews/2026-09-27-post-merge-quality-verification.md`. The next feature is unspecified until the owner requests it after merge. Earlier stage statements below are historical.

Guest checkout stage approvals and artifacts: the owner approved immediate guest COD checkout with later verified-email account linking and explicitly directed no further approval questions. The design, plan and discovery are `docs/superpowers/specs/2026-09-27-guest-checkout-account-linking-design.md`, `docs/superpowers/plans/2026-09-27-guest-checkout-account-linking.md`, and `docs/superpowers/discovery/2026-09-27-guest-checkout-account-linking.md`. Implementation was inline on managed worktree branch `feat/guest-checkout-account-linking`, based on `3e6fbcf`. The owner did not separately review the written documents, so do not claim that stage-specific approval; this is a recorded ruling under the owner's direct no-questions instruction. TDD evidence and final local verification are in `.superpowers/sdd/2026-09-27-guest-checkout-account-linking/progress.md` (ignored local) and the tracked review record. The merged change was PR #7. Earlier stage statements below are historical.

## Prior baseline

Baseline commit `afa0b56` contains a working visual storefront but has no original design approval, implementation plan, automated test suite, or independent review record. Treat it as an existing prototype. Do not fabricate retroactive compliance.
