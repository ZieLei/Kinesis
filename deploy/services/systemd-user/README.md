# systemd user units (single-user host, no root)

Templates for `deploy/install/linux/install-kinesis.sh --scope user`, which
fills in the `@PLACEHOLDERS@` and installs them into
`~/.config/systemd/user/`. They run Kinesis as the logged-in account under
the user's own systemd manager; with lingering enabled
(`loginctl enable-linger`) they start at boot without anyone logging in.

Use the system units in `../systemd/` (`--scope system`) on a dedicated host:
they add separate `kinesis` and `kinesis-proxy` accounts, so the backend
cannot read the TLS keys even if it is compromised. In user scope every
service runs as the same account, and the separation comes only from the
sandbox settings below (private home, hidden runtime directory, read-only
code), which is weaker.

| Unit | Purpose |
|---|---|
| `kinesis.target` | Starts/stops everything (`kinesisctl start`, `kinesisctl stop`) |
| `kinesis-postgresql.service` | PostgreSQL 18 cluster owned by this account in `<DATA>/postgres`, `127.0.0.1:<port>` only (installed with `--pg own`) |
| `kinesis-backend.service` | uvicorn/FastAPI on `127.0.0.1:8000` |
| `kinesis-caddy.service` | HTTPS/WSS; admin API on `$XDG_RUNTIME_DIR/kinesis-caddy/admin.sock` |
| `kinesis-pki-renew.timer` | Daily certificate renewal check, then a graceful Caddy reload |
| `kinesis-awake.service` | Blocks sleep and lid-close suspend while Kinesis runs |
| `kinesis-mdns.service` | Optional `kinesis.local` responder (`--mdns`) |
