# Kinesis host deployment architecture

Kinesis runs on one computer in the shop. It serves phones, tablets and PCs
on the shop's LAN, with **no internet connection required**.

Supported hosts, in order of priority:
1. **Arch Linux** (primary; the owner's laptop): [ARCH-LINUX.md](ARCH-LINUX.md).
2. **macOS 13+**, Apple silicon, or Intel with a documented exception:
   [MIGRATION.md](MIGRATION.md) section 1.4.
3. Debian 13 / Ubuntu 24.04, and Windows 10/11 x64 (existing support, not extended).

One operator command on every Linux and macOS host: `kinesisctl`
(`start | stop | status | logs | doctor`).

This document is the recommended architecture. It is not an installer.
Templates live in `deploy/`.
To move an existing installation to a dedicated shop PC, follow
[MIGRATION.md](MIGRATION.md).

```
 iPhone Safari / PWA ─┐                       ┌──────────── Host (Linux | macOS | Windows) ───────────┐
 Android Chrome/app ──┼── https / wss ─▶ :443 │ Caddy (one static binary)                             │
 iOS app / PCs ───────┘   kinesis.local       │   TLS certs from kinesis-pki · security headers       │
                                              │   POS web build (static) · POS-only API paths ──────┐ │
 Admin browser ────────── https ───────▶ :8443│   Admin build (static) · full API ──────────────────┤ │
 New device ──────────── http ───────▶ IP:8080│   CA certificate + instructions only                │ │
                                              │ uvicorn/FastAPI 127.0.0.1:8000 (1 worker) ◀─────────┘ │
                                              │ PostgreSQL 127.0.0.1:5432 (OS service)                │
                                              │ kinesis-pki (cert issue/renew) · kinesis-mdns (opt.)  │
                                              └───────────────────────────────────────────────────────┘
```

## Components

| Concern | Choice | Notes |
|---|---|---|
| HTTPS/WSS | **Caddy v2** (`deploy/caddy/Caddyfile`) | Single binary for all three OSes (amd64/arm64). Native Windows service support. Proxies WebSockets. Public certificate automation is disabled (`auto_https disable_certs`). Ports 80 and 443 are configurable for testing. |
| Certificates | **`deploy/pki/kinesis_pki.py`** (pyca `cryptography`) | Name-constrained root (key kept offline) → issuing CA → 365-day server cert, renewed automatically. See `deploy/README-tls.md`. Runs from its own venv (`pki-venv`): the backend venv contains no `cryptography`, enforced by `deploy/tests/test_dependency_boundary.py`. |
| Caddy admin API | Unix socket, `KINESIS_CADDY_ADMIN` | Only the proxy account can reach it (`/run/kinesis-caddy`, `$XDG_RUNTIME_DIR/kinesis-caddy` or `<DATA>/caddy` on macOS). A TCP admin port would let any local account make Caddy serve the TLS keys. Windows keeps `localhost:2019`. |
| Backend | uvicorn: `--host 127.0.0.1 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1 --timeout-graceful-shutdown 20` | One worker, because settings WebSockets, backup locking and console sessions are per-process. Loopback only, so the LAN can't bypass TLS. Proxy headers give the real client IP for lockouts and audit records, trusted only from Caddy. |
| Database | PostgreSQL **18** on every host: Arch `postgresql` package (system `postgresql.service`, or a Kinesis-owned cluster on 127.0.0.1:5433 in user scope), PGDG packages (Debian/Ubuntu), EDB installer (macOS/Windows) | Boot-time service, persistent data directory, matching `pg_dump`/`pg_restore`. Loopback only. The installers create the role (SCRAM verifier, password never on a command line) and the database, and the schema only for a new, empty database. |
| Web apps | Built ahead of time: `npx expo export -p web`, `npm --prefix admin run build` | Hosts receive static files; Node.js is not needed on the server. Check each build with `deploy/tools/check_web_build.py`. |
| Services | systemd system units (`deploy/services/systemd`), systemd user units with lingering (`deploy/services/systemd-user`), launchd (`deploy/services/launchd`), WinSW + `sc.exe` + Task Scheduler (`deploy/services/windows`) | Start at boot without a login, restart on failure, stop gracefully (uvicorn logs "Application shutdown complete"). systemd hosts group everything in `kinesis.target`. `kinesis-awake` blocks sleep and lid-close suspend while Kinesis runs. |
| Python runtime | Linux: private CPython 3.14 from `uv` (default) or the system Python; macOS: python.org 3.13 universal2 | On Arch, a `pacman -Syu` to a new Python minor version would break venvs built on `/usr/bin/python3`; the private runtime is unaffected. |
| Name resolution | Certificate covers `kinesis.local`, `<computer-name>.local` and the LAN IP | iPhones/iPads/Macs resolve `.local` via Bonjour on any host OS. Android 12+ resolves `.local` in the system resolver; older devices use the IP. |
| `kinesis.local` | `deploy/mdns/kinesis_mdns.py` (python-zeroconf), **spike** | Windows only advertises its computer name, and Avahi/Bonjour need OS-specific setup. Verified on Linux (no Avahi): answers A queries. **Still to test**: coexistence with Avahi, Bonjour and the Windows mDNS responder on UDP 5353. Fallback: `<computer-name>.local` or the IP. |
| Docker | Optional, Linux only | Docker Desktop on Windows/macOS runs a VM. LAN multicast (mDNS) doesn't reach containers, it needs extra RAM, and it has licence terms. Not recommended for shop owners. |

## Data and configuration (separate from code)

All deployment-specific values live in one directory **outside the
repository**. The backend finds its settings file through `KINESIS_ENV_FILE`,
which the service definition sets. Relative data paths resolve against
`KINESIS_DATA_DIR`, never the working directory (Windows services start in
`System32`).

| | Linux system scope | Linux user scope (Arch laptop) | macOS | Windows |
|---|---|---|---|---|
| Code + venvs | `/opt/kinesis/` | `~/.local/lib/kinesis/` | `/Library/Application Support/Kinesis/{app,venv,pki-venv}` | `C:\Program Files\Kinesis\` |
| Config (`kinesis.env`, `caddy.env`, `install.conf`) | `/etc/kinesis/` | `~/.config/kinesis/` | `/Library/Application Support/Kinesis/config/` | `C:\ProgramData\Kinesis\config\` |
| Data (`pki/`, `onboarding/`, `uploads/`, `backups/`) | `/var/lib/kinesis/` | `~/.local/share/kinesis-host/` (+ `postgres/`) | `/Library/Application Support/Kinesis/` (+ `logs/`) | `C:\ProgramData\Kinesis\` |
| Logs | journal | journal (`journalctl --user`) | `<DATA>/logs/*.log` | `<DATA>\logs\` |
| Access control | `kinesis` (backend) and `kinesis-proxy` (Caddy + PKI) accounts | one account; systemd sandbox (private home, hidden runtime dir) | `_kinesis` / `_kinesisproxy` | ACL: SYSTEM + Administrators |

Templates: `deploy/config/kinesis.env.example`, `deploy/config/caddy.env.example`.

The backend account can't read TLS keys. The proxy account can't read the
database password.

## OS-specific assumptions found, and what changed

| Location | Problem | Status |
|---|---|---|
| `backend/database.py`, `database_routes.py` `env_file=".env"` | Relative to the working directory; differed from other settings | **Fixed**: `backend/config_paths.py` (`KINESIS_ENV_FILE`, else `backend/.env`) |
| `main.py`, `settings_routes.py` upload folders via `os.getenv` | Relative to the working directory; ignored `.env` | **Fixed**: resolved against `KINESIS_DATA_DIR` |
| `database_routes.py` `os.fchmod` | Not available on Windows before Python 3.13 | **Fixed**: portable helpers (`create_private_file`, `restrict_to_owner`) |
| `database_routes.py` default backups `~/.local/share/kinesis/backups` | Linux path on Windows | **Fixed**: `<DATA_DIR>/backups` in production; `%LOCALAPPDATA%\Kinesis\backups` on Windows (dev); Linux/macOS dev path unchanged |
| `database_routes.py` `shutil.which("pg_dump")` | PostgreSQL `bin` isn't on PATH on Windows/macOS | **Fixed**: `KINESIS_PG_BIN_DIR` |
| `database_routes.py` `subprocess.run(text=True)` | Windows locale codepage | **Fixed**: UTF-8 with replacement |
| `chmod 0700/0600` on backups | No effect on Windows | Documented: data-directory ACL |
| README `uvicorn --reload --host 0.0.0.0` | Development flags, exposes the API on the LAN | Development only; production uses the service templates |
| Single process assumed (`threading.Lock`, in-memory WebSocket registry) | Breaks with several workers | Documented: `--workers 1` |
| Caddy admin API on `localhost:2019` | Any local account could reconfigure Caddy and read the TLS keys through it | **Fixed**: Unix socket reachable only by the proxy account (`KINESIS_CADDY_ADMIN`); Windows unchanged |
| PKI library in the backend venv | The backend venv carried `cryptography` (and its OpenSSL) without using it | **Fixed**: separate `pki-venv` on Linux and macOS; guard test |
| Arch rolling upgrades | A new Python minor breaks venvs; a new PostgreSQL major leaves the data directory unstartable | **Fixed/guarded**: private CPython via uv; `postgresql-check-db-dir` before start; `kinesisctl doctor`; `IgnorePkg` recommended |
| Dev backup folder `~/.local/share/kinesis/backups` | A user-scope host data folder there would mix dev dumps into the host's restore list | **Fixed**: user-scope data in `~/.local/share/kinesis-host`; installer refuses foreign non-empty data folders |
| Python version not pinned | Wheel availability differs by OS | **Fixed**: hash-locked `backend/requirements.lock` and `deploy/pki/requirements.lock`, tested on Python 3.12–3.14; prebuilt wheels for Linux x86-64/arm64, Windows x64 and Apple-silicon macOS; Intel macOS uses `requirements-macos-intel.lock` (both selected automatically by `deploy/install/macos/install-kinesis.sh`). `tzdata` added for Windows. |

No other OS coupling was found. The app code uses no signals, `fcntl`/`pwd`,
or hard-coded `/tmp` or `/etc` paths, and the console is an allow-listed
diagnostic tool with no shell.

## Operations

### Startup and shutdown order
PostgreSQL → backend → Caddy. Each template declares the dependency. Stop
in reverse order; uvicorn drains requests for up to 20 seconds.

### Updates
1. Stop the backend.
2. Back up (below).
3. Replace the code and web builds.
4. Run `KINESIS_ENV_FILE=… alembic upgrade head` from `backend/`.
5. Start the backend.

Migrations are deliberately **not** run automatically at service start.

### Backups (what to copy off the host)
How the current manual backup and restore work, and how to keep an
off-host copy: [BACKUPS.md](BACKUPS.md).

- **Database**: the admin console's backup (`pg_dump` custom format) into
  `<DATA_DIR>/backups`. **Recommended next step**: a scheduled daily backup.
  Today, backups are only made on demand.
- **Uploads**: `<DATA_DIR>/uploads/` (product images, GCash QR). These are
  **not** inside the database dump.
- **Configuration and certificates**: `<DATA_DIR>/config/`, plus
  `<DATA_DIR>/pki/` (issuing CA and server certificate). Restoring these
  means no device needs to be onboarded again.
- Copy all of the above to a USB drive or NAS regularly. One computer is a
  single point of failure. Keep the **root key USB separate** from the
  backups.

### Recovery on a new computer
1. Install PostgreSQL, Python and Caddy.
2. Restore `config/`, `pki/` and `uploads/`.
3. Create the database and restore the dump with `pg_restore`.
4. Run `alembic upgrade head`.
5. Install the services.
6. Keep the same LAN address (DHCP reservation), or run `renew --ip`.

Devices keep working because the root CA is unchanged.

### Power and clock
- Laptops: disable sleep on mains power (`powercfg`, Energy Saver, or
  `systemd-inhibit`/logind settings).
- With no internet there is no NTP. Check the host clock occasionally.
  Certificates are backdated one hour and valid for a year, so small drift is
  harmless. A wrong clock does affect session expiry and receipts.

### Firewall
Open the ports configured in `caddy.env`: every POS and admin site port,
the onboarding port, optionally `KINESIS_HTTP_PORT`, and UDP 5353 (mDNS).
The template defaults are 443, 8443, 8080 and 80. The shop uses 9443,
9444 and 9080 (`docs/deployment/MIGRATION.md`). Open them on the
**private** network profile only. Never open 8000 (backend) or 5432
(PostgreSQL). See `deploy/services/windows/README.md` for Windows commands.
On macOS, allow Caddy in the application firewall. On Linux, use
`ufw`/`firewalld`.

## Verification per host OS

`kinesisctl status` and `kinesisctl doctor` cover most of the list below on
Linux and macOS. `deploy/tools/e2e_sale_check.py` drives a full sale over
HTTPS against a `*_test` database.

1. Install the services. Reboot, and confirm they all start without anyone
   logging in.
2. Kill the backend process and confirm it restarts.
3. Stop the service and confirm the log shows a graceful shutdown.
4. Make an admin backup and restore with `KINESIS_PG_BIN_DIR` set
   (Windows/macOS).
5. `kinesis_pki.py renew --force`, then confirm the browser shows the new
   certificate without a Caddy restart.
6. From an iPhone: `https://kinesis.local` (with the mDNS responder running),
   then `https://<computer-name>.local`, then `https://<IP>`.
7. Run `python deploy/tools/check_web_build.py <dist> --caddyfile deploy/caddy/Caddyfile`.
