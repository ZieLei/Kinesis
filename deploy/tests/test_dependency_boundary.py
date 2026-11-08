"""
Enforce the dependency boundary that the Intel-Mac security exception and
the separate PKI virtual environment rely on.

Run with any Python 3.11+ (standard library only, no database):

    python -m unittest discover -s deploy/tests -v

What is enforced, and why
-------------------------
* The backend never imports ``cryptography`` and its lock files never pin
  it. The network-facing backend therefore never loads the library or the
  OpenSSL it bundles.
* The deployment tools that do use it (``kinesis_pki.py``, ``preflight.py``)
  import only an allow-listed set of modules and names: X.509 certificate
  building/parsing, SHA-256, EC keys on NIST curves, PEM/PKCS#8. Every
  known advisory against the Intel-Mac pin (cryptography 48.0.1 with
  OpenSSL 4.0.1) is in an API outside this list: PKCS#7 decryption,
  ``x509.verification``, CMS, CRLs, OCSP, AEAD ciphers, non-NIST curves,
  or concurrent use from several threads.
* Only the Intel-Mac PKI lock may pin a cryptography release older than
  49.0.0.

If a change needs an API outside the allow-list, this test fails on purpose:
re-assess deploy/pki/requirements-macos-intel.lock before widening it.
"""

from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PKI_TOOLS = (
    ROOT / "deploy" / "pki" / "kinesis_pki.py",
    ROOT / "deploy" / "migration" / "preflight.py",
)

ALLOWED_MODULES = {
    "cryptography",
    "cryptography.x509",
    "cryptography.x509.oid",
    "cryptography.hazmat.primitives",
    "cryptography.hazmat.primitives.asymmetric",
}

# Names that may be imported from each allowed module.
ALLOWED_FROM = {
    "cryptography": {"x509"},
    "cryptography.x509.oid": {"ExtendedKeyUsageOID", "NameOID"},
    "cryptography.hazmat.primitives": {"hashes", "serialization"},
    "cryptography.hazmat.primitives.asymmetric": {"ec"},
}

# Attribute names that would reach code covered by an open advisory against
# the Intel pin (or by OpenSSL 4.0.2/4.0.3 fixes). Matched anywhere in the
# tool's AST, so aliasing a module does not get around the check.
FORBIDDEN_ATTRIBUTES = {
    "verification",          # CVE-2026-69248 / -69249 (x509.verification)
    "PolicyBuilder",
    "Store",
    "pkcs7",                 # CVE-2026-69247 (PKCS#7 EnvelopedData)
    "pkcs7_decrypt_der",
    "pkcs7_decrypt_pem",
    "pkcs7_decrypt_smime",
    "pkcs12",
    "ocsp",                  # OpenSSL OCSP fixes
    "load_pem_x509_crl",     # OpenSSL CRLDP fix (CVE-2026-35189)
    "load_der_x509_crl",
    "CertificateRevocationListBuilder",
    "aead",                  # OpenSSL AEAD fix (CVE-2026-75803)
    "ciphers",
    "fernet",
    "SECT571K1", "SECT571R1", "SECT409K1", "SECT409R1", "SECT283K1",
    "SECT283R1", "SECT233K1", "SECT233R1", "SECT163K1", "SECT163R2",
    "BrainpoolP256R1", "BrainpoolP384R1", "BrainpoolP512R1",
    "SECP256K1",             # non-NIST curves (CVE-2026-54872)
}

ALLOWED_CURVES = {"SECP256R1", "SECP384R1"}

# OpenSSL 4.0.3 fixed a use-after-free under concurrent use of one
# certificate (CVE-2026-84783): the tools must stay single-threaded.
FORBIDDEN_STDLIB = {"threading", "concurrent", "multiprocessing", "asyncio"}


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _backend_sources() -> list[Path]:
    backend = ROOT / "backend"
    skip = {"venv", ".venv", "node_modules", "__pycache__", "tests"}
    return [
        p for p in backend.rglob("*.py")
        if not skip & set(p.relative_to(backend).parts)
    ]


def _lock_pins(path: Path) -> dict[str, str]:
    pins = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Za-z0-9_.-]+)==([^\s;\\]+)", line)
        if match:
            pins[match.group(1).lower()] = match.group(2)
    return pins


def _major(version: str) -> int:
    return int(version.split(".")[0])


class BackendDoesNotUseCryptography(unittest.TestCase):
    def test_no_backend_module_imports_cryptography(self) -> None:
        offenders = []
        for path in _backend_sources():
            for node in ast.walk(_parse(path)):
                names = []
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and node.module:
                    names = [node.module]
                if any(n == "cryptography" or n.startswith("cryptography.") for n in names):
                    offenders.append(f"{path.relative_to(ROOT)}:{node.lineno}")
        self.assertEqual(offenders, [], "the backend must not import cryptography")

    def test_backend_locks_do_not_pin_cryptography(self) -> None:
        for lock in sorted((ROOT / "backend").glob("requirements*.lock")):
            with self.subTest(lock=lock.name):
                self.assertNotIn("cryptography", _lock_pins(lock))


class PkiToolsUseOnlyAllowListedApis(unittest.TestCase):
    def test_imports_are_allow_listed(self) -> None:
        for path in PKI_TOOLS:
            tree = _parse(path)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        top = alias.name.split(".")[0]
                        with self.subTest(file=path.name, line=node.lineno, module=alias.name):
                            self.assertNotIn(top, FORBIDDEN_STDLIB)
                            if top == "cryptography":
                                self.assertIn(alias.name, ALLOWED_MODULES)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    top = node.module.split(".")[0]
                    with self.subTest(file=path.name, line=node.lineno, module=node.module):
                        self.assertNotIn(top, FORBIDDEN_STDLIB)
                        if top == "cryptography":
                            self.assertIn(node.module, ALLOWED_FROM)
                            imported = {alias.name for alias in node.names}
                            self.assertLessEqual(imported, ALLOWED_FROM[node.module])

    def test_no_forbidden_api_is_referenced(self) -> None:
        for path in PKI_TOOLS:
            for node in ast.walk(_parse(path)):
                if isinstance(node, ast.Attribute):
                    with self.subTest(file=path.name, line=node.lineno, attribute=node.attr):
                        self.assertNotIn(node.attr, FORBIDDEN_ATTRIBUTES)
                elif isinstance(node, ast.Name):
                    with self.subTest(file=path.name, line=node.lineno, name=node.id):
                        self.assertNotIn(node.id, FORBIDDEN_ATTRIBUTES)

    def test_only_nist_curves(self) -> None:
        for path in PKI_TOOLS:
            for node in ast.walk(_parse(path)):
                if (
                    isinstance(node, ast.Attribute)
                    and isinstance(node.value, ast.Name)
                    and node.value.id == "ec"
                    and node.attr.isupper()
                ):
                    with self.subTest(file=path.name, line=node.lineno, curve=node.attr):
                        self.assertIn(node.attr, ALLOWED_CURVES)


class LockFiles(unittest.TestCase):
    def test_only_the_intel_lock_pins_an_old_cryptography(self) -> None:
        pki = ROOT / "deploy" / "pki"
        for lock in sorted(pki.glob("requirements*.lock")):
            version = _lock_pins(lock).get("cryptography")
            with self.subTest(lock=lock.name, version=version):
                self.assertIsNotNone(version)
                if lock.name == "requirements-macos-intel.lock":
                    self.assertLess(_major(version), 49)
                else:
                    self.assertGreaterEqual(_major(version), 50)

    def test_intel_lock_documents_its_exception(self) -> None:
        text = (ROOT / "deploy" / "pki" / "requirements-macos-intel.lock").read_text(encoding="utf-8")
        self.assertIn("SECURITY EXCEPTION", text)
        for cve in ("CVE-2026-69247", "CVE-2026-69248", "CVE-2026-69249"):
            self.assertIn(cve, text)


if __name__ == "__main__":
    unittest.main()
