# Moving Kinesis to the shop's host computer

Runbook for moving production from the development machine ("Shimamura")
to a computer the shop already has. The host takes over `192.168.254.199`
and keeps the existing HTTPS addresses, so phones that already trust the
Kinesis CA and browser terminals that are already paired keep working.

Shimamura stays the development machine. Its database is only **read**
(`pg_dump`). After the move it is the rollback copy.

Every step marked **[needs authorization]** changes production, the
network or the host. Do not start one without the owner's go-ahead.

---

## 1. Choosing the host

Kinesis adapts to the hardware the shop has. It does not ask the shop to
buy or reinstall a machine.

| Candidate | Status | Templates |
|---|---|---|
| **Shop owner's MacBook** | **Primary candidate** | `deploy/services/launchd`, `deploy/config/shop/*.macos.*` |
| Existing Windows PC (currently broken) | Fallback, only if repaired and healthy | `deploy/services/windows`, `deploy/config/shop/*.windows.*` |
| Linux PC | Not available today; kept as a reference | `deploy/services/systemd`, `deploy/install/linux`, `deploy/config/shop/caddy.env` |

### 1.1 Information needed before the final decision

Nothing about either machine is assumed. Ask the shop owner for the
following. All commands only read information. Do not send the serial
number or account names; they are not needed.

**MacBook**

| Question | How to find it | Why it matters |
|---|---|---|
| Chip: Apple silicon (M1 or later) or Intel? | Apple menu → About This Mac, or `uname -m` (`arm64` / `x86_64`) | Apple silicon uses the tested lock file. Intel needs a separate, older lock (section 1.2). |
| macOS version | About This Mac, or `sw_vers -productVersion` | PostgreSQL 18's installer is tested on **macOS 13 Ventura or later**. Caddy needs **macOS 12 or later**, and future Caddy builds will need 13. |
| Memory and free disk space | About This Mac → More Info; `df -h /` | 8 GB RAM and 20 GB free are comfortable for one shop. |
| Battery condition | System Settings → Battery → Battery Health, or `system_profiler SPPowerDataType` | It will be plugged in all the time; a worn battery is still useful as a short power-cut buffer. |
| Ethernet: built-in port, or a USB-C/Thunderbolt Ethernet adapter available? | `networksetup -listallhardwareports` | Wired Ethernet gives a stable MAC address for the router reservation and avoids Wi-Fi drops. |
| FileVault on? | `fdesetup status` | With FileVault on, the Mac waits at the unlock screen after any restart. Kinesis does not start until someone types the password (section 1.3). |
| Managed by an organization (MDM)? | `profiles status -type enrollment` | A managed Mac may block service installation, firewall changes or power settings. |
| Does the MacBook **stay at the shop** permanently? Is it also the owner's daily/personal computer? | ask | If it leaves the shop or goes to sleep, the POS stops for everyone. |
| Administrator access available? | ask | Installing services needs an admin account. |

**Windows PC (if repaired)**

| Question | How to find it | Why it matters |
|---|---|---|
| What was broken, and what was repaired or replaced? | ask the technician | A failing disk or power supply makes it unfit as the only server. |
| Windows edition and version | `winver` | Windows 10 22H2 or 11, 64-bit. Pro is preferred (BitLocker, update deferral); Home works with more care. |
| CPU architecture | Settings → System → About ("x64" or "ARM") | **x64 only.** `cryptography` and `psycopg-binary` have no Windows-on-ARM wheels. |
| Disk health and free space | `Get-PhysicalDisk \| Select FriendlyName,MediaType,HealthStatus`; `Get-PSDrive C` | Must be Healthy, with 20 GB free. |
| Memory | `systeminfo` (Total Physical Memory) | 8 GB is comfortable. |
| Ethernet port | `Get-NetAdapter` | Stable MAC for the reservation. |
| BitLocker / device encryption | `manage-bde -status C:` | BitLocker with TPM unlocks on its own at boot, which suits unattended restarts. |

### 1.2 Assessment (evidence from the release checks)

**Software requirements on the host**

| Component | macOS | Windows |
|---|---|---|
| Python packages (hash-checked lock) | Apple silicon: every package has wheels for **macOS 11+** (checked against PyPI). Intel: the pinned `cryptography` 50.0.1 and `argon2-cffi-bindings` 26.1.0 have no Intel-Mac wheels. A binary-only Intel set does resolve with `cryptography` 48.0.1 and `argon2-cffi-bindings` 25.1.0 (checked), but it would need its own lock file and one test run. | x64: all wheels present; `tzdata` included. ARM: not supported. |
| Python | 3.12–3.14 (python.org installer) | 3.12–3.14 x64 (python.org installer) |
| PostgreSQL 18 | **EDB installer**: runs at boot as a system service; tested on macOS 13+. Postgres.app also runs on older macOS, but it starts only when a user logs in, so it does not suit an unattended server. | EDB installer, service `postgresql-x64-18` |
| Caddy | Official `darwin_arm64` / `darwin_amd64` binary; Go 1.25+ needs macOS 12+ | Official `windows_amd64` binary, run as a Windows service |
| Services | launchd daemons, start at boot without login | WinSW (backend) + Caddy's built-in service support |
| `kinesis.local` | Built in: set the Bonjour name to `kinesis` | Name the computer `kinesis` (to be confirmed on the device) |

**What the host computer means for daily operation**

| | MacBook | Windows PC |
|---|---|---|
| Survives a power cut | The battery covers short outages (the router and phones still need power) | Needs a UPS, or it turns off |
| Restarts on its own | Only if FileVault is off; with FileVault on, someone must unlock it | Yes, with BitLocker + TPM or no encryption |
| Sleep | Must be prevented on power, with the lid **open** (section 1.3) | `powercfg` settings |
| Updates | Turn off automatic macOS installs; update after hours | Set active hours; defer feature updates; Home edition restarts less predictably |
| TLS keys separated from the backend | Yes (separate `_kinesis` / `_kinesisproxy` accounts) | No: both services run as LocalSystem; the folder ACL protects the keys from other users |
| Shared use | If it is also the owner's personal laptop, it must not leave the shop or sleep | Usually a dedicated machine |

**Current recommendation:** the MacBook, if it is **Apple silicon on macOS
13 or later** and can stay plugged in at the shop with its lid open. If it
is an Intel Mac, it still works, after one extra lock-and-test step. If it
must leave the shop daily, the repaired Windows PC is the better host,
provided its disk is healthy and it is 64-bit x64.

### 1.3 macOS long-running operation

* **Sleep:** keep it plugged in with the lid open. Run
  `sudo pmset -c sleep 0 disksleep 0 powernap 0 womp 1` and allow the
  display to sleep. Closing the lid makes a MacBook sleep unless an
  external display is attached. Avoid `pmset disablesleep` unless it is
  tested on this Mac.
* **FileVault:** on protects the shop data and keys if the laptop is
  stolen. But after a power-down or update restart, Kinesis stays off until
  someone unlocks the Mac. For planned restarts, `sudo fdesetup authrestart`
  skips the unlock once. This is the owner's decision.
* **Updates:** System Settings → General → Software Update → Automatic
  updates: leave downloads on, but turn off installing macOS updates
  automatically. Install updates after closing time, then run the smoke
  test.
* **Network:** use Ethernet. If only Wi-Fi is possible, set **Private Wi-Fi
  Address: Off** for the shop network (System Settings → Wi-Fi → Details).
  Rotating or "fixed" private addresses can change and break the
  router reservation.
* **Firewall:** turn on the macOS firewall and allow incoming connections
  only for Caddy. The backend and PostgreSQL listen on localhost and are
  never exposed.
* **Logs:** launchd writes to `/Library/Application Support/Kinesis/logs`.
  These files cannot be rotated while running. The backend template
  therefore turns off per-request access logging, and errors are still
  recorded. Check the folder size monthly.

---

## 2. What moves, and how

`<DATA>`, `<CONFIG>` and `<CODE>` are defined per OS in section 3.

| Item | On Shimamura today | Destination | How |
|---|---|---|---|
| Database `kinesis` | PostgreSQL 18.6, owner `kinesis_app` | `kinesis` on the host | `kinesis_migrate.py dump` / `restore`, checked with `baseline` + `compare` |
| Product images | `backend/uploads/products/` | `<DATA>/uploads/products/` | copy with names unchanged + `manifest` / `verify-manifest` |
| GCash QR | `backend/uploads/gcash/` | `<DATA>/uploads/gcash/` | same |
| Issuing CA + server certificate | `~/kinesis-local/pki/` | `<DATA>/pki/` | USB, by the owner (private keys) |
| Onboarding files | `~/kinesis-local/onboarding/` | `<DATA>/onboarding/` | regenerate with `export-ca` (public) |
| Root CA private key | `~/kinesis-root-key/root-ca.key.enc` (encrypted) | **offline USB only** | owner; never to the host |
| Configuration | dev `.env` files | new files from `deploy/config/shop/` (per OS) | new secret, new database password |
| Web apps | built on Shimamura | the web roots for the host's OS (section 3) | `expo export` / `vite build`, checked with `check_web_build.py` |

The phase 0 baseline (2026-11-08) confirmed:

* migration `f1b914eead0e`;
* PostgreSQL 18;
* bare image file names;
* all 3 referenced upload files present;
* 4 paired terminals, none in maintenance.

### What happens to devices

* **Paired browser terminals** stay paired. Their HttpOnly cookie is tied
  to the host name (`192.168.254.199` / `kinesis.local`), which does not
  change. The matching credential hash moves with the database.
* **CSRF tokens** change, because the host gets a new auth secret. The POS
  web app (v1.4.0+) fetches a fresh token automatically when the server
  rejects the old one, so open tabs recover on their own. This was
  verified in a browser against the production configuration.
* **Cashiers** keep their sessions unless they expire during the downtime.
* **Admin** logs in again. The cookie name changes to
  `__Host-kinesis_admin_session`, and admin accounts move with the
  database.
* **Phones' trust in the CA** is unchanged: same root, same issuing CA,
  same server certificate (valid until 2027-11-07).

### Ports (unchanged on every OS)

| Port | Use | Firewall |
|---|---|---|
| TCP 9443 | POS (`https://192.168.254.199:9443`, `https://kinesis.local:9443`) | open to the LAN |
| TCP 9444 | Admin console (`https://192.168.254.199:9444`) | open to the LAN (or only the owner's PC) |
| TCP 9080 | Device onboarding (CA certificate only, HTTP) | open to the LAN |
| UDP 5353 | mDNS (`kinesis.local`) | handled by the OS (Bonjour on macOS) |
| TCP 8000 / 5432 / 2019 | backend / PostgreSQL / Caddy admin API | **closed**: loopback only |

---

## 3. Per-OS reference

| | macOS (primary) | Windows (fallback) | Linux (reference) |
|---|---|---|---|
| `<CONFIG>` | `/Library/Application Support/Kinesis/config` | `C:\ProgramData\Kinesis\config` | `/etc/kinesis` |
| `<DATA>` | `/Library/Application Support/Kinesis` | `C:\ProgramData\Kinesis` | `/var/lib/kinesis` |
| `<CODE>` (backend + deploy) | `/Library/Application Support/Kinesis/app` | `C:\Program Files\Kinesis\app` | `/opt/kinesis` |
| Venv Python `<PY>` | `/Library/Application Support/Kinesis/venv/bin/python` | `C:\Program Files\Kinesis\venv\Scripts\python.exe` | `/opt/kinesis/venv/bin/python` |
| Web roots | `<DATA>/web/{pos,admin}` | `C:\Program Files\Kinesis\web\{pos,admin}` | `/opt/kinesis/web/{pos,admin}` |
| Config files | `caddy.macos.env`, `kinesis.macos.env.template` | `caddy.windows.env`, `kinesis.windows.env.template` | `caddy.env`, `kinesis.env.template` |
| Run as backend account | `sudo -u _kinesis` | elevated PowerShell (services run as LocalSystem) | `sudo -u kinesis` |
| Run as proxy account | `sudo -u _kinesisproxy` | elevated PowerShell | `sudo -u kinesis-proxy` |
| PostgreSQL tools | `/Library/PostgreSQL/18/bin` (set as `KINESIS_PG_BIN_DIR`) | `C:\Program Files\PostgreSQL\18\bin` | on `PATH` |
| `pg_hba.conf` / `postgresql.conf` | `/Library/PostgreSQL/18/data/` | `C:\Program Files\PostgreSQL\18\data\` | `/etc/postgresql/18/main/` |
| Start Kinesis | `sudo launchctl bootstrap system /Library/LaunchDaemons/local.kinesis.backend.plist`, then `…caddy.plist`, `…pki-renew.plist` | `Start-Service kinesis-backend, kinesis-caddy` | `sudo systemctl enable --now kinesis-backend kinesis-caddy kinesis-pki-renew.timer` |
| Stop Kinesis | `sudo launchctl bootout system/local.kinesis.caddy`, then `…backend` | `Stop-Service kinesis-caddy, kinesis-backend` | `sudo systemctl stop kinesis-caddy kinesis-backend` |
| Service status / logs | `sudo launchctl print system/local.kinesis.backend`; `<DATA>/logs/` | `Get-Service kinesis-*`; `<DATA>\logs\` | `systemctl status …`; `journalctl -u …` |
| Provisioning guide | section 5.1 | `deploy/services/windows/README.md` + section 5.2 | `deploy/install/linux/install-kinesis.sh` + section 5.3 |

In the commands below:

* `M` = `<run as backend account> <PY> <CODE>/deploy/migration/kinesis_migrate.py`
* `K` = `<run as proxy account> <PY> <CODE>/deploy/pki/kinesis_pki.py --pki-dir "<DATA>/pki"`

Quote every path that contains a space.

---

## 4. Phase 0: prerequisites

| # | Item | Who | Status |
|---|---|---|---|
| 0.1 | Release committed and tagged | owner | **Done:** `v1.4.1` on `release/v1.4.0` (merge and push still open) |
| 0.2 | Move the root CA key off Shimamura's internal disk: copy `~/kinesis-root-key/root-ca.key.enc` to two USB drives, verify one copy (0.3), then delete the internal copy | owner | open |
| 0.3 | `python3 deploy/pki/kinesis_pki.py --pki-dir ~/kinesis-local/pki verify-root-key --root-key /path/to/USB/root-ca.key.enc` (prompts; writes nothing). If the passphrase is lost, see section 9 | owner | open |
| 0.4 | Read-only baseline of the live database | | **Done:** 2026-11-08, `~/kinesis-migration/baseline-phase0-20261108.json` |
| 0.5 | **Host facts collected (section 1.1) and host chosen** | owner | open |
| 0.6 | Intel Mac only: produce and test the Intel lock file | developer | only if needed |
| 0.7 | Router admin access. Shimamura's Wi-Fi (`24:b2:b9:fd:74:e7`) holds `.199` today on a 24-hour DHCP lease | owner | open |
| 0.8 | Two USB drives (cutover transfer; offline root key) | owner | open |

## 5. Phase 1: provision the host [needs authorization]

No effect on Shimamura or the shop. The host keeps its own temporary
address until the cutover.

**Common to every OS**

1. Build the release on Shimamura:
   ```sh
   git archive --format=tar.gz -o kinesis-v1.4.1.tar.gz v1.4.1
   npx expo export -p web --output-dir /tmp/kinesis-web/pos
   npm --prefix admin run build -- --outDir /tmp/kinesis-web/admin --emptyOutDir
   python3 deploy/tools/check_web_build.py /tmp/kinesis-web/pos --caddyfile deploy/caddy/Caddyfile
   python3 deploy/tools/check_web_build.py /tmp/kinesis-web/admin --caddyfile deploy/caddy/Caddyfile
   ```
2. Create the venv from the lock files:
   ```sh
   <PY> -m pip install --require-hashes --only-binary :all: -r <CODE>/backend/requirements.lock
   <PY> -m pip install --require-hashes --only-binary :all: -r <CODE>/deploy/pki/requirements.lock
   ```
   On an Intel Mac, use the Intel lock from 0.6.
3. PostgreSQL 18:
   - Set `listen_addresses = 'localhost'` in `postgresql.conf`. Installers may default to all interfaces.
   - Keep only `scram-sha-256` lines for `127.0.0.1/32` and `::1/128` in `pg_hba.conf`.
   - Create the role and the empty database with a password prompt:
     `createuser -U postgres --pwprompt --no-superuser --no-createdb --no-createrole kinesis_app`
     and `createdb -U postgres --owner kinesis_app kinesis`.
4. Configuration from `deploy/config/shop/` for this OS:
   - Copy `caddy.<os>.env` to `<CONFIG>/caddy.env`.
   - Copy `kinesis.<os>.env.template` to `<CONFIG>/kinesis.env`.
   - Fill in the database password from step 3 and a new secret
     (`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`).
   - Readable only by the service accounts / Administrators.
5. Certificates (the owner copies the private keys by USB into
   `<DATA>/pki`, owned by the proxy account; keys mode 0600):
   ```sh
   $K renew --no-reload --reload-command "\"<caddy binary>\" reload --config \"<CODE>/deploy/caddy/Caddyfile\" --adapter caddyfile --force" --reload-env-file "<CONFIG>/caddy.env"
   $K verify --expect-ip 192.168.254.199 --expect-hostname kinesis.local
   $K export-ca --out "<DATA>/onboarding"
   ```
   `verify` must print the same root fingerprint as on Shimamura
   (`61:63:63:FB:…:6B:6A`). `renew` only records the reload command; the
   certificate is not due.
6. Preflight, which must report 0 failures:
   `<PY> <CODE>/deploy/migration/preflight.py --kinesis-env "<CONFIG>/kinesis.env" --caddy-env "<CONFIG>/caddy.env" --expect-ip 192.168.254.199`
7. Install the services, but **do not start them** before phase 2.

### 5.1 macOS specifics (primary)

1. Install, as an administrator:
   - PostgreSQL 18 (EDB installer from postgresql.org);
   - Python 3.13 (python.org installer);
   - Caddy (official macOS binary for the Mac's chip), copied to
     `/Library/Application Support/Kinesis/bin/caddy`. A binary downloaded
     with a browser is quarantined; remove that with
     `xattr -d com.apple.quarantine <file>`.
2. Hidden service accounts. Pick two unused IDs below 500; check with
   `dscl . -list /Users UniqueID`. For each of `_kinesis` and
   `_kinesisproxy`, create a group, then a user with `UserShell
   /usr/bin/false`, `NFSHomeDirectory /var/empty` and `IsHidden 1`
   (`dscl . -create …`). Confirm with `id _kinesis`.
3. Folders under `/Library/Application Support/Kinesis`:

   | Folder | Owner | Mode |
   |---|---|---|
   | `app`, `venv`, `bin`, `web` | root:wheel | 755 |
   | `config` | root:wheel | 755 |
   | `config/kinesis.env` | root:_kinesis | 640 |
   | `config/caddy.env` | root:_kinesisproxy | 640 |
   | `uploads` | _kinesis | 750 |
   | `backups` | _kinesis | 700 |
   | `pki` | _kinesisproxy | 700 |
   | `caddy` | _kinesisproxy | 700 |
   | `onboarding` | _kinesisproxy | 755 |
   | `logs` | root | 755 |

   Pre-create `logs/backend.log` (owned by `_kinesis`) and `logs/caddy.log`
   and `logs/pki-renew.log` (owned by `_kinesisproxy`).
4. Bonjour name: `sudo scutil --set LocalHostName kinesis`, so the Mac
   answers to `kinesis.local`.
5. Power, updates, network and firewall as in section 1.3. Allow Caddy:
   `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "/Library/Application Support/Kinesis/bin/caddy"`
   and `--unblockapp` with the same path.
6. Copy the three plists from `deploy/services/launchd` to
   `/Library/LaunchDaemons/` (root:wheel 644). Do not bootstrap them yet.
   Daemons start at boot without a login (FileVault caveat in 1.3).

### 5.2 Windows specifics (fallback)

Follow `deploy/services/windows/README.md`, which covers:

* ACL on `C:\ProgramData\Kinesis`;
* the venv from the lock files;
* WinSW (`<depend>postgresql-x64-18</depend>` must match `Get-Service postgresql*`);
* the Caddy service;
* the renewal task;
* firewall rules for 9443/9444/9080 on the Private profile;
* `powercfg`.

Additionally:

* Set the network profile to **Private**.
* Name the computer `kinesis`.
* Set Windows Update active hours to cover shop hours, and turn off
  Fast Startup.
* After the repair, verify disk health and run a memory test.

### 5.3 Linux (reference)

`deploy/install/linux/install-kinesis.sh` provisions Debian 13 / Ubuntu
24.04 (dry run unless `--apply`). It then follows the common steps, with
ufw allowing 9443, 9444 and 9080/tcp and 5353/udp from `192.168.254.0/24`.

## 6. Phase 2: rehearsal on the host [needs authorization]

Proves the whole path with a test dump while the shop keeps selling on
Shimamura.

1. On Shimamura:
   `backend/venv/bin/python deploy/migration/kinesis_migrate.py dump --env-file backend/.env.test --out-dir /tmp/rehearsal`
   (with authorization, a dump of `kinesis` may be used instead; dumping only reads).
2. On the host:
   - copy the dump and its `.sha256` into a folder the backend account can
     read;
   - `$M restore --env-file "<CONFIG>/kinesis.env" --allow-production --dump <file>.dump --confirm-database kinesis`;
   - start Kinesis (section 3).
3. From another LAN computer, using the host's temporary address while
   keeping the real names:
   `python3 smoke_test.py --caddy-env caddy.env --ca root-ca.crt --connect-ip <temporary-IP> --lan-ip <temporary-IP>`.
   Then, in a browser with a hosts entry `kinesis.local → <temporary-IP>`:
   - admin login;
   - pair a test terminal;
   - make a test sale;
   - create, download and restore a backup.
4. Restart the host and confirm Kinesis comes back with nobody logged in.
   On macOS with FileVault on, confirm what happens.
5. Time each step. Then stop Kinesis, drop and recreate the empty
   `kinesis` database, and remove the rehearsal uploads and backups.

## 7. Phase 3: cutover [needs authorization]

Downtime runs from step 3 to step 11. Expect roughly 20–40 minutes,
confirmed in the rehearsal. Choose a time when the shop is closed.

On **Shimamura** (`R` = repository root):

1. Announce the window. Admin → Terminals: maintenance mode on for every
   terminal. Sales, stock receipts and catalog edits are refused from then on.
2. Confirm on the Overview that the last sale happened before the freeze.
   The administrator makes no further edits.
3. Stop the development backend. Nothing can write from here on.
4. Final baseline, dump and uploads to USB:
   ```sh
   cd $R; PY=backend/venv/bin/python; MS=deploy/migration/kinesis_migrate.py; OUT=/path/to/USB/kinesis-cutover
   $PY $MS baseline --env-file backend/.env --allow-production --out $OUT/source.json
   $PY $MS dump --env-file backend/.env --allow-production --out-dir $OUT
   $PY $MS manifest backend/uploads --out $OUT/uploads.manifest.json
   cp -a backend/uploads $OUT/uploads
   ```

On the **host**:

5. Copy the cutover folder into a location the backend account can read
   (for example `<DATA>/cutover`, owned by the backend account), then:
   ```sh
   $M restore --env-file "<CONFIG>/kinesis.env" --allow-production --dump <C>/kinesis_*.dump --confirm-database kinesis
   $M baseline --env-file "<CONFIG>/kinesis.env" --allow-production --out <C>/target.json
   $M compare <C>/source.json <C>/target.json      # must print "Snapshots match"
   ```
6. Copy `<C>/uploads/` into `<DATA>/uploads/`, owned by the backend
   account, then `$M verify-manifest "<DATA>/uploads" <C>/uploads.manifest.json`.
7. Start Kinesis (section 3), then
   `<PY> <CODE>/deploy/migration/smoke_test.py --caddy-env "<CONFIG>/caddy.env" --ca "<DATA>/pki/root-ca.crt" --connect-ip 127.0.0.1`.
8. **Address handover** (router):
   - Remove `.199` from Shimamura's Wi-Fi (`24:b2:b9:fd:74:e7`).
   - Reserve `.199` for the host's **Ethernet** MAC. A Mac on Wi-Fi needs
     Private Wi-Fi Address set to Off.
   - On Shimamura, reconnect the Wi-Fi and confirm it no longer has `.199`.
   - Reconnect the host's network and confirm it shows `192.168.254.199`.
9. From a **different** LAN computer:
   `python3 smoke_test.py --caddy-env caddy.env --ca root-ca.crt --lan-ip 192.168.254.199`.
   All checks must pass, including ports 8000, 5432 and 2019 closed.
10. **Go / no-go.** If anything failed, roll back (section 8) now.
11. Admin → Terminals: maintenance mode **off**. The flag came over in
    the dump. Open the POS on one phone (still paired), log in as a cashier,
    and make one supervised sale.
12. First production backup from the admin console on a computer other
    than the host, copied to USB. Delete `<C>` afterwards; it holds a full
    copy of the shop's data.

## 8. Rollback

| When | What to do | Data impact |
|---|---|---|
| Before step 8 | Stop Kinesis on the host. Start the dev backend on Shimamura. Turn maintenance off. | None. Shimamura's database was only read. |
| Steps 8–10 (no sales on the host yet) | Stop Kinesis on the host. Give `.199` back to Shimamura's Wi-Fi in the router and renew both leases. Start the dev backend. Turn maintenance off. | None. |
| After step 11 (sales on the host) | Prefer fixing forward. To go back: maintenance on; `kinesis_migrate.py dump` on the host; restore into a **new empty** database on Shimamura; compare baselines; copy new upload files back; then hand `.199` back as above. | None if done in this order. Never let two copies sell at the same time. |

Shimamura's `kinesis` database must stay untouched for at least two weeks
after the cutover.

## 9. Root CA key

* It is at `~/kinesis-root-key/root-ca.key.enc` on Shimamura's internal
  disk: encrypted PKCS#8, mode 0600, created on 2026-11-07. Phase 0.2
  moves it to USB.
* It is **not needed** for this migration. The issuing CA key renews the
  server certificate and can re-issue for new private addresses.
* It **is** needed every 5 years, to replace the issuing CA
  (`rotate-intermediate`), or after a compromise.
* **If the passphrase is lost:** nothing breaks now; the issuing CA is
  valid until 2031-11. Before then, a new CA must be created and every
  device must trust it once. Plan that as its own task.

## 10. Tools

| Tool | Purpose |
|---|---|
| `deploy/migration/kinesis_migrate.py` | `baseline`, `compare`, `dump`, `restore` (empty database only), `manifest`, `verify-manifest`. Any OS (backend venv). |
| `deploy/migration/preflight.py` | Offline config check: origins vs. sites, certificate names, production flags, placeholders, permissions, web roots. |
| `deploy/migration/smoke_test.py` | Read-only network check (standard library only; any OS). |
| `deploy/pki/kinesis_pki.py verify` / `verify-root-key` | Read-only certificate chain and key checks. |
| `deploy/install/linux/install-kinesis.sh` | Linux provisioning only (dry run unless `--apply`). |
