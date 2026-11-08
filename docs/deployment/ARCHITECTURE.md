# Kinesis host deployment architecture

Kinesis runs on one computer in the shop (Linux, macOS or Windows; often an
existing laptop or desktop). It serves phones, tablets and PCs on the shop's
LAN, with **no internet connection required**.

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
| Certificates | **`deploy/pki/kinesis_pki.py`** (pyca `cryptography`) | Name-constrained root (key kept offline) → issuing CA → 365-day server cert, renewed automatically. See `deploy/README-tls.md`. |
| Backend | uvicorn: `--host 127.0.0.1 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1 --timeout-graceful-shutdown 20` | One worker, because settings WebSockets, backup locking and console sessions are per-process. Loopback only, so the LAN can't bypass TLS. Proxy headers give the real client IP for lockouts and audit records, trusted only from Caddy. |
| Database | Official PostgreSQL for each OS: EDB installer (Windows/macOS) or Postgres.app; distro packages (Linux) | Gives a boot-time service, a persistent data directory, and matching `pg_dump`/`pg_restore`. Listen on `localhost` only. |
| Web apps | Built ahead of time: `npx expo export -p web`, `npm --prefix admin run build` | Hosts receive static files; Node.js is not needed on the server. Check each build with `deploy/tools/check_web_build.py`. |
| Services | systemd (`deploy/services/systemd`), launchd (`deploy/services/launchd`), WinSW + `sc.exe` + Task Scheduler (`deploy/services/windows`) | Start at boot without a login, restart on failure, stop gracefully (uvicorn logs "Application shutdown complete"). |
| Name resolution | Certificate covers `kinesis.local`, `<computer-name>.local` and the LAN IP | iPhones/iPads/Macs resolve `.local` via Bonjour on any host OS. Android 12+ resolves `.local` in the system resolver; older devices use the IP. |
| `kinesis.local` | `deploy/mdns/kinesis_mdns.py` (python-zeroconf), **spike** | Windows only advertises its computer name, and Avahi/Bonjour need OS-specific setup. Verified on Linux (no Avahi): answers A queries. **Still to test**: coexistence with Avahi, Bonjour and the Windows mDNS responder on UDP 5353. Fallback: `<computer-name>.local` or the IP. |
| Docker | Optional, Linux only | Docker Desktop on Windows/macOS runs a VM. LAN multicast (mDNS) doesn't reach containers, it needs extra RAM, and it has licence terms. Not recommended for shop owners. |

## Data and configuration (separate from code)

All deployment-specific values live in one directory **outside the
repository**. The backend finds its settings file through `KINESIS_ENV_FILE`,
which the service definition sets. Relative data paths resolve against
`KINESIS_DATA_DIR`, never the working directory (Windows services start in
`System32`).

| | Linux | macOS | Windows |
|---|---|---|---|
| Config (`kinesis.env`, `caddy.env`) | `/etc/kinesis/` | `/Library/Application Support/Kinesis/config/` | `C:\ProgramData\Kinesis\config\` |
| Data (`pki/`, `onboarding/`, `uploads/`, `backups/`, `logs/`) | `/var/lib/kinesis/` | `/Library/Application Support/Kinesis/` | `C:\ProgramData\Kinesis\` |
| Access control | Owner/group modes; `kinesis` (backend) and `kinesis-proxy` (Caddy + PKI) users | Same, with `_kinesis` / `_kinesisproxy` | ACL: SYSTEM + Administrators (`icacls`; `chmod` has no effect) |

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
Open TCP 80, 443, 8443 (HTTPS), TCP 8080 (onboarding) and UDP 5353 (mDNS)
on the **private** network profile only. Never open 8000 (backend) or 5432
(PostgreSQL). See `deploy/services/windows/README.md` for Windows commands.
On macOS, allow Caddy in the application firewall. On Linux, use
`ufw`/`firewalld`.

## Verification per host OS

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
