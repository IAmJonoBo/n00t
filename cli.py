#!/usr/bin/env python3
"""Repo-local helper for n00t."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent


def list_capabilities() -> None:
    manifest = json.loads((REPO_ROOT / "capabilities" / "manifest.json").read_text())
    for capability in manifest.get("capabilities", []):
        print(f"- {capability.get('id')}: {capability.get('description', '')}")


def run_tests() -> None:
    try:
        subprocess.run(["pnpm", "test"], check=True, cwd=REPO_ROOT)
    except FileNotFoundError:
        raise SystemExit("pnpm is not installed or not in PATH.")


def main() -> int:
    parser = argparse.ArgumentParser(description="n00t helper CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("capabilities", help="List registered capabilities.")
    subparsers.add_parser("tests", help="Run pnpm test suite.")
    subparsers.add_parser("status", help="Show git status for n00t.")

    args = parser.parse_args()
    if args.command == "capabilities":
        list_capabilities()
    elif args.command == "tests":
        run_tests()
    elif args.command == "status":
        subprocess.run(["git", "status", "-sb"], check=True, cwd=REPO_ROOT)
    else:  # pragma: no cover - safety net
        parser.print_help()
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
