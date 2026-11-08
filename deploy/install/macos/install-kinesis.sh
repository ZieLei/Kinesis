#!/bin/bash
# Provision a Mac (macOS 13+, Apple silicon or Intel) as the Kinesis host
# (phase 1 of docs/deployment/MIGRATION.md). Idempotent.
#
# DRY RUN BY DEFAULT: prints every command. Pass --apply (with sudo) to run.
#
#   sudo ./install-kinesis.sh --release /path/to/kinesis-v1.4.2 \
#        --web-pos /path/to/pos-build --web-admin /path/to/admin-build --apply
#
# The processor is detected automatically; nobody chooses an architecture:
#   * Apple silicon -> backend/requirements.lock, deploy/pki/requirements.lock,
#                      Caddy mac_arm64
#   * Intel         -> backend/requirements-macos-intel.lock,
#                      deploy/pki/requirements-macos-intel.lock, Caddy mac_amd64
# If the script itself runs under Rosetta on Apple silicon, it restarts
# natively. Python, PostgreSQL, Caddy and the virtual environment must all
# run natively; anything else is refused with an explanation instead of
# being installed.
#
# Before running (one installer each, the same file for both processors):
#   * Python 3.13 from python.org ("macOS 64-bit universal2 installer")
#   * PostgreSQL 18 from postgresql.org (EDB installer)
#
# What it does: checks the above; creates the hidden accounts _kinesis and
# _kinesisproxy; creates /Library/Application Support/Kinesis with
# permissions; copies the code and web apps; builds the venv from the
# hash-checked lock for this processor; installs Caddy (downloaded and
# SHA-512-verified, or --caddy-binary); allows Caddy in the firewall;
# installs the launchd daemons WITHOUT starting them.
#
# What it does NOT do: create the database, write kinesis.env/caddy.env,
# copy certificates or data, change power, update or FileVault settings, or
# start anything. Those are reviewed steps in MIGRATION.md.
#
# Testing on another OS (dry run only):
#   --simulate-arch arm64|x86_64  --simulate-macos 14.5  --simulate-rosetta
#
# Compatible with the bash 3.2 that ships with macOS.
set -eu

APPLY=0
RELEASE=""
WEB_POS=""
WEB_ADMIN=""
CADDY_BINARY=""
PYTHON="/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13"
PG_BIN="/Library/PostgreSQL/18/bin"
SIM_ARCH=""
SIM_MACOS=""
SIM_ROSETTA=0

CADDY_VERSION="2.11.4"
ROOT="/Library/Application Support/Kinesis"
DAEMONS="/Library/LaunchDaemons"
MIN_MACOS_MAJOR=13

usage() {
    sed -n '2,38p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
section() { printf '\n== %s\n' "$1"; }

ORIGINAL_ARGS=("$@")

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --release) RELEASE="$2"; shift ;;
        --web-pos) WEB_POS="$2"; shift ;;
        --web-admin) WEB_ADMIN="$2"; shift ;;
        --caddy-binary) CADDY_BINARY="$2"; shift ;;
        --python) PYTHON="$2"; shift ;;
        --pg-bin) PG_BIN="$2"; shift ;;
        --simulate-arch) SIM_ARCH="$2"; shift ;;
        --simulate-macos) SIM_MACOS="$2"; shift ;;
        --simulate-rosetta) SIM_ROSETTA=1 ;;
        -h|--help) usage 0 ;;
        *) echo "Unknown option: $1" >&2; usage 2 ;;
    esac
    shift
done

SIMULATED=0
if [ -n "$SIM_ARCH" ] || [ -n "$SIM_MACOS" ] || [ "$SIM_ROSETTA" -eq 1 ]; then
    SIMULATED=1
    [ "$APPLY" -eq 0 ] || die "--simulate-* options are for dry runs only."
fi

[ -n "$RELEASE" ] && [ -n "$WEB_POS" ] && [ -n "$WEB_ADMIN" ] || usage 2

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
echo "  Lock files: $LOCK_BACKEND, $LOCK_PKI"
echo "  Caddy:      $CADDY_ASSET"

for required in "$RELEASE/backend/main.py" "$RELEASE/$LOCK_BACKEND" "$RELEASE/$LOCK_PKI" \
                "$RELEASE/deploy/caddy/Caddyfile" "$RELEASE/deploy/services/launchd/local.kinesis.backend.plist" \
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
    echo "  This Mac already uses 192.168.254.199. Provision it on a temporary" >&2
    echo "  address; it takes .199 only at cutover." >&2
    [ "$APPLY" -eq 1 ] && exit 2
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
    for tool in pg_dump pg_restore; do
        [ -x "$PG_BIN/$tool" ] || die "$PG_BIN/$tool is missing (needed for backups)."
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
section "Code and virtual environment"
# --------------------------------------------------------------------------
run rsync -a --delete --exclude '__pycache__' --exclude 'tests/' --exclude 'venv/' \
    --exclude 'uploads/' --exclude '.env*' "$RELEASE/backend/" "$ROOT/app/backend/"
run rsync -a --delete --exclude '__pycache__' "$RELEASE/deploy/" "$ROOT/app/deploy/"
run chown -R root:wheel "$ROOT/app"

VENV="$ROOT/venv"
VENV_PY="$VENV/bin/python"
CLEAR=""
if [ "$SIMULATED" -eq 0 ] && [ -x "$VENV_PY" ]; then
    EXISTING="$(arch "-$HW_ARCH" "$VENV_PY" -c 'import platform; print(platform.machine())' 2>/dev/null || echo unknown)"
    if [ "$EXISTING" != "$HW_ARCH" ]; then
        echo "  Existing venv runs as $EXISTING, not $HW_ARCH: it is rebuilt."
        CLEAR="--clear"
    fi
fi
if [ ! -x "$VENV_PY" ] || [ -n "$CLEAR" ]; then
    run arch "-$HW_ARCH" "$PYTHON" -m venv $CLEAR "$VENV"
fi
run arch "-$HW_ARCH" "$VENV_PY" -m pip install --require-hashes --only-binary :all: -r "$ROOT/app/$LOCK_BACKEND"
run arch "-$HW_ARCH" "$VENV_PY" -m pip install --require-hashes --only-binary :all: -r "$ROOT/app/$LOCK_PKI"
run arch "-$HW_ARCH" "$VENV_PY" -m pip check

# Every compiled extension must contain code for this processor.
CHECK_EXTENSIONS='
import pathlib, subprocess, sys, sysconfig
arch = sys.argv[1]
bad = []
site = pathlib.Path(sysconfig.get_paths()["purelib"])
for so in [*site.rglob("*.so"), *site.rglob("*.dylib")]:
    archs = subprocess.run(["lipo", "-archs", str(so)], capture_output=True, text=True).stdout.split()
    if arch not in archs:
        bad.append(f"{so.name}: {archs}")
import fastapi, uvicorn, sqlalchemy, psycopg, argon2, cryptography  # noqa: F401
if bad:
    sys.exit("Extensions without " + arch + " code:\n  " + "\n  ".join(bad))
print("  all compiled extensions are native", arch)
'
if [ "$APPLY" -eq 1 ]; then
    arch "-$HW_ARCH" "$VENV_PY" -c "$CHECK_EXTENSIONS" "$HW_ARCH" || die "The virtual environment is not native $HW_ARCH."
else
    echo "+ check every compiled extension in the venv contains $HW_ARCH code"
fi

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
section "launchd daemons (installed, NOT started)"
# --------------------------------------------------------------------------
for plist in local.kinesis.backend.plist local.kinesis.caddy.plist local.kinesis.pki-renew.plist; do
    run install -o root -g wheel -m 0644 "$ROOT/app/deploy/services/launchd/$plist" "$DAEMONS/$plist"
    if [ "$SIMULATED" -eq 0 ]; then
        run plutil -lint "$DAEMONS/$plist"
    fi
done

section "Done"
echo "  $CPU_LABEL Mac, macOS $MACOS_VERSION: $LOCK_BACKEND + $LOCK_PKI, Caddy $CADDY_ASSET"
if [ "$APPLY" -eq 0 ]; then
    echo "Dry run only. Re-run with sudo and --apply to make these changes."
fi
echo "Next: MIGRATION.md phase 1 (database role, config files, certificates, power settings)."
