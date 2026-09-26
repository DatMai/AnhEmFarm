#!/usr/bin/env bash
set -euo pipefail
umask 077

backup="${1:?Usage: restore-test.sh BACKUP.dump.age TARGET_DATABASE_URL}"
target_url="${2:?Usage: restore-test.sh BACKUP.dump.age TARGET_DATABASE_URL}"
for tool in pg_restore psql openssl node; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
target_db="$(TARGET_URL="$target_url" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.TARGET_URL).pathname.slice(1)))')"
[[ "$target_db" == *_restore_test ]] || { echo 'Target database must end with _restore_test' >&2; exit 1; }
[[ -f "$backup" && -f "$backup.source" && -f "$backup.counts" ]] || { echo 'Backup or metadata missing' >&2; exit 1; }
source_db="$(cat "$backup.source")"
[[ "$source_db" != "$target_db" ]] || { echo 'Source and target databases match' >&2; exit 1; }
for file in "$backup" "$backup.source" "$backup.counts"; do
  [[ -f "$file.sha256" ]] || { echo "Checksum missing for $file" >&2; exit 1; }
  expected="$(cat "$file.sha256")"
  actual="$(openssl dgst -sha256 "$file" | awk '{print $NF}')"
  [[ "$expected" == "$actual" ]] || { echo "Checksum failed for $file" >&2; exit 1; }
done
existing="$(psql "$target_url" -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
[[ "$existing" == 0 ]] || { echo 'Target database is not empty' >&2; exit 1; }
if [[ "$backup" == *.age ]]; then
  : "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required for encrypted backup}"
  command -v age >/dev/null || { echo 'Missing age' >&2; exit 1; }
  age -d -i "$AGE_IDENTITY_FILE" "$backup" | pg_restore --dbname="$target_url" --no-owner --no-acl --exit-on-error
elif [[ "$backup" == *.dump && "${RESTORE_ALLOW_PLAINTEXT_TEST:-}" == 1 ]]; then
  pg_restore --dbname="$target_url" --no-owner --no-acl --exit-on-error "$backup"
else
  echo 'Only encrypted backups are accepted outside an explicit local test drill' >&2; exit 1
fi
psql "$target_url" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE users SET "authVersion" = "authVersion" + 1;
DELETE FROM sessions;
DELETE FROM account_tokens;
UPDATE email_outbox SET "sentAt" = now(), "leaseId" = NULL, "leaseUntil" = NULL WHERE "sentAt" IS NULL;
COMMIT;
SQL
actual_counts="$(psql "$target_url" -At -F, -c 'SELECT (SELECT count(*) FROM orders),(SELECT count(*) FROM order_items),(SELECT count(*) FROM variants),(SELECT count(*) FROM media)')"
expected_counts="$(cat "$backup.counts")"
[[ "$actual_counts" == "$expected_counts" ]] || { echo 'Restored record counts differ' >&2; exit 1; }
echo "Isolated restore passed: $actual_counts. Rotate SESSION_SECRET before any exposure and verify media objects separately."
