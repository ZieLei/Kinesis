#!/usr/bin/env python3
"""
kinesis-mdns: advertise the Kinesis server as kinesis.local on the LAN.

Why: iPhones, iPads, Macs and Android 12+ resolve ".local" names over
multicast DNS (Bonjour). Each OS only advertises its own computer name
("shop-pc.local"); Windows cannot advertise an additional name at all.
This responder publishes one stable name, the same on every host OS, so
browser terminals keep using https://kinesis.local:<port> (and their
pairing, which is bound to that host name) whichever network the host is
on.

Multiple interfaces
-------------------
The host may be on Wi-Fi, Ethernet or both, and either can disappear,
come back or change address at any time. The responder:

* publishes every *eligible* address: IPv4, private, inside the allowed
  subnets (``--subnet``), on a real interface (not loopback, link-local,
  container, VM bridge or VPN interfaces);
* listens and answers on exactly those interfaces (mDNS is link-local:
  each interface needs its own multicast membership);
* watches the kernel for address changes (Linux netlink) and also polls,
  so it follows interfaces appearing, disappearing and changing address
  without restarting;
* waits quietly when no eligible interface exists, instead of exiting;
* keeps exactly one registration of the name (one zeroconf instance,
  updated in place), and refuses to take kinesis.local over when another
  device on the LAN already answers for it.

Answers carry all published addresses (python-zeroconf does not answer
per interface). With the allowed subnets limited to the shop LAN, every
published address is reachable from every client on it.

Usage:

    python kinesis_mdns.py --hostname kinesis.local --port 9443 \
        --subnet 192.168.254.0/24
    python kinesis_mdns.py --list  --subnet 192.168.254.0/24   # eligible addresses
    python kinesis_mdns.py --query 192.168.254.134              # ask via one interface

It is deployment tooling (python-zeroconf + ifaddr, pure Python,
Linux/macOS/Windows) and independent of the POS backend.
"""

from __future__ import annotations

import argparse
import ipaddress
import logging
import os
import random
import re
import signal
import socket
import struct
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from typing import Callable, Iterable, Protocol, Sequence

LOG = logging.getLogger("kinesis-mdns")

DEFAULT_HOSTNAME = "kinesis.local"
SERVICE_TYPE = "_https._tcp.local."
SERVICE_NAME = "Kinesis POS." + SERVICE_TYPE
MDNS_GROUP = "224.0.0.251"
MDNS_PORT = 5353

# Host records expire from client caches after this long, so a client
# stops trying an address that disappeared within half a minute (RFC 6762
# suggests 120 s; shorter is allowed and suits a host that changes links).
HOST_TTL = 30
# Wait for a burst of kernel address events to settle before rescanning.
DEBOUNCE_SECONDS = 2.0
# Polling backs up the netlink watcher (and is the only watcher off Linux).
POLL_SECONDS_WITH_WATCHER = 30.0
POLL_SECONDS_WITHOUT_WATCHER = 5.0
# Retry after an error that is likely transient (interface went away
# between the scan and the socket bind).
RETRY_SECONDS = 5.0
# Back-off while another device owns the name.
CONFLICT_BACKOFF_SECONDS = (30.0, 60.0, 120.0, 300.0)

# Interfaces that never carry the shop LAN: loopback, containers, VM
# bridges, VPNs and Apple's peer-to-peer links.
EXCLUDED_INTERFACES = re.compile(
    r"^(lo|docker|br-|veth|virbr|vnet|vboxnet|vmnet|podman|cni|flannel|"
    r"tun|tap|wg|zt|tailscale|utun|ipsec|ppp|llw|awdl|p2p|bridge|gif|stf|anpi)",
    re.IGNORECASE,
)


# --------------------------------------------------------------------------
# Interface discovery
# --------------------------------------------------------------------------


@dataclass(frozen=True, order=True)
class LanAddress:
    ip: str
    interface: str

    def __str__(self) -> str:
        return f"{self.interface}={self.ip}"


@dataclass(frozen=True)
class RawAddress:
    """One IPv4 address as reported by the OS, before filtering."""

    interface: str
    ip: str


def eligible_addresses(
    raw: Iterable[RawAddress],
    subnets: Sequence[ipaddress.IPv4Network],
    include_interfaces: Sequence[str] = (),
    exclude_interfaces: Sequence[str] = (),
) -> tuple[LanAddress, ...]:
    """Filter OS addresses down to the ones kinesis.local may point to."""

    found: dict[str, LanAddress] = {}

    for entry in raw:
        name = entry.interface
        if include_interfaces and name not in include_interfaces:
            continue
        if name in exclude_interfaces or EXCLUDED_INTERFACES.match(name):
            continue
        try:
            ip = ipaddress.ip_address(entry.ip)
        except ValueError:
            continue
        if not isinstance(ip, ipaddress.IPv4Address):
            continue
        if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified:
            continue
        if subnets:
            if not any(ip in net for net in subnets):
                continue
        elif not ip.is_private:
            continue
        # The same address on two interfaces (rare) is published once.
        found.setdefault(str(ip), LanAddress(str(ip), name))

    return tuple(sorted(found.values()))


def os_addresses() -> list[RawAddress]:
    """IPv4 addresses of this computer's interfaces."""

    try:
        import ifaddr  # shipped with python-zeroconf
    except ImportError:
        return _addresses_from_commands()

    result = []
    for adapter in ifaddr.get_adapters():
        name = adapter.nice_name or adapter.name
        if isinstance(name, bytes):
            name = name.decode("utf-8", "replace")
        for entry in adapter.ips:
            if isinstance(entry.ip, str):  # IPv6 entries are tuples
                result.append(RawAddress(str(name), entry.ip))
    return result


def _addresses_from_commands() -> list[RawAddress]:
    """Fallback without ifaddr (kinesisctl runs this file from another venv)."""

    result: list[RawAddress] = []
    try:
        out = subprocess.run(
            ["ip", "-4", "-o", "addr", "show"], capture_output=True, text=True, check=True
        ).stdout
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 4 and parts[2] == "inet":
                result.append(RawAddress(parts[1].split("@")[0], parts[3].split("/")[0]))
        return result
    except (OSError, subprocess.CalledProcessError):
        pass
    try:  # macOS / BSD
        out = subprocess.run(["ifconfig"], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return result
    current = ""
    for line in out.splitlines():
        if line and not line[0].isspace():
            current = line.split(":", 1)[0]
        else:
            match = re.search(r"\binet (\d+\.\d+\.\d+\.\d+)\b", line)
            if match and current:
                result.append(RawAddress(current, match.group(1)))
    return result


def joined_mdns_group() -> set[str] | None:
    """Linux: interfaces that joined 224.0.0.251 (from /proc/net/igmp)."""

    try:
        lines = open("/proc/net/igmp", encoding="ascii").read().splitlines()
    except OSError:
        return None
    joined: set[str] = set()
    device = ""
    target = socket.inet_aton(MDNS_GROUP)[::-1].hex().upper()  # little-endian
    for line in lines[1:]:
        if line and not line[0].isspace():
            fields = line.split()
            device = fields[1] if len(fields) > 1 else ""
        elif line.split() and line.split()[0].upper() == target:
            joined.add(device)
    return joined


# --------------------------------------------------------------------------
# Responder state machine (no sockets; the backend does the network I/O)
# --------------------------------------------------------------------------


class NameConflict(Exception):
    """Another device already answers for the host or service name."""


class Backend(Protocol):
    def start(self, ips: list[str]) -> None: ...
    def set_interfaces(self, ips: list[str]) -> None: ...
    def foreign_owners(self, hostname: str, ips: list[str]) -> list[str]: ...
    def register(self, hostname: str, port: int, ips: list[str]) -> None: ...
    def update(self, hostname: str, port: int, ips: list[str]) -> None: ...
    def stop(self) -> None: ...


class Responder:
    """Keeps one kinesis.local registration in step with the eligible addresses."""

    def __init__(
        self,
        hostname: str,
        port: int,
        scan: Callable[[], tuple[LanAddress, ...]],
        backend: Backend,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.hostname = hostname
        self.port = port
        self.scan = scan
        self.backend = backend
        self.clock = clock

        self.published: tuple[LanAddress, ...] = ()
        self.started = False
        self.registered = False
        self.waiting_logged = False
        self.conflicts = 0
        self.retry_at: float | None = None

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _ips(addresses: tuple[LanAddress, ...]) -> list[str]:
        return [a.ip for a in addresses]

    def _reset(self) -> None:
        if self.started:
            try:
                self.backend.stop()
            except Exception:  # noqa: BLE001 - never let shutdown errors escape
                LOG.exception("error while stopping the responder")
        self.started = False
        self.registered = False
        self.published = ()

    def next_wakeup(self, poll_seconds: float) -> float:
        """Seconds until reconcile() should run again at the latest."""

        if self.retry_at is None:
            return poll_seconds
        return max(0.0, min(poll_seconds, self.retry_at - self.clock()))

    # -- the one entry point ----------------------------------------------

    def reconcile(self) -> str:
        """Bring the advertisement in line with the current interfaces.

        Returns a short state name (for logs and tests). Never raises for
        network or name problems: those are logged and retried later.
        """

        now = self.clock()
        if self.retry_at is not None and now < self.retry_at:
            return "backing-off"
        self.retry_at = None

        addresses = self.scan()

        if not addresses:
            if self.started:
                LOG.warning("no eligible LAN interface any more; stopped advertising %s", self.hostname)
            self._reset()
            if not self.waiting_logged:
                LOG.warning("waiting for an eligible LAN interface (allowed subnets) to advertise %s", self.hostname)
                self.waiting_logged = True
            return "waiting"
        self.waiting_logged = False

        if self.registered and addresses == self.published:
            return "unchanged"

        ips = self._ips(addresses)
        try:
            if not self.started:
                self.backend.start(ips)
                self.started = True
            elif addresses != self.published:
                self.backend.set_interfaces(ips)

            if not self.registered:
                foreign = self.backend.foreign_owners(self.hostname, ips)
                if foreign:
                    raise NameConflict(
                        f"{self.hostname} is already answered by {', '.join(foreign)}"
                    )
                self.backend.register(self.hostname, self.port, ips)
                self.registered = True
                state = "registered"
            else:
                self.backend.update(self.hostname, self.port, ips)
                state = "updated"
        except NameConflict as error:
            delay = CONFLICT_BACKOFF_SECONDS[min(self.conflicts, len(CONFLICT_BACKOFF_SECONDS) - 1)]
            self.conflicts += 1
            LOG.error(
                "%s; another Kinesis host or device uses this name on the LAN. "
                "Not taking it over; retrying in %.0f s.",
                error,
                delay,
            )
            self._reset()
            self.retry_at = now + delay
            return "conflict"
        except Exception as error:  # noqa: BLE001 - interface races, socket errors
            LOG.warning("could not advertise on %s (%s); retrying in %.0f s",
                        ", ".join(map(str, addresses)), error, RETRY_SECONDS)
            self._reset()
            self.retry_at = now + RETRY_SECONDS
            return "error"

        self.conflicts = 0
        self.published = addresses
        LOG.info("advertising %s -> %s (port %d)", self.hostname,
                 ", ".join(map(str, addresses)), self.port)
        return state

    def shutdown(self) -> None:
        if self.started:
            LOG.info("stopping: withdrawing %s", self.hostname)
        self._reset()


# --------------------------------------------------------------------------
# python-zeroconf backend
# --------------------------------------------------------------------------


class ZeroconfBackend:
    """The real network side: one Zeroconf instance, one ServiceInfo."""

    def __init__(self) -> None:
        import zeroconf  # noqa: F401 - fail early with a clear message

        self.zc = None
        self.info = None

    def _service(self, hostname: str, port: int, ips: list[str]):
        from zeroconf import ServiceInfo

        return ServiceInfo(
            type_=SERVICE_TYPE,
            name=SERVICE_NAME,
            port=port,
            # The responder answers A queries for `server`, which is what
            # makes "kinesis.local" resolvable.
            server=hostname.rstrip(".") + ".",
            parsed_addresses=ips,
            properties={"path": "/"},
            host_ttl=HOST_TTL,
        )

    def start(self, ips: list[str]) -> None:
        from zeroconf import IPVersion, Zeroconf

        self.zc = Zeroconf(interfaces=ips, ip_version=IPVersion.V4Only)

    def set_interfaces(self, ips: list[str]) -> None:
        assert self.zc is not None
        self.zc.update_interfaces(interfaces=ips)

    def foreign_owners(self, hostname: str, ips: list[str]) -> list[str]:
        from zeroconf import AddressResolverIPv4

        assert self.zc is not None
        resolver = AddressResolverIPv4(hostname.rstrip(".") + ".")
        resolver.request(self.zc, 1500)
        return sorted(a for a in resolver.parsed_addresses() if a not in ips)

    def register(self, hostname: str, port: int, ips: list[str]) -> None:
        from zeroconf import NonUniqueNameException

        assert self.zc is not None
        info = self._service(hostname, port, ips)
        try:
            self.zc.register_service(info, allow_name_change=False)
        except NonUniqueNameException as error:
            raise NameConflict(f"the service name {SERVICE_NAME!r} is taken") from error
        self.info = info

    def update(self, hostname: str, port: int, ips: list[str]) -> None:
        assert self.zc is not None
        info = self._service(hostname, port, ips)
        self.zc.update_service(info)
        self.info = info

    def stop(self) -> None:
        zc, info = self.zc, self.info
        self.zc = self.info = None
        if zc is None:
            return
        try:
            if info is not None:
                zc.unregister_service(info)  # goodbye packets (TTL 0)
        except Exception:  # noqa: BLE001 - the interface may already be gone
            LOG.debug("goodbye failed", exc_info=True)
        finally:
            zc.close()


# --------------------------------------------------------------------------
# Change detection
# --------------------------------------------------------------------------

RTMGRP_LINK = 0x1
RTMGRP_IPV4_IFADDR = 0x10


def start_netlink_watcher(wake: threading.Event) -> bool:
    """Linux: set `wake` on every link/IPv4 address change. False if unavailable."""

    if not hasattr(socket, "AF_NETLINK"):
        return False
    try:
        sock = socket.socket(socket.AF_NETLINK, socket.SOCK_RAW, socket.NETLINK_ROUTE)
        sock.bind((0, RTMGRP_LINK | RTMGRP_IPV4_IFADDR))
    except OSError as error:
        LOG.info("netlink unavailable (%s); polling every %.0f s", error, POLL_SECONDS_WITHOUT_WATCHER)
        return False

    def run() -> None:
        while True:
            try:
                sock.recv(65536)
            except OSError:
                time.sleep(1)
                continue
            wake.set()

    threading.Thread(target=run, name="netlink", daemon=True).start()
    return True


def serve(responder: Responder, stop: threading.Event, wake: threading.Event, watcher: bool) -> None:
    poll = POLL_SECONDS_WITH_WATCHER if watcher else POLL_SECONDS_WITHOUT_WATCHER
    while not stop.is_set():
        responder.reconcile()
        woke = wake.wait(timeout=responder.next_wakeup(poll))
        if stop.is_set():
            break
        if woke:
            wake.clear()
            # Debounce: one address change is usually several netlink events.
            stop.wait(DEBOUNCE_SECONDS)
            wake.clear()


# --------------------------------------------------------------------------
# --query: ask for the name through one interface (used by kinesisctl)
# --------------------------------------------------------------------------


def _encode_name(name: str) -> bytes:
    out = b""
    for label in name.rstrip(".").split("."):
        out += bytes([len(label)]) + label.encode("ascii")
    return out + b"\x00"


def _read_name(packet: bytes, offset: int) -> tuple[str, int]:
    labels, jumped, end = [], False, offset
    for _ in range(128):
        length = packet[offset]
        if length & 0xC0 == 0xC0:
            pointer = ((length & 0x3F) << 8) | packet[offset + 1]
            if not jumped:
                end = offset + 2
            offset, jumped = pointer, True
            continue
        if length == 0:
            if not jumped:
                end = offset + 1
            return ".".join(labels), end
        labels.append(packet[offset + 1: offset + 1 + length].decode("ascii", "replace"))
        offset += 1 + length
    raise ValueError("name loop")


def parse_a_records(packet: bytes, hostname: str) -> list[str]:
    """IPv4 addresses for `hostname` in an mDNS response."""

    want = hostname.rstrip(".").lower()
    _, flags, qd, an, ns, ar = struct.unpack("!6H", packet[:12])
    if not flags & 0x8000:
        return []
    offset = 12
    for _ in range(qd):
        _, offset = _read_name(packet, offset)
        offset += 4
    found = []
    for _ in range(an + ns + ar):
        name, offset = _read_name(packet, offset)
        rtype, _, _, rdlength = struct.unpack("!HHIH", packet[offset: offset + 10])
        offset += 10
        if rtype == 1 and rdlength == 4 and name.lower() == want:
            found.append(socket.inet_ntoa(packet[offset: offset + 4]))
        offset += rdlength
    return sorted(set(found))


def query(hostname: str, via_ip: str, timeout: float = 2.0) -> list[str]:
    """Send one mDNS A query out of the interface holding `via_ip`.

    The query leaves through that interface only (IP_MULTICAST_IF) and is a
    "legacy unicast" query (source port != 5353), so responders answer to
    this socket directly.
    """

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    try:
        sock.bind((via_ip, 0))
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(via_ip))
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
        query_id = random.randint(1, 0xFFFF)
        packet = struct.pack("!6H", query_id, 0, 1, 0, 0, 0) + _encode_name(hostname) + struct.pack("!HH", 1, 1)
        sock.sendto(packet, (MDNS_GROUP, MDNS_PORT))
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return []
            sock.settimeout(remaining)
            try:
                data, _ = sock.recvfrom(9000)
            except socket.timeout:
                return []
            try:
                answers = parse_a_records(data, hostname)
            except (ValueError, IndexError, struct.error):
                continue
            if answers:
                return answers
    finally:
        sock.close()


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="kinesis-mdns", description=__doc__.split("\n\n")[0])
    parser.add_argument("--hostname", default=DEFAULT_HOSTNAME)
    parser.add_argument("--port", type=int, default=443)
    parser.add_argument("--subnet", action="append", default=[],
                        help="Allowed LAN subnet, e.g. 192.168.254.0/24 (repeatable). "
                             "Default: any private IPv4 network.")
    parser.add_argument("--interface", action="append", default=[],
                        help="Only use these interfaces (repeatable). Default: all eligible.")
    parser.add_argument("--exclude-interface", action="append", default=[],
                        help="Never use these interfaces (repeatable).")
    parser.add_argument("--ip", action="append", default=[],
                        help="Deprecated: a fixed address; treated as a /32 subnet. Use --subnet.")
    parser.add_argument("--list", action="store_true",
                        help="Print the eligible interfaces and exit.")
    parser.add_argument("--query", metavar="IP",
                        help="Ask for --hostname through the interface holding IP; print the answers.")
    args = parser.parse_args(argv)

    if not args.hostname.endswith(".local"):
        parser.error("mDNS names must end in .local")
    try:
        nets = [ipaddress.IPv4Network(s, strict=False) for s in args.subnet]
        nets += [ipaddress.IPv4Network(f"{ip}/32") for ip in args.ip]
    except ValueError as error:
        parser.error(str(error))
    args.subnets = nets
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=os.environ.get("KINESIS_MDNS_LOG", "INFO"),
                        format="%(levelname)s %(message)s", stream=sys.stdout)

    def scan() -> tuple[LanAddress, ...]:
        return eligible_addresses(os_addresses(), args.subnets, args.interface, args.exclude_interface)

    if args.list:
        joined = joined_mdns_group()
        for address in scan():
            member = "" if joined is None else ("\tmdns-member" if address.interface in joined else "\tnot-member")
            print(f"{address.interface}\t{address.ip}{member}")
        return 0

    if args.query:
        answers = query(args.hostname, args.query)
        print(" ".join(answers))
        return 0 if answers else 1

    if args.ip:
        LOG.warning("--ip is deprecated (pins one address); use --subnet")

    try:
        backend = ZeroconfBackend()
    except ImportError:
        sys.exit("kinesis-mdns needs python-zeroconf: python -m pip install zeroconf")

    responder = Responder(args.hostname, args.port, scan, backend)
    stop, wake = threading.Event(), threading.Event()

    def on_signal(*_: object) -> None:
        stop.set()
        wake.set()

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    LOG.info("kinesis-mdns: %s, port %d, subnets %s (host %s)", args.hostname, args.port,
             ", ".join(map(str, args.subnets)) or "any private", socket.gethostname())
    try:
        serve(responder, stop, wake, start_netlink_watcher(wake))
    finally:
        responder.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
