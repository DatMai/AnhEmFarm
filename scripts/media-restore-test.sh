#!/usr/bin/env bash
set -euo pipefail
umask 077

stamp="${1:?Usage: media-restore-test.sh BACKUP_STAMP RESTORED_DATABASE_URL}"
target_url="${2:?Usage: media-restore-test.sh BACKUP_STAMP RESTORED_DATABASE_URL}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required}"
[[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { echo 'Invalid backup stamp' >&2; exit 1; }
target_db="$(TARGET_URL="$target_url" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.TARGET_URL).pathname.slice(1)))')"
[[ "$target_db" == *_restore_test ]] || { echo 'Target database must end with _restore_test' >&2; exit 1; }
for tool in psql aws age openssl; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
count=0
psql "$target_url" -At -c 'SELECT "objectKey" FROM media ORDER BY "objectKey"' > "$scratch/keys"
while IFS= read -r key; do
  [[ "$key" =~ ^products/[0-9a-f-]{36}\.webp$ ]] || { echo 'Unexpected restored media key' >&2; exit 1; }
  filename="${key##*/}.age"
  aws s3 cp "s3://$BACKUP_BUCKET/$stamp/media/$filename" "$scratch/$filename" --only-show-errors
  aws s3 cp "s3://$BACKUP_BUCKET/$stamp/media/$filename.sha256" "$scratch/$filename.sha256" --only-show-errors
  expected="$(cat "$scratch/$filename.sha256")"
  actual="$(openssl dgst -sha256 "$scratch/$filename" | awk '{print $NF}')"
  [[ "$expected" == "$actual" ]] || { echo 'Media backup checksum failed' >&2; exit 1; }
  age -d -i "$AGE_IDENTITY_FILE" "$scratch/$filename" > /dev/null
  rm -f "$scratch/$filename" "$scratch/$filename.sha256"
  count=$((count + 1))
done < "$scratch/keys"
echo "Verified $count independently backed media objects referenced by the restored database."
