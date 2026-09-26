#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${STORAGE_BUCKET:?STORAGE_BUCKET is required}"
for tool in pg_dump psql age aws openssl; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$backup_dir/anhemfarm-$stamp"
backup="$base.dump.age"
source_db="$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)))')"
case "$source_db" in ''|*_test|*_restore_test) echo 'Refusing a nonproduction source database' >&2; exit 1;; esac

printf '%s\n' "$source_db" > "$backup.source"
psql "$DATABASE_URL" -At -F, -c 'SELECT (SELECT count(*) FROM orders),(SELECT count(*) FROM order_items),(SELECT count(*) FROM variants),(SELECT count(*) FROM media)' > "$backup.counts"
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" | age -r "$AGE_RECIPIENT" -o "$backup"
aws s3api list-object-versions --bucket "$STORAGE_BUCKET" --prefix products/ --query 'Versions[].[Key,VersionId,IsLatest]' --output text | age -r "$AGE_RECIPIENT" -o "$base.media.age"
for file in "$backup" "$base.media.age" "$backup.source" "$backup.counts"; do
  openssl dgst -sha256 "$file" | awk '{print $NF}' > "$file.sha256"
  aws s3 cp "$file" "s3://$BACKUP_BUCKET/$(basename "$file")" --only-show-errors
  aws s3 cp "$file.sha256" "s3://$BACKUP_BUCKET/$(basename "$file.sha256")" --only-show-errors
done
echo "Uploaded encrypted backup set $stamp. Configure bucket versioning and retention of at least 30 days."
