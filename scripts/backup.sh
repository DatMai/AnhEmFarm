#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${STORAGE_BUCKET:?STORAGE_BUCKET is required}"
[[ "$STORAGE_BUCKET" != "$BACKUP_BUCKET" ]] || { echo 'Backup and media buckets must be independent' >&2; exit 1; }
for tool in pg_dump psql age aws openssl; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$backup_dir/anhemfarm-$stamp"
backup="$base.dump.age"
source_db="$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)))')"
case "$source_db" in ''|*_test|*_restore_test) echo 'Refusing a nonproduction source database' >&2; exit 1;; esac

printf '%s\n' "$source_db" > "$backup.source"
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" | age -r "$AGE_RECIPIENT" -o "$backup"
aws s3api list-object-versions --bucket "$STORAGE_BUCKET" --prefix products/ --query 'Versions[].[Key,VersionId,IsLatest]' --output text | age -r "$AGE_RECIPIENT" -o "$base.media.age"
media_dir="$base.media"
mkdir -p "$media_dir"
aws s3api list-objects-v2 --bucket "$STORAGE_BUCKET" --prefix products/ --output json | node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    for (const object of JSON.parse(input).Contents ?? []) {
      if (!/^products\/[0-9a-f-]{36}\.webp$/.test(object.Key)) throw new Error("Unexpected media key");
      process.stdout.write(object.Key + "\n");
    }
  });
' > "$base.media.keys"
while IFS= read -r key; do
  [[ -n "$key" ]] || continue
  encrypted="$media_dir/${key##*/}.age"
  aws s3 cp "s3://$STORAGE_BUCKET/$key" - --only-show-errors | age -r "$AGE_RECIPIENT" -o "$encrypted"
  openssl dgst -sha256 "$encrypted" | awk '{print $NF}' > "$encrypted.sha256"
  aws s3 cp "$encrypted" "s3://$BACKUP_BUCKET/$stamp/media/$(basename "$encrypted")" --only-show-errors
  aws s3 cp "$encrypted.sha256" "s3://$BACKUP_BUCKET/$stamp/media/$(basename "$encrypted.sha256")" --only-show-errors
done < "$base.media.keys"
age -r "$AGE_RECIPIENT" -o "$base.media.keys.age" "$base.media.keys"
for file in "$backup" "$base.media.age" "$base.media.keys.age" "$backup.source"; do
  openssl dgst -sha256 "$file" | awk '{print $NF}' > "$file.sha256"
  aws s3 cp "$file" "s3://$BACKUP_BUCKET/$(basename "$file")" --only-show-errors
  aws s3 cp "$file.sha256" "s3://$BACKUP_BUCKET/$(basename "$file.sha256")" --only-show-errors
done
echo "Uploaded encrypted database and independent media backup set $stamp. Configure backup bucket versioning and retention of at least 30 days."
