import os
import stat
from pathlib import Path

import pytest

import config_paths


def test_relative_paths_resolve_against_data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config_paths.path_settings, "data_dir", str(tmp_path))

    resolved = config_paths.resolve_data_path(None, "uploads/products")

    assert resolved == (tmp_path / "uploads" / "products").resolve()


def test_absolute_paths_are_kept(tmp_path, monkeypatch):
    monkeypatch.setattr(config_paths.path_settings, "data_dir", "/somewhere/else")

    resolved = config_paths.resolve_data_path(str(tmp_path / "images"), "unused")

    assert resolved == (tmp_path / "images").resolve()


def test_relative_paths_never_depend_on_working_directory(tmp_path, monkeypatch):
    monkeypatch.setattr(config_paths.path_settings, "data_dir", None)
    monkeypatch.chdir(tmp_path)

    resolved = config_paths.resolve_data_path(None, "uploads/gcash")

    assert resolved == (config_paths.BACKEND_DIRECTORY / "uploads" / "gcash").resolve()


def test_create_private_file_is_exclusive_and_private(tmp_path):
    target = tmp_path / "secret.dump"

    config_paths.create_private_file(target)

    with pytest.raises(FileExistsError):
        config_paths.create_private_file(target)

    if os.name != "nt":
        mode = stat.S_IMODE(target.stat().st_mode)
        assert mode & 0o077 == 0


def test_postgres_tool_prefers_configured_directory(tmp_path, monkeypatch):
    name = "pg_dump.exe" if os.name == "nt" else "pg_dump"
    tool = tmp_path / name
    tool.write_text("#!/bin/sh\n")
    tool.chmod(0o755)

    monkeypatch.setattr(config_paths.path_settings, "pg_bin_dir", str(tmp_path))

    assert Path(config_paths.postgres_tool("pg_dump")) == tool
