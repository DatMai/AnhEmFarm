# Development dependencies

Task 1 was verified with Node.js 24.21.0 and npm 11.12.1. The host default is Node.js 26.0.0, so select the version in `.nvmrc` before installing or testing. Run `npm ci` in the repository root and `npm ci --prefix server` for the API. Server installation generates the Prisma client; `npm --prefix server run db:generate` can regenerate it after schema changes.

## Local services

Copy `.env.example` to `.env.dev`, replace the password placeholders with one unique local password in `POSTGRES_PASSWORD`, `DATABASE_URL`, and `TEST_DATABASE_URL`, and supply unique local secret values. `.env.dev` is ignored by Git. Start services with:

```sh
docker compose --env-file .env.dev -f deploy/compose.dev.yml up -d
```

The Compose volume persists PostgreSQL data. PostgreSQL listens on `127.0.0.1:5433` with `anhemfarm_dev` and `anhemfarm_test`; Mailpit listens on `127.0.0.1:1025` for SMTP and `127.0.0.1:8025` for its UI. The test harness refuses a database name without the `_test` suffix. The test database is created only when the Compose volume is first initialized. A prior volume created before this setup needs a separately provisioned test database; do not wipe a data volume as a routine setup step.

Pulled on 2026-09-25:

| Service | Resolved version | Pinned image |
| --- | --- | --- |
| PostgreSQL | 17.11 | `postgres:17@sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f` |
| Mailpit | `latest` digest at pull time | `axllent/mailpit@sha256:74d609a42ec279aa63c6b4622a6fa9b5408d1ad5b1d76a1c4be40a265ce0863d` |

## Locked server packages

Versions below are exact in `server/package.json` and `server/package-lock.json`.

| Package | Version |
| --- | --- |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing` | 11.2.6 |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg` | 7.10.0 |
| `pg` | 8.23.0 |
| `zod` | 4.6.5 |
| `vitest` | 5.0.2 |
| `typescript` | 5.9.3 |
| `rxjs` | 7.8.2 |
| `reflect-metadata` | 0.2.2 |
| `tsx` | 4.23.15 |
| `@types/node` | 24.13.6 |
| `@types/pg` | 8.23.1 |
| `@types/express` | 5.0.6 |
| `cookie` | 2.0.1 |
| `helmet` | 8.3.0 |
| `@aws-sdk/client-s3` | 3.1140.0 |
| `nodemailer` | 10.0.10 |
| `@types/nodemailer` | 8.0.2 |
| `dotenv` | 17.3.1 |

The Prisma schema is a client-generation scaffold without commerce models or migrations. Task 2 owns the full schema, migrations, database scripts, and readiness requirements. The `worker`, `db:seed:test`, and `admin` script targets are reserved for later tasks.

`npm audit` reports four high-severity advisories in dependencies of the pinned Prisma CLI. Reassess these advisories when updating the approved version pin; do not automatically downgrade or cross the planned major version boundary.
