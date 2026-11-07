#!/usr/bin/env python3
"""
Check a production web build before deploying it.

    npx expo export -p web --output-dir dist
    python deploy/tools/check_web_build.py dist --caddyfile deploy/caddy/Caddyfile

Fails (exit 1) when:
  * an inline <script> is not allowed by a sha256 hash in the Caddyfile CSP
    (Expo upgrades can change the hydration snippet);
  * the bundle contains values from local .env files other than the
    intended public server URL, or text that looks like a secret;
  * native-only credential storage code (expo-secure-store) leaked into it.

Uses only the Python standard library; runs on Linux, macOS and Windows.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import re
import sys
from pathlib import Path


INLINE_SCRIPT = re.compile(
    r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)

SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "admin auth secret": re.compile(r"KINESIS_ADMIN_AUTH_SECRET_KEY"),
    "database password": re.compile(r"DATABASE_PASSWORD"),
    "secure-store module": re.compile(r"ExpoSecureStore|expo-secure-store"),
    "credential key": re.compile(r"kinesis-(terminal|cashier)-session-token"),
}

# Only compare values of secret-like settings; ordinary values such as
# "development" legitimately appear in JavaScript.
SECRET_KEY_NAME = re.compile(r"PASSWORD|SECRET|TOKEN|_KEY$|_KEY_|PASSPHRASE", re.IGNORECASE)

# Public by design: the native apps' server address.
PUBLIC_ENV_PREFIXES = ("EXPO_PUBLIC_",)


def csp_hashes(caddyfile: Path) -> set[str]:
    return set(re.findall(r"'(sha256-[A-Za-z0-9+/=]+)'", caddyfile.read_text("utf-8")))


def env_values(root: Path) -> dict[str, str]:
    values: dict[str, str] = {}

    for env_file in list(root.glob(".env*")) + list((root / "backend").glob(".env*")):
        if env_file.name.endswith(".example"):
            continue

        for line in env_file.read_text("utf-8", errors="replace").splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue

            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip('"')

            if (
                len(value) >= 8
                and SECRET_KEY_NAME.search(key)
                and not key.startswith(PUBLIC_ENV_PREFIXES)
            ):
                values[key] = value

    return values


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dist", type=Path)
    parser.add_argument("--caddyfile", type=Path, required=True)
    parser.add_argument("--project-root", type=Path, default=Path("."))
    args = parser.parse_args()

    problems: list[str] = []
    allowed = csp_hashes(args.caddyfile)
    secrets_from_env = env_values(args.project_root)

    for path in args.dist.rglob("*"):
        if not path.is_file() or path.suffix not in {".html", ".js", ".json", ".css", ".map"}:
            continue

        text = path.read_text("utf-8", errors="replace")
        relative = path.relative_to(args.dist)

        if path.suffix == ".html":
            for script in INLINE_SCRIPT.findall(text):
                digest = "sha256-" + base64.b64encode(
                    hashlib.sha256(script.encode("utf-8")).digest()
                ).decode()

                if digest not in allowed:
                    problems.append(
                        f"{relative}: inline script not allowed by CSP: '{digest}'"
                    )

        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                problems.append(f"{relative}: contains {label}")

        for key, value in secrets_from_env.items():
            if value in text:
                problems.append(f"{relative}: contains the value of {key} from a .env file")

    for problem in sorted(set(problems)):
        print(f"FAIL {problem}")

    if problems:
        return 1

    print(f"OK: {args.dist} passes CSP-hash and secret checks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
