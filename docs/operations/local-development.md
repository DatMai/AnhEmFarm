# Local development

1. Install Node.js 24, Docker, and npm. Copy `.env.example` to `.env.dev`; set a unique PostgreSQL password, the matching URLs, development session and email payload secrets, and a test SMTP sender. The test database URL must end in `_test`. Never commit `.env.dev`.
2. Start `docker compose -f deploy/compose.dev.yml --env-file .env.dev up -d`.
3. Run `npm ci`, `npm --prefix server ci`, and `npm --prefix server run db:migrate`. Apply migrations to the test database as well by setting `DATABASE_URL` to `TEST_DATABASE_URL` for that command.
4. In separate terminals run `npm --prefix server run dev` and `npm run dev`. The compiled API watcher is used because direct `tsx` execution does not emit the decorator metadata required by Nest dependency injection.
5. Open Vite's URL. Mailpit is at `http://127.0.0.1:8025` and receives local verification/reset messages.

To run all tests after migrations: `npm run verify` then `npm run test:e2e`. `npm --prefix server run db:seed:demo` is for an isolated development database only; its content is illustrative, not live catalog data. Bootstrap the first seller with `npm --prefix server run admin -- create --email <real-address> --name <real-name> --password-file <protected-file>`. The CLI never accepts a password on the command line.
