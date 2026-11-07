#!/usr/bin/env python3
"""
kinesis-mdns: advertise the Kinesis server as kinesis.local on the LAN.

Why: iPhones, iPads, Macs and Android 12+ resolve ".local" names over
multicast DNS (Bonjour). Each OS only advertises its own computer name
("shop-pc.local"); Windows cannot advertise an additional name at all.
This small responder publishes a stable name, the same on every host OS,
so one app build and one certificate work in every shop.

It is deployment tooling (python-zeroconf, pure Python, Linux/macOS/
Windows) and is independent of the POS backend. If it cannot run, devices
can still use <computer-name>.local or the IP address, both of which are
in the server certificate.

    python kinesis_mdns.py --hostname kinesis.local --ip 192.168.1.10

STATUS: spike. Coexistence with the OS responders (Bonjour on macOS,
Avahi on Linux, the Windows DNS Client mDNS responder) on UDP 5353 must be
verified on each OS; see docs/deployment/ARCHITECTURE.md.
"""

from __future__ import annotations

import argparse
import ipaddress
import signal
import socket
import sys
import threading

try:
    from zeroconf import IPVersion, ServiceInfo, Zeroconf
except ImportError:  # pragma: no cover - environment guidance
    sys.exit("kinesis-mdns needs python-zeroconf: python -m pip install zeroconf")


def build_service(hostname: str, addresses: list[str], port: int) -> ServiceInfo:
    server = hostname.rstrip(".") + "."

    return ServiceInfo(
        type_="_https._tcp.local.",
        name="Kinesis POS._https._tcp.local.",
        port=port,
        # The responder answers A/AAAA queries for `server`, which is what
        # makes "kinesis.local" resolvable.
        server=server,
        addresses=[ipaddress.ip_address(a).packed for a in addresses],
        properties={"path": "/"},
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kinesis-mdns")
    parser.add_argument("--hostname", default="kinesis.local")
    parser.add_argument("--ip", action="append", required=True, help="LAN address to publish (repeatable).")
    parser.add_argument("--port", type=int, default=443)
    args = parser.parse_args(argv)

    if not args.hostname.endswith(".local"):
        parser.error("mDNS names must end in .local")

    addresses = [str(ipaddress.ip_address(ip)) for ip in args.ip]

    # Bind to the published addresses only, not to every interface.
    zeroconf = Zeroconf(interfaces=addresses, ip_version=IPVersion.V4Only)
    service = build_service(args.hostname, addresses, args.port)

    stop = threading.Event()

    def shutdown(*_):
        stop.set()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        zeroconf.register_service(service, allow_name_change=False)
        print(
            f"Advertising {args.hostname} -> {', '.join(addresses)} "
            f"(host {socket.gethostname()})",
            flush=True,
        )
        stop.wait()
    finally:
        zeroconf.unregister_service(service)
        zeroconf.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
