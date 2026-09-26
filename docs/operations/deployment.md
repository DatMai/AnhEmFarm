# Deployment

## Prerequisites

Use a domain pointing at a host with ports 80/443 open, Node 24 container support, PostgreSQL 17, external SMTP, S3-compatible versioned object storage, encrypted offsite backups, and approved product/policy/business/delivery data. Copy `.env.production.example` to `.env.production` outside Git. Replace every placeholder. `APP_ORIGIN` must be the exact HTTPS site origin; `SITE_DOMAIN` must match it. Use a 32-character-or-longer random session secret and email payload key. Set `DATABASE_URL` to the internal `db` hostname and a unique database password. Keep `SALES_ENABLED=false` during setup. When every prerequisite is ready, set it to `true`, redeploy, then use the seller settings page to confirm live sales. Either switch can stop new quotes and orders.

## Sequence

1. Run `scripts/backup.sh` with production backup credentials and verify the encrypted object and checksum exist offsite.
2. Build with `docker compose --env-file .env.production -f deploy/compose.production.yml build`.
3. Run migrations explicitly: `docker compose --env-file .env.production -f deploy/compose.production.yml --profile migration run --rm migrate`.
4. Start API, worker and proxy: `docker compose --env-file .env.production -f deploy/compose.production.yml up -d db api worker proxy`.
5. Check `https://<domain>/health/live`, `/health/ready`, a published product HTML page and an authenticated test account. Verify SMTP and media retrieval. Only then route public traffic and consider the guarded sales switch.

The proxy is the only public service; database and worker expose no host ports. The API and worker run as the unprivileged `node` user. The worker shares PostgreSQL and SMTP configuration but has no HTTP listener. Caddy manages HTTPS certificates and HTTP redirect. Configure host firewall, monitoring, log retention and bucket lifecycle policies separately.

If migration fails, stop before serving the new version. Roll back application code only when the old version supports the migrated schema. Otherwise restore the pre-migration encrypted backup into a new database, perform integrity and session checks, then switch traffic. Never use `prisma db push`, `migrate reset`, or an automatic down migration in production.
