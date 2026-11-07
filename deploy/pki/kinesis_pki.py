#!/usr/bin/env python3
"""
kinesis-pki: local certificate authority for an offline Kinesis shop network.

Runs the same way on Linux, macOS and Windows (Python 3.11+ and the
"cryptography" package). It is deployment tooling only: the Kinesis
backend never imports it and never sees any private key.

Hierarchy
---------
  Kinesis Local Root CA        ECDSA P-256, 10 years, name-constrained.
                               Private key exported passphrase-encrypted
                               to offline storage and NOT kept on the host.
    Kinesis Local Issuing CA   ECDSA P-256, 5 years, same name constraints.
                               Key stays on the host (owner-only) so the
                               server certificate can renew automatically.
      Server certificate       ECDSA P-256, 365 days, serverAuth, SAN =
                               the Kinesis host names and LAN addresses.

Name constraints limit both CAs to the Kinesis host names and private
(RFC 1918) address ranges, so a device that trusts the root cannot be
attacked with certificates for other websites even if a CA key leaks.

Commands
--------
  init                 create the CA hierarchy and the first server cert
  renew                reissue the server cert when due or when names change
  status               show fingerprints, names and expiry dates
  export-ca            write the root certificate for device onboarding
  rotate-intermediate  replace the issuing CA (needs the offline root key)
  issue-constraint-test  create a deliberately invalid certificate to prove
                         that client devices enforce the name constraints

Run with --help for options. All randomness comes from the OS CSPRNG via
the cryptography package; nothing is hardcoded.
"""

from __future__ import annotations

import argparse
import datetime as dt
import getpass
import ipaddress
import json
import os
import plistlib
import re
import shlex
import socket
import subprocess
import sys
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
except ImportError:  # pragma: no cover - environment guidance
    sys.exit(
        "kinesis-pki needs the 'cryptography' package: "
        "python -m pip install -r deploy/pki/requirements.txt"
    )


ROOT_DAYS = 3650
INTERMEDIATE_DAYS = 1825
LEAF_DAYS = 365
RENEW_BEFORE_DAYS = 60

# Clock tolerance: an offline host has no NTP, so certificates are dated
# slightly in the past to stay valid on clients whose clocks are ahead.
BACKDATE = dt.timedelta(hours=1)

MIN_PASSPHRASE_LENGTH = 12

DEFAULT_PERMITTED_NETWORKS = (
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
)

ORGANIZATION = "Kinesis (local)"

ROOT_CERT = "root-ca.crt"
INTERMEDIATE_CERT = "intermediate-ca.crt"
INTERMEDIATE_KEY = "intermediate-ca.key"
SERVER_CERT = "server.crt"  # leaf + intermediate (full chain)
SERVER_KEY = "server.key"
STATE_FILE = "pki.json"

HOSTNAME_PATTERN = re.compile(
    r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$"
)


class PkiError(Exception):
    pass


# --------------------------------------------------
# State
# --------------------------------------------------


@dataclass
class PkiState:
    hostnames: list[str]
    ip_addresses: list[str]
    permitted_dns: list[str]
    permitted_networks: list[str]
    reload_command: str | None = None
    reload_env_file: str | None = None

    @classmethod
    def load(cls, directory: Path) -> "PkiState":
        path = directory / STATE_FILE

        if not path.is_file():
            raise PkiError(f"{path} not found. Run 'init' first.")

        data = json.loads(path.read_text(encoding="utf-8"))

        return cls(
            hostnames=data["hostnames"],
            ip_addresses=data["ip_addresses"],
            permitted_dns=data["permitted_dns"],
            permitted_networks=data["permitted_networks"],
            reload_command=data.get("reload_command"),
            reload_env_file=data.get("reload_env_file"),
        )

    def save(self, directory: Path) -> None:
        payload = {
            "hostnames": self.hostnames,
            "ip_addresses": self.ip_addresses,
            "permitted_dns": self.permitted_dns,
            "permitted_networks": self.permitted_networks,
            "reload_command": self.reload_command,
            "reload_env_file": self.reload_env_file,
        }

        atomic_write(
            directory / STATE_FILE,
            (json.dumps(payload, indent=2) + "\n").encode("utf-8"),
            private=False,
        )


# --------------------------------------------------
# File helpers (portable)
# --------------------------------------------------


def atomic_write(path: Path, data: bytes, *, private: bool) -> None:
    """
    Write a file atomically. Private files are created owner-only on POSIX.
    On Windows, privacy comes from the data directory's ACL (see the
    deployment guide), because os.open's mode only sets the read-only flag.
    """

    path.parent.mkdir(parents=True, exist_ok=True)

    fd, temporary = tempfile.mkstemp(
        prefix=f".{path.name}.",
        dir=path.parent,
    )

    try:
        if os.name != "nt":
            os.chmod(temporary, 0o600 if private else 0o644)

        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())

        os.replace(temporary, path)

    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def pem_certificate(certificate: x509.Certificate) -> bytes:
    return certificate.public_bytes(serialization.Encoding.PEM)


def pem_private_key(key: ec.EllipticCurvePrivateKey) -> bytes:
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )


def read_certificate(path: Path) -> x509.Certificate:
    return x509.load_pem_x509_certificate(path.read_bytes())


def read_certificates(path: Path) -> list[x509.Certificate]:
    return x509.load_pem_x509_certificates(path.read_bytes())


def read_private_key(path: Path, passphrase: bytes | None = None):
    return serialization.load_pem_private_key(path.read_bytes(), passphrase)


def fingerprint(certificate: x509.Certificate) -> str:
    digest = certificate.fingerprint(hashes.SHA256()).hex().upper()

    return ":".join(digest[i : i + 2] for i in range(0, len(digest), 2))


# --------------------------------------------------
# Input validation
# --------------------------------------------------


def normalize_hostname(value: str) -> str:
    hostname = value.strip().rstrip(".").lower()

    if not HOSTNAME_PATTERN.fullmatch(hostname):
        raise PkiError(f"Invalid host name: {value!r}")

    return hostname


def default_hostnames() -> list[str]:
    names = ["kinesis.local"]

    # The name the operating system advertises over mDNS/Bonjour, so the
    # certificate is valid whichever name a device uses.
    machine = socket.gethostname().split(".")[0].strip().lower()
    machine = re.sub(r"[^a-z0-9-]", "-", machine).strip("-")

    if machine:
        names.append(f"{machine}.local")

    return names


def parse_ip(value: str) -> str:
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError as exc:
        raise PkiError(f"Invalid IP address: {value!r}") from exc


def parse_network(value: str) -> str:
    try:
        return str(ipaddress.ip_network(value.strip(), strict=True))
    except ValueError as exc:
        raise PkiError(f"Invalid network: {value!r}") from exc


def unique(values: list[str]) -> list[str]:
    seen: list[str] = []

    for value in values:
        if value not in seen:
            seen.append(value)

    return seen


def check_names_permitted(state: PkiState) -> None:
    networks = [ipaddress.ip_network(n) for n in state.permitted_networks]

    for address in state.ip_addresses:
        ip = ipaddress.ip_address(address)

        if not any(ip in network for network in networks):
            raise PkiError(
                f"{address} is outside the CA's permitted networks "
                f"({', '.join(state.permitted_networks)}). Devices would "
                "reject the certificate."
            )

    for hostname in state.hostnames:
        if not any(
            hostname == allowed or hostname.endswith("." + allowed)
            for allowed in state.permitted_dns
        ):
            raise PkiError(
                f"{hostname} is outside the CA's permitted names "
                f"({', '.join(state.permitted_dns)})."
            )


def read_passphrase(args, *, confirm: bool) -> bytes:
    if args.passphrase_file:
        value = Path(args.passphrase_file).read_text(encoding="utf-8").strip()
    else:
        value = getpass.getpass("Root CA key passphrase: ")

        if confirm and value != getpass.getpass("Repeat passphrase: "):
            raise PkiError("The passphrases do not match.")

    if confirm and len(value) < MIN_PASSPHRASE_LENGTH:
        raise PkiError(
            f"Use a passphrase of at least {MIN_PASSPHRASE_LENGTH} characters."
        )

    return value.encode("utf-8")


# --------------------------------------------------
# Certificate construction
# --------------------------------------------------


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def new_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


def name_constraints(state: PkiState) -> x509.NameConstraints:
    permitted: list[x509.GeneralName] = [
        x509.DNSName(name) for name in state.permitted_dns
    ]
    permitted += [
        x509.IPAddress(ipaddress.ip_network(network))
        for network in state.permitted_networks
    ]

    return x509.NameConstraints(permitted_subtrees=permitted, excluded_subtrees=None)


def ca_name(common_name: str) -> x509.Name:
    return x509.Name(
        [
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, ORGANIZATION),
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ]
    )


def build_root(state: PkiState) -> tuple[x509.Certificate, ec.EllipticCurvePrivateKey]:
    key = new_key()
    now = utc_now()
    name = ca_name("Kinesis Local Root CA")

    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - BACKDATE)
        .not_valid_after(now + dt.timedelta(days=ROOT_DAYS))
        .add_extension(x509.BasicConstraints(ca=True, path_length=1), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=False,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(name_constraints(state), critical=True)
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(key.public_key()),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    return certificate, key


def build_intermediate(
    state: PkiState,
    root_certificate: x509.Certificate,
    root_key,
) -> tuple[x509.Certificate, ec.EllipticCurvePrivateKey]:
    key = new_key()
    now = utc_now()

    not_after = min(
        now + dt.timedelta(days=INTERMEDIATE_DAYS),
        root_certificate.not_valid_after_utc,
    )

    certificate = (
        x509.CertificateBuilder()
        .subject_name(ca_name("Kinesis Local Issuing CA"))
        .issuer_name(root_certificate.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - BACKDATE)
        .not_valid_after(not_after)
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=False,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        # Repeated here: not every client enforces constraints that appear
        # only on a self-signed trust anchor.
        .add_extension(name_constraints(state), critical=True)
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(
                root_key.public_key()
            ),
            critical=False,
        )
        .sign(root_key, hashes.SHA256())
    )

    return certificate, key


def build_leaf(
    hostnames: list[str],
    ip_addresses: list[str],
    intermediate_certificate: x509.Certificate,
    intermediate_key,
) -> tuple[x509.Certificate, ec.EllipticCurvePrivateKey]:
    key = new_key()
    now = utc_now()

    not_after = min(
        now + dt.timedelta(days=LEAF_DAYS),
        intermediate_certificate.not_valid_after_utc,
    )

    alternative_names: list[x509.GeneralName] = [
        x509.DNSName(name) for name in hostnames
    ]
    alternative_names += [
        x509.IPAddress(ipaddress.ip_address(address)) for address in ip_addresses
    ]

    certificate = (
        x509.CertificateBuilder()
        .subject_name(
            x509.Name(
                [
                    x509.NameAttribute(NameOID.ORGANIZATION_NAME, ORGANIZATION),
                    x509.NameAttribute(NameOID.COMMON_NAME, hostnames[0]),
                ]
            )
        )
        .issuer_name(intermediate_certificate.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - BACKDATE)
        .not_valid_after(not_after)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .add_extension(
            x509.SubjectAlternativeName(alternative_names),
            critical=False,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(
                intermediate_key.public_key()
            ),
            critical=False,
        )
        .sign(intermediate_key, hashes.SHA256())
    )

    return certificate, key


def write_leaf(
    directory: Path,
    certificate: x509.Certificate,
    key,
    intermediate_certificate: x509.Certificate,
) -> None:
    # Key first: a reload never sees a certificate without its key.
    atomic_write(directory / SERVER_KEY, pem_private_key(key), private=True)
    atomic_write(
        directory / SERVER_CERT,
        pem_certificate(certificate) + pem_certificate(intermediate_certificate),
        private=False,
    )


def leaf_names(certificate: x509.Certificate) -> tuple[set[str], set[str]]:
    try:
        san = certificate.extensions.get_extension_for_class(
            x509.SubjectAlternativeName
        ).value
    except x509.ExtensionNotFound:
        return set(), set()

    dns = set(san.get_values_for_type(x509.DNSName))
    ips = {str(ip) for ip in san.get_values_for_type(x509.IPAddress)}

    return dns, ips


def read_env_file(path: Path) -> dict[str, str]:
    """Parse simple KEY=VALUE lines (the format Caddy's --envfile uses)."""

    values: dict[str, str] = {}

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"')

    return values


def run_reload(state: PkiState) -> None:
    if not state.reload_command:
        print("No reload command configured; restart the proxy to use the new certificate.")
        return

    environment = os.environ.copy()

    if state.reload_env_file:
        # `caddy reload` re-adapts the Caddyfile, whose site addresses come
        # from environment variables, but has no --envfile option.
        environment.update(read_env_file(Path(state.reload_env_file)))

    command = shlex.split(state.reload_command, posix=os.name != "nt")
    result = subprocess.run(command, check=False, env=environment)

    if result.returncode != 0:
        raise PkiError(f"Reload command failed with exit code {result.returncode}.")


# --------------------------------------------------
# Commands
# --------------------------------------------------


def command_init(args) -> None:
    directory = Path(args.pki_dir).resolve()

    if (directory / INTERMEDIATE_KEY).exists() and not args.force:
        raise PkiError(
            f"A CA already exists in {directory}. Re-initializing means every "
            "device must trust a new root. Pass --force to do that deliberately."
        )

    root_key_out = Path(args.root_key_out).resolve()

    if directory in root_key_out.parents and not args.keep_root_key_on_host:
        raise PkiError(
            "--root-key-out points inside the PKI directory on this host. Write "
            "the root key to removable/offline storage, or pass "
            "--keep-root-key-on-host to accept that risk explicitly."
        )

    hostnames = unique(
        [normalize_hostname(h) for h in (args.hostname or default_hostnames())]
    )
    ip_addresses = unique([parse_ip(ip) for ip in args.ip or []])

    if not ip_addresses:
        raise PkiError(
            "Give the host's LAN address with --ip (reserve it in the router's "
            "DHCP settings so it does not change)."
        )

    state = PkiState(
        hostnames=hostnames,
        ip_addresses=ip_addresses,
        permitted_dns=unique(
            [normalize_hostname(d) for d in (args.permit_dns or hostnames)]
        ),
        permitted_networks=unique(
            [parse_network(n) for n in (args.permit_network or DEFAULT_PERMITTED_NETWORKS)]
        ),
        reload_command=args.reload_command,
        reload_env_file=args.reload_env_file,
    )

    check_names_permitted(state)

    passphrase = read_passphrase(args, confirm=True)

    root_certificate, root_key = build_root(state)
    intermediate_certificate, intermediate_key = build_intermediate(
        state, root_certificate, root_key
    )
    leaf_certificate, leaf_key = build_leaf(
        hostnames, ip_addresses, intermediate_certificate, intermediate_key
    )

    atomic_write(
        root_key_out,
        root_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.BestAvailableEncryption(passphrase),
        ),
        private=True,
    )

    atomic_write(directory / ROOT_CERT, pem_certificate(root_certificate), private=False)
    atomic_write(
        directory / INTERMEDIATE_KEY, pem_private_key(intermediate_key), private=True
    )
    atomic_write(
        directory / INTERMEDIATE_CERT,
        pem_certificate(intermediate_certificate),
        private=False,
    )
    write_leaf(directory, leaf_certificate, leaf_key, intermediate_certificate)
    state.save(directory)

    del root_key

    print(f"Kinesis CA created in {directory}")
    print(f"Encrypted root key written to {root_key_out}")
    print("  Keep it (and its passphrase) offline. It is only needed to")
    print("  replace the issuing CA, every few years or after a compromise.")
    print()
    print_status(directory, state)


def command_renew(args) -> None:
    directory = Path(args.pki_dir).resolve()
    state = PkiState.load(directory)

    if args.ip:
        state.ip_addresses = unique([parse_ip(ip) for ip in args.ip])

    if args.hostname:
        state.hostnames = unique([normalize_hostname(h) for h in args.hostname])

    if args.reload_command is not None:
        state.reload_command = args.reload_command or None

    if args.reload_env_file is not None:
        state.reload_env_file = args.reload_env_file or None

    check_names_permitted(state)

    intermediate_certificate = read_certificate(directory / INTERMEDIATE_CERT)
    intermediate_key = read_private_key(directory / INTERMEDIATE_KEY)

    reason = None
    leaf_path = directory / SERVER_CERT

    if args.force:
        reason = "forced"
    elif not leaf_path.exists():
        reason = "no server certificate"
    else:
        leaf = read_certificates(leaf_path)[0]
        remaining = leaf.not_valid_after_utc - utc_now()
        dns, ips = leaf_names(leaf)

        if remaining < dt.timedelta(days=RENEW_BEFORE_DAYS):
            reason = f"expires in {remaining.days} days"
        elif dns != set(state.hostnames) or ips != set(state.ip_addresses):
            reason = "host names or addresses changed"

    remaining_ca = intermediate_certificate.not_valid_after_utc - utc_now()

    if remaining_ca < dt.timedelta(days=RENEW_BEFORE_DAYS):
        print(
            f"WARNING: the issuing CA expires in {remaining_ca.days} days. "
            "Run 'rotate-intermediate' with the offline root key.",
            file=sys.stderr,
        )

    if reason is None:
        print("Server certificate is current; nothing to do.")
        state.save(directory)
        return

    leaf_certificate, leaf_key = build_leaf(
        state.hostnames, state.ip_addresses, intermediate_certificate, intermediate_key
    )
    write_leaf(directory, leaf_certificate, leaf_key, intermediate_certificate)
    state.save(directory)

    print(f"Server certificate reissued ({reason}).")

    if not args.no_reload:
        run_reload(state)


def print_status(directory: Path, state: PkiState) -> None:
    root = read_certificate(directory / ROOT_CERT)
    intermediate = read_certificate(directory / INTERMEDIATE_CERT)

    print("Root CA SHA-256 fingerprint (compare on each device before trusting):")
    print(f"  {fingerprint(root)}")
    print(f"Root CA valid until:     {root.not_valid_after_utc:%Y-%m-%d}")
    print(f"Issuing CA valid until:  {intermediate.not_valid_after_utc:%Y-%m-%d}")

    leaf_path = directory / SERVER_CERT

    if leaf_path.exists():
        leaf = read_certificates(leaf_path)[0]
        dns, ips = leaf_names(leaf)
        print(f"Server cert valid until: {leaf.not_valid_after_utc:%Y-%m-%d}")
        print(f"Server cert names:       {', '.join(sorted(dns) + sorted(ips))}")

    print(f"Permitted names:         {', '.join(state.permitted_dns)}")
    print(f"Permitted networks:      {', '.join(state.permitted_networks)}")


def command_status(args) -> None:
    directory = Path(args.pki_dir).resolve()
    print_status(directory, PkiState.load(directory))


def command_export_ca(args) -> None:
    directory = Path(args.pki_dir).resolve()
    output = Path(args.out).resolve()
    root = read_certificate(directory / ROOT_CERT)

    der = root.public_bytes(serialization.Encoding.DER)

    atomic_write(output / "kinesis-root.crt", pem_certificate(root), private=False)
    # DER copy: some Android versions only accept binary certificates.
    atomic_write(output / "kinesis-root.cer", der, private=False)

    # Unsigned configuration profile for iPhone/iPad. iOS shows it as
    # "Unverified"; the fingerprint check is what establishes trust.
    profile_uuid = str(uuid.uuid4()).upper()
    payload_uuid = str(uuid.uuid4()).upper()

    profile = {
        "PayloadType": "Configuration",
        "PayloadVersion": 1,
        "PayloadIdentifier": f"local.kinesis.ca.{profile_uuid}",
        "PayloadUUID": profile_uuid,
        "PayloadDisplayName": "Kinesis Local Root CA",
        "PayloadDescription": (
            "Lets this device connect securely to the Kinesis server on the "
            "shop network. Root fingerprint (SHA-256): " + fingerprint(root)
        ),
        "PayloadOrganization": ORGANIZATION,
        "PayloadRemovalDisallowed": False,
        "PayloadContent": [
            {
                "PayloadType": "com.apple.security.root",
                "PayloadVersion": 1,
                "PayloadIdentifier": f"local.kinesis.ca.root.{payload_uuid}",
                "PayloadUUID": payload_uuid,
                "PayloadDisplayName": "Kinesis Local Root CA",
                "PayloadCertificateFileName": "kinesis-root.cer",
                "PayloadContent": der,
            }
        ],
    }

    atomic_write(
        output / "kinesis-root.mobileconfig",
        plistlib.dumps(profile, fmt=plistlib.FMT_XML),
        private=False,
    )

    atomic_write(
        output / "fingerprint.txt",
        (fingerprint(root) + "\n").encode("ascii"),
        private=False,
    )

    state = PkiState.load(directory)

    atomic_write(
        output / "index.html",
        onboarding_page(fingerprint(root), state.hostnames[0]).encode("utf-8"),
        private=False,
    )

    print(f"Onboarding files written to {output}")
    print(f"Root CA SHA-256 fingerprint: {fingerprint(root)}")


def onboarding_page(root_fingerprint: str, hostname: str) -> str:
    """
    Static instructions served over plain HTTP before a device trusts the
    CA. No scripts; values are generated by this tool (hex and a validated
    host name), so no untrusted input is interpolated.
    """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect this device to Kinesis</title>
<style>
body {{ font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }}
code {{ word-break: break-all; font-size: 0.95rem; background: #eee; padding: 0.4rem; display: block; }}
a.button {{ display: inline-block; padding: 0.6rem 1rem; background: #1e66f5; color: #fff; border-radius: 0.4rem; text-decoration: none; margin: 0.25rem 0; }}
</style>
</head>
<body>
<h1>Connect this device to Kinesis</h1>
<p>Kinesis uses a certificate authority created on this shop's server. Install
it once on each phone, tablet or computer that uses Kinesis.</p>

<h2>1. Check the fingerprint</h2>
<p>The fingerprint below must exactly match the one shown on the Kinesis server
screen (and in the admin console). If it differs, stop and ask the shop owner.</p>
<code>{root_fingerprint}</code>

<h2>2. Install the certificate</h2>
<p><a class="button" href="/kinesis-root.mobileconfig">iPhone / iPad (open in Safari)</a></p>
<p><a class="button" href="/kinesis-root.crt">Android, Windows, macOS, Linux</a></p>
<p>On iPhone/iPad, after installing the profile also enable it under
<em>Settings &gt; General &gt; About &gt; Certificate Trust Settings</em>.</p>

<h2>3. Open Kinesis</h2>
<p>Go to <strong>https://{hostname}</strong>. On iPhone, use
<em>Share &gt; Add to Home Screen</em>, open Kinesis from the Home Screen, and
pair the terminal there.</p>
</body>
</html>
"""


def command_rotate_intermediate(args) -> None:
    directory = Path(args.pki_dir).resolve()
    state = PkiState.load(directory)

    root_certificate = read_certificate(directory / ROOT_CERT)
    passphrase = read_passphrase(args, confirm=False)

    try:
        root_key = read_private_key(Path(args.root_key), passphrase)
    except (ValueError, TypeError) as exc:
        raise PkiError("Could not decrypt the root key (wrong passphrase?).") from exc

    if root_key.public_key().public_numbers() != (
        root_certificate.public_key().public_numbers()
    ):
        raise PkiError("That key does not belong to this Kinesis root CA.")

    intermediate_certificate, intermediate_key = build_intermediate(
        state, root_certificate, root_key
    )
    leaf_certificate, leaf_key = build_leaf(
        state.hostnames, state.ip_addresses, intermediate_certificate, intermediate_key
    )

    atomic_write(
        directory / INTERMEDIATE_KEY, pem_private_key(intermediate_key), private=True
    )
    atomic_write(
        directory / INTERMEDIATE_CERT,
        pem_certificate(intermediate_certificate),
        private=False,
    )
    write_leaf(directory, leaf_certificate, leaf_key, intermediate_certificate)

    print("Issuing CA and server certificate replaced. Devices need no changes.")

    if not args.no_reload:
        run_reload(state)


def command_issue_constraint_test(args) -> None:
    """
    Issue a certificate that names a valid Kinesis host AND a forbidden
    name. Clients that enforce name constraints must reject it even though
    the host name matches. Never install it on the production listener.
    """

    directory = Path(args.pki_dir).resolve()
    state = PkiState.load(directory)
    output = Path(args.out).resolve()

    intermediate_certificate = read_certificate(directory / INTERMEDIATE_CERT)
    intermediate_key = read_private_key(directory / INTERMEDIATE_KEY)

    leaf_certificate, leaf_key = build_leaf(
        [state.hostnames[0], normalize_hostname(args.forbidden_name)],
        state.ip_addresses,
        intermediate_certificate,
        intermediate_key,
    )

    atomic_write(output / "constraint-test.key", pem_private_key(leaf_key), private=True)
    atomic_write(
        output / "constraint-test.crt",
        pem_certificate(leaf_certificate) + pem_certificate(intermediate_certificate),
        private=False,
    )

    print(f"Test certificate written to {output}. Serve it on a spare port; every")
    print("device must REFUSE the connection. If one accepts it, that device does")
    print("not enforce name constraints; record it in the security report.")


# --------------------------------------------------
# CLI
# --------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kinesis-pki",
        description="Local certificate authority for an offline Kinesis network.",
    )
    parser.add_argument(
        "--pki-dir",
        required=True,
        help="Directory holding the CA and server certificates "
        "(for example <KINESIS_DATA_DIR>/pki).",
    )

    commands = parser.add_subparsers(dest="command", required=True)

    init = commands.add_parser("init", help="Create the CA and first server certificate.")
    init.add_argument("--hostname", action="append", help="Server host name (repeatable). Default: kinesis.local and <computer-name>.local.")
    init.add_argument("--ip", action="append", help="Server LAN IP address (repeatable). Required.")
    init.add_argument("--permit-dns", action="append", help="Name-constraint DNS subtree (repeatable). Default: the host names.")
    init.add_argument("--permit-network", action="append", help="Name-constraint IP network (repeatable). Default: RFC 1918 private ranges.")
    init.add_argument("--root-key-out", required=True, help="Where to write the encrypted root key (offline media).")
    init.add_argument("--keep-root-key-on-host", action="store_true", help="Allow --root-key-out inside the PKI directory.")
    init.add_argument("--passphrase-file", help="Read the root key passphrase from a file instead of prompting.")
    init.add_argument("--reload-command", help="Command run after renewal, e.g. \"caddy reload --config ...\".")
    init.add_argument("--reload-env-file", help="Environment file loaded for the reload command (e.g. caddy.env).")
    init.add_argument("--force", action="store_true", help="Replace an existing CA (all devices must re-trust).")
    init.set_defaults(handler=command_init)

    renew = commands.add_parser("renew", help="Reissue the server certificate when due.")
    renew.add_argument("--ip", action="append", help="Replace the server IP addresses.")
    renew.add_argument("--hostname", action="append", help="Replace the server host names.")
    renew.add_argument("--reload-command", help="Set the reload command (empty string clears it).")
    renew.add_argument("--reload-env-file", help="Set the reload environment file (empty string clears it).")
    renew.add_argument("--force", action="store_true", help="Reissue even if not due.")
    renew.add_argument("--no-reload", action="store_true", help="Do not run the reload command.")
    renew.set_defaults(handler=command_renew)

    status = commands.add_parser("status", help="Show fingerprints and expiry dates.")
    status.set_defaults(handler=command_status)

    export = commands.add_parser("export-ca", help="Write device onboarding files.")
    export.add_argument("--out", required=True, help="Output directory (served by the onboarding page).")
    export.set_defaults(handler=command_export_ca)

    rotate = commands.add_parser("rotate-intermediate", help="Replace the issuing CA.")
    rotate.add_argument("--root-key", required=True, help="Encrypted root key from offline storage.")
    rotate.add_argument("--passphrase-file", help="Read the passphrase from a file instead of prompting.")
    rotate.add_argument("--no-reload", action="store_true")
    rotate.set_defaults(handler=command_rotate_intermediate)

    test = commands.add_parser("issue-constraint-test", help="Create a deliberately invalid cert for device testing.")
    test.add_argument("--out", required=True)
    test.add_argument("--forbidden-name", default="name-constraint-test.example.com")
    test.set_defaults(handler=command_issue_constraint_test)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        args.handler(args)
    except PkiError as exc:
        print(f"kinesis-pki: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
