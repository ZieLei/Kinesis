"""
Tests for the multi-interface kinesis.local responder (deploy/mdns).

Standard library only (python-zeroconf is replaced by a fake backend):

    python -m unittest discover -s deploy/tests -v
"""

from __future__ import annotations

import importlib.util
import ipaddress
import socket
import struct
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "mdns" / "kinesis_mdns.py"
spec = importlib.util.spec_from_file_location("kinesis_mdns", MODULE_PATH)
mdns = importlib.util.module_from_spec(spec)
sys.modules["kinesis_mdns"] = mdns
spec.loader.exec_module(mdns)

SHOP = [ipaddress.IPv4Network("192.168.254.0/24")]
WIFI = mdns.RawAddress("wlan0", "192.168.254.199")
ETH = mdns.RawAddress("enp63s0", "192.168.254.134")


class FakeBackend:
    """Records calls; can be told to fail like the network would."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.running = False
        self.registrations = 0  # live registrations of the name
        self.foreign: list[str] = []
        self.fail_start = 0
        self.register_conflict = False

    def start(self, ips):
        self.calls.append(("start", tuple(ips)))
        if self.fail_start:
            self.fail_start -= 1
            raise OSError(19, "No such device")
        assert not self.running, "second zeroconf instance started"
        self.running = True

    def set_interfaces(self, ips):
        assert self.running
        self.calls.append(("set_interfaces", tuple(ips)))

    def foreign_owners(self, hostname, ips):
        assert self.running
        self.calls.append(("probe", tuple(ips)))
        return list(self.foreign)

    def register(self, hostname, port, ips):
        assert self.running
        if self.register_conflict:
            raise mdns.NameConflict("service name taken")
        self.registrations += 1
        assert self.registrations == 1, "duplicate registration of the name"
        self.calls.append(("register", hostname, port, tuple(ips)))

    def update(self, hostname, port, ips):
        assert self.running and self.registrations == 1
        self.calls.append(("update", tuple(ips)))

    def stop(self):
        self.calls.append(("stop",))
        self.running = False
        self.registrations = 0

    def names(self):
        return [c[0] for c in self.calls]


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def make(raw_by_step, **kwargs):
    """Responder whose OS address list is whatever `raw_by_step[0]` holds."""

    backend = FakeBackend()
    clock = Clock()
    responder = mdns.Responder(
        "kinesis.local", 9443,
        lambda: mdns.eligible_addresses(raw_by_step[0], SHOP, **kwargs),
        backend, clock,
    )
    return responder, backend, clock


class EligibilityTests(unittest.TestCase):
    def test_keeps_both_shop_interfaces(self):
        result = mdns.eligible_addresses([WIFI, ETH], SHOP)
        self.assertEqual([(a.interface, a.ip) for a in result],
                         [("enp63s0", "192.168.254.134"), ("wlan0", "192.168.254.199")])

    def test_drops_loopback_link_local_virtual_and_vpn(self):
        raw = [
            mdns.RawAddress("lo", "127.0.0.1"),
            mdns.RawAddress("wlan0", "169.254.10.2"),
            mdns.RawAddress("docker0", "192.168.254.50"),
            mdns.RawAddress("br-1a2b", "192.168.254.51"),
            mdns.RawAddress("veth9", "192.168.254.52"),
            mdns.RawAddress("virbr0", "192.168.254.53"),
            mdns.RawAddress("wg0", "192.168.254.54"),
            mdns.RawAddress("tailscale0", "192.168.254.55"),
            mdns.RawAddress("tun0", "192.168.254.56"),
            WIFI,
        ]
        self.assertEqual(mdns.eligible_addresses(raw, SHOP), (mdns.LanAddress("192.168.254.199", "wlan0"),))

    def test_subnet_allow_list(self):
        raw = [WIFI, mdns.RawAddress("enp0s1", "10.0.0.5"), mdns.RawAddress("wlan1", "192.168.1.9")]
        self.assertEqual([a.ip for a in mdns.eligible_addresses(raw, SHOP)], ["192.168.254.199"])

    def test_without_subnets_only_private_addresses(self):
        raw = [WIFI, mdns.RawAddress("eth1", "8.8.8.8"), mdns.RawAddress("eth2", "10.1.2.3")]
        self.assertEqual([a.ip for a in mdns.eligible_addresses(raw, [])], ["10.1.2.3", "192.168.254.199"])

    def test_ignores_ipv6_and_garbage(self):
        raw = [mdns.RawAddress("wlan0", "fe80::1"), mdns.RawAddress("wlan0", "not-an-ip"), ETH]
        self.assertEqual([a.ip for a in mdns.eligible_addresses(raw, SHOP)], ["192.168.254.134"])

    def test_include_and_exclude_interfaces(self):
        self.assertEqual([a.ip for a in mdns.eligible_addresses([WIFI, ETH], SHOP, ["wlan0"])],
                         ["192.168.254.199"])
        self.assertEqual([a.ip for a in mdns.eligible_addresses([WIFI, ETH], SHOP, (), ["wlan0"])],
                         ["192.168.254.134"])

    def test_same_address_twice_is_published_once(self):
        raw = [WIFI, mdns.RawAddress("wlan0", "192.168.254.199")]
        self.assertEqual(len(mdns.eligible_addresses(raw, SHOP)), 1)

    def test_legacy_ip_option_becomes_a_host_subnet(self):
        args = mdns.parse_args(["--ip", "192.168.254.199"])
        self.assertEqual(args.subnets, [ipaddress.IPv4Network("192.168.254.199/32")])

    def test_rejects_non_local_names(self):
        with self.assertRaises(SystemExit):
            mdns.parse_args(["--hostname", "kinesis.example.com", "--subnet", "192.168.254.0/24"])


class ResponderTests(unittest.TestCase):
    def test_registers_once_on_all_interfaces(self):
        step = [[WIFI, ETH]]
        responder, backend, _ = make(step)
        self.assertEqual(responder.reconcile(), "registered")
        self.assertEqual(backend.calls[0], ("start", ("192.168.254.134", "192.168.254.199")))
        self.assertIn(("register", "kinesis.local", 9443, ("192.168.254.134", "192.168.254.199")), backend.calls)
        # Nothing changed: nothing is sent or re-registered.
        self.assertEqual(responder.reconcile(), "unchanged")
        self.assertEqual(backend.names().count("register"), 1)

    def test_interface_disappears_and_returns(self):
        step = [[WIFI, ETH]]
        responder, backend, _ = make(step)
        responder.reconcile()

        step[0] = [ETH]  # Wi-Fi drops
        self.assertEqual(responder.reconcile(), "updated")
        self.assertEqual(backend.calls[-2:], [("set_interfaces", ("192.168.254.134",)),
                                              ("update", ("192.168.254.134",))])

        step[0] = [WIFI, ETH]  # Wi-Fi returns
        self.assertEqual(responder.reconcile(), "updated")
        self.assertEqual(backend.calls[-1], ("update", ("192.168.254.134", "192.168.254.199")))
        self.assertEqual(backend.names().count("start"), 1)
        self.assertEqual(backend.names().count("register"), 1)

    def test_address_change_on_same_interface(self):
        step = [[WIFI]]
        responder, backend, _ = make(step)
        responder.reconcile()
        step[0] = [mdns.RawAddress("wlan0", "192.168.254.77")]
        self.assertEqual(responder.reconcile(), "updated")
        self.assertEqual(backend.calls[-1], ("update", ("192.168.254.77",)))
        self.assertEqual(responder.published, (mdns.LanAddress("192.168.254.77", "wlan0"),))

    def test_waits_without_interfaces_and_starts_when_one_appears(self):
        step = [[]]
        responder, backend, _ = make(step)
        with self.assertLogs("kinesis-mdns", "WARNING") as logs:
            self.assertEqual(responder.reconcile(), "waiting")
            self.assertEqual(responder.reconcile(), "waiting")
        self.assertEqual(len(logs.output), 1, "the waiting message is logged once")
        self.assertEqual(backend.calls, [])

        step[0] = [ETH]
        self.assertEqual(responder.reconcile(), "registered")

    def test_all_interfaces_gone_withdraws_then_recovers(self):
        step = [[WIFI, ETH]]
        responder, backend, _ = make(step)
        responder.reconcile()
        step[0] = []
        with self.assertLogs("kinesis-mdns", "WARNING"):
            self.assertEqual(responder.reconcile(), "waiting")
        self.assertEqual(backend.calls[-1], ("stop",))
        self.assertFalse(backend.running)

        step[0] = [WIFI]
        self.assertEqual(responder.reconcile(), "registered")
        self.assertEqual(backend.registrations, 1)

    def test_virtual_interfaces_never_trigger_changes(self):
        step = [[WIFI]]
        responder, backend, _ = make(step)
        responder.reconcile()
        step[0] = [WIFI, mdns.RawAddress("docker0", "192.168.254.200")]
        self.assertEqual(responder.reconcile(), "unchanged")

    def test_name_owned_by_another_device_is_not_taken_over(self):
        step = [[WIFI]]
        responder, backend, clock = make(step)
        backend.foreign = ["192.168.254.10"]
        with self.assertLogs("kinesis-mdns", "ERROR"):
            self.assertEqual(responder.reconcile(), "conflict")
        self.assertEqual(backend.registrations, 0)
        self.assertFalse(backend.running)

        # Backs off instead of hammering the LAN.
        clock.now += 10
        self.assertEqual(responder.reconcile(), "backing-off")
        self.assertEqual(responder.next_wakeup(30), 20)

        # The other device left: takes the name after the back-off.
        backend.foreign = []
        clock.now += 25
        self.assertEqual(responder.reconcile(), "registered")

    def test_conflict_backoff_grows(self):
        step = [[WIFI]]
        responder, backend, clock = make(step)
        backend.foreign = ["192.168.254.10"]
        delays = []
        with self.assertLogs("kinesis-mdns", "ERROR"):
            for _ in range(5):
                start = clock.now
                responder.reconcile()
                delays.append(responder.retry_at - start)
                clock.now = responder.retry_at
        self.assertEqual(delays, [30.0, 60.0, 120.0, 300.0, 300.0])

    def test_service_name_conflict_from_zeroconf(self):
        step = [[WIFI]]
        responder, backend, _ = make(step)
        backend.register_conflict = True
        with self.assertLogs("kinesis-mdns", "ERROR"):
            self.assertEqual(responder.reconcile(), "conflict")
        self.assertFalse(backend.running)

    def test_interface_vanishing_during_bind_is_retried(self):
        step = [[WIFI]]
        responder, backend, clock = make(step)
        backend.fail_start = 1  # OSError: No such device
        with self.assertLogs("kinesis-mdns", "WARNING"):
            self.assertEqual(responder.reconcile(), "error")
        self.assertEqual(responder.reconcile(), "backing-off")
        clock.now += mdns.RETRY_SECONDS
        self.assertEqual(responder.reconcile(), "registered")
        self.assertEqual(backend.registrations, 1)

    def test_shutdown_withdraws(self):
        step = [[WIFI]]
        responder, backend, _ = make(step)
        responder.reconcile()
        responder.shutdown()
        self.assertEqual(backend.calls[-1], ("stop",))
        responder.shutdown()  # idempotent
        self.assertEqual(backend.names().count("stop"), 1)


class PacketTests(unittest.TestCase):
    def _response(self, name, ips):
        header = struct.pack("!6H", 0, 0x8400, 0, len(ips), 0, 0)
        body = b""
        encoded = mdns._encode_name(name)
        for i, ip in enumerate(ips):
            # First record spells the name; later ones use a compression pointer.
            owner = encoded if i == 0 else b"\xc0\x0c"
            body += owner + struct.pack("!HHIH", 1, 0x8001, 30, 4) + socket.inet_aton(ip)
        return header + body

    def test_parses_a_records_with_compression(self):
        packet = self._response("kinesis.local", ["192.168.254.199", "192.168.254.134"])
        self.assertEqual(mdns.parse_a_records(packet, "kinesis.local"),
                         ["192.168.254.134", "192.168.254.199"])

    def test_ignores_other_names_and_queries(self):
        self.assertEqual(mdns.parse_a_records(self._response("other.local", ["10.0.0.1"]), "kinesis.local"), [])
        query = struct.pack("!6H", 1, 0, 1, 0, 0, 0) + mdns._encode_name("kinesis.local") + b"\x00\x01\x00\x01"
        self.assertEqual(mdns.parse_a_records(query, "kinesis.local"), [])


class IgmpParsingTests(unittest.TestCase):
    def test_reads_group_membership(self):
        sample = (
            "Idx\tDevice    : Count Querier\tGroup    Users Timer\tReporter\n"
            "1\tlo        :     1      V3\n"
            "\t\t\t\t010000E0     1 0:00000000\t\t0\n"
            "2\tenp63s0   :     2      V3\n"
            "\t\t\t\tFB0000E0     1 0:00000000\t\t0\n"
            "3\twlan0     :     2      V3\n"
            "\t\t\t\t010000E0     1 0:00000000\t\t0\n"
        )
        import builtins
        from unittest import mock
        with mock.patch.object(builtins, "open", mock.mock_open(read_data=sample)):
            self.assertEqual(mdns.joined_mdns_group(), {"enp63s0"})


if __name__ == "__main__":
    unittest.main()
