# Local PR readiness verification

Date: 2026-09-26. Scope: the local `main` history through `32bc5c9`, the current documentation sync, and a browser-test synchronization fix. This is a code-review handoff, not a production release approval.

## Checks run on this checkout

| Check | Result |
| --- | --- |
| `npm run verify` | Passed: client, SSR and API builds; 17 frontend tests; 153 PostgreSQL backend tests. |
| `npm run test:e2e` | Final full rerun passed 23/23 Chromium cases. |
| `npm run test:e2e -- e2e/customer-order.spec.ts` | Focused rerun passed 5/5 cases after the test correction. |
| Root and server `npm audit --audit-level=high` | Both reported zero vulnerabilities at every severity level. Root and server audits with `--omit=dev --omit=optional` also reported zero. |
| `git diff --check` | Passed before commit. |

The first full browser run had 22/23 cases: the registration case still expected the old “check your email” text after the development UI began pointing to Mailpit. The next full run again had 22/23 cases: the address-edit test clicked Save before the delivery-zone options finished loading. The test now expects the development Mailpit message and waits for the saved zone selection before Save. The focused and final full reruns above are the passing evidence. Vite logged proxy connection refusals for background auth requests in public/mock browser cases that did not start the API; these cases passed.

## Review and limits

The original commerce implementation had a separate whole-branch review, and the demo catalog follow-up had its own review; see the earlier dated records. This PR preparation was self-reviewed against the approved spec and plan. The changes in this pass synchronize historical status and dependency documentation and stabilize the existing browser test; no product behavior or production data was changed. The dependency audit is a lockfile check. Production image, Compose, offsite backup, external SMTP, object storage, TLS and live business inputs were not reverified in this pass. The release checklist remains the launch gate.

At the time of this record, this Git checkout has no configured remote and the `gh` CLI is unavailable. Pushing a branch and creating a PR require the owner's repository URL and authenticated GitHub access. No PR or CI result is claimed here.

Subsequent handoff: the owner supplied `https://github.com/DatMai/AnhEmFarm.git`. After checking the public repository was empty and screening the local history for high-confidence credentials, the initial prototype commit `afa0b56` was pushed as remote `main`. The full commerce history was pushed to `codex/commerce-pr`, and [PR #1](https://github.com/DatMai/AnhEmFarm/pull/1) was opened. GitHub CI was still running at this update; no remote pass is claimed.

## CI origin correction

The first push and pull-request CI runs for `3f842ff` failed in `npm run verify`: three media integration cases received HTTP 403 instead of their expected auth or upload response. CI sets `APP_ORIGIN=http://127.0.0.1:4278`, while `server/test/media.integration.test.ts` sent the unrelated local Vite origin `http://127.0.0.1:5173`. The security middleware correctly rejected those requests before authentication.

RED: `APP_ORIGIN=http://127.0.0.1:4278 npm --prefix server run test:integration -- test/media.integration.test.ts` failed 3/9 cases with the same 403 mismatch. The test harness now exposes its configured origin, and media requests use it. GREEN: the same focused command passed 9/9; `APP_MODE=test APP_ORIGIN=http://127.0.0.1:4278 npm run verify` passed the client/SSR/API builds, 17 frontend tests and 153 backend tests; and `APP_MODE=test APP_ORIGIN=http://127.0.0.1:4278 npm run test:e2e` passed 23/23 browser cases. The browser run still logged proxy refusals for background auth requests in public/mock cases without an API process. Both GitHub `verify` checks for fix commit `5438612` completed with success: [push run](https://github.com/DatMai/AnhEmFarm/actions/runs/36255508826) and [pull-request run](https://github.com/DatMai/AnhEmFarm/actions/runs/36255511739).
