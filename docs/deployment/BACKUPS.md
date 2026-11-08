# Kinesis backups: what exists today

This page describes the backup and restore features as they are
implemented now (`backend/database_routes.py`,
`admin/src/lib/databaseApi.ts`). It is not a design for future features.

## Manual vs. scheduled backups

- **Manual backups exist.** A backup is created only when an administrator
  clicks **Create and download** (or **Download SQL**) on the admin
  console's **Database** page.
- **Scheduled (automatic) backups do not exist.** Nothing in Kinesis
  creates backups on a timer. The "Automatic backup schedule" value in
  Settings → Database backups is stored but has no effect, and the page
  marks it **Not in effect**.

Until a scheduler exists, the shop owner must create backups by hand, for
example at the end of each business day.

## What "Create and download" does

1. The admin console sends `POST /api/admin/database/backups?format=custom`
   (or `format=sql` for **Download SQL**). It needs an administrator
   session. Only one backup or restore runs at a time; a second request
   gets "Another database backup or restore is already running."
2. The backend runs `pg_dump` against the configured database:
   - `custom` → PostgreSQL custom-format archive (`.dump`). This is the
     only format the restore feature accepts.
   - `sql` → plain SQL text (`.sql`), for inspection or manual use.
   The PostgreSQL password is passed through a temporary password file
   that is deleted afterwards. `pg_dump` must be installed; on Windows and
   macOS set `KINESIS_PG_BIN_DIR` to PostgreSQL's `bin` folder.
3. The file is written **on the server** as
   `kinesis_backup_<UTC timestamp>_<random>.dump|.sql`, readable only by
   the backend's account (file `0600`, folder `0700` on Linux/macOS).
4. The same file is **sent to the browser as a download**. It is saved
   wherever that browser saves downloads, on **whichever computer is
   running the browser**.

So every manual backup leaves two copies: one in the server's backup
folder, and one in the downloading browser's Downloads folder.

## Where the server-side copy goes

The backup folder is chosen in this order:

1. `KINESIS_DATABASE_BACKUP_DIRECTORY`, if set. Relative paths are
   resolved against `KINESIS_DATA_DIR`.
2. `<KINESIS_DATA_DIR>/backups`, if `KINESIS_DATA_DIR` is set (production
   layout: `/var/lib/kinesis/backups`, `C:\ProgramData\Kinesis\backups`, …).
3. Otherwise (development): `~/.local/share/kinesis/backups` on
   Linux/macOS, `%LOCALAPPDATA%\Kinesis\backups` on Windows.

The Database page lists the files in this folder but does not show its
path.

## Retention: old backups are deleted automatically

Every time the backup list is loaded or a backup is created, the backend
deletes managed backup files older than the retention period:

- default **30 days**, set with `KINESIS_DATABASE_BACKUP_RETENTION_DAYS`;
- based on the file's modification time;
- applies to normal backups **and** pre-restore snapshots;
- only touches files named like Kinesis backups in that folder.

There is no "always keep the newest N" rule. If no backup is created for
longer than the retention period, the next time someone opens the backup
list **every server-side backup is deleted**. The browser-downloaded
copies are not affected.

## What a backup does not contain

The database dump does **not** include:

- product images (`<DATA_DIR>/uploads/products`, or
  `backend/uploads/products` without `KINESIS_DATA_DIR`);
- the GCash QR image (`<DATA_DIR>/uploads/gcash`);
- configuration files (`kinesis.env`, `caddy.env`);
- certificates and keys (`<DATA_DIR>/pki`).

Copy these separately (see the Backups section of
[ARCHITECTURE.md](ARCHITECTURE.md)).

## Keeping an off-host copy (owner's responsibility)

The server-side copy sits on the same disk as the database. A disk
failure, theft or fire loses both. To keep a usable off-host copy:

1. Create the backup from a browser on **another device** (for example
   the owner's laptop or office PC), so the download lands off the server.
   If you create it from a browser on the server itself, the "download"
   is still on the server and you must copy it off yourself.
2. Move the downloaded `.dump` file to removable or separate storage
   (USB drive, NAS) and keep several recent copies.
3. Copy the uploads folder (images, GCash QR) at the same time.
4. Treat the files as confidential. They contain all sales, cashier and
   administrator account data (password and PIN hashes).
5. Occasionally test a restore on a spare computer or a test database.
   A backup that has never been restored is unverified.

## Restore (summary)

**Database → Restore** accepts only a custom-format `.dump`, up to 1 GiB by
default (`KINESIS_DATABASE_MAX_RESTORE_UPLOAD_BYTES`). The administrator
must type the database name to confirm. The backend then:

1. checks the file signature and has `pg_restore --list` parse it;
2. **creates a mandatory pre-restore backup** of the current database, and
   aborts without changing anything if that fails;
3. runs `pg_restore --clean --if-exists --single-transaction --exit-on-error`,
   so a failed restore rolls back completely.

Restore replaces the whole database: sales recorded after the backup was
taken are lost (they remain in the pre-restore snapshot). It does not
pause the POS. Before restoring, put the terminals in maintenance mode or
stop selling, so no sale is recorded during the restore. Restore does not
bring back product images or the GCash QR image.
