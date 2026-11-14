"""
Tests for the server-control helper (deploy/control/kinesis_control.py).

Standard library only; a fake kinesisctl records what it was asked to do:

    python -m unittest discover -s deploy/tests -v
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

HELPER = Path(__file__).resolve().parents[1] / "control" / "kinesis_control.py"


class ControlHelperTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dir = Path(self.temp.name) / "control"
        self.dir.mkdir()
        self.log = Path(self.temp.name) / "calls.log"
        self.fake = Path(self.temp.name) / "kinesisctl"
        self.fake.write_text(f'#!/bin/sh\necho "$@" >> "{self.log}"\nexit ${{FAKE_EXIT:-0}}\n')
        self.fake.chmod(0o755)

    def tearDown(self):
        self.temp.cleanup()

    def request(self, **overrides):
        data = {
            "id": "abc123",
            "action": "restart",
            "command": "restart",
            "requested_by": "admin",
            "requested_at": datetime.now(timezone.utc).isoformat(),
        }
        data.update(overrides)
        (self.dir / "request.json").write_text(json.dumps(data))

    def run_helper(self, **env):
        return subprocess.run(
            [sys.executable, "-I", str(HELPER)],
            env={"KINESIS_CONTROL_DIR": str(self.dir), "KINESISCTL": str(self.fake), "PATH": os.environ["PATH"], **env},
            capture_output=True,
            text=True,
            timeout=60,
        )

    def result(self):
        return json.loads((self.dir / "result.json").read_text())

    def calls(self):
        return self.log.read_text().split() if self.log.exists() else []

    def test_restart_runs_kinesisctl_restart_and_reports_done(self):
        self.request()
        self.assertEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.calls(), ["restart"])
        self.assertEqual(self.result()["state"], "done")
        self.assertFalse((self.dir / "request.json").exists(), "the request must be consumed")

    def test_shutdown_runs_kinesisctl_stop(self):
        self.request(action="shutdown", command="stop")
        self.run_helper()
        self.assertEqual(self.calls(), ["stop"])

    def test_failure_is_reported(self):
        self.request()
        self.assertEqual(self.run_helper(FAKE_EXIT="3").returncode, 1)
        self.assertEqual(self.result()["state"], "failed")
        self.assertEqual(self.result()["exit_code"], 3)

    def test_other_commands_are_never_run(self):
        for command in ["start", "restart; rm -rf /", "$(reboot)", "", None]:
            self.request(command=command)
            self.run_helper()
            self.assertEqual(self.calls(), [], command)
            self.assertEqual(self.result()["state"], "failed")
            self.assertFalse((self.dir / "request.json").exists())

    def test_expired_request_is_refused(self):
        old = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.request(requested_at=old)
        self.run_helper()
        self.assertEqual(self.calls(), [])
        self.assertIn("expired", self.result()["message"])

    def test_malformed_and_oversized_requests_are_refused(self):
        (self.dir / "request.json").write_text("{not json")
        self.run_helper()
        self.assertEqual(self.result()["state"], "failed")

        (self.dir / "request.json").write_text(json.dumps({"command": "restart", "pad": "x" * 10_000}))
        self.run_helper()
        self.assertEqual(self.calls(), [])
        self.assertIn("too large", self.result()["message"])

    def test_a_symlinked_request_is_not_followed(self):
        target = Path(self.temp.name) / "elsewhere.json"
        target.write_text(json.dumps({"command": "stop", "requested_at": datetime.now(timezone.utc).isoformat()}))
        (self.dir / "request.json").symlink_to(target)
        self.run_helper()
        self.assertEqual(self.calls(), [])

    def test_nothing_to_do_is_fine(self):
        self.assertEqual(self.run_helper().returncode, 0)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
