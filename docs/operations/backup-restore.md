# Backup and isolated restore

Run `scripts/backup.sh` daily and before every migration with `DATABASE_URL`, `AGE_RECIPIENT`, `BACKUP_BUCKET`, and `STORAGE_BUCKET` set. The two buckets must be independent. It streams a custom-format PostgreSQL dump through age encryption, records a versioned media-key inventory, encrypts a separate copy of each current product image, calculates SHA-256 checksums, and uploads the set to the offsite bucket. The host needs PostgreSQL client tools, Node, age and AWS CLI. Enable backup bucket versioning and retention of at least 30 days; periodically verify completed uploads. Keep the age identity offline and separate from the backup bucket. A backup fails if any listed media object cannot be copied. Do not remove retained backup media when deleting a source object.

For a restore drill, create an empty isolated database with a name ending `_restore_test`, disconnect it from public traffic and real SMTP, download the backup set plus checksums, and run:

```sh
AGE_IDENTITY_FILE=/secure/key.txt scripts/restore-test.sh /secure/backup.dump.age postgresql://user@localhost/anhemfarm_restore_test
```

The script verifies checksums, refuses a non-test or nonempty target, restores the dump, invalidates every session and account token, increments auth versions, disables pending email delivery, and reports key record counts from the restored dump's own snapshot. It does not compare counts taken at another time against a live source database. Then verify every media row against its independent encrypted copy (the stamp is the UTC suffix in the database backup filename):

```sh
BACKUP_BUCKET=offsite-bucket AGE_IDENTITY_FILE=/secure/key.txt scripts/media-restore-test.sh 20260926T070000Z postgresql://user@localhost/anhemfarm_restore_test
```

Rotate `SESSION_SECRET` before any restored environment is exposed. Verify sample order totals, stock, lease recovery and SMTP isolation manually. The media drill downloads, checks and decrypts every object referenced by the restored database without publishing it. Restore product images to a fresh private media bucket from these encrypted copies before routing public traffic. Do not send restored pending mail to real recipients.

If a restore fails integrity checks, keep it isolated and investigate; do not route traffic to it.
