# Release checklist

## Technical gates

- [ ] `npm run verify` passes against a migrated PostgreSQL 17 test database.
- [ ] `npm run test:e2e` passes with Mailpit and Chromium.
- [ ] Production image builds and Compose smoke reaches `/health/ready`.
- [ ] Encrypted offsite backup and isolated restore drill pass with matching counts and media verification.
- [ ] Dependency audit has no unresolved high or critical findings.
- [ ] Reviewer findings are resolved and affected tests rerun.

## Business launch gates

- [ ] Real SKUs, pack sizes, prices, stock, images and sourcing have been confirmed.
- [ ] Business/support details, delivery zones and fees, and approved shipping/returns/privacy/terms copy have been entered and published.
- [ ] Domain, HTTPS, external SMTP, object storage, backup bucket and monitoring credentials are configured outside Git.
- [ ] A real registration, verification, COD order, fulfillment and support lookup are tested on the deployment.
- [ ] Wine is enabled only after a separate owner confirmation and applicable age/legal review.

Leave live sales disabled until every applicable gate is complete. Passing code tests alone is not a live launch.
