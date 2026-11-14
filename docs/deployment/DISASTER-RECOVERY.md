# Kinesis disaster recovery

What to do when the shop server is lost, damaged or corrupted. It describes
what exists today (`backend/backup_cli.py`, the Database page's restore, the
System health card); it is not a promise of any recovery time.

## What you can lose

| Backup state | Data lost if the server dies now |
| --- | --- |
| Nightly timer enabled, copy kept off the server (`--copy-to`) | Up to one day of sales and stock changes |
| Nightly timer enabled, no off-server copy | Everything, if the disk itself is lost |
| Manual backups only | Everything since the last time someone clicked **Create and download** |

The **System health** card on the admin Overview turns red when no backup
has ever run, the last one failed, the last good one is over 3 days old, or
the disk is nearly full. It shows a yellow warning when the newest backup
was not copied to another device.

## What a backup contains

- `kinesis_backup_*.dump`: the whole database (products, sales, voids and
  refunds, stock history, accounts, settings, activity log).
- `kinesis_files_*.tar.gz`: product images and the GCash QR image.
- **Not included:** `kinesis.env` / `caddy.env` and the certificate
  authority and server keys under `pki/`. Copy these once when the server
  is set up and again whenever they change. Without the PKI keys, every
  device must trust a new certificate authority.

## Recover onto the same or a replacement server

1. Install Kinesis on the new host the usual way
   (`docs/deployment/ARCH-LINUX.md` or the installer for your OS) with the
   same `KINESIS_ADMIN_AUTH_SECRET_KEY`, or accept that everyone signs in
   again and administrators re-enrol two-step sign-in codes only if the
   database is not restored.
2. Restore the newest good `.dump`:
   - **From the admin console:** Database → Restore. It makes its own
     pre-restore backup first and applies the dump in one transaction, so a
     bad file changes nothing.
   - **From a shell** (when the console is unavailable): stop the backend,
     then
     `pg_restore --clean --if-exists --no-owner --single-transaction -d kinesis FILE.dump`.
3. Unpack `kinesis_files_*.tar.gz` into the data directory
   (`uploads/products`, `uploads/gcash`).
4. Start the backend. It must report the expected database version; the
   System health card shows "Database version: Up to date". If it says the
   database is behind, run `alembic upgrade head` (migrations only add; do
   this on the restored copy, never on the only copy).
5. Check: open Transactions (latest sale present), Stock (counts plausible),
   and complete one test sale on a terminal.
6. Terminals keep their pairing if the database came back with them. Devices
   that were paired after the backup must be paired again.

## Practising it

`backend/tests/test_backup_restore.py` performs a real dump, wipe and
restore through the restore endpoint on the test database and compares the
result. Run a manual drill on a spare computer at least once a quarter:
restore last night's dump there, open the admin console and look at
yesterday's sales. A backup that has never been restored is untested.

## Known gaps

- Backups are logical dumps taken once a night. There is no continuous WAL
  archiving, so a crash loses everything since the last dump.
- Installers do not yet enable the backup timer; install the units from
  `deploy/services/` by hand (see `BACKUPS.md`).
- There is a single server and a single database; no standby.
- Restore is not coordinated with the terminals: stop selling (put terminals
  into maintenance mode) before restoring.
