# Moving Kinesis to the shop PC

Runbook for moving production from the development machine ("Shimamura")
to a dedicated shop PC on the same LAN. The shop PC takes over
`192.168.254.199` and keeps the existing HTTPS addresses, so phones that
already trust the Kinesis CA and browser terminals that are already paired
keep working.

Shimamura stays the development machine. Its database is only **read**
(`pg_dump`). After the move it is the rollback copy.

Every step marked **[needs authorization]** changes production, the
network or the shop PC. Do not start one without the owner's go-ahead.

---

## 1. Target architecture

| | Shop PC (recommended) |
|---|---|
| OS | **Debian 13** (or Ubuntu 24.04 LTS), 64-bit, wired Ethernet |
| Database | PostgreSQL **18** (PGDG repository). The dump comes from PostgreSQL 18.6 and cannot be restored into an older major version. |
| Python | System Python 3.13 (Debian 13) or 3.12 (Ubuntu 24.04). Lock file tested on 3.12, 3.13 and 3.14. |
| Proxy | Caddy 2.11 (official repository), as `kinesis-caddy.service` |
| Accounts | `kinesis` (backend), `kinesis-proxy` (Caddy and certificates; the only account that can read TLS keys) |
| Hostname | `kinesis`, so Avahi answers `kinesis.local` |
| Address | `192.168.254.199`, reserved in the router for the shop PC's MAC |

**Why Linux.** The systemd templates are the most complete and are
sandboxed, the backend account cannot read the TLS keys, Avahi provides
`kinesis.local` with no extra software, and nothing needs `tzdata`.
Windows (`deploy/services/windows`) and macOS (`deploy/services/launchd`)
remain possible; see section 9. Intel Macs are not supported: `cryptography`
and `argon2-cffi-bindings` have no prebuilt wheels for them.

**Ports** (unchanged from today, so existing origins and paired terminals stay valid):

| Port | Use | Firewall |
|---|---|---|
| TCP 9443 | POS (`https://192.168.254.199:9443`, `https://kinesis.local:9443`) | open to the LAN |
| TCP 9444 | Admin console (`https://192.168.254.199:9444`) | open to the LAN (or only the owner's PC) |
| TCP 9080 | Device onboarding (CA certificate only, HTTP) | open to the LAN |
| UDP 5353 | mDNS (`kinesis.local`) | open to the LAN |
| TCP 9081 | HTTP to HTTPS redirect | closed (not needed) |
| TCP 8000 | Backend | **closed**: listens on 127.0.0.1 only |
| TCP 5432 | PostgreSQL | **closed**: `listen_addresses = localhost` |
| TCP 2019 | Caddy admin API | **closed**: localhost only |

**Files on the shop PC**

| Path | Owner / mode | Contents |
|---|---|---|
| `/etc/kinesis/kinesis.env` | `root:kinesis 0640` | from `deploy/config/shop/kinesis.env.template` (secrets) |
| `/etc/kinesis/caddy.env` | `root:kinesis-proxy 0640` | `deploy/config/shop/caddy.env` |
| `/opt/kinesis/{backend,deploy,venv,web/pos,web/admin}` | root, read-only | code, venv, prebuilt web apps |
| `/var/lib/kinesis/uploads/{products,gcash}` | `kinesis 0750` | product images, GCash QR |
| `/var/lib/kinesis/backups` | `kinesis 0700` | admin-console backups |
| `/var/lib/kinesis/pki` | `kinesis-proxy 0700` | issuing CA, server certificate and keys |
| `/var/lib/kinesis/onboarding` | `kinesis-proxy 0755` | public CA files for new devices |
| `/var/lib/kinesis/caddy` | `kinesis-proxy 0700` | Caddy state |

## 2. What moves, and how

| Item | On Shimamura today | Destination | How |
|---|---|---|---|
| Database `kinesis` | PostgreSQL 18.6, owner `kinesis_app` | `kinesis` on the shop PC | `kinesis_migrate.py dump` / `restore`, checked with `baseline` + `compare` |
| Product images | `backend/uploads/products/` | `/var/lib/kinesis/uploads/products/` | copy with names unchanged + `manifest` / `verify-manifest` |
| GCash QR | `backend/uploads/gcash/` | `/var/lib/kinesis/uploads/gcash/` | same |
| Issuing CA + server certificate | `~/kinesis-local/pki/` | `/var/lib/kinesis/pki/` | USB, by the owner (private keys) |
| Onboarding files | `~/kinesis-local/onboarding/` | `/var/lib/kinesis/onboarding/` | regenerate with `export-ca` (public) |
| Root CA private key | `~/kinesis-root-key/root-ca.key.enc` (encrypted) | **offline USB only** | owner; never to the shop PC |
| Configuration | dev `.env` files | new files from `deploy/config/shop/` | new secrets, new database password |
| Web apps | built on Shimamura | `/opt/kinesis/web/{pos,admin}` | `expo export` / `vite build`, checked with `check_web_build.py` |
| Server-side backups | `~/.local/share/kinesis/backups/` | not migrated | keep on Shimamura; the cutover dump replaces them |

Images and the GCash QR are stored in the database as bare file names
(`<32 hex>.<ext>`), so copying the files under the same names keeps them
working. Phase 0 checks this on the live data.

### What happens to devices

* **Paired browser terminals** stay paired. Their HttpOnly cookie is tied
  to the host name (`192.168.254.199` / `kinesis.local`), which does not
  change. The matching credential hash moves with the database.
* **CSRF tokens** change, because the shop PC gets a new auth secret. The
  POS web app now fetches a fresh token automatically when the server
  rejects the old one (`src/lib/api.ts`), so open tabs recover on their own.
  This was verified in a browser against the production configuration.
  Older POS builds would instead show "This terminal has been disabled by an
  administrator" until reloaded, so deploy this release.
* **Cashiers** keep their sessions unless they expire during the downtime.
* **Admin** logs in again. The cookie name changes to
  `__Host-kinesis_admin_session`, and admin accounts move with the database.
* **Phones' trust in the CA** is unchanged: same root, same issuing CA,
  same server certificate (valid until 2027-11-07).

---

## 3. Phase 0: prerequisites

| # | Item | Who | Notes |
|---|---|---|---|
| 0.1 | Commit and tag the release, including the uncommitted admin-inventory work, migration `f1b914eead0e`, the lock files and these tools | owner [needs authorization] | The shop PC gets `git archive <tag>`, never a working tree. |
| 0.2 | Move the root CA key off Shimamura's internal disk | owner | Copy `~/kinesis-root-key/root-ca.key.enc` to two USB drives, then run `verify-root-key` (below) against a USB copy. Delete the internal copy only after that succeeds. Keep the passphrase separately. |
| 0.3 | Verify the root key passphrase | owner | `python3 deploy/pki/kinesis_pki.py --pki-dir ~/kinesis-local/pki verify-root-key --root-key /media/USB/root-ca.key.enc` (prompts; nothing is written). If the passphrase is lost, see section 8. |
| 0.4 | Read-only baseline of the live database | [needs authorization] | `backend/venv/bin/python deploy/migration/kinesis_migrate.py baseline --env-file backend/.env --allow-production --out baseline-phase0.json`. Check: `alembic_version` = `f1b914eead0e`; `product_image_paths` are bare file names; note `terminals_in_maintenance`. |
| 0.5 | Shop PC hardware with wired Ethernet, Debian 13 installed, temporary DHCP address | owner | Disable sleep on mains power. |
| 0.6 | Router admin access | owner | Shimamura's Wi-Fi (`24:b2:b9:fd:74:e7`) holds `.199` today on a 24-hour DHCP lease. |
| 0.7 | Two USB drives | owner | One for the cutover transfer, one kept offline with the root key. |

## 4. Phase 1: provision the shop PC [needs authorization]

No effect on Shimamura or the shop. Run on the shop PC while it still has its temporary address.

1. Build the release on Shimamura and copy it to the shop PC:
   ```sh
   git archive --format=tar.gz -o kinesis-<tag>.tar.gz <tag>
   npx expo export -p web --output-dir /tmp/kinesis-web/pos
   npm --prefix admin run build -- --outDir /tmp/kinesis-web/admin --emptyOutDir
   python3 deploy/tools/check_web_build.py /tmp/kinesis-web/pos --caddyfile deploy/caddy/Caddyfile
   python3 deploy/tools/check_web_build.py /tmp/kinesis-web/admin --caddyfile deploy/caddy/Caddyfile
   ```
2. On the shop PC: set the hostname, then dry-run and apply the installer:
   ```sh
   sudo hostnamectl set-hostname kinesis
   ./deploy/install/linux/install-kinesis.sh --release ./kinesis-<tag> --web-pos ./pos --web-admin ./admin
   sudo ./deploy/install/linux/install-kinesis.sh --release ./kinesis-<tag> --web-pos ./pos --web-admin ./admin --apply
   ```
   This installs PostgreSQL 18, Caddy and Avahi, creates the accounts,
   folders, `/opt/kinesis` and the venv (hash-checked), and installs the
   units **disabled**.
3. Database role and empty database (interactive password prompt, so
   nothing ends up in shell history):
   ```sh
   sudo -u postgres createuser --pwprompt --no-superuser --no-createdb --no-createrole kinesis_app
   sudo -u postgres createdb --owner kinesis_app kinesis
   sudo -u postgres psql -Atc "SHOW listen_addresses"     # expect: localhost
   sudo grep -E '^(host|local)' /etc/postgresql/18/main/pg_hba.conf  # expect scram-sha-256 for 127.0.0.1/32 and ::1/128
   ```
4. Configuration:
   ```sh
   sudo install -o root -g kinesis-proxy -m 0640 deploy/config/shop/caddy.env /etc/kinesis/caddy.env
   sudo install -o root -g kinesis -m 0640 deploy/config/shop/kinesis.env.template /etc/kinesis/kinesis.env
   sudoedit /etc/kinesis/kinesis.env   # set DATABASE_PASSWORD (step 3) and a new secret:
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
5. Certificates (owner copies the private keys from Shimamura by USB):
   ```sh
   sudo install -o kinesis-proxy -g kinesis-proxy -m 0600 USB/pki/{intermediate-ca.key,server.key} /var/lib/kinesis/pki/
   sudo install -o kinesis-proxy -g kinesis-proxy -m 0644 USB/pki/{root-ca.crt,intermediate-ca.crt,server.crt,pki.json} /var/lib/kinesis/pki/
   K="sudo -u kinesis-proxy /opt/kinesis/venv/bin/python /opt/kinesis/deploy/pki/kinesis_pki.py --pki-dir /var/lib/kinesis/pki"
   $K renew --no-reload --reload-command "caddy reload --config /opt/kinesis/deploy/caddy/Caddyfile --adapter caddyfile --force" --reload-env-file /etc/kinesis/caddy.env
   $K verify --expect-ip 192.168.254.199 --expect-hostname kinesis.local
   $K export-ca --out /var/lib/kinesis/onboarding
   ```
   `verify` must print the same root fingerprint as on Shimamura
   (`61:63:63:FB:…:6B:6A`). The `renew` call only records the reload
   command; the certificate is not due, so nothing is re-issued.
6. Preflight (must report 0 failures):
   ```sh
   sudo /opt/kinesis/venv/bin/python /opt/kinesis/deploy/migration/preflight.py \
       --kinesis-env /etc/kinesis/kinesis.env --caddy-env /etc/kinesis/caddy.env --expect-ip 192.168.254.199
   ```
7. Firewall:
   ```sh
   sudo apt-get install -y ufw
   sudo ufw default deny incoming && sudo ufw default allow outgoing
   sudo ufw allow from 192.168.254.0/24 to any port 9443,9444,9080 proto tcp
   sudo ufw allow from 192.168.254.0/24 to any port 5353 proto udp
   sudo ufw allow from 192.168.254.0/24 to any port 22 proto tcp   # only if SSH is used
   sudo ufw enable
   ```

## 5. Phase 2: rehearsal on the shop PC [needs authorization]

Proves the whole path with a test dump. The shop keeps selling on Shimamura.

1. On Shimamura, take a dump of `kinesis_test` (or, with authorization, of
   `kinesis`; dumping only reads):
   `backend/venv/bin/python deploy/migration/kinesis_migrate.py dump --env-file backend/.env.test --out-dir /tmp/rehearsal`
2. On the shop PC (copy the dump and its `.sha256` into a folder owned by
   `kinesis`, as in phase 3 step 5):
   ```sh
   M="sudo -u kinesis /opt/kinesis/venv/bin/python /opt/kinesis/deploy/migration/kinesis_migrate.py"
   $M restore --env-file /etc/kinesis/kinesis.env --allow-production --dump /var/tmp/kinesis-rehearsal/<file>.dump --confirm-database kinesis
   sudo systemctl start kinesis-backend kinesis-caddy
   ```
3. Check from the shop PC and from a laptop, using the shop PC's temporary
   address while keeping the real names:
   ```sh
   python3 smoke_test.py --caddy-env caddy.env --ca root-ca.crt --connect-ip <temporary-IP> --lan-ip <temporary-IP>
   ```
   Then in a laptop browser with a hosts entry `kinesis.local → <temporary-IP>`:
   - admin login on `https://kinesis.local:9444` (temporarily add that origin) or by `curl --resolve`;
   - pair a test terminal and make a test sale;
   - create and download a backup;
   - restore it.
4. Reboot the shop PC. Everything must come up with nobody logged in.
5. Time each step. Then reset:
   ```sh
   sudo systemctl stop kinesis-caddy kinesis-backend
   sudo -u postgres dropdb kinesis && sudo -u postgres createdb --owner kinesis_app kinesis
   ```
   Also remove the rehearsal uploads and backups.

## 6. Phase 3: cutover [needs authorization]

Downtime runs from step 3 to step 11. With the rehearsal timings, expect
roughly 20–40 minutes. Choose a time when the shop is closed.

On **Shimamura** (`R` = repository root):

1. Announce the window. Set the admin console's terminals to **maintenance
   mode** (Admin → Terminals). Sales, stock receipts and catalog edits are
   refused from then on.
2. Confirm on the Overview that the last sale happened before the freeze.
   The administrator makes no further edits.
3. Stop the development backend (`uvicorn`). Nothing can write from here on.
4. Final baseline, dump and uploads:
   ```sh
   cd $R
   PY=backend/venv/bin/python; M=deploy/migration/kinesis_migrate.py; OUT=/run/media/$USER/USB/kinesis-cutover
   $PY $M baseline --env-file backend/.env --allow-production --out $OUT/source.json
   $PY $M dump --env-file backend/.env --allow-production --out-dir $OUT
   $PY $M manifest backend/uploads --out $OUT/uploads.manifest.json
   cp -a backend/uploads $OUT/uploads
   ```
   `source.json` must show the maintenance flags you set and the same last-sale time as step 2.

On the **shop PC** (`M` as in phase 2):

5. Copy the cutover folder off the USB stick into a location the `kinesis`
   account can read (it cannot read `/run/media/<user>`), then restore and
   reconcile:
   ```sh
   C=/var/tmp/kinesis-cutover
   sudo install -d -o kinesis -g kinesis -m 0700 $C
   sudo cp -a /path/to/USB/kinesis-cutover/. $C/ && sudo chown -R kinesis:kinesis $C
   $M restore --env-file /etc/kinesis/kinesis.env --allow-production --dump $C/kinesis_*.dump --confirm-database kinesis
   $M baseline --env-file /etc/kinesis/kinesis.env --allow-production --out $C/target.json
   $M compare $C/source.json $C/target.json      # must print "Snapshots match"
   ```
6. Uploads:
   ```sh
   sudo rsync -a $C/uploads/ /var/lib/kinesis/uploads/
   sudo chown -R kinesis:kinesis /var/lib/kinesis/uploads && sudo chmod -R u=rwX,g=rX,o= /var/lib/kinesis/uploads
   $M verify-manifest /var/lib/kinesis/uploads $C/uploads.manifest.json
   ```
   Keep `$C` until the go/no-go decision; delete it afterwards (it holds a
   full copy of the shop's data).
7. Start the services and check them on the temporary address:
   ```sh
   sudo systemctl enable --now kinesis-backend kinesis-caddy kinesis-pki-renew.timer
   python3 /opt/kinesis/deploy/migration/smoke_test.py --caddy-env /etc/kinesis/caddy.env \
       --ca /var/lib/kinesis/pki/root-ca.crt --connect-ip 127.0.0.1
   ```
8. **Address handover** (router):
   - Remove the `.199` binding for Shimamura's Wi-Fi (`24:b2:b9:fd:74:e7`).
   - Reserve `.199` for the shop PC's MAC.
   - On Shimamura, renew the Wi-Fi lease (`nmcli device disconnect wlan0 && nmcli device connect wlan0`) and confirm it no longer has `.199`.
   - On the shop PC, renew its lease (`sudo networkctl renew <if>` or reconnect) and confirm `ip -4 addr` shows `192.168.254.199`.
9. Full smoke test on the real address, from a **different** LAN computer:
   ```sh
   python3 smoke_test.py --caddy-env caddy.env --ca root-ca.crt --lan-ip 192.168.254.199
   ```
   All checks must pass, including ports 8000, 5432 and 2019 closed.
10. **Go / no-go.** If anything failed, roll back (section 7) now. Nothing has been sold on the shop PC yet.
11. Admin → Terminals: turn maintenance mode **off**. The flag came over in the dump. Open the POS on one phone (it should still be paired), log in as a cashier, and make one supervised sale.
12. Create the first production backup from the admin console **on a computer other than the shop PC**, so the download is off-host, and copy it to USB.

## 7. Rollback

| When | What to do | Data impact |
|---|---|---|
| Before step 8 | Stop the shop PC services. Start the dev backend on Shimamura. Turn maintenance off. | None. Shimamura's database was only read. |
| Steps 8–10 (no sales on the shop PC yet) | Stop the shop PC services. Give `.199` back to Shimamura's Wi-Fi in the router and renew both leases. Start the dev backend. Turn maintenance off. | None. |
| After step 11 (sales on the shop PC) | Prefer fixing forward. To go back: maintenance on; `kinesis_migrate.py dump` on the shop PC; restore into a **new empty** database on Shimamura; compare baselines; copy new upload files back; then hand `.199` back as above. | None if done in this order. Never point two backends at different copies while both sell. |

Shimamura's `kinesis` database must stay untouched for at least two weeks
after the cutover. Do not rename or reuse it until the owner decides.

## 8. Root CA key

* It is at `~/kinesis-root-key/root-ca.key.enc` on Shimamura's internal
  disk: encrypted PKCS#8, mode 0600, created on 2026-11-07. This contradicts
  `README-tls.md` ("keep it offline"). Phase 0.2 moves it to USB.
* It is **not needed** for this migration. The issuing CA key, which is
  on the host, renews the server certificate and can re-issue for new
  addresses within the private ranges.
* It **is** needed every 5 years, to replace the issuing CA
  (`rotate-intermediate`), or after a compromise.
* **If the passphrase is lost:** nothing breaks now. The issuing CA is
  valid until 2031-11. Before then, a new CA must be created (`init
  --force`) and every device must trust the new root once (onboarding
  page). Plan that as its own task. Do not do it as part of this migration.

## 9. Windows or macOS shop PC

The same procedure applies, with these differences:

* **Windows:** `deploy/services/windows/README.md` covers the venv from the
  lock files (includes `tzdata`), WinSW (`<depend>` must name the installed
  `postgresql-x64-18` service), and firewall rules for 9443/9444/9080 on
  the Private profile. Both services run as LocalSystem, so the backend
  can read the TLS keys; protect `C:\ProgramData\Kinesis` with the ACL. Use
  forward slashes in `caddy.env`. `kinesis.local` needs the
  `deploy/mdns` responder (not yet tested on Windows); otherwise phones use
  the IP address, which is the primary origin anyway.
* **macOS (Apple silicon only):** `deploy/services/launchd`. The log files
  in `/Library/Application Support/Kinesis/logs` are not rotated; check
  their size monthly.
* On both, the paths in `caddy.env` / `kinesis.env` change to the OS layout
  (`docs/deployment/ARCHITECTURE.md`), and `preflight.py` must pass.

## 10. Tools

| Tool | Purpose |
|---|---|
| `deploy/install/linux/install-kinesis.sh` | Provision the shop PC (dry run unless `--apply`). |
| `deploy/migration/kinesis_migrate.py` | `baseline`, `compare`, `dump`, `restore` (empty database only), `manifest`, `verify-manifest`. Refuses non-`_test` databases without `--allow-production`. |
| `deploy/migration/preflight.py` | Offline config check: origins vs. sites, certificate names, production flags, placeholders, permissions, web roots. |
| `deploy/migration/smoke_test.py` | Read-only network check: TLS trust, route allow-list, headers, onboarding, closed ports. |
| `deploy/pki/kinesis_pki.py verify` / `verify-root-key` | Read-only certificate chain and key checks. |
