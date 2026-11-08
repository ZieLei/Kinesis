#!/usr/bin/env bash
# Provision a Debian 13 / Ubuntu 24.04 shop PC for Kinesis (phase 1 of
# docs/deployment/MIGRATION.md). Idempotent.
#
# DRY RUN BY DEFAULT: prints every command. Pass --apply (as root) to run.
#
#   sudo ./install-kinesis.sh --release /path/to/unpacked-release \
#        --web-pos /path/to/pos-build --web-admin /path/to/admin-build --apply
#
# What it does:
#   1. Installs PostgreSQL 18 (PGDG repository), Caddy (official repository),
#      Python venv support. Needs internet once; Kinesis itself runs offline.
#   2. Creates the service accounts kinesis (backend) and kinesis-proxy (Caddy
#      and certificates), and the directory layout with permissions.
#   3. Copies the release code to /opt/kinesis, creates the venv from the
#      hash-checked lock files, copies the prebuilt web apps.
#   4. Installs the systemd units DISABLED and keeps the distribution's own
#      caddy.service disabled.
#
# What it does NOT do: create the database, write kinesis.env/caddy.env,
# copy certificates or data, open the firewall, or start anything. Those are
# separate, reviewed steps in MIGRATION.md.
set -euo pipefail

APPLY=0
RELEASE=""
WEB_POS=""
WEB_ADMIN=""
SKIP_PACKAGES=0

usage() {
    sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --release) RELEASE="$2"; shift ;;
        --web-pos) WEB_POS="$2"; shift ;;
        --web-admin) WEB_ADMIN="$2"; shift ;;
        --skip-packages) SKIP_PACKAGES=1 ;;
        -h|--help) usage 0 ;;
        *) echo "Unknown option: $1" >&2; usage 2 ;;
    esac
    shift
done

[[ -n "$RELEASE" && -n "$WEB_POS" && -n "$WEB_ADMIN" ]] || usage 2

for required in "$RELEASE/backend/main.py" "$RELEASE/backend/requirements.lock" \
                "$RELEASE/deploy/pki/requirements.lock" "$RELEASE/deploy/caddy/Caddyfile" \
                "$WEB_POS/index.html" "$WEB_ADMIN/index.html"; do
    [[ -f "$required" ]] || { echo "Missing: $required" >&2; exit 2; }
done

if ip -4 -o addr show 2>/dev/null | grep -q " 192.168.254.199/"; then
    echo "This machine already uses 192.168.254.199. Provision the shop PC while" >&2
    echo "it has a temporary address; it takes .199 only at cutover." >&2
    [[ $APPLY -eq 1 ]] && exit 2
fi

if [[ $APPLY -eq 1 && $EUID -ne 0 ]]; then
    echo "--apply must run as root." >&2
    exit 2
fi

run() {
    printf '+ %s\n' "$*"
    if [[ $APPLY -eq 1 ]]; then
        "$@"
    fi
}

section() { printf '\n== %s\n' "$1"; }

# --------------------------------------------------------------------------
section "Packages"
# --------------------------------------------------------------------------
if [[ $SKIP_PACKAGES -eq 0 ]]; then
    run apt-get update
    # avahi-daemon publishes <hostname>.local; with the hostname "kinesis"
    # that is kinesis.local, the name in the certificate and POS origins.
    run apt-get install -y postgresql-common python3 python3-venv rsync avahi-daemon \
        curl gnupg debian-keyring debian-archive-keyring apt-transport-https
    # PostgreSQL 18 from the PostgreSQL project's repository (Debian 13 and
    # Ubuntu 24.04 ship older majors). Must match the dump from the dev host.
    run /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
    run apt-get install -y postgresql-18 postgresql-client-18
    # Caddy from the official repository (matches the tested 2.11.x).
    if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
        run bash -c "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
        run bash -c "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list"
        run apt-get update
    fi
    run apt-get install -y caddy
fi

# The package enables its own caddy.service; Kinesis uses kinesis-caddy.service.
run systemctl disable --now caddy.service

# --------------------------------------------------------------------------
section "Service accounts"
# --------------------------------------------------------------------------
for account in kinesis kinesis-proxy; do
    if ! getent passwd "$account" >/dev/null; then
        run useradd --system --user-group --home-dir /nonexistent \
            --no-create-home --shell /usr/sbin/nologin "$account"
    else
        echo "  $account exists"
    fi
done

# --------------------------------------------------------------------------
section "Directories"
# --------------------------------------------------------------------------
run install -d -o root -g root -m 0755 /etc/kinesis /var/lib/kinesis /opt/kinesis /opt/kinesis/web
run install -d -o kinesis -g kinesis -m 0750 /var/lib/kinesis/uploads
run install -d -o kinesis -g kinesis -m 0750 /var/lib/kinesis/uploads/products /var/lib/kinesis/uploads/gcash
run install -d -o kinesis -g kinesis -m 0700 /var/lib/kinesis/backups
run install -d -o kinesis-proxy -g kinesis-proxy -m 0700 /var/lib/kinesis/pki /var/lib/kinesis/caddy
run install -d -o kinesis-proxy -g kinesis-proxy -m 0755 /var/lib/kinesis/onboarding

# --------------------------------------------------------------------------
section "Code and virtual environment"
# --------------------------------------------------------------------------
run rsync -a --delete --exclude '__pycache__' --exclude 'tests/' --exclude 'venv/' \
    --exclude 'uploads/' --exclude '.env*' "$RELEASE/backend/" /opt/kinesis/backend/
run rsync -a --delete --exclude '__pycache__' "$RELEASE/deploy/" /opt/kinesis/deploy/
run chown -R root:root /opt/kinesis/backend /opt/kinesis/deploy

if [[ ! -x /opt/kinesis/venv/bin/python ]]; then
    run python3 -m venv /opt/kinesis/venv
fi
run /opt/kinesis/venv/bin/pip install --require-hashes --only-binary :all: \
    -r /opt/kinesis/backend/requirements.lock
run /opt/kinesis/venv/bin/pip install --require-hashes --only-binary :all: \
    -r /opt/kinesis/deploy/pki/requirements.lock
run /opt/kinesis/venv/bin/pip check

# --------------------------------------------------------------------------
section "Web applications (prebuilt; no Node.js on the host)"
# --------------------------------------------------------------------------
run rsync -a --delete "$WEB_POS/" /opt/kinesis/web/pos/
run rsync -a --delete "$WEB_ADMIN/" /opt/kinesis/web/admin/
run chown -R root:root /opt/kinesis/web
run chmod -R a+rX /opt/kinesis/web

# --------------------------------------------------------------------------
section "systemd units (installed, NOT enabled or started)"
# --------------------------------------------------------------------------
for unit in kinesis-backend.service kinesis-caddy.service \
            kinesis-pki-renew.service kinesis-pki-renew.timer; do
    run install -o root -g root -m 0644 \
        "/opt/kinesis/deploy/services/systemd/$unit" "/etc/systemd/system/$unit"
done
run systemctl daemon-reload

section "Done"
if [[ $APPLY -eq 0 ]]; then
    echo "Dry run only. Re-run with --apply as root to make these changes."
fi
echo "Next: MIGRATION.md phase 1, steps for the database role, config files and certificates."
