#!/usr/bin/env python3
"""Fail early with actionable diagnostics for Portfolio's native build environments."""

from __future__ import annotations

import argparse
import importlib.util
import shutil
import subprocess
import sys


PROFILES = {
    "ux": {
        "executables": ("node", "npm", "curl"),
        "modules": (),
    },
    "publication": {
        "executables": ("python", "git", "jupyter"),
        "modules": ("bs4", "jsonschema", "nbconvert"),
    },
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", choices=PROFILES)
    args = parser.parse_args()
    failures: list[str] = []

    required_python = (3, 12)
    if sys.version_info[:2] != required_python:
        failures.append(f"Python 3.12 is required; found {sys.version.split()[0]}")

    for executable in PROFILES[args.profile]["executables"]:
        if shutil.which(executable) is None:
            failures.append(f"Required executable not found on PATH: {executable}")

    if args.profile == "ux" and shutil.which("node"):
        version = subprocess.run(
            ["node", "--version"], check=True, capture_output=True, text=True
        ).stdout.strip()
        if not version.startswith("v22."):
            failures.append(f"Node 22 is required by package.json; found {version}")

    for module in PROFILES[args.profile]["modules"]:
        if importlib.util.find_spec(module) is None:
            failures.append(f"Required installed module/tool not found: {module}")

    if args.profile == "ux":
        try:
            subprocess.run(
                ["npm", "ls", "--depth=0"],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError):
            failures.append("Locked UX packages are not installed; run npm ci")
        try:
            result = subprocess.run(
                ["npx", "playwright", "install", "--list"],
                check=True,
                capture_output=True,
                text=True,
            )
            if "chromium" not in result.stdout.lower():
                failures.append("Playwright Chromium is not installed")
        except (OSError, subprocess.CalledProcessError):
            failures.append("Playwright Chromium is not installed or could not be queried")
        try:
            subprocess.run(
                [
                    "node",
                    "-e",
                    "require('@playwright/test').chromium.launch()"
                    ".then(browser => browser.close())"
                    ".catch(error => { console.error(error); process.exit(1); })",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError):
            failures.append("Chromium cannot launch; check Playwright browser and system dependencies")
    else:
        try:
            subprocess.run(
                ["jupyter", "lite", "--version"],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError):
            failures.append("JupyterLite is not installed or could not be queried")

    if failures:
        print("Environment preflight failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print(f"Environment preflight passed: {args.profile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
