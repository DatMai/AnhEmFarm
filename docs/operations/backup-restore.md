# Backup and isolated restore

Run `scripts/backup.sh` daily and before every migration with `DATABASE_URL`, `AGE_RECIPIENT`, `BACKUP_BUCKET`, and `STORAGE_BUCKET` set. It streams a custom-format PostgreSQL dump through age encryption, records counts for orders/items/variants/media, records a versioned media-key inventory, calculates SHA-256 checksums, and uploads the set to the offsite bucket. The host needs PostgreSQL client tools, age and AWS CLI. Enable bucket versioning and retention of at least 30 days; periodically verify completed uploads. Keep the age identity offline and separate from the backup bucket.

For a restore drill, create an empty isolated database with a name ending `_restore_test`, disconnect it from public traffic and real SMTP, download the backup set plus checksums, and run:

```sh
AGE_IDENTITY_FILE=/secure/key.txt scripts/restore-test.sh /secure/backup.dump.age postgresql://user@localhost/anhemfarm_restore_test
```

The script verifies checksums, refuses a non-test or nonempty target, restores the dump, invalidates every session and account token, increments auth versions, disables pending email delivery, and compares key record counts. Rotate `SESSION_SECRET` before any restored environment is exposed. Verify sample order totals, stock, media object checksums/existence, lease recovery and SMTP isolation manually. The encrypted media inventory is a manifest, not a copy of the objects; restore media from versioned object storage separately. Do not send restored pending mail to real recipients.

If a restore fails integrity checks, keep it isolated and investigate; do not route traffic to it.
