# Commerce implementation verification

Date: 2026-09-26. Scope: isolated commerce worktree, Tasks 1–17 of `docs/superpowers/plans/2026-09-25-commerce.md`. Execution method changed after Task 14 at the owner's request: Tasks 15–17 inline, one final whole-branch reviewer using GPT-6-sol or below. This record distinguishes local technical evidence from a live launch.

## Fresh technical evidence

| Check | Result |
| --- | --- |
| `npm run verify` | Passed after final review fixes: client/SSR/API builds, 15/15 frontend tests, 149/149 PostgreSQL backend tests. |
| `npm run test:e2e` | First full rerun had 13/16 due a local test backend startup conflict after a two-minute first-case timeout. The isolated first case then passed, followed by a fresh full run with 16/16 Chromium tests. Includes real registration/SMTP, cart/COD/order persistence, seller fulfillment, no-JavaScript product HTML, responsive widths and serious/critical axe checks. |
| `npm audit --audit-level=high` and `npm --prefix server audit --audit-level=high` | Both reported 0 vulnerabilities after compatible transitive overrides. |
| `docker build -f deploy/Dockerfile -t anhemfarm:local-check .` | Passed with Node 24 runtime image. |
| Production-image smoke against migrated PostgreSQL 17 development database | `/health/ready` 200; `/products` HTML 200 with canonical metadata. |
| Isolated production Compose smoke | PostgreSQL started, explicit migration job passed, API readiness 200, worker running. Temporary project and database volume removed after the check. |
| Isolated restore drill | Synthetic test database dump restored into fresh `_restore_test` database. Order/item/variant/media counts matched in the earlier drill; 685 session rows and 586 account tokens were cleared. This drill used a plaintext local dump because age/offsite credentials are unavailable. The final script derives its reported counts from the restored snapshot, avoiding false comparisons to live-source counts. |
| Backup and media restore scripts | `bash -n` passed. A local mock of PostgreSQL dump, age, AWS CLI and one media object uploaded an independent encrypted-copy set and verified retrieval, checksum and decryption of the restored media row. This does not prove real age encryption or remote S3 permissions/retention. |
| `npm --prefix server run dev` | Compiled watcher started with 0 TypeScript errors; `/health/ready` returned 200. |
| Compose syntax, shell syntax and diff whitespace | Passed. |

Local terminal verification used host Node 26.0.0; the built image and CI configuration use Node 24. PostgreSQL server is version 17. GitHub Actions has not been executed remotely in this local session. The real domain/TLS certificate, offsite encrypted backup, external SMTP and object-storage credentials, confirmed products, business contact details, delivery rules and legal pages remain external launch inputs. The seller sales switch stays off until its server-side prerequisites and owner confirmation are satisfied.

## Review

One read-only GPT-6-sol reviewer examined the whole branch at `6c34853` against the approved design and plan. It found no Critical issue and six Important issues: missing independent media bytes in offsite backups; live counts sampled outside the dump snapshot; missing stable production trusted proxy address; required policies could become drafts while sales stayed enabled; failed logout retained private UI; and unbounded rate buckets from per-email checks before IP limits. It also found a Minor confirmation checkbox needed on every enabled-settings edit.

The inline fix pass copies current product image bytes, encrypted and checksummed, to a separate backup bucket and adds an isolated media retrieval drill; derives record counts after restoring the dump; pins Caddy to a documented trusted proxy address in Compose and requires a valid production IP; locks the settings row before required policy edits and rejects draft transitions during sales; clears private UI state even if logout fails; checks IP quotas first and prunes expired buckets hourly. The settings confirmation check now applies only when enabling sales. RED evidence was observed for the policy draft, failed logout, IP bucket ordering, missing prune method and missing trusted proxy configuration; focused GREEN tests passed. Fresh whole-suite results are above. No second reviewer or real external integration is claimed.
