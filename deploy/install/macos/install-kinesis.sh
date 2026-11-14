#!/bin/bash
# Install or update a Mac as the Kinesis host (macOS 13+, Apple silicon or
# Intel). Idempotent: existing configuration, secrets, certificates,
# uploads and databases are never overwritten.
#
# DRY RUN BY DEFAULT: prints every step. Pass --apply (with sudo) to run.
#
#   sudo ./install-kinesis.sh --release /path/to/kinesis-v1.4.x \
#        --web-pos /path/to/pos-build --web-admin /path/to/admin-build \
#        --pki-dir /Volumes/USB/pki --create-database --apply
#
# MINIMUM REQUIREMENTS (checked; the installer refuses anything less):
#   * macOS 13 Ventura or later
#   * Apple silicon (arm64), or Intel (x86_64) with
#     --accept-intel-pki-exception (see below)
#   * 8 GB RAM and 20 GB free disk space (16 GB and 40 GB recommended)
#   * Python 3.13 from python.org (universal2 installer; 3.12-3.14 work)
#   * PostgreSQL 18 from postgresql.org (EDB installer)
# Operational (warned, not enforced): stays at the shop, on mains power,
# never sleeps; wired Ethernet; a decision about FileVault.
#
# The processor is detected from the hardware, not the current process:
#   * Apple silicon -> backend/requirements.lock, deploy/pki/requirements.lock,
#                      Caddy mac_arm64
#   * Intel         -> backend/requirements-macos-intel.lock,
#                      deploy/pki/requirements-macos-intel.lock, Caddy mac_amd64
# If the script runs under Rosetta on Apple silicon, it restarts natively.
# Python, PostgreSQL, Caddy and every compiled package must run natively;
# anything else is refused with an explanation.
#
# INTEL MACS: the certificate tool needs cryptography 48.0.1 (the last
# release with Intel-Mac wheels), which carries known advisories in APIs
# Kinesis does not use. It runs only in its own pki-venv; the backend never
# loads it. Read deploy/pki/requirements-macos-intel.lock, then pass
# --accept-intel-pki-exception to proceed.
#
# Options:
#   --release DIR --web-pos DIR --web-admin DIR   (required)
#   --pki-dir DIR          copy an existing Kinesis PKI (issuing CA + server
#                          certificate; NOT the root key) into the host
#   --create-database      create the role and database in PostgreSQL 18
#                          (prompts for the EDB "postgres" password) and
#                          create the schema in a new, empty database
#   --db-name NAME         default kinesis     --db-user NAME  default kinesis_app
#   --lan-ip IP            default 192.168.254.199
#   --caddy-binary FILE    offline Caddy binary instead of downloading
#   --python FILE          --pg-bin DIR
#   --accept-intel-pki-exception
#   --apply
#
# Testing on another OS (dry run only):
#   --simulate-arch arm64|x86_64  --simulate-macos 14.5  --simulate-rosetta
#   --simulate-ram-gb N  --simulate-free-gb N
#
# Afterwards: kinesisctl start | stop | status | logs | doctor
#
# Compatible with the bash 3.2 that ships with macOS.
set -eu

APPLY=0
RELEASE=""
WEB_POS=""
WEB_ADMIN=""
CADDY_BINARY=""
PKI_SOURCE=""
CREATE_DB=0
DB_NAME="kinesis"
DB_USER="kinesis_app"
LAN_IP="192.168.254.199"
ACCEPT_INTEL=0
PYTHON="/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13"
PG_BIN="/Library/PostgreSQL/18/bin"
SIM_ARCH=""
SIM_MACOS=""
SIM_ROSETTA=0
SIM_RAM_GB=""
SIM_FREE_GB=""

CADDY_VERSION="2.11.4"
ROOT="/Library/Application Support/Kinesis"
DAEMONS="/Library/LaunchDaemons"
LABELS="local.kinesis.backend local.kinesis.caddy local.kinesis.pki-renew"
MIN_MACOS_MAJOR=13
MIN_RAM_GB=8
REC_RAM_GB=16
MIN_FREE_GB=20
REC_FREE_GB=40

usage() {
    sed -n '2,58p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
section() { printf '\n== %s\n' "$1"; }

ORIGINAL_ARGS=("$@")

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --release) RELEASE="$2"; shift ;;
        --web-pos) WEB_POS="$2"; shift ;;
        --web-admin) WEB_ADMIN="$2"; shift ;;
        --caddy-binary) CADDY_BINARY="$2"; shift ;;
        --pki-dir) PKI_SOURCE="$2"; shift ;;
        --create-database) CREATE_DB=1 ;;
        --db-name) DB_NAME="$2"; shift ;;
        --db-user) DB_USER="$2"; shift ;;
        --lan-ip) LAN_IP="$2"; shift ;;
        --accept-intel-pki-exception) ACCEPT_INTEL=1 ;;
        --python) PYTHON="$2"; shift ;;
        --pg-bin) PG_BIN="$2"; shift ;;
        --simulate-arch) SIM_ARCH="$2"; shift ;;
        --simulate-macos) SIM_MACOS="$2"; shift ;;
        --simulate-rosetta) SIM_ROSETTA=1 ;;
        --simulate-ram-gb) SIM_RAM_GB="$2"; shift ;;
        --simulate-free-gb) SIM_FREE_GB="$2"; shift ;;
        -h|--help) usage 0 ;;
        *) echo "Unknown option: $1" >&2; usage 2 ;;
    esac
    shift
done

SIMULATED=0
if [ -n "$SIM_ARCH" ] || [ -n "$SIM_MACOS" ] || [ "$SIM_ROSETTA" -eq 1 ] || [ -n "$SIM_RAM_GB" ] || [ -n "$SIM_FREE_GB" ]; then
    SIMULATED=1
    [ "$APPLY" -eq 0 ] || die "--simulate-* options are for dry runs only."
fi

[ -n "$RELEASE" ] && [ -n "$WEB_POS" ] && [ -n "$WEB_ADMIN" ] || usage 2
echo "$DB_NAME" | grep -Eq '^[a-z_][a-z0-9_]{0,62}$' || die "--db-name must be a lower-case SQL identifier"
echo "$DB_USER" | grep -Eq '^[a-z_][a-z0-9_]{0,62}$' || die "--db-user must be a lower-case SQL identifier"

run() {
    printf '+'
    for arg in "$@"; do
        case "$arg" in
            *[[:space:]]*) printf ' "%s"' "$arg" ;;
            *) printf ' %s' "$arg" ;;
        esac
    done
    printf '\n'
    if [ "$APPLY" -eq 1 ]; then
        "$@"
    fi
}

# Critical problems found by the final verification.
PROBLEMS=""
problem() { PROBLEMS="$PROBLEMS
  - $*"; }

# --------------------------------------------------------------------------
section "Host"
# --------------------------------------------------------------------------
if [ "$SIMULATED" -eq 0 ]; then
    [ "$(uname -s)" = "Darwin" ] || die "This installer is for macOS. Use deploy/install/linux on Linux."
fi

# Hardware, not the current process: hw.optional.arm64 is 1 on Apple silicon
# even inside a Rosetta (x86_64) process, where `uname -m` says x86_64.
if [ -n "$SIM_ARCH" ]; then
    HW_ARCH="$SIM_ARCH"
elif [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
    HW_ARCH="arm64"
else
    HW_ARCH="x86_64"
fi

case "$HW_ARCH" in
    arm64|x86_64) ;;
    *) die "Unsupported processor: $HW_ARCH" ;;
esac

if [ "$SIM_ROSETTA" -eq 1 ]; then
    TRANSLATED=1
else
    TRANSLATED="$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)"
fi

if [ "$TRANSLATED" = "1" ]; then
    if [ "$SIMULATED" -eq 1 ]; then
        echo "  Running under Rosetta: would restart natively with: arch -arm64 /bin/bash $0 ..."
    elif [ "${KINESIS_INSTALL_NATIVE:-0}" = "1" ]; then
        die "Still running under Rosetta after restarting natively. Open a native Terminal (not 'Open using Rosetta') and run again."
    else
        echo "  This shell runs under Rosetta; restarting natively for Apple silicon."
        export KINESIS_INSTALL_NATIVE=1
        exec arch -arm64 /bin/bash "$0" ${ORIGINAL_ARGS[@]+"${ORIGINAL_ARGS[@]}"}
    fi
fi

if [ -n "$SIM_MACOS" ]; then
    MACOS_VERSION="$SIM_MACOS"
else
    MACOS_VERSION="$(sw_vers -productVersion)"
fi
MACOS_MAJOR="${MACOS_VERSION%%.*}"
[ "$MACOS_MAJOR" -ge "$MIN_MACOS_MAJOR" ] 2>/dev/null \
    || die "macOS $MACOS_VERSION is too old. Kinesis needs macOS $MIN_MACOS_MAJOR (Ventura) or later (PostgreSQL 18 installer)."

if [ -n "$SIM_RAM_GB" ]; then
    RAM_GB="$SIM_RAM_GB"
else
    RAM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
fi
[ "$RAM_GB" -ge "$MIN_RAM_GB" ] || die "This Mac has ${RAM_GB} GB of memory; Kinesis needs at least ${MIN_RAM_GB} GB."
[ "$RAM_GB" -ge "$REC_RAM_GB" ] || warn "${RAM_GB} GB of memory: ${REC_RAM_GB} GB is recommended."

if [ -n "$SIM_FREE_GB" ]; then
    FREE_GB="$SIM_FREE_GB"
else
    FREE_GB=$(( $(df -k / | awk 'NR == 2 { print $4 }') / 1048576 ))
fi
[ "$FREE_GB" -ge "$MIN_FREE_GB" ] || die "Only ${FREE_GB} GB free on the startup disk; Kinesis needs at least ${MIN_FREE_GB} GB."
[ "$FREE_GB" -ge "$REC_FREE_GB" ] || warn "${FREE_GB} GB free: ${REC_FREE_GB} GB is recommended (backups grow)."

if [ "$HW_ARCH" = "arm64" ]; then
    CPU_LABEL="Apple silicon"
    LOCK_BACKEND="backend/requirements.lock"
    LOCK_PKI="deploy/pki/requirements.lock"
    CADDY_ASSET="caddy_${CADDY_VERSION}_mac_arm64.tar.gz"
else
    CPU_LABEL="Intel"
    LOCK_BACKEND="backend/requirements-macos-intel.lock"
    LOCK_PKI="deploy/pki/requirements-macos-intel.lock"
    CADDY_ASSET="caddy_${CADDY_VERSION}_mac_amd64.tar.gz"
fi

echo "  Processor:  $CPU_LABEL ($HW_ARCH)"
echo "  macOS:      $MACOS_VERSION"
echo "  Memory:     ${RAM_GB} GB; free disk: ${FREE_GB} GB"
echo "  Lock files: $LOCK_BACKEND, $LOCK_PKI"
echo "  Caddy:      $CADDY_ASSET"

if [ "$HW_ARCH" = "x86_64" ]; then
    cat >&2 <<'EOF'
  INTEL MAC SECURITY EXCEPTION
  The certificate tool (kinesis_pki.py) needs cryptography 48.0.1, the last
  release built for Intel Macs. It carries CVE-2026-69247/-69248/-69249 and
  bundles OpenSSL 4.0.1 without the 4.0.2/4.0.3 fixes. None of them is in an
  API Kinesis calls, and the library is installed only in pki-venv, which runs
  the daily certificate check on local files; the backend never loads it.
  Details and the conditions under which this stops being acceptable:
  deploy/pki/requirements-macos-intel.lock.
EOF
    [ "$ACCEPT_INTEL" -eq 1 ] || die "Intel Mac: re-run with --accept-intel-pki-exception after reading the above, or use an Apple-silicon Mac or the Linux installer."
    echo "  Intel exception accepted by the operator (--accept-intel-pki-exception)."
fi

for required in "$RELEASE/backend/main.py" "$RELEASE/$LOCK_BACKEND" "$RELEASE/$LOCK_PKI" \
                "$RELEASE/deploy/caddy/Caddyfile" "$RELEASE/deploy/services/launchd/local.kinesis.backend.plist" \
                "$RELEASE/deploy/install/kinesis_config.py" "$RELEASE/deploy/kinesisctl" \
                "$RELEASE/deploy/config/shop/kinesis.macos.env.template" "$RELEASE/deploy/config/shop/caddy.macos.env" \
                "$WEB_POS/index.html" "$WEB_ADMIN/index.html"; do
    [ -f "$required" ] || die "Missing: $required"
done

if [ "$APPLY" -eq 1 ] && [ "$(id -u)" -ne 0 ]; then
    die "--apply must run as root (sudo)."
fi

# Is a binary built for this processor? (lipo lists the slices of a file.)
has_arch() {
    if [ "$SIMULATED" -eq 1 ]; then
        return 0
    fi
    lipo -archs "$1" 2>/dev/null | tr ' ' '\n' | grep -qx "$HW_ARCH"
}

if [ -e "$ROOT/app/backend/main.py" ] || [ -d "$ROOT/venv" ]; then
    echo "  Existing installation found; it is updated in place."
fi

if [ "$SIMULATED" -eq 0 ] && ifconfig 2>/dev/null | grep -q "inet 192\.168\.254\.199 "; then
    echo "  This Mac holds 192.168.254.199: it will serve the shop's addresses as soon as Kinesis starts."
fi

# --------------------------------------------------------------------------
section "Operation checks (warnings)"
# --------------------------------------------------------------------------
if [ "$SIMULATED" -eq 1 ]; then
    echo "  (simulated) would check: sleep on mains power (pmset), FileVault, Ethernet, battery"
else
    AC_SLEEP="$(pmset -g custom 2>/dev/null | awk '/AC Power/ { ac = 1 } ac && $1 == "sleep" { print $2; exit }')"
    if [ "${AC_SLEEP:-1}" != "0" ]; then
        warn "The Mac sleeps on mains power (sleep ${AC_SLEEP:-?} min). A sleeping host stops every terminal. Run: sudo pmset -c sleep 0 disksleep 0 powernap 0 womp 1 (keep the lid open)."
    else
        echo "  Sleep on mains power: off"
    fi
    if fdesetup status 2>/dev/null | grep -q "FileVault is On"; then
        warn "FileVault is on: after any restart Kinesis stays off until someone unlocks the Mac (sudo fdesetup authrestart for planned restarts)."
    else
        echo "  FileVault: off (Kinesis starts after a restart without anyone logging in)"
    fi
    if networksetup -listallhardwareports 2>/dev/null | grep -Eqi 'Hardware Port: .*(Ethernet|LAN|Thunderbolt Ethernet)'; then
        echo "  Wired Ethernet port available (recommended)"
    else
        warn "No wired Ethernet port found. Use a USB-C Ethernet adapter if possible; on Wi-Fi set Private Wi-Fi Address to Off."
    fi
fi

# --------------------------------------------------------------------------
section "Python (native $HW_ARCH)"
# --------------------------------------------------------------------------
if [ "$SIMULATED" -eq 1 ]; then
    echo "  (simulated) would check $PYTHON is universal2/$HW_ARCH and runs natively"
else
    [ -x "$PYTHON" ] || die "Python 3.13 not found at $PYTHON. Install the python.org macOS universal2 installer, or pass --python."
    has_arch "$PYTHON" || die "$PYTHON has no $HW_ARCH code ($(lipo -archs "$PYTHON" 2>/dev/null)). It would run under Rosetta. Use the python.org universal2 installer."
    PY_INFO="$(arch "-$HW_ARCH" "$PYTHON" -c 'import platform, sys; print(platform.machine(), "%d.%d" % sys.version_info[:2])')"
    PY_MACHINE="${PY_INFO%% *}"
    PY_VERSION="${PY_INFO##* }"
    [ "$PY_MACHINE" = "$HW_ARCH" ] || die "Python reports $PY_MACHINE on a $HW_ARCH Mac."
    case "$PY_VERSION" in
        3.12|3.13|3.14) ;;
        *) die "Python $PY_VERSION is not supported; use 3.13 (3.12 to 3.14 work)." ;;
    esac
    echo "  $PYTHON: Python $PY_VERSION, native $PY_MACHINE"
fi

# --------------------------------------------------------------------------
section "PostgreSQL 18"
# --------------------------------------------------------------------------
if [ "$SIMULATED" -eq 1 ]; then
    echo "  (simulated) would check $PG_BIN/postgres is PostgreSQL 18 with $HW_ARCH code"
else
    [ -x "$PG_BIN/postgres" ] || die "PostgreSQL 18 not found in $PG_BIN. Install it with the EDB installer from postgresql.org."
    PG_MAJOR="$("$PG_BIN/postgres" --version | awk '{ print $NF }' | cut -d. -f1)"
    [ "$PG_MAJOR" = "18" ] || die "Found PostgreSQL $PG_MAJOR in $PG_BIN; Kinesis needs 18."
    has_arch "$PG_BIN/postgres" || die "PostgreSQL in $PG_BIN has no $HW_ARCH code (it would run under Rosetta)."
    for tool in pg_dump pg_restore psql; do
        [ -x "$PG_BIN/$tool" ] || die "$PG_BIN/$tool is missing (needed for backups and setup)."
    done
    echo "  PostgreSQL $PG_MAJOR, native $HW_ARCH"
fi

# --------------------------------------------------------------------------
section "Caddy $CADDY_VERSION ($HW_ARCH)"
# --------------------------------------------------------------------------
WORK="$(mktemp -d "${TMPDIR:-/tmp}/kinesis-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

if [ -n "$CADDY_BINARY" ]; then
    CADDY_SOURCE="$CADDY_BINARY"
    [ "$SIMULATED" -eq 1 ] || [ -f "$CADDY_SOURCE" ] || die "Not found: $CADDY_SOURCE"
else
    BASE="https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION"
    run curl -fsSL -o "$WORK/$CADDY_ASSET" "$BASE/$CADDY_ASSET"
    run curl -fsSL -o "$WORK/checksums.txt" "$BASE/caddy_${CADDY_VERSION}_checksums.txt"
    if [ "$APPLY" -eq 1 ]; then
        EXPECTED="$(awk -v f="$CADDY_ASSET" '$2 == f { print $1 }' "$WORK/checksums.txt")"
        ACTUAL="$(shasum -a 512 "$WORK/$CADDY_ASSET" | awk '{ print $1 }')"
        [ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || die "Caddy download failed its SHA-512 check."
        echo "  SHA-512 verified"
    else
        echo "+ verify SHA-512 of $CADDY_ASSET against caddy_${CADDY_VERSION}_checksums.txt"
    fi
    run tar -xzf "$WORK/$CADDY_ASSET" -C "$WORK" caddy
    CADDY_SOURCE="$WORK/caddy"
fi

if [ "$APPLY" -eq 1 ]; then
    has_arch "$CADDY_SOURCE" || die "The Caddy binary has no $HW_ARCH code ($(lipo -archs "$CADDY_SOURCE" 2>/dev/null))."
fi

# --------------------------------------------------------------------------
section "Service accounts"
# --------------------------------------------------------------------------
free_id() {
    # First ID from 450 to 499 unused by any user or group.
    taken="$(dscl . -list /Users UniqueID 2>/dev/null | awk '{ print $2 }'; dscl . -list /Groups PrimaryGroupID 2>/dev/null | awk '{ print $2 }')"
    id=450
    while [ "$id" -lt 500 ]; do
        if ! printf '%s\n' "$taken" | grep -qx "$id"; then
            echo "$id"
            return 0
        fi
        id=$((id + 1))
    done
    return 1
}

for account in _kinesis _kinesisproxy; do
    if [ "$SIMULATED" -eq 0 ] && dscl . -read "/Users/$account" >/dev/null 2>&1; then
        echo "  $account exists ($(id "$account"))"
        continue
    fi
    if [ "$SIMULATED" -eq 1 ]; then
        ID="<free id 450-499>"
    else
        ID="$(free_id)" || die "No free account ID between 450 and 499."
    fi
    run dscl . -create "/Groups/$account"
    run dscl . -create "/Groups/$account" PrimaryGroupID "$ID"
    run dscl . -create "/Groups/$account" RealName "Kinesis service ($account)"
    run dscl . -create "/Users/$account"
    run dscl . -create "/Users/$account" UniqueID "$ID"
    run dscl . -create "/Users/$account" PrimaryGroupID "$ID"
    run dscl . -create "/Users/$account" UserShell /usr/bin/false
    run dscl . -create "/Users/$account" NFSHomeDirectory /var/empty
    run dscl . -create "/Users/$account" RealName "Kinesis service ($account)"
    run dscl . -create "/Users/$account" IsHidden 1
done

# --------------------------------------------------------------------------
section "Directories ($ROOT)"
# --------------------------------------------------------------------------
run install -d -o root -g wheel -m 0755 "$ROOT" "$ROOT/app" "$ROOT/bin" "$ROOT/web" "$ROOT/config" "$ROOT/logs"
run install -d -o _kinesis -g _kinesis -m 0750 "$ROOT/uploads" "$ROOT/uploads/products" "$ROOT/uploads/gcash"
run install -d -o _kinesis -g _kinesis -m 0700 "$ROOT/backups"
run install -d -o _kinesisproxy -g _kinesisproxy -m 0700 "$ROOT/pki" "$ROOT/caddy"
run install -d -o _kinesisproxy -g _kinesisproxy -m 0755 "$ROOT/onboarding"
for log in backend:_kinesis caddy:_kinesisproxy pki-renew:_kinesisproxy; do
    name="${log%%:*}"
    owner="${log##*:}"
    # launchd opens these as root; pre-create them owned by the service account.
    run touch "$ROOT/logs/$name.log"
    run chown "$owner:$owner" "$ROOT/logs/$name.log"
    run chmod 0640 "$ROOT/logs/$name.log"
done

# --------------------------------------------------------------------------
section "Code and virtual environments"
# --------------------------------------------------------------------------
run rsync -a --delete --exclude '__pycache__' --exclude 'tests/' --exclude 'venv/' \
    --exclude 'node_modules/' --exclude 'uploads/' --exclude '.env*' "$RELEASE/backend/" "$ROOT/app/backend/"
run rsync -a --delete --exclude '__pycache__' --exclude 'tests/' "$RELEASE/deploy/" "$ROOT/app/deploy/"
run chown -R root:wheel "$ROOT/app"
run chmod 0755 "$ROOT/app/deploy/kinesisctl"

# build_venv DIR LOCK: the backend venv has no cryptography; the PKI tooling
# gets its own venv (pki-venv), so the backend never loads that library.
build_venv() {
    venv="$1"
    lock="$2"
    venv_py="$venv/bin/python"
    clear=""
    if [ "$SIMULATED" -eq 0 ] && [ -x "$venv_py" ]; then
        existing="$(arch "-$HW_ARCH" "$venv_py" -c 'import platform; print(platform.machine())' 2>/dev/null || echo unknown)"
        if [ "$existing" != "$HW_ARCH" ]; then
            echo "  Existing $(basename "$venv") runs as $existing, not $HW_ARCH: it is rebuilt."
            clear="--clear"
        fi
    fi
    if [ ! -x "$venv_py" ] || [ -n "$clear" ]; then
        run arch "-$HW_ARCH" "$PYTHON" -m venv $clear "$venv"
    fi
    run arch "-$HW_ARCH" "$venv_py" -m pip install --quiet --disable-pip-version-check --require-hashes --only-binary :all: -r "$lock"
    run arch "-$HW_ARCH" "$venv_py" -m pip check
}
VENV="$ROOT/venv"
PKI_VENV="$ROOT/pki-venv"
build_venv "$VENV" "$ROOT/app/$LOCK_BACKEND"
build_venv "$PKI_VENV" "$ROOT/app/$LOCK_PKI"
if [ "$APPLY" -eq 1 ] && "$VENV/bin/python" -c 'import cryptography' 2>/dev/null; then
    # Left over from releases before v1.5, which shared one venv.
    run arch "-$HW_ARCH" "$VENV/bin/python" -m pip uninstall --quiet --yes cryptography cffi pycparser
fi

# Every compiled extension must contain code for this processor.
CHECK_EXTENSIONS='
import pathlib, subprocess, sys, sysconfig
arch, modules = sys.argv[1], sys.argv[2].split(",")
bad = []
site = pathlib.Path(sysconfig.get_paths()["purelib"])
for so in [*site.rglob("*.so"), *site.rglob("*.dylib")]:
    archs = subprocess.run(["lipo", "-archs", str(so)], capture_output=True, text=True).stdout.split()
    if arch not in archs:
        bad.append(f"{so.name}: {archs}")
for name in modules:
    __import__(name)
if bad:
    sys.exit("Extensions without " + arch + " code:\n  " + "\n  ".join(bad))
print("  all compiled extensions are native", arch, "(" + sys.argv[2] + ")")
'
if [ "$APPLY" -eq 1 ]; then
    arch "-$HW_ARCH" "$VENV/bin/python" -c "$CHECK_EXTENSIONS" "$HW_ARCH" fastapi,uvicorn,sqlalchemy,psycopg,argon2,alembic \
        || die "The backend virtual environment is not native $HW_ARCH."
    arch "-$HW_ARCH" "$PKI_VENV/bin/python" -c "$CHECK_EXTENSIONS" "$HW_ARCH" cryptography \
        || die "The PKI virtual environment is not native $HW_ARCH."
    if "$VENV/bin/python" -c 'import cryptography' 2>/dev/null; then
        die "cryptography is importable in the backend venv; it must only be in pki-venv."
    fi
else
    echo "+ check every compiled extension in both venvs contains $HW_ARCH code; backend venv has no cryptography"
fi
run chown -R root:wheel "$VENV" "$PKI_VENV"

# --------------------------------------------------------------------------
section "Web applications (prebuilt)"
# --------------------------------------------------------------------------
run rsync -a --delete "$WEB_POS/" "$ROOT/web/pos/"
run rsync -a --delete "$WEB_ADMIN/" "$ROOT/web/admin/"
run chown -R root:wheel "$ROOT/web"
run chmod -R a+rX "$ROOT/web"

# --------------------------------------------------------------------------
section "Caddy binary and firewall"
# --------------------------------------------------------------------------
run install -o root -g wheel -m 0755 "$CADDY_SOURCE" "$ROOT/bin/caddy"
# Only browser downloads are quarantined; ignore the error if not set.
run xattr -d com.apple.quarantine "$ROOT/bin/caddy" 2>/dev/null || true
FIREWALL=/usr/libexec/ApplicationFirewall/socketfilterfw
if [ "$SIMULATED" -eq 1 ] || [ -x "$FIREWALL" ]; then
    run "$FIREWALL" --add "$ROOT/bin/caddy"
    run "$FIREWALL" --unblockapp "$ROOT/bin/caddy"
fi

# --------------------------------------------------------------------------
section "Configuration ($ROOT/config)"
# --------------------------------------------------------------------------
CFG_PY="$PKI_VENV/bin/python"
CONFIG="$ROOT/config"
NEW_ENV=0
[ -e "$CONFIG/kinesis.env" ] || NEW_ENV=1
run "$CFG_PY" "$ROOT/app/deploy/install/kinesis_config.py" render \
    --template "$ROOT/app/deploy/config/shop/kinesis.macos.env.template" --out "$CONFIG/kinesis.env" \
    --owner root:_kinesis --mode 0640 \
    --header "Kinesis backend settings (macOS, generated by install-kinesis.sh).
CONTAINS SECRETS. Never copy, print or commit this file." \
    --set "DATABASE_NAME=$DB_NAME" --set "DATABASE_USER=$DB_USER" --set "KINESIS_PG_BIN_DIR=$PG_BIN" \
    --generate DATABASE_PASSWORD --generate KINESIS_ADMIN_AUTH_SECRET_KEY
run "$CFG_PY" "$ROOT/app/deploy/install/kinesis_config.py" render \
    --template "$ROOT/app/deploy/config/shop/caddy.macos.env" --out "$CONFIG/caddy.env" \
    --owner root:_kinesisproxy --mode 0640 \
    --header "Kinesis Caddy settings (macOS, generated by install-kinesis.sh). No secrets."
INSTALL_CONF="SCOPE=macos
CODE=$ROOT/app
CONFIG=$CONFIG
DATA=$ROOT
PG_MODE=system
PG_PORT=5432
PG_BIN=$PG_BIN
DB_NAME=$DB_NAME
DB_USER=$DB_USER
LAN_IP=$LAN_IP
SVC_USER=_kinesis
PROXY_USER=_kinesisproxy
HW_ARCH=$HW_ARCH
VERSION=$(sed -n 's/^    version="\([^"]*\)",$/\1/p' "$RELEASE/backend/main.py" | head -1)"
echo "+ write $CONFIG/install.conf"
if [ "$APPLY" -eq 1 ]; then
    printf '%s\n' "$INSTALL_CONF" > "$CONFIG/install.conf"
    chmod 0644 "$CONFIG/install.conf"
fi

# --------------------------------------------------------------------------
section "Certificates ($ROOT/pki)"
# --------------------------------------------------------------------------
as_proxy() { sudo -u _kinesisproxy "$@"; }
PKI_TOOL="$ROOT/app/deploy/pki/kinesis_pki.py"
if [ -n "$PKI_SOURCE" ]; then
    for f in root-ca.crt intermediate-ca.crt intermediate-ca.key server.crt server.key pki.json; do
        [ -f "$PKI_SOURCE/$f" ] || die "$PKI_SOURCE is not a Kinesis PKI folder (missing $f)."
    done
    if [ -e "$PKI_SOURCE/root-ca.key" ] || [ -e "$PKI_SOURCE/root-ca.key.enc" ]; then
        die "$PKI_SOURCE contains the ROOT CA key. It belongs on offline media only."
    fi
    if [ -f "$ROOT/pki/server.key" ]; then
        echo "  $ROOT/pki already holds certificates; not overwritten."
    else
        for f in root-ca.crt intermediate-ca.crt server.crt pki.json; do
            run install -o _kinesisproxy -g _kinesisproxy -m 0644 "$PKI_SOURCE/$f" "$ROOT/pki/$f"
        done
        for f in intermediate-ca.key server.key; do
            run install -o _kinesisproxy -g _kinesisproxy -m 0600 "$PKI_SOURCE/$f" "$ROOT/pki/$f"
        done
    fi
fi
if [ -f "$ROOT/pki/server.crt" ] || { [ "$APPLY" -eq 0 ] && [ -n "$PKI_SOURCE" ]; }; then
    run as_proxy "$PKI_VENV/bin/python" "$PKI_TOOL" --pki-dir "$ROOT/pki" renew --no-reload \
        --reload-command "\"$ROOT/bin/caddy\" reload --config \"$ROOT/app/deploy/caddy/Caddyfile\" --adapter caddyfile --force" \
        --reload-env-file "$CONFIG/caddy.env"
    APP_PORT="$(sed -n 's/^KINESIS_HTTPS_PORT=//p' "$ROOT/app/deploy/config/shop/caddy.macos.env" | head -1)"
    APP_URL="https://kinesis.local"; [[ -z "$APP_PORT" || "$APP_PORT" == 443 ]] || APP_URL="$APP_URL:$APP_PORT"
    run as_proxy "$PKI_VENV/bin/python" "$PKI_TOOL" --pki-dir "$ROOT/pki" export-ca --out "$ROOT/onboarding" --app-url "$APP_URL"
    run as_proxy "$PKI_VENV/bin/python" "$PKI_TOOL" --pki-dir "$ROOT/pki" verify --expect-ip "$LAN_IP" --expect-hostname kinesis.local
else
    warn "No certificates in $ROOT/pki: re-run with --pki-dir <folder> (existing PKI, phones keep trusting it), or create a CA (deploy/README-tls.md)."
    [ "$APPLY" -eq 1 ] && problem "no TLS certificates in $ROOT/pki (--pki-dir)"
fi

# --------------------------------------------------------------------------
section "Database ($DB_NAME)"
# --------------------------------------------------------------------------
if [ "$CREATE_DB" -eq 1 ]; then
    PSQL="$PG_BIN/psql"
    echo "+ $PSQL -h 127.0.0.1 -U postgres (prompts for the EDB superuser password)"
    if [ "$APPLY" -eq 1 ]; then
        LISTEN="$("$PSQL" -X -A -t -h 127.0.0.1 -U postgres -d postgres -c 'show listen_addresses')"
        case "$LISTEN" in
            localhost|127.0.0.1|::1|"127.0.0.1, ::1"|"localhost, 127.0.0.1") echo "  PostgreSQL listens on: $LISTEN" ;;
            *) die "PostgreSQL listens on '$LISTEN'. Set listen_addresses = 'localhost' in $PG_BIN/../data/postgresql.conf and restart it: the database must not be reachable from the LAN." ;;
        esac
        ROLE_EXISTS="$("$PSQL" -X -A -t -h 127.0.0.1 -U postgres -d postgres -c "select 1 from pg_roles where rolname = '$DB_USER'")"
        if [ "$ROLE_EXISTS" != "1" ]; then
            # Password only as a SCRAM verifier, on stdin (psql reads the
            # superuser password from the terminal).
            "$CFG_PY" "$ROOT/app/deploy/install/kinesis_config.py" role-sql --env-file "$CONFIG/kinesis.env" \
                | "$PSQL" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres >/dev/null
            echo "  created role $DB_USER"
        elif [ "$NEW_ENV" -eq 1 ]; then
            die "Role $DB_USER exists but kinesis.env was just generated with a new password; refusing to change the role's password. Put its password in $CONFIG/kinesis.env or choose --db-user."
        fi
        DB_EXISTS="$("$PSQL" -X -A -t -h 127.0.0.1 -U postgres -d postgres -c "select 1 from pg_database where datname = '$DB_NAME'")"
        if [ "$DB_EXISTS" != "1" ]; then
            "$PSQL" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres \
                -c "create database $DB_NAME owner $DB_USER encoding 'UTF8' template template0"
            "$PSQL" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d "$DB_NAME" \
                -c "revoke all on database $DB_NAME from public"
            (cd "$ROOT/app/backend" && sudo -u _kinesis env KINESIS_ENV_FILE="$CONFIG/kinesis.env" PYTHONNOUSERSITE=1 \
                "$VENV/bin/alembic" upgrade head)
            echo "  created database $DB_NAME with the current schema"
        else
            echo "  database $DB_NAME exists; not modified (migrate with: kinesisctl migrate)"
        fi
    fi
else
    echo "  skipped (--create-database to create the role and database; MIGRATION.md 5.3)"
fi

# --------------------------------------------------------------------------
section "launchd daemons and kinesisctl"
# --------------------------------------------------------------------------
for plist in local.kinesis.backend.plist local.kinesis.caddy.plist local.kinesis.pki-renew.plist; do
    run install -o root -g wheel -m 0644 "$ROOT/app/deploy/services/launchd/$plist" "$DAEMONS/$plist"
    if [ "$SIMULATED" -eq 0 ]; then
        run plutil -lint "$DAEMONS/$plist"
    fi
done
# Daemons in /Library/LaunchDaemons load at every boot. Keep them disabled
# until `kinesisctl start` (which also makes them start at boot).
for label in $LABELS; do
    if [ "$SIMULATED" -eq 1 ] || ! launchctl print "system/$label" >/dev/null 2>&1; then
        run launchctl disable "system/$label"
    else
        echo "  $label is loaded; left running (kinesisctl restart to use the new code)"
    fi
done
run install -d -o root -g wheel -m 0755 /usr/local/bin
run ln -sfn "$ROOT/app/deploy/kinesisctl" /usr/local/bin/kinesisctl

# --------------------------------------------------------------------------
section "Verification"
# --------------------------------------------------------------------------
if [ "$APPLY" -eq 1 ]; then
    "$ROOT/bin/caddy" version >/dev/null 2>&1 || problem "Caddy does not run ($ROOT/bin/caddy)"
    if [ -f "$CONFIG/caddy.env" ]; then
        "$ROOT/bin/caddy" adapt --config "$ROOT/app/deploy/caddy/Caddyfile" --adapter caddyfile \
            --envfile "$CONFIG/caddy.env" >/dev/null 2>"$WORK/adapt.log" \
            || problem "Caddyfile does not load with caddy.env: $(tail -1 "$WORK/adapt.log")"
    fi
    if [ -f "$ROOT/pki/server.crt" ]; then
        "$PKI_VENV/bin/python" "$ROOT/app/deploy/migration/preflight.py" --kinesis-env "$CONFIG/kinesis.env" \
            --caddy-env "$CONFIG/caddy.env" --expect-ip "$LAN_IP" > "$WORK/preflight.log" 2>&1 \
            || problem "preflight failed: $(grep -E '^FAIL' "$WORK/preflight.log" | head -3 | tr '\n' ';')"
    fi
fi

section "Done"
echo "  $CPU_LABEL Mac, macOS $MACOS_VERSION: $LOCK_BACKEND + $LOCK_PKI, Caddy $CADDY_ASSET"
if [ "$APPLY" -eq 0 ]; then
    echo "Dry run only. Re-run with sudo and --apply to make these changes."
    exit 0
fi
if [ -n "$PROBLEMS" ]; then
    printf 'INSTALLATION INCOMPLETE. Kinesis cannot serve terminals yet:%s\n' "$PROBLEMS" >&2
    exit 1
fi
echo "Installed. Start Kinesis (and at every boot) with: sudo kinesisctl start"
echo "Then: kinesisctl status | sudo kinesisctl doctor | kinesisctl urls"
echo "First administrator: sudo kinesisctl create-admin <username>"
