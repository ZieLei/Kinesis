# Kinesis on Arch Linux (primary host)

Arch Linux is the primary Kinesis host platform. This guide covers the
owner's laptop (Acer Nitro V15, i5-13420H, 16 GB, x86_64) and any other
x86_64 or aarch64 Arch machine. The application, Caddyfile, ports, origins,
certificates and database schema are the same as on macOS and Windows
([ARCHITECTURE.md](ARCHITECTURE.md)).

**No GPU is used.** Kinesis needs no NVIDIA driver, CUDA or GPU library. The
RTX 4050 can stay on whatever driver the desktop uses.

## 1. Two layouts, one installer

`deploy/install/linux/install-kinesis.sh` installs either layout. It is a
dry run unless `--apply` is given, and it is idempotent: re-run it to update.

| | `--scope user` (owner's laptop, no root) | `--scope system` (dedicated host, sudo) |
|---|---|---|
| Runs as | the owner's account, `systemd --user`, started at boot by lingering | `kinesis` (backend) and `kinesis-proxy` (Caddy, certificates) |
| Code, venvs, web apps | `~/.local/lib/kinesis/` | `/opt/kinesis/` |
| Configuration | `~/.config/kinesis/` (`kinesis.env`, `caddy.env` 0600) | `/etc/kinesis/` (0640, per account) |
| Data | `~/.local/share/kinesis-host/` | `/var/lib/kinesis/` |
| PostgreSQL 18 | Kinesis-owned cluster `<DATA>/postgres` on `127.0.0.1:5433` (`kinesis-postgresql.service`) | Arch's `postgresql.service`, `/var/lib/postgres/data`, `127.0.0.1:5432` |
| Units | `~/.config/systemd/user/kinesis*.{service,timer,target}` | `/etc/systemd/system/kinesis*` |
| Key separation | Sandbox only (private home, hidden runtime dir). Same account. | Separate accounts: the backend cannot read TLS keys |
| `kinesisctl` | `~/.local/bin/kinesisctl` | `/usr/local/bin/kinesisctl` |

**Why the laptop uses user scope.** Without root you can't add a database to
the system PostgreSQL that holds the development database, add accounts,
or install system units. User scope needs none of that and is still a
persistent, boot-started service set. Use system scope when a machine is
dedicated to Kinesis.

**Why port 5433 on the laptop.** `127.0.0.1:5432` belongs to Arch's
`postgresql.service`, which holds the development `kinesis` database.
Kinesis never touches that cluster in user scope.

**Why `~/.local/share/kinesis-host` and not `~/.local/share/kinesis`.** The
latter is the development backend's default backup folder
(`backend/database_routes.py`) and holds dumps of the real shop database.
The installer refuses to use a non-empty data folder it did not create.

## 2. Install (laptop, user scope)

Prerequisites, once (Arch packages; no AUR):

```sh
sudo pacman -S --needed postgresql caddy python uv nodejs npm
npm ci && npm --prefix admin ci          # only to build the web apps here
```

`uv` provides a private CPython 3.14 for the venvs (`--python managed`, the
default). A `pacman -Syu` that moves the system Python to 3.15 would otherwise
break every venv at the next restart. `rsync` is not needed.

Install, build the web apps and reuse the existing certificates in place
(keys are not copied or moved):

```sh
deploy/install/linux/install-kinesis.sh --scope user --build-web \
    --pki-dir ~/kinesis-local/pki --mdns            # dry run: read it
deploy/install/linux/install-kinesis.sh --scope user --build-web \
    --pki-dir ~/kinesis-local/pki --mdns --apply --start
kinesisctl create-admin <username>                  # first administrator
kinesisctl enable                                   # start at every boot
```

`--db-name` / `--db-user` choose the database (default `kinesis` /
`kinesis_app`). This laptop's current installation uses the **test**
database `kinesis_arch_test` (role `kinesis_arch_app`). See section 8.

What `--apply` does, in order:

1. Checks the host: Arch or Debian/Ubuntu, x86_64/aarch64, at least 4 GB RAM
   (8 recommended) and 10 GB free (20 recommended). Checks that the ports are
   free; if one is taken, it names the owner and stops. It never kills a
   process.
2. Checks PostgreSQL 18 and Caddy 2.8+. Warns if `postgresql` is not in
   pacman's `IgnorePkg` (section 6).
3. Copies `backend/` and `deploy/` (tar, swapped in atomically), and the
   prebuilt POS and admin apps, checked with `deploy/tools/check_web_build.py`.
4. Builds three venvs from hash-locked wheels (`--require-hashes --only-binary
   :all:`). Each is rebuilt only when its lock or interpreter changes, so
   code-only updates work offline:
   - `venv`: the backend; it contains **no** `cryptography`;
   - `pki-venv`: certificate tooling (`cryptography` 50.0.2, OpenSSL 4.0.3);
   - `mdns-venv`: optional `kinesis.local` responder.
5. Writes `kinesis.env` / `caddy.env` from `deploy/config/shop/` with
   generated secrets (mode 0600). Existing files are kept, never regenerated.
6. Links or copies the PKI, regenerates the onboarding files, and verifies
   the chain, keys and names.
7. Renders and enables the units into `kinesis.target`, and installs `kinesisctl`.
8. Creates the cluster (`initdb --locale=C.UTF-8 --encoding=UTF8`, data
   checksums, peer auth on the socket, scram-sha-256 on TCP). Creates the
   role (password sent as a SCRAM verifier only) and the database. On a new,
   empty database it runs `alembic upgrade head`. Existing databases are
   never altered; use `kinesisctl migrate`.
9. Runs `preflight.py`.

## 3. Operate

```sh
kinesisctl start          # postgresql -> backend -> caddy (+ renew timer, awake, mdns)
kinesisctl stop           # waits until every service has stopped
kinesisctl restart
kinesisctl status         # service states + live HTTPS / WSS-path / backend checks
kinesisctl logs -f        # all units; or: kinesisctl logs backend caddy postgresql
kinesisctl doctor         # config, certificates, PG version vs data, venv, ports, power
kinesisctl urls           # addresses and CA fingerprint for devices
kinesisctl enable|disable # start at boot without a login
kinesisctl migrate --yes  # dump to <DATA>/backups/pre-migrate-*, upgrade, restart backend
kinesisctl smoke          # read-only network checks (deploy/migration/smoke_test.py)
```

Services (user scope; system scope has the same names without
`kinesis-postgresql`):

| Unit | Role | Restart |
|---|---|---|
| `kinesis.target` | groups everything; `enable` = start at boot | |
| `kinesis-postgresql.service` | PostgreSQL 18, `127.0.0.1:5433` | on failure; refuses a data directory from another major version |
| `kinesis-backend.service` | uvicorn `127.0.0.1:8000`, 1 worker | on failure, 3 s; graceful 20 s stop |
| `kinesis-caddy.service` | HTTPS 9443/9444, onboarding 9080, redirect 9081; admin API on a Unix socket | on failure, 3 s; `reload` without downtime |
| `kinesis-pki-renew.timer` | daily 03:30 renewal check, then graceful Caddy reload | |
| `kinesis-awake.service` | blocks sleep, idle suspend and lid-close suspend while Kinesis runs | |
| `kinesis-mdns.service` | answers `kinesis.local` on every LAN interface in `192.168.254.0/24` (Wi-Fi, Ethernet or both); follows interfaces as they come and go, waits while none is up | on failure, 10 s (a missing interface is not a failure) |

Logs are in the journal (`journalctl --user -u kinesis-backend`, rotated
by journald).

## 4. Addresses

| | URL |
|---|---|
| POS (canonical) | **`https://kinesis.local:9443`**, over Wi-Fi or Ethernet |
| Admin (canonical) | **`https://kinesis.local:9444`** |
| Migration fallback | `https://192.168.254.199:9443` (POS), `:9444` (admin): only while the laptop holds `.199` |
| Onboarding (CA certificate) | `http://<any laptop address>:9080`, e.g. `http://192.168.254.199:9080` or `http://192.168.254.134:9080` (`kinesisctl urls` lists them) |
| Backend / PostgreSQL / Caddy admin | `127.0.0.1:8000` / `127.0.0.1:5433` / Unix socket: never on the LAN |

Root CA fingerprint: `61:63:63:FB:DE:8E:21:5E:E5:53:F9:4E:BE:70:12:99:81:FD:B6:72:DA:24:93:C1:1C:9F:97:F4:6D:EF:6B:6A`.
Phones that already trust this CA need nothing new.

### Wi-Fi, Ethernet or both

`kinesis.local` does not depend on one address. `kinesis-mdns` advertises
every laptop address inside `192.168.254.0/24` (today `wlan0` =
`192.168.254.199` and `enp63s0` = `192.168.254.134`), on each of those
interfaces separately, and updates within a few seconds when one drops,
returns or changes address. With no interface up it waits instead of
exiting. Caddy listens on all interfaces and picks the site by host name,
and the certificate already covers `kinesis.local`: nothing is tied to
`.199` any more except the fallback entries.

`kinesisctl status` checks HTTPS, onboarding and an mDNS query **through
each interface**; `kinesisctl urls` lists what is advertised where.

The router must forward multicast between its Wi-Fi and wired ports (most
home routers do; "AP/client isolation" or multicast filtering breaks it).
Test once: with the laptop on Ethernet only, a phone on Wi-Fi must still
open `https://kinesis.local:9443`.

### Opening kinesis.local on the laptop itself

Phones and other computers look `.local` names up over mDNS themselves.
The laptop does not: its resolver (`/etc/nsswitch.conf`) has no mDNS client
(no `nss-mdns`, `systemd-resolved` inactive). Its own browser therefore
needs one line in `/etc/hosts`, pointing at loopback, which works on
Wi-Fi, Ethernet or no network at all (Caddy also listens on 127.0.0.1, and
the certificate and allowed origins already cover `kinesis.local`):

```sh
echo '127.0.0.1 kinesis.local' | sudo tee -a /etc/hosts
```

`kinesisctl doctor` warns while it is missing. Do not enable Avahi or
`systemd-resolved` mDNS for this: they would add a second responder on
UDP 5353 next to `kinesis-mdns`.

### Moving terminals to kinesis.local (once per terminal)

A terminal's pairing is stored in cookies that belong to the exact host
name it was paired under. A phone paired at `https://192.168.254.199:9443`
keeps working there (the fallback stays until a separate, explicitly
approved change retires it), but it has to pair once more after switching
to `https://kinesis.local:9443`. From then on it stays paired whichever
interface the laptop uses.

## 5. Security notes

* **Caddy admin API.** It used to listen on `localhost:2019`, where any local
  process could load a config that serves the TLS key folder. It now listens
  on `$XDG_RUNTIME_DIR/kinesis-caddy/admin.sock` (user scope) or
  `/run/kinesis-caddy/admin.sock` (system scope), mode 0600 in a 0700
  directory (`KINESIS_CADDY_ADMIN` in `caddy.env`).
* **User-scope sandbox.** Each unit sees an empty tmpfs instead of the home
  directory, plus only what it needs:
  - backend: its code (read-only), `kinesis.env`, `uploads/` and `backups/`;
  - Caddy: web apps, `pki/` and its own state.

  The runtime directory, which holds the systemd/D-Bus sockets, the
  PostgreSQL superuser socket and the Caddy admin socket, is hidden from
  every service that does not need it. All units still run as the owner's
  account, so a process the owner starts outside Kinesis can read Kinesis
  files. System scope removes that limitation.
* **PostgreSQL** listens on `127.0.0.1` only. The superuser (the owner's
  account) can log in only by peer authentication on the hidden socket; the
  application role needs its SCRAM password over TCP.

## 6. Arch rolling-release care

**PostgreSQL major upgrades.** Arch ships a new PostgreSQL major in a normal
`pacman -Syu`. Kinesis then refuses to start the old data directory
(`postgresql-check-db-dir`), and `kinesisctl doctor` reports the mismatch.
Recommended: hold it in `/etc/pacman.conf`:

```
IgnorePkg = postgresql postgresql-libs
```

Upgrade deliberately, after closing time:

1. `kinesisctl stop`. Make an admin-console backup first, or run
   `kinesisctl migrate`'s dump: `deploy/migration/kinesis_migrate.py dump`.
2. `sudo pacman -S postgresql postgresql-libs postgresql-old-upgrade`.
3. Move the cluster aside, then initialise a new one and run pg_upgrade
   (user scope shown; system scope runs these as `postgres` in
   `/var/lib/postgres`):
   ```sh
   D=~/.local/share/kinesis-host
   mv $D/postgres $D/postgres-old
   initdb -D $D/postgres --username="$USER" --locale=C.UTF-8 --encoding=UTF8 \
          --auth-local=peer --auth-host=scram-sha-256
   pg_upgrade -b /opt/pgsql-<OLD>/bin -B /usr/bin -d $D/postgres-old -D $D/postgres -U "$USER"
   ```
4. Re-run the installer (it expects the new major, so update `PG_MAJOR` in
   the installer and units if Kinesis moves to that major), then
   `kinesisctl start` and `kinesisctl doctor`.

Every Kinesis host should run the same PostgreSQL major, so that dumps
restore everywhere. The supported major is 18.

**Python.** The venvs use the private CPython in `<CODE>/python` (uv), so a
system Python upgrade has no effect. To pick up CPython patch releases,
re-run the installer. With `--python system`, re-run the installer after
any Python minor upgrade.

**Caddy** (2.11 today) is used from Arch's package. A Caddy upgrade restarts
nothing by itself; `kinesisctl restart` afterwards.

## 7. Devices, firewall, power

* **Phones**: [README-tls.md](../../deploy/README-tls.md), section 2.
  `kinesis.local` is answered by `kinesis-mdns`; Avahi is not needed and
  remains disabled. If Avahi is enabled later, both can share UDP 5353.
* **Firewall**: none is active on the laptop today. If you enable `nftables`,
  `ufw` or `firewalld`, allow TCP 9443, 9444 and 9080 (and 9081 for the
  redirect) plus UDP 5353 from `192.168.254.0/24` only, on **both** `wlan0`
  and `enp63s0`. Never open 8000, 5432, 5433 or 2019.
* **Power**: `kinesis-awake` blocks suspend while Kinesis runs, including
  when the lid is closed. Keep the laptop on mains power. Hyprland/idle
  daemons can still blank the screen.
* **Clock**: no NTP without internet. Check the clock occasionally
  (`timedatectl`).

## 8. The laptop's current installation (2026-11-08)

* User scope, `kinesis_arch_test` database (synthetic data only) in the
  Kinesis-owned cluster on port 5433. The development `kinesis` database in
  Arch's `postgresql.service` (5432) was not read or changed, and neither
  were `backend/uploads/`, the dev backups or `~/kinesis-local/pki`.
* **Cutover** (serving the real shop data) is a separate, authorized step:
  1. Stop the dev backend.
  2. Run `kinesis_migrate.py dump` from the dev database, then `restore` into
     a new, empty `kinesis` database in the Kinesis cluster.
  3. Point `~/.config/kinesis/kinesis.env` at it.
  4. Copy `backend/uploads/{products,gcash}` to
     `~/.local/share/kinesis-host/uploads/`.
  5. Run `kinesisctl restart`.

  Follow [MIGRATION.md](MIGRATION.md) sections 7–8 for checks and rollback.
* Before cutover, do not leave Kinesis running on the shop ports when the
  dev Caddy/backend should serve them: both use 8000 and 9443/9444/9080.
  `kinesisctl stop` frees them.
