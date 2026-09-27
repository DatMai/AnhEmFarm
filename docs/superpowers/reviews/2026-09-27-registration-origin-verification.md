# Registration origin verification — 2026-09-27

## Finding

Registration from `http://localhost:5173` was rejected while the local API used `APP_ORIGIN=http://127.0.0.1:5173`. The browser sent the former as its `Origin`; strict origin validation correctly blocked the request, but the UI showed a generic error. Registration through the configured `127.0.0.1` origin succeeded.

## Change

In development and test only, `localhost`, `127.0.0.1`, and `[::1]` are equivalent when scheme and port match. Production still accepts only its configured origin. The client now explains how to recover from an origin rejection, and the local development guide documents the host behavior.

## Verification

- Regression coverage initially failed because the localhost alias received 403; after the middleware change it reaches authentication validation (401 for intentionally invalid credentials).
- A foreign scheme remains rejected in development, and a loopback alias remains rejected in production.
- Frontend error mapping has a focused regression test.
- Browser registration, Mailpit verification, and sign-in succeeded for a synthetic local QA account.
- Full `npm run verify` result: see final handoff entry.

The QA account and all email data are local synthetic data; no credentials are stored in this repository.
