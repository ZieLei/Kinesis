#!/usr/bin/env python3
"""
kinesis-config: write a host's kinesis.env / caddy.env from the shop
templates, and produce the SQL that creates the database role.

Standard library only; used by the Linux and macOS installers.

    kinesis_config.py render --template T --out F --mode 0640 \
        [--owner USER[:GROUP]] [--set KEY=VALUE ...] [--generate KEY ...] \
        [--header TEXT]
    kinesis_config.py role-sql --env-file F            # SQL on stdout
    kinesis_config.py get --env-file F KEY             # non-secret values only

Secrets never appear on a command line or in the terminal:
* ``--generate KEY`` creates the value inside this process;
* ``role-sql`` prints SQL meant to be piped straight into ``psql`` on stdin,
  and the password in it is a SCRAM-SHA-256 verifier computed here, so the
  plaintext never reaches the PostgreSQL server or its logs;
* ``get`` refuses keys that hold secrets.

``render`` never overwrites an existing file: re-running an installer keeps
the secrets, database password and any edits already made.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import os
import re
import secrets
import sys
import tempfile
from pathlib import Path

SECRET_KEY_PATTERN = re.compile(r"(PASSWORD|SECRET|_KEY$|TOKEN)", re.IGNORECASE)
KEY_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")
IDENTIFIER_PATTERN = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
SCRAM_ITERATIONS = 4096  # PostgreSQL's default scram_iterations


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def parse_assignments(items: list[str]) -> dict[str, str]:
    result = {}
    for item in items:
        if "=" not in item:
            raise SystemExit(f"--set needs KEY=VALUE, got {item!r}")
        key, value = item.split("=", 1)
        if not KEY_PATTERN.match(key):
            raise SystemExit(f"invalid key {key!r}")
        if SECRET_KEY_PATTERN.search(key):
            raise SystemExit(f"{key} holds a secret: use --generate, not --set")
        if "\n" in value:
            raise SystemExit(f"{key}: value must be one line")
        result[key] = value
    return result


def new_secret(key: str) -> str:
    # URL-safe base64: no quotes, spaces, '$' or '#', so the value is safe in
    # env files read by systemd, launchd wrappers, python-dotenv and Caddy,
    # and inside a SQL string literal.
    return secrets.token_urlsafe(48 if "SECRET" in key.upper() else 32)


def render_text(template: str, overrides: dict[str, str], header: str | None) -> str:
    lines = template.splitlines()
    out: list[str] = []
    seen: set[str] = set()

    # Replace the template's leading comment block (install instructions for
    # the template itself) with a generated header.
    index = 0
    if header is not None:
        while index < len(lines) and (lines[index].startswith("#") or not lines[index].strip()):
            index += 1
        out.extend(f"# {h}" if h else "#" for h in header.splitlines())
        out.append("")

    for line in lines[index:]:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in overrides:
                out.append(f"{key}={overrides[key]}")
                seen.add(key)
                continue
        out.append(line)

    missing = [k for k in overrides if k not in seen]
    if missing:
        out.append("")
        out.append("# Added by the Kinesis installer")
        out.extend(f"{k}={overrides[k]}" for k in missing)

    text = "\n".join(out).rstrip("\n") + "\n"
    leftovers = re.findall(r"^[A-Z0-9_]+=__[A-Z0-9_]+__$", text, flags=re.MULTILINE)
    if leftovers:
        raise SystemExit("placeholders left in output: " + ", ".join(sorted(leftovers)))
    return text


def write_private(path: Path, text: str, mode: int, owner: str | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        if owner:
            import shutil
            user, _, group = owner.partition(":")
            shutil.chown(temporary, user=user or None, group=group or None)
        # O_EXCL-like: never replace a file that appeared meanwhile.
        os.link(temporary, path)
    finally:
        os.unlink(temporary)


def command_render(args) -> int:
    out = Path(args.out)
    if out.exists():
        print(f"  kept existing {out} (secrets and edits preserved)")
        return 0

    overrides = parse_assignments(args.set or [])
    for key in args.generate or []:
        if not KEY_PATTERN.match(key):
            raise SystemExit(f"invalid key {key!r}")
        overrides[key] = new_secret(key)

    text = render_text(Path(args.template).read_text(encoding="utf-8"), overrides, args.header)
    write_private(out, text, int(args.mode, 8), args.owner)
    generated = f" (generated: {', '.join(args.generate)})" if args.generate else ""
    print(f"  wrote {out} mode {args.mode}{generated}")
    return 0


def scram_verifier(password: str, iterations: int = SCRAM_ITERATIONS) -> str:
    """PostgreSQL's SCRAM-SHA-256 verifier (RFC 7677 / RFC 5802)."""

    salt = secrets.token_bytes(16)
    salted = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()

    def b64(data: bytes) -> str:
        return base64.b64encode(data).decode("ascii")

    return f"SCRAM-SHA-256${iterations}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}"


def command_role_sql(args) -> int:
    env = read_env(Path(args.env_file))
    user = env.get("DATABASE_USER", "")
    database = env.get("DATABASE_NAME", "")
    password = env.get("DATABASE_PASSWORD", "")

    for label, value in (("DATABASE_USER", user), ("DATABASE_NAME", database)):
        if not IDENTIFIER_PATTERN.match(value):
            raise SystemExit(f"{label} {value!r} must be a lower-case SQL identifier")
    if len(password) < 24 or password.startswith("__"):
        raise SystemExit("DATABASE_PASSWORD is missing or too short in the env file")

    verifier = scram_verifier(password)
    statement = "ALTER" if args.alter else "CREATE"
    attributes = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"
    sys.stdout.write(f"{statement} ROLE {user} WITH {attributes} PASSWORD '{verifier}';\n")
    return 0


def command_get(args) -> int:
    if SECRET_KEY_PATTERN.search(args.key):
        raise SystemExit(f"{args.key} holds a secret and is never printed")
    env = read_env(Path(args.env_file))
    if args.key not in env:
        return 1
    print(env[args.key])
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kinesis-config")
    sub = parser.add_subparsers(dest="command", required=True)

    render = sub.add_parser("render")
    render.add_argument("--template", required=True)
    render.add_argument("--out", required=True)
    render.add_argument("--mode", default="0600")
    render.add_argument("--owner")
    render.add_argument("--set", action="append")
    render.add_argument("--generate", action="append")
    render.add_argument("--header")
    render.set_defaults(handler=command_render)

    role = sub.add_parser("role-sql")
    role.add_argument("--env-file", required=True)
    role.add_argument("--alter", action="store_true")
    role.set_defaults(handler=command_role_sql)

    get = sub.add_parser("get")
    get.add_argument("--env-file", required=True)
    get.add_argument("key")
    get.set_defaults(handler=command_get)

    args = parser.parse_args(argv)
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
