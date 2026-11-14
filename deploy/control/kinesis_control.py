#!/usr/bin/env python3
"""
Carries out a server-control request from the administrator console.

The backend runs in a sandbox that cannot reach the service manager, so it
only drops a small JSON request into <data>/control/request.json. systemd
(kinesis-control.path) starts this script when that file appears. The script
checks the request and runs exactly one of

    kinesisctl restart
    kinesisctl stop

then writes <data>/control/result.json, which the console reads.

Nothing from the request is ever passed to a shell or used as a command: the
only field that selects what runs is "command", and it must be one of the
two words above. A request is refused when it is a symlink, not owned by the
expected account, too large, malformed or older than MAX_AGE_SECONDS (so a
request left behind while this unit was not running cannot fire later).

Environment:
  KINESIS_CONTROL_DIR     the control directory (required)
  KINESISCTL              path of kinesisctl (required)
  KINESIS_CONTROL_OWNER   account that may write requests (default: the
                          account running this script)
"""

import json
import os
import pwd
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ALLOWED_COMMANDS = {"restart", "stop"}
MAX_AGE_SECONDS = 120
MAX_REQUEST_BYTES = 4096
# Let the HTTP response that asked for this reach the browser first.
START_DELAY_SECONDS = 2
COMMAND_TIMEOUT_SECONDS = 300


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_result(directory: Path, **fields) -> None:
    temporary = directory / ".result.tmp"

    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(fields, handle)

    os.chmod(temporary, 0o644)
    os.replace(temporary, directory / "result.json")


def read_request(directory: Path, owner_uid: int) -> dict:
    path = directory / "request.json"

    # O_NOFOLLOW: a symlink planted here must not be read.
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)

    try:
        info = os.fstat(descriptor)

        if not stat.S_ISREG(info.st_mode):
            raise ValueError("the request is not a regular file")

        if info.st_uid not in (owner_uid, 0):
            raise ValueError("the request is not owned by the Kinesis account")

        if info.st_size > MAX_REQUEST_BYTES:
            raise ValueError("the request is too large")

        raw = os.read(descriptor, MAX_REQUEST_BYTES + 1)
    finally:
        os.close(descriptor)

    data = json.loads(raw.decode("utf-8"))

    if not isinstance(data, dict):
        raise ValueError("the request is not a JSON object")

    return data


def main() -> int:
    directory = Path(os.environ["KINESIS_CONTROL_DIR"])
    kinesisctl = os.environ["KINESISCTL"]
    owner = os.environ.get("KINESIS_CONTROL_OWNER")
    owner_uid = pwd.getpwnam(owner).pw_uid if owner else os.getuid()

    request_path = directory / "request.json"

    if not request_path.exists():
        return 0

    request_id = "unknown"

    try:
        request = read_request(directory, owner_uid)
        request_id = str(request.get("id", "unknown"))[:32]
        command = request.get("command")

        if command not in ALLOWED_COMMANDS:
            raise ValueError("the request names a command that is not allowed")

        requested_at = datetime.fromisoformat(str(request.get("requested_at")))
        age = (datetime.now(timezone.utc) - requested_at).total_seconds()

        if age > MAX_AGE_SECONDS or age < -5:
            raise ValueError("the request has expired")
    except (OSError, ValueError, KeyError) as error:
        # Remove it either way, or this unit would start again and again.
        request_path.unlink(missing_ok=True)
        write_result(
            directory,
            id=request_id,
            state="failed",
            finished_at=now(),
            message=f"Request refused: {error}.",
        )
        return 1

    # Delete before acting: restarting must not find the same request again.
    request_path.unlink(missing_ok=True)

    started = now()
    write_result(
        directory,
        id=request_id,
        action=request.get("action"),
        command=command,
        state="running",
        started_at=started,
    )

    time.sleep(START_DELAY_SECONDS)

    try:
        completed = subprocess.run(  # noqa: S603 - fixed argv, command checked above
            [kinesisctl, command],
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
        code = completed.returncode
        output = (completed.stdout + completed.stderr).strip().splitlines()[-8:]
    except (OSError, subprocess.TimeoutExpired) as error:
        code = -1
        output = [str(error)]

    write_result(
        directory,
        id=request_id,
        action=request.get("action"),
        command=command,
        state="done" if code == 0 else "failed",
        started_at=started,
        finished_at=now(),
        exit_code=code,
        message=(
            "kinesisctl " + command + " finished."
            if code == 0
            else "kinesisctl " + command + " failed: " + " ".join(output)[:300]
        ),
    )

    return 0 if code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
