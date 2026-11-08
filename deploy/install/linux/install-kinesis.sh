#!/usr/bin/env bash
# Install or update a Kinesis host on Linux. Arch Linux is the primary
# platform; Debian 13 / Ubuntu 24.04 are also supported. Idempotent: run it
# again to update the code, web apps and units. Existing configuration,
# secrets, certificates, uploads and databases are never overwritten.
#
# DRY RUN BY DEFAULT: prints every step. Add --apply to make the changes.
#
# Two layouts, same application, Caddyfile, ports and origins:
#
#   --scope system  (run with sudo) dedicated host. Accounts kinesis and
#                   kinesis-proxy (the backend cannot read the TLS keys),
#                   /opt/kinesis, /etc/kinesis, /var/lib/kinesis, system
#                   units, the distribution's postgresql.service.
#   --scope user    (no root) a single-user computer such as the owner's
#                   laptop. Everything runs as the invoking account under its
#                   systemd user manager, started at boot by lingering, with a
#                   PostgreSQL 18 cluster owned by that account on
#                   127.0.0.1:5433. ~/.local/lib/kinesis, ~/.config/kinesis,
#                   ~/.local/share/kinesis-host.
#
# Common use (Arch, from a checkout, building the web apps):
#   deploy/install/linux/install-kinesis.sh --scope user --build-web \
#       --pki-dir ~/kinesis-local/pki --apply
#   sudo deploy/install/linux/install-kinesis.sh --scope system \
#       --web-pos ./pos --web-admin ./admin --pki-dir /media/usb/pki --apply
#
# Options:
#   --scope system|user    default: system as root, user otherwise
#   --apply                make the changes (otherwise: dry run)
#   --release DIR          source tree to install (default: this checkout)
#   --web-pos DIR          prebuilt POS web app (npx expo export -p web)
#   --web-admin DIR        prebuilt admin app (npm --prefix admin run build)
#   --build-web            build both from --release instead (needs Node.js
#                          and node_modules; not as root)
#   --python managed|system|PATH
#                          managed (default): a private CPython 3.14 from uv,
#                          immune to pacman upgrading the system Python to a
#                          new minor version; system: /usr/bin/python3
#   --pg system|own        system: the distribution's postgresql.service
#                          (default for --scope system); own: a cluster owned
#                          by the Kinesis account (default for --scope user)
#   --pg-port N            default 5432 (system) / 5433 (own)
#   --db-name NAME         default kinesis
#   --db-user NAME         default kinesis_app
#   --pki-dir DIR          existing certificate directory (kinesis_pki.py
#                          init output). user scope: linked in place as
#                          <DATA>/pki (keys are not copied); system scope:
#                          copied into /var/lib/kinesis/pki for kinesis-proxy
#   --lan-ip IP            host LAN address (default 192.168.254.199)
#   --mdns                 also run the kinesis.local mDNS responder
#   --no-awake             do not block sleep/lid-close suspend while running
#   --enable               start Kinesis at boot (kinesis.target)
#   --start                start (or restart) Kinesis when done
#   --skip-packages        do not install distribution packages (system scope)
#   --distro arch|debian   override detection (dry runs on other systems)
#
# Afterwards, operate the host with `kinesisctl`
# (start | stop | restart | status | logs | doctor | migrate | create-admin).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_RELEASE="$(cd "$SCRIPT_DIR/../../.." && pwd)"

APPLY=0
SCOPE=""
RELEASE="$DEFAULT_RELEASE"
WEB_POS=""
WEB_ADMIN=""
BUILD_WEB=0
PYTHON_MODE="managed"
PG_MODE=""
PG_PORT=""
DB_NAME="kinesis"
DB_USER="kinesis_app"
PKI_SOURCE=""
LAN_IP="192.168.254.199"
MDNS=0
AWAKE=1
ENABLE=0
START=0
SKIP_PACKAGES=0
DISTRO=""

PYTHON_SERIES="3.14"
PG_MAJOR="18"
MIN_RAM_MB=4096
REC_RAM_MB=8192
MIN_FREE_GB=10
REC_FREE_GB=20

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
note() { printf '  %s\n' "$*"; }
section() { printf '\n== %s\n' "$1"; }
usage() { sed -n '2,62p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --scope) SCOPE="$2"; shift ;;
        --release) RELEASE="$2"; shift ;;
        --web-pos) WEB_POS="$2"; shift ;;
        --web-admin) WEB_ADMIN="$2"; shift ;;
        --build-web) BUILD_WEB=1 ;;
        --python) PYTHON_MODE="$2"; shift ;;
        --pg) PG_MODE="$2"; shift ;;
        --pg-port) PG_PORT="$2"; shift ;;
        --db-name) DB_NAME="$2"; shift ;;
        --db-user) DB_USER="$2"; shift ;;
        --pki-dir) PKI_SOURCE="$2"; shift ;;
        --lan-ip) LAN_IP="$2"; shift ;;
        --mdns) MDNS=1 ;;
        --no-awake) AWAKE=0 ;;
        --enable) ENABLE=1 ;;
        --start) START=1 ;;
        --skip-packages) SKIP_PACKAGES=1 ;;
        --distro) DISTRO="$2"; shift ;;
        -h|--help) usage 0 ;;
        *) echo "Unknown option: $1" >&2; usage 2 ;;
    esac
    shift
done

# Shell-quote a command for display; secrets are never passed as arguments.
show() {
    local out="+" arg
    for arg in "$@"; do
        if [[ "$arg" =~ ^[A-Za-z0-9_./:=@%+,-]+$ ]]; then out+=" $arg"; else out+=" $(printf '%q' "$arg")"; fi
    done
    printf '%s\n' "$out"
}
run() { show "$@"; if [[ $APPLY -eq 1 ]]; then "$@"; fi; }
# A pipeline or redirect, given as one bash -c string; shown with a label.
run_sh() { local label="$1"; shift; printf '+ %s\n' "$label"; if [[ $APPLY -eq 1 ]]; then bash -c "$1"; fi; }

# --------------------------------------------------------------------------
section "Host"
# --------------------------------------------------------------------------
[[ "$(uname -s)" == "Linux" ]] || die "This installer is for Linux. macOS: deploy/install/macos/install-kinesis.sh"
command -v systemctl >/dev/null || die "systemd is required (systemctl not found)."

if [[ -z "$SCOPE" ]]; then
    if [[ $EUID -eq 0 ]]; then SCOPE=system; else SCOPE=user; fi
fi
case "$SCOPE" in
    system) [[ $APPLY -eq 0 || $EUID -eq 0 ]] || die "--scope system --apply must run as root (sudo)." ;;
    user) [[ $EUID -ne 0 ]] || die "--scope user installs for the account running it; do not use sudo." ;;
    *) die "--scope must be system or user" ;;
esac

MACHINE="$(uname -m)"
case "$MACHINE" in
    x86_64|aarch64) ;;
    *) die "Unsupported processor $MACHINE: the hash-locked Python wheels cover x86_64 and aarch64 only." ;;
esac

if [[ -z "$DISTRO" ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case " ${ID:-} ${ID_LIKE:-} " in
        *" arch "*) DISTRO=arch ;;
        *" debian "*|*" ubuntu "*) DISTRO=debian ;;
        *) die "Unsupported distribution ${PRETTY_NAME:-unknown}. Supported: Arch Linux, Debian 13, Ubuntu 24.04." ;;
    esac
fi
[[ "$DISTRO" == arch || "$DISTRO" == debian ]] || die "--distro must be arch or debian"

if [[ "$DISTRO" == arch ]]; then
    PG_BIN=/usr/bin
    NOLOGIN=/usr/bin/nologin
else
    PG_BIN="/usr/lib/postgresql/$PG_MAJOR/bin"
    NOLOGIN=/usr/sbin/nologin
fi
CADDY_BIN=/usr/bin/caddy

[[ -n "$PG_MODE" ]] || { [[ $SCOPE == system ]] && PG_MODE=system || PG_MODE=own; }
case "$PG_MODE" in system|own) ;; *) die "--pg must be system or own" ;; esac
[[ $SCOPE == user && $PG_MODE == system ]] && die "--scope user cannot create a database in the system PostgreSQL (that needs the postgres superuser). Use --pg own, or --scope system."
[[ -n "$PG_PORT" ]] || { [[ $PG_MODE == own ]] && PG_PORT=5433 || PG_PORT=5432; }
[[ "$PG_PORT" =~ ^[0-9]+$ ]] || die "--pg-port must be a number"
[[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "--db-name must be a lower-case SQL identifier"
[[ "$DB_USER" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "--db-user must be a lower-case SQL identifier"
[[ "$LAN_IP" =~ ^(10|172|192)\.[0-9.]+$ ]] || die "--lan-ip must be a private (RFC 1918) IPv4 address"

if [[ $SCOPE == system ]]; then
    CODE=/opt/kinesis
    CONFIG=/etc/kinesis
    DATA=/var/lib/kinesis
    UNIT_DIR=/etc/systemd/system
    BIN_DIR=/usr/local/bin
    SYSTEMCTL=(systemctl)
    PG_SOCKET=/run/postgresql
else
    : "${HOME:?}"
    ME="$(id -un)"
    CODE="$HOME/.local/lib/kinesis"
    CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/kinesis"
    # Not ~/.local/share/kinesis: that is the development backend's default
    # backup folder (backend/database_routes.py) and may hold real backups.
    DATA="${XDG_DATA_HOME:-$HOME/.local/share}/kinesis-host"
    UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    BIN_DIR="$HOME/.local/bin"
    SYSTEMCTL=(systemctl --user)
    RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    PG_SOCKET="$RUNTIME_DIR/kinesis-postgresql"
    for path in "$CODE" "$CONFIG" "$DATA"; do
        [[ "$path" != *[[:space:]]* ]] || die "Paths with spaces are not supported in user scope: $path"
    done
fi

note "Distribution: $DISTRO ($MACHINE); scope: $SCOPE; PostgreSQL: $PG_MODE on 127.0.0.1:$PG_PORT"
note "Code: $CODE   Config: $CONFIG   Data: $DATA"

MEM_MB=$(( $(awk '/^MemTotal:/ { print $2 }' /proc/meminfo) / 1024 ))
(( MEM_MB >= MIN_RAM_MB )) || die "Kinesis needs at least $((MIN_RAM_MB / 1024)) GB of RAM; this computer has ${MEM_MB} MB."
(( MEM_MB >= REC_RAM_MB )) || warn "${MEM_MB} MB RAM: $((REC_RAM_MB / 1024)) GB or more is recommended."
FREE_PARENT="$DATA"; while [[ ! -d "$FREE_PARENT" ]]; do FREE_PARENT="$(dirname "$FREE_PARENT")"; done
FREE_GB=$(( $(df -Pk "$FREE_PARENT" | awk 'NR == 2 { print $4 }') / 1024 / 1024 ))
(( FREE_GB >= MIN_FREE_GB )) || die "Only ${FREE_GB} GB free on $FREE_PARENT; Kinesis needs at least ${MIN_FREE_GB} GB."
(( FREE_GB >= REC_FREE_GB )) || warn "${FREE_GB} GB free: ${REC_FREE_GB} GB or more is recommended (backups grow)."
note "Memory: ${MEM_MB} MB; free disk: ${FREE_GB} GB"
if command -v nvidia-smi >/dev/null 2>&1 || [[ -e /proc/driver/nvidia ]]; then
    note "NVIDIA GPU present: not used. Kinesis needs no GPU, CUDA or GPU libraries."
fi

if ip -4 -o addr show 2>/dev/null | grep -q " $LAN_IP/"; then
    note "This computer currently holds $LAN_IP: it will serve the shop's existing addresses."
else
    warn "$LAN_IP is not assigned to this computer right now. Phones reach Kinesis only once it is (router DHCP reservation)."
fi

if [[ $SCOPE == user ]]; then
    if [[ "$(loginctl show-user "$ME" -p Linger --value 2>/dev/null)" != yes ]]; then
        warn "Lingering is off: Kinesis would only run while $ME is logged in."
        run loginctl enable-linger "$ME"
    else
        note "Lingering is on: services start at boot without a login."
    fi
fi

# --------------------------------------------------------------------------
section "Release ($RELEASE)"
# --------------------------------------------------------------------------
for required in backend/main.py backend/requirements.lock deploy/pki/requirements.lock \
                deploy/caddy/Caddyfile deploy/kinesisctl deploy/install/kinesis_config.py \
                deploy/config/shop/kinesis.env.template deploy/config/shop/caddy.env; do
    [[ -f "$RELEASE/$required" ]] || die "Missing: $RELEASE/$required"
done
VERSION="$(sed -n 's/^    version="\([^"]*\)",$/\1/p' "$RELEASE/backend/main.py" | head -1)"
note "Kinesis version: ${VERSION:-unknown}"
if git -C "$RELEASE" rev-parse --git-dir >/dev/null 2>&1; then
    COMMIT="$(git -C "$RELEASE" rev-parse --short HEAD)"
    if [[ -n "$(git -C "$RELEASE" status --porcelain -- backend deploy 2>/dev/null)" ]]; then
        warn "Uncommitted changes in backend/ or deploy/ will be installed (commit $COMMIT + local edits)."
        COMMIT="$COMMIT+local"
    fi
    note "Source commit: $COMMIT"
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/kinesis-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

if [[ $BUILD_WEB -eq 1 ]]; then
    [[ $EUID -ne 0 ]] || die "--build-web must not run as root; build as a normal user and pass --web-pos/--web-admin."
    command -v npx >/dev/null || die "--build-web needs Node.js (pacman -S nodejs npm)."
    [[ -d "$RELEASE/node_modules" && -d "$RELEASE/admin/node_modules" ]] || die "--build-web needs node_modules: run npm ci and npm --prefix admin ci in $RELEASE."
    WEB_POS="$WORK/web/pos"
    WEB_ADMIN="$WORK/web/admin"
    section "Build web applications"
    # Built even in a dry run (writes only to a temporary folder) so the
    # checks below are real.
    show npx expo export -p web --output-dir "$WEB_POS"
    (cd "$RELEASE" && npx expo export -p web --output-dir "$WEB_POS" >"$WORK/pos-build.log" 2>&1) \
        || { tail -20 "$WORK/pos-build.log" >&2; die "POS web build failed."; }
    show npm --prefix admin run build -- --outDir "$WEB_ADMIN" --emptyOutDir
    (cd "$RELEASE" && npm --prefix admin run build -- --outDir "$WEB_ADMIN" --emptyOutDir >"$WORK/admin-build.log" 2>&1) \
        || { tail -20 "$WORK/admin-build.log" >&2; die "Admin web build failed."; }
fi
[[ -n "$WEB_POS" && -n "$WEB_ADMIN" ]] || die "Give --web-pos and --web-admin, or --build-web."
for build in "$WEB_POS" "$WEB_ADMIN"; do
    [[ -f "$build/index.html" ]] || die "Not a web build (no index.html): $build"
done
HOST_PY=""
for candidate in python3 /usr/bin/python3; do command -v "$candidate" >/dev/null && { HOST_PY="$(command -v "$candidate")"; break; }; done
[[ -n "$HOST_PY" ]] || die "python3 is required."
for build in "$WEB_POS" "$WEB_ADMIN"; do
    "$HOST_PY" -I "$RELEASE/deploy/tools/check_web_build.py" "$build" --caddyfile "$RELEASE/deploy/caddy/Caddyfile" >"$WORK/check.log" 2>&1 \
        || { cat "$WORK/check.log" >&2; die "Web build check failed: $build"; }
    note "web build OK: $build"
done

# --------------------------------------------------------------------------
section "Packages ($DISTRO)"
# --------------------------------------------------------------------------
if [[ "$DISTRO" == arch ]]; then
    PACKAGES=(postgresql caddy python)
    [[ "$PYTHON_MODE" == managed ]] && PACKAGES+=(uv)
    MISSING=()
    for pkg in "${PACKAGES[@]}"; do pacman -Q "$pkg" >/dev/null 2>&1 || MISSING+=("$pkg"); done
    if [[ ${#MISSING[@]} -gt 0 ]]; then
        if [[ $SCOPE == system && $SKIP_PACKAGES -eq 0 ]]; then
            # No -y: installing against a fresh sync database without
            # upgrading is a partial upgrade, which Arch does not support.
            run pacman -S --needed --noconfirm "${MISSING[@]}" \
                || die "pacman failed. Update the system first (pacman -Syu), then re-run."
        else
            die "Missing packages: ${MISSING[*]}. Install them with: sudo pacman -S --needed ${MISSING[*]}"
        fi
    else
        note "installed: $(pacman -Q "${PACKAGES[@]}" | tr '\n' ' ')"
    fi
    if ! grep -Eq '^[[:space:]]*IgnorePkg[[:space:]]*=.*\bpostgresql\b' /etc/pacman.conf 2>/dev/null; then
        warn "Arch upgrades PostgreSQL to a new major version as part of pacman -Syu; the Kinesis database then refuses to start until it is upgraded (pg_upgrade, docs/deployment/ARCH-LINUX.md). Recommended: add 'IgnorePkg = postgresql postgresql-libs' to /etc/pacman.conf and upgrade PostgreSQL deliberately."
    fi
else
    if [[ $SCOPE == system && $SKIP_PACKAGES -eq 0 ]]; then
        run apt-get update
        run apt-get install -y postgresql-common python3 python3-venv curl gnupg \
            debian-keyring debian-archive-keyring apt-transport-https
        # PostgreSQL 18 from the PostgreSQL project's repository (Debian 13 and
        # Ubuntu 24.04 ship older majors).
        run /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
        run apt-get install -y "postgresql-$PG_MAJOR" "postgresql-client-$PG_MAJOR"
        if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
            run_sh "add the Caddy apt repository" "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list"
            run apt-get update
        fi
        run apt-get install -y caddy
        [[ "$PYTHON_MODE" == managed ]] && warn "uv is not packaged on Debian/Ubuntu; using --python system." && PYTHON_MODE=system
    else
        for tool in "$PG_BIN/postgres" "$CADDY_BIN"; do
            command -v "$tool" >/dev/null || die "Missing $tool. Install postgresql-$PG_MAJOR and caddy (see --scope system)."
        done
    fi
fi

if [[ $APPLY -eq 1 || -x "$PG_BIN/postgres" ]]; then
    PG_FOUND="$("$PG_BIN/postgres" --version | awk '{ print $NF }')"
    [[ "${PG_FOUND%%.*}" == "$PG_MAJOR" ]] || die "PostgreSQL $PG_FOUND found in $PG_BIN; Kinesis needs $PG_MAJOR (databases must match the dumps from other Kinesis hosts)."
    note "PostgreSQL $PG_FOUND"
fi
if [[ $APPLY -eq 1 || -x "$CADDY_BIN" ]]; then
    CADDY_FOUND="$("$CADDY_BIN" version | awk '{ print $1 }')"
    IFS=. read -r c_major c_minor _ <<<"${CADDY_FOUND#v}"
    (( c_major > 2 || (c_major == 2 && c_minor >= 8) )) || die "Caddy $CADDY_FOUND is too old; Kinesis needs 2.8 or later (admin socket permissions)."
    note "Caddy $CADDY_FOUND"
fi
if [[ $SCOPE == system ]]; then
    # The package's own caddy.service would compete for the ports.
    if systemctl is-enabled caddy.service >/dev/null 2>&1 || systemctl is-active caddy.service >/dev/null 2>&1; then
        run systemctl disable --now caddy.service
    fi
fi

# --------------------------------------------------------------------------
section "Ports"
# --------------------------------------------------------------------------
CADDY_ENV_SOURCE="$CONFIG/caddy.env"
[[ -r "$CADDY_ENV_SOURCE" ]] || CADDY_ENV_SOURCE="$RELEASE/deploy/config/shop/caddy.env"
read -r -a ENV_PORTS <<<"$( { grep -E '^KINESIS_(POS_SITES|ADMIN_SITES|ONBOARDING_SITE)=' "$CADDY_ENV_SOURCE" \
        | grep -oE ':[0-9]{2,5}\b' | tr -d ':'; sed -n 's/^KINESIS_HTTP_PORT=//p' "$CADDY_ENV_SOURCE"; } | sort -un | tr '\n' ' ')"
CHECK_PORTS=(8000 "${ENV_PORTS[@]}")
[[ $PG_MODE == own ]] && CHECK_PORTS+=("$PG_PORT")
# Ports held by this scope's own units are fine (re-install / update).
if [[ $SCOPE == system ]]; then OWN_CGROUP='^0::/system\.slice/kinesis-'; else OWN_CGROUP='user@[0-9]+\.service/.*kinesis-'; fi
for port in "${CHECK_PORTS[@]}"; do
    owner="$(ss -Hltnp "sport = :$port" 2>/dev/null | head -1)"
    pid="$(sed -n 's/.*pid=\([0-9]*\).*/\1/p' <<<"$owner")"
    if [[ -z "$owner" ]]; then
        note "port $port free"
    elif [[ -n "$pid" ]] && grep -Eq "$OWN_CGROUP" "/proc/$pid/cgroup" 2>/dev/null; then
        note "port $port used by this Kinesis installation"
    elif [[ -n "$pid" ]] && grep -Eq '/kinesis-(backend|caddy|postgresql)\.service' "/proc/$pid/cgroup" 2>/dev/null; then
        die "Port $port is used by ANOTHER Kinesis installation (the other scope: $(sed -n 's#^0::##p' "/proc/$pid/cgroup")). Stop it first (kinesisctl --user stop / --system stop); two installations cannot serve the same ports."
    else
        process="$(grep -o 'users:(([^)]*' <<<"$owner" | sed 's/users:((//')"
        die "Port $port is already in use by ${process:-a process of another account}. Find out what it is first ('ss -ltnp sport = :$port', as root to see other accounts); stop it or change the port in $CONFIG, then re-run."
    fi
done

# --------------------------------------------------------------------------
section "Accounts and directories"
# --------------------------------------------------------------------------
# The data folder must be empty or one this installer created: it holds
# the database cluster (user scope), uploads and backups, and the admin
# console offers every dump in backups/ for restore.
MARKER="$DATA/.kinesis-host"
if [[ -d "$DATA" && ! -e "$MARKER" && -n "$(ls -A "$DATA" 2>/dev/null)" ]]; then
    die "$DATA already exists, is not empty and was not created by this installer. Refusing to share it (it may hold another installation's data or backups)."
fi
if [[ $SCOPE == system ]]; then
    SVC_USER=kinesis
    PROXY_USER=kinesis-proxy
    for account in "$SVC_USER" "$PROXY_USER"; do
        if getent passwd "$account" >/dev/null; then
            note "$account exists"
        else
            run useradd --system --user-group --home-dir /nonexistent --no-create-home --shell "$NOLOGIN" "$account"
        fi
    done
    run install -d -o root -g root -m 0755 "$CONFIG" "$DATA" "$CODE" "$CODE/web"
    run install -d -o "$SVC_USER" -g "$SVC_USER" -m 0750 "$DATA/uploads" "$DATA/uploads/products" "$DATA/uploads/gcash"
    run install -d -o "$SVC_USER" -g "$SVC_USER" -m 0700 "$DATA/backups"
    run install -d -o "$PROXY_USER" -g "$PROXY_USER" -m 0700 "$DATA/caddy"
    run install -d -o "$PROXY_USER" -g "$PROXY_USER" -m 0755 "$DATA/onboarding"
    [[ -L "$DATA/pki" ]] || run install -d -o "$PROXY_USER" -g "$PROXY_USER" -m 0700 "$DATA/pki"
else
    SVC_USER="$ME"
    PROXY_USER="$ME"
    run install -d -m 0700 "$CONFIG" "$DATA" "$DATA/uploads" "$DATA/uploads/products" "$DATA/uploads/gcash" \
        "$DATA/backups" "$DATA/caddy"
    run install -d -m 0755 "$CODE" "$CODE/web" "$DATA/onboarding" "$UNIT_DIR" "$BIN_DIR"
fi
[[ -e "$MARKER" ]] || run_sh "mark $DATA as a Kinesis host data folder" "printf 'Kinesis host data folder (install-kinesis.sh). Back up uploads/, backups/ and pki/.\n' > '$MARKER'"

# Run a command as the backend / proxy account.
as_svc() { if [[ $SCOPE == system ]]; then runuser -u "$SVC_USER" -- "$@"; else "$@"; fi; }
as_proxy() { if [[ $SCOPE == system ]]; then runuser -u "$PROXY_USER" -- "$@"; else "$@"; fi; }

# --------------------------------------------------------------------------
section "Code"
# --------------------------------------------------------------------------
# sync_tree SRC DST [tar --exclude patterns...]: replace DST with a copy of
# SRC. The copy is assembled next to DST and swapped in with two renames, so
# a failed update never leaves a half-copied tree. Needs only tar (in Arch's
# base and every Debian install).
sync_tree() {
    local src="$1" dst="$2"; shift 2
    local excludes=() pattern
    for pattern in "$@"; do excludes+=("--exclude=$pattern"); done
    show sync "$src/" "->" "$dst/" "${excludes[@]}"
    [[ $APPLY -eq 1 ]] || return 0
    rm -rf "$dst.new" "$dst.old"
    mkdir -p "$dst.new"
    tar -C "$src" "${excludes[@]}" -cf - . | tar -C "$dst.new" -xf -
    if [[ -e "$dst" ]]; then mv "$dst" "$dst.old"; fi
    mv "$dst.new" "$dst"
    rm -rf "$dst.old"
}
CODE_EXCLUDES=(__pycache__ '*.pyc' ./tests ./venv ./.venv ./node_modules ./uploads './.env*')
sync_tree "$RELEASE/backend" "$CODE/backend" "${CODE_EXCLUDES[@]}"
sync_tree "$RELEASE/deploy" "$CODE/deploy" "${CODE_EXCLUDES[@]}"
run chmod 0755 "$CODE/deploy/kinesisctl"
[[ $SCOPE == system ]] && run chown -R root:root "$CODE/backend" "$CODE/deploy"

# --------------------------------------------------------------------------
section "Python runtime and virtual environments"
# --------------------------------------------------------------------------
PYTHON_HOME=""
case "$PYTHON_MODE" in
    managed)
        command -v uv >/dev/null || die "--python managed needs uv (pacman -S uv), or use --python system."
        PYTHON_HOME="$CODE/python"
        # uv verifies the SHA-256 of the CPython build it downloads.
        run env UV_PYTHON_INSTALL_DIR="$PYTHON_HOME" uv python install --no-bin "$PYTHON_SERIES"
        if [[ $APPLY -eq 1 || -d "$PYTHON_HOME" ]]; then
            BASE_PY="$(UV_PYTHON_INSTALL_DIR="$PYTHON_HOME" uv python find --managed-python --no-project "$PYTHON_SERIES" 2>/dev/null || true)"
            [[ -n "$BASE_PY" || $APPLY -eq 0 ]] || die "uv installed Python $PYTHON_SERIES but it cannot be found in $PYTHON_HOME."
        fi
        BASE_PY="${BASE_PY:-$PYTHON_HOME/cpython-$PYTHON_SERIES-*/bin/python$PYTHON_SERIES}"
        ;;
    system)
        BASE_PY=/usr/bin/python3
        warn "Using the system Python. A pacman upgrade to a new Python minor version breaks the venvs; re-run this installer afterwards."
        ;;
    *)
        BASE_PY="$PYTHON_MODE"
        [[ -x "$BASE_PY" ]] || die "Python not found: $BASE_PY"
        ;;
esac
if [[ -x "$BASE_PY" ]]; then
    PY_VERSION="$("$BASE_PY" -I -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
    case "$PY_VERSION" in 3.12|3.13|3.14) ;; *) die "Python $PY_VERSION is not supported (3.12 to 3.14)." ;; esac
    note "Python $PY_VERSION: $BASE_PY"
fi

# build_venv NAME LOCK...: (re)create <CODE>/NAME when it is missing, built
# from another interpreter, or the locks changed. Otherwise left alone, so
# updating the code works offline.
build_venv() {
    local name="$1"; shift
    local venv="$CODE/$name" stamp want have
    stamp="$venv/.kinesis-build"
    want="$( { "$BASE_PY" -I -c 'import sys; print(sys.version)' 2>/dev/null || echo "?"; cat "$@"; } | sha256sum | cut -d' ' -f1)"
    have="$(cat "$stamp" 2>/dev/null || true)"
    if [[ -x "$venv/bin/python" && "$want" == "$have" ]]; then
        note "$name is current"
        return
    fi
    run "$BASE_PY" -I -m venv --clear "$venv"
    local lock
    for lock in "$@"; do
        run "$venv/bin/python" -I -m pip install --quiet --disable-pip-version-check --no-input \
            --require-hashes --only-binary :all: -r "$lock"
    done
    run "$venv/bin/python" -I -m pip check
    run_sh "record $name build stamp" "printf '%s\n' '$want' > '$stamp'"
}
# The backend venv has no cryptography; the PKI tooling has its own venv.
build_venv venv "$RELEASE/backend/requirements.lock"
build_venv pki-venv "$RELEASE/deploy/pki/requirements.lock"
[[ $MDNS -eq 1 ]] && build_venv mdns-venv "$RELEASE/deploy/mdns/requirements.lock"
if [[ $APPLY -eq 1 ]]; then
    "$CODE/venv/bin/python" -I -c 'import fastapi, uvicorn, sqlalchemy, psycopg, argon2, alembic' \
        || die "The backend venv is incomplete."
    if "$CODE/venv/bin/python" -I -c 'import cryptography' 2>/dev/null; then
        die "cryptography is importable in the backend venv; it must only be in pki-venv."
    fi
    "$CODE/pki-venv/bin/python" -I -c 'import cryptography; print("  pki-venv: cryptography", cryptography.__version__)'
fi
[[ $SCOPE == system ]] && run chown -R root:root "$CODE/venv" "$CODE/pki-venv"

# --------------------------------------------------------------------------
section "Web applications"
# --------------------------------------------------------------------------
sync_tree "$WEB_POS" "$CODE/web/pos"
sync_tree "$WEB_ADMIN" "$CODE/web/admin"
run chmod -R a+rX "$CODE/web"
[[ $SCOPE == system ]] && run chown -R root:root "$CODE/web"

# --------------------------------------------------------------------------
section "Configuration ($CONFIG)"
# --------------------------------------------------------------------------
CFG=("$CODE/pki-venv/bin/python" -I "$CODE/deploy/install/kinesis_config.py")
[[ -x "$CODE/pki-venv/bin/python" ]] || CFG=("$HOST_PY" -I "$RELEASE/deploy/install/kinesis_config.py")
if [[ $SCOPE == system ]]; then
    ENV_OWNER=(--owner "root:$SVC_USER" --mode 0640)
    CADDY_OWNER=(--owner "root:$PROXY_USER" --mode 0640)
    CADDY_ADMIN="unix//run/kinesis-caddy/admin.sock|0600"
else
    ENV_OWNER=(--mode 0600)
    CADDY_OWNER=(--mode 0600)
    CADDY_ADMIN="unix/$RUNTIME_DIR/kinesis-caddy/admin.sock|0600"
fi
NEW_ENV=0
[[ -e "$CONFIG/kinesis.env" ]] || NEW_ENV=1
run "${CFG[@]}" render --template "$RELEASE/deploy/config/shop/kinesis.env.template" \
    --out "$CONFIG/kinesis.env" "${ENV_OWNER[@]}" \
    --header "Kinesis backend settings ($SCOPE scope, generated by install-kinesis.sh).
CONTAINS SECRETS. Never copy, print or commit this file." \
    --set "KINESIS_DATA_DIR=$DATA" --set "DATABASE_PORT=$PG_PORT" \
    --set "DATABASE_NAME=$DB_NAME" --set "DATABASE_USER=$DB_USER" \
    --set "KINESIS_PG_BIN_DIR=$PG_BIN" \
    --generate DATABASE_PASSWORD --generate KINESIS_ADMIN_AUTH_SECRET_KEY
run "${CFG[@]}" render --template "$RELEASE/deploy/config/shop/caddy.env" \
    --out "$CONFIG/caddy.env" "${CADDY_OWNER[@]}" \
    --header "Kinesis Caddy settings ($SCOPE scope, generated by install-kinesis.sh). No secrets.
Ports and origins must match kinesis.env and the server certificate:
kinesisctl doctor checks them." \
    --set "KINESIS_DATA_DIR=$DATA" \
    --set "KINESIS_POS_WEB_ROOT=$CODE/web/pos" --set "KINESIS_ADMIN_WEB_ROOT=$CODE/web/admin" \
    --set "KINESIS_CADDY_ADMIN=$CADDY_ADMIN"
if [[ -r "$CONFIG/kinesis.env" ]]; then
    CONFIGURED_DB="$("${CFG[@]}" get --env-file "$CONFIG/kinesis.env" DATABASE_NAME || true)"
    CONFIGURED_USER="$("${CFG[@]}" get --env-file "$CONFIG/kinesis.env" DATABASE_USER || true)"
    CONFIGURED_PORT="$("${CFG[@]}" get --env-file "$CONFIG/kinesis.env" DATABASE_PORT || true)"
    if [[ "$CONFIGURED_DB" != "$DB_NAME" || "$CONFIGURED_USER" != "$DB_USER" || "$CONFIGURED_PORT" != "$PG_PORT" ]]; then
        warn "$CONFIG/kinesis.env already configures database $CONFIGURED_DB as $CONFIGURED_USER on port $CONFIGURED_PORT; keeping it (edit the file to change it)."
        DB_NAME="$CONFIGURED_DB"; DB_USER="$CONFIGURED_USER"; PG_PORT="$CONFIGURED_PORT"
    fi
fi
if [[ $MDNS -eq 1 ]]; then
    MDNS_HOSTNAME=kinesis.local
    MDNS_PORT="$(sed -n 's/^KINESIS_HTTPS_PORT=//p' "$CADDY_ENV_SOURCE" | head -1)"
    MDNS_PORT="${MDNS_PORT:-443}"
    if [[ $SCOPE == system ]]; then
        run_sh "write $CONFIG/mdns.env" "printf 'KINESIS_MDNS_HOSTNAME=%s\nKINESIS_MDNS_IP=%s\nKINESIS_MDNS_PORT=%s\n' '$MDNS_HOSTNAME' '$LAN_IP' '$MDNS_PORT' > '$CONFIG/mdns.env' && chmod 0644 '$CONFIG/mdns.env'"
    fi
fi

# Non-secret description of this installation, read by kinesisctl.
INSTALL_CONF="SCOPE=$SCOPE
DISTRO=$DISTRO
CODE=$CODE
CONFIG=$CONFIG
DATA=$DATA
PG_MODE=$PG_MODE
PG_PORT=$PG_PORT
PG_BIN=$PG_BIN
PG_SOCKET=$PG_SOCKET
DB_NAME=$DB_NAME
DB_USER=$DB_USER
LAN_IP=$LAN_IP
SVC_USER=$SVC_USER
PROXY_USER=$PROXY_USER
MDNS=$MDNS
AWAKE=$AWAKE
VERSION=${VERSION:-unknown}
COMMIT=${COMMIT:-unknown}"
run_sh "write $CONFIG/install.conf" "printf '%s\n' '$INSTALL_CONF' > '$CONFIG/install.conf' && chmod 0644 '$CONFIG/install.conf'"

# --------------------------------------------------------------------------
section "Certificates ($DATA/pki)"
# --------------------------------------------------------------------------
PKI_REAL="$DATA/pki"
if [[ -n "$PKI_SOURCE" ]]; then
    PKI_SOURCE="$(cd "$PKI_SOURCE" && pwd -P)" || die "Not a directory: $PKI_SOURCE"
    for f in root-ca.crt intermediate-ca.crt intermediate-ca.key server.crt server.key pki.json; do
        [[ -f "$PKI_SOURCE/$f" ]] || die "$PKI_SOURCE is not a Kinesis PKI directory (missing $f)."
    done
    [[ ! -e "$PKI_SOURCE/root-ca.key" && ! -e "$PKI_SOURCE/root-ca.key.enc" ]] \
        || die "$PKI_SOURCE contains the ROOT CA key. It belongs on offline media only; remove it from this folder first."
    if [[ $SCOPE == user ]]; then
        PKI_REAL="$PKI_SOURCE"
        if [[ -L "$DATA/pki" && "$(readlink -f "$DATA/pki")" == "$PKI_SOURCE" ]]; then
            note "$DATA/pki -> $PKI_SOURCE (existing certificates, used in place)"
        elif [[ -e "$DATA/pki" ]]; then
            die "$DATA/pki already exists and is not a link to $PKI_SOURCE; refusing to replace certificates."
        else
            run ln -s "$PKI_SOURCE" "$DATA/pki"
        fi
        run chmod 0700 "$PKI_SOURCE"
    elif [[ -f "$DATA/pki/server.key" ]]; then
        note "$DATA/pki already holds certificates; not overwritten."
    else
        for f in root-ca.crt intermediate-ca.crt server.crt pki.json; do
            run install -o "$PROXY_USER" -g "$PROXY_USER" -m 0644 "$PKI_SOURCE/$f" "$DATA/pki/$f"
        done
        for f in intermediate-ca.key server.key; do
            run install -o "$PROXY_USER" -g "$PROXY_USER" -m 0600 "$PKI_SOURCE/$f" "$DATA/pki/$f"
        done
    fi
elif [[ -L "$DATA/pki" ]]; then
    PKI_REAL="$(readlink -f "$DATA/pki")"
    note "$DATA/pki -> $PKI_REAL"
fi
PKI=("$CODE/pki-venv/bin/python" -I "$CODE/deploy/pki/kinesis_pki.py" --pki-dir "$DATA/pki")
HAVE_PKI=0
if [[ -f "$DATA/pki/server.crt" || ( $APPLY -eq 0 && -n "$PKI_SOURCE" ) ]]; then
    HAVE_PKI=1
    if [[ $SCOPE == system ]]; then
        # Recorded in pki.json: what the daily renewal runs after reissuing.
        run as_proxy "${PKI[@]}" renew --no-reload \
            --reload-command "$CADDY_BIN reload --config $CODE/deploy/caddy/Caddyfile --adapter caddyfile --force" \
            --reload-env-file "$CONFIG/caddy.env"
    fi
    run as_proxy "${PKI[@]}" export-ca --out "$DATA/onboarding"
    run as_proxy "${PKI[@]}" verify --expect-ip "$LAN_IP" --expect-hostname kinesis.local
else
    warn "No certificates in $DATA/pki. Kinesis cannot serve HTTPS until they exist:
    - existing PKI (recommended; phones keep trusting it): re-run with --pki-dir <folder>
    - new CA: ${PKI[*]} init --ip $LAN_IP --root-key-out <USB>/kinesis-root-ca.key.enc
      (deploy/README-tls.md; every device must then trust the new CA)"
fi

# --------------------------------------------------------------------------
section "systemd units ($UNIT_DIR)"
# --------------------------------------------------------------------------
if [[ $SCOPE == system ]]; then
    UNITS=(kinesis.target kinesis-backend.service kinesis-caddy.service kinesis-pki-renew.service kinesis-pki-renew.timer)
    [[ $AWAKE -eq 1 ]] && UNITS+=(kinesis-awake.service)
    [[ $MDNS -eq 1 ]] && UNITS+=(kinesis-mdns.service)
    for unit in "${UNITS[@]}"; do
        run install -o root -g root -m 0644 "$CODE/deploy/services/systemd/$unit" "$UNIT_DIR/$unit"
    done
    if [[ "$DISTRO" == arch && $PG_MODE == system ]]; then
        # Arch's postgresql.service needs an initialized cluster (Arch wiki).
        if [[ $EUID -ne 0 ]]; then
            show "initdb /var/lib/postgres/data only if it is empty (checked when run as root)"
        elif [[ ! -f /var/lib/postgres/data/PG_VERSION ]]; then
            run runuser -u postgres -- "$PG_BIN/initdb" --locale=C.UTF-8 --encoding=UTF8 \
                --auth-local=peer --auth-host=scram-sha-256 -D /var/lib/postgres/data
        fi
        run systemctl enable --now postgresql.service
    fi
else
    WANTS="kinesis-backend.service kinesis-caddy.service kinesis-pki-renew.timer"
    UNITS=(kinesis.target kinesis-backend.service kinesis-caddy.service kinesis-pki-renew.service kinesis-pki-renew.timer)
    [[ $PG_MODE == own ]] && UNITS+=(kinesis-postgresql.service) && WANTS="kinesis-postgresql.service $WANTS"
    [[ $AWAKE -eq 1 ]] && UNITS+=(kinesis-awake.service) && WANTS="$WANTS kinesis-awake.service"
    [[ $MDNS -eq 1 ]] && UNITS+=(kinesis-mdns.service) && WANTS="$WANTS kinesis-mdns.service"
    if [[ -x /usr/bin/postgresql-check-db-dir ]]; then
        PG_CHECK="/usr/bin/postgresql-check-db-dir $DATA/postgres"
    else
        # No '|' or '&' here: the value goes through sed below.
        PG_CHECK="/bin/sh -c 'if test \"\$\$(cat $DATA/postgres/PG_VERSION)\" = $PG_MAJOR; then exit 0; fi; echo \"$DATA/postgres is not a PostgreSQL $PG_MAJOR cluster; upgrade it with pg_upgrade\"; exit 1'"
    fi
    BACKEND_PG_DEPS=""
    [[ $PG_MODE == own ]] && BACKEND_PG_DEPS="Requires=kinesis-postgresql.service"
    for unit in "${UNITS[@]}"; do
        template="$CODE/deploy/services/systemd-user/$unit.in"
        [[ -f "$template" || $APPLY -eq 0 ]] || die "Missing unit template $template"
        show render "$template" "->" "$UNIT_DIR/$unit"
        if [[ $APPLY -eq 1 ]]; then
            sed -e "s|@CODE@|$CODE|g" -e "s|@CONFIG@|$CONFIG|g" -e "s|@DATA@|$DATA|g" \
                -e "s|@PKI_REAL@|$PKI_REAL|g" -e "s|@PG_PORT@|$PG_PORT|g" -e "s|@PG_BIN@|$PG_BIN|g" \
                -e "s|@PG_MAJOR@|$PG_MAJOR|g" -e "s|@PG_CHECK@|$PG_CHECK|g" -e "s|@CADDY@|$CADDY_BIN|g" \
                -e "s|@PYTHON_HOME_BIND@|$PYTHON_HOME|g" -e "s|@TARGET_WANTS@|$WANTS|g" \
                -e "s|@BACKEND_PG_DEPS@|$BACKEND_PG_DEPS|g" -e "s|@LAN_IP@|$LAN_IP|g" \
                -e "s|@MDNS_HOSTNAME@|${MDNS_HOSTNAME:-kinesis.local}|g" -e "s|@MDNS_PORT@|${MDNS_PORT:-443}|g" \
                "$template" > "$UNIT_DIR/$unit.tmp"
            ! grep -q '@[A-Z_]*@' "$UNIT_DIR/$unit.tmp" || die "Unfilled placeholder in $unit"
            mv "$UNIT_DIR/$unit.tmp" "$UNIT_DIR/$unit"
        fi
    done
fi
run "${SYSTEMCTL[@]}" daemon-reload
# Units that belong to kinesis.target start and stop with it.
ENABLE_IN_TARGET=(kinesis-backend.service kinesis-caddy.service kinesis-pki-renew.timer)
[[ $SCOPE == user && $PG_MODE == own ]] && ENABLE_IN_TARGET+=(kinesis-postgresql.service)
[[ $AWAKE -eq 1 ]] && ENABLE_IN_TARGET+=(kinesis-awake.service)
[[ $MDNS -eq 1 ]] && ENABLE_IN_TARGET+=(kinesis-mdns.service)
run "${SYSTEMCTL[@]}" enable "${ENABLE_IN_TARGET[@]}"
[[ $AWAKE -eq 0 ]] && "${SYSTEMCTL[@]}" is-enabled --quiet kinesis-awake.service 2>/dev/null && run "${SYSTEMCTL[@]}" disable --now kinesis-awake.service

run ln -sfn "$CODE/deploy/kinesisctl" "$BIN_DIR/kinesisctl"
if [[ $SCOPE == user && ":$PATH:" != *":$BIN_DIR:"* ]]; then
    warn "$BIN_DIR is not on PATH; run $BIN_DIR/kinesisctl or add it to PATH."
fi

# --------------------------------------------------------------------------
section "Database ($DB_NAME on 127.0.0.1:$PG_PORT)"
# --------------------------------------------------------------------------
if [[ $SCOPE == user ]]; then
    PSQL_BASE=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET" -p "$PG_PORT" -U "$ME")
    if [[ ! -f "$DATA/postgres/PG_VERSION" ]]; then
        [[ ! -e "$DATA/postgres" ]] || [[ -z "$(ls -A "$DATA/postgres" 2>/dev/null)" ]] \
            || die "$DATA/postgres exists but is not a PostgreSQL cluster; refusing to touch it."
        # Superuser = this account, peer auth on the Unix socket only; TCP
        # logins need a SCRAM password (the superuser has none).
        run "$PG_BIN/initdb" --pgdata="$DATA/postgres" --username="$ME" --locale=C.UTF-8 --encoding=UTF8 \
            --auth-local=peer --auth-host=scram-sha-256
    else
        note "cluster exists: PostgreSQL $(cat "$DATA/postgres/PG_VERSION") in $DATA/postgres"
    fi
    run systemctl --user start kinesis-postgresql.service
else
    PSQL_BASE=(runuser -u postgres -- "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -p "$PG_PORT")
fi

PSQL=("${PSQL_BASE[@]}" -d postgres)
if [[ $APPLY -eq 1 ]]; then
    for _ in $(seq 1 30); do "${PSQL[@]}" -Atc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
    "${PSQL[@]}" -Atc 'select 1' >/dev/null || die "Cannot connect to PostgreSQL as its superuser (see: kinesisctl logs postgresql)."
    LISTEN="$("${PSQL[@]}" -Atc 'show listen_addresses')"
    case "$LISTEN" in
        localhost|127.0.0.1|::1|"127.0.0.1, ::1"|"localhost, 127.0.0.1"|"") note "PostgreSQL listens on: ${LISTEN:-(Unix socket only)}" ;;
        *) die "PostgreSQL listens on '$LISTEN'. Set listen_addresses = 'localhost' in postgresql.conf: the database must not be reachable from the LAN." ;;
    esac
    ROLE_EXISTS="$("${PSQL[@]}" -Atc "select 1 from pg_roles where rolname = '$DB_USER'")"
    DB_EXISTS="$("${PSQL[@]}" -Atc "select 1 from pg_database where datname = '$DB_NAME'")"
    if [[ "$ROLE_EXISTS" != 1 ]]; then
        "${CFG[@]}" role-sql --env-file "$CONFIG/kinesis.env" | "${PSQL[@]}" >/dev/null
        note "created role $DB_USER (SCRAM-SHA-256; password only in $CONFIG/kinesis.env)"
    elif [[ $NEW_ENV -eq 1 ]]; then
        die "Role $DB_USER already exists in this PostgreSQL, but $CONFIG/kinesis.env was just generated with a new password. Another installation may use that role: refusing to change its password. Choose another --db-user, or put the role's existing password in $CONFIG/kinesis.env, then re-run."
    else
        note "role $DB_USER exists"
    fi
    FRESH_DB=0
    if [[ "$DB_EXISTS" != 1 ]]; then
        "${PSQL[@]}" -c "create database $DB_NAME owner $DB_USER encoding 'UTF8' template template0"
        "${PSQL_BASE[@]}" -d "$DB_NAME" -c "revoke all on database $DB_NAME from public"
        FRESH_DB=1
        note "created database $DB_NAME (owner $DB_USER)"
    else
        note "database $DB_NAME exists; not modified"
    fi
    if [[ $FRESH_DB -eq 1 ]]; then
        # Empty database: create the schema. Existing databases are only
        # migrated on request (kinesisctl migrate), after a backup.
        (cd "$CODE/backend" && as_svc env KINESIS_ENV_FILE="$CONFIG/kinesis.env" PYTHONNOUSERSITE=1 \
            "$CODE/venv/bin/alembic" upgrade head)
    else
        CURRENT="$(cd "$CODE/backend" && as_svc env KINESIS_ENV_FILE="$CONFIG/kinesis.env" "$CODE/venv/bin/alembic" current 2>/dev/null | awk 'NF { print $1 }' | tail -1)"
        HEAD="$(cd "$CODE/backend" && "$CODE/venv/bin/alembic" heads 2>/dev/null | awk 'NF { print $1 }' | tail -1)"
        if [[ "$CURRENT" != "$HEAD" ]]; then
            warn "Database schema is at ${CURRENT:-unknown}, code expects $HEAD. Back up, then run: kinesisctl migrate"
        else
            note "schema is current ($CURRENT)"
        fi
    fi
else
    show "create role $DB_USER and database $DB_NAME if missing; alembic upgrade head on a new, empty database"
fi

# --------------------------------------------------------------------------
section "Preflight"
# --------------------------------------------------------------------------
if [[ $APPLY -eq 1 ]]; then
    # As root in system scope: it reads both env files (owned by different
    # service accounts).
    "$CODE/pki-venv/bin/python" -I "$CODE/deploy/migration/preflight.py" \
        --kinesis-env "$CONFIG/kinesis.env" --caddy-env "$CONFIG/caddy.env" --expect-ip "$LAN_IP" \
        || warn "Preflight reported problems (above). Fix them before serving terminals."
else
    show preflight.py --kinesis-env "$CONFIG/kinesis.env" --caddy-env "$CONFIG/caddy.env" --expect-ip "$LAN_IP"
fi

# --------------------------------------------------------------------------
section "Done"
# --------------------------------------------------------------------------
if [[ $ENABLE -eq 1 ]]; then
    run "${SYSTEMCTL[@]}" enable kinesis.target
fi
if [[ $START -eq 1 ]]; then
    [[ $HAVE_PKI -eq 1 ]] || die "Not starting: no certificates."
    run "${SYSTEMCTL[@]}" restart kinesis.target
fi
if [[ $APPLY -eq 0 ]]; then
    echo "Dry run only. Re-run with --apply to make these changes."
else
    echo "Installed Kinesis ${VERSION:-} ($SCOPE scope)."
    echo "  Start / stop:   kinesisctl start | stop | restart"
    echo "  Check / logs:   kinesisctl status | doctor | logs [-f] [backend|caddy|postgresql]"
    echo "  Start at boot:  kinesisctl enable"
    echo "  First admin:    kinesisctl create-admin <username>"
fi
