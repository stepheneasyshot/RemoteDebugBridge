#!/usr/bin/env python3
"""Download or verify only the scrcpy resources pinned in the repository."""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import urllib.error
import urllib.request


RESOURCE_DIR = Path(__file__).resolve().parents[1] / "src-tauri/resources/scrcpy"


def matches(path, asset):
    return (
        path.is_file()
        and path.stat().st_size == asset["size"]
        and hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]
    )


def prepare(asset, check_only):
    name = asset["file"]
    if Path(name).name != name:
        raise ValueError(f"Invalid resource filename: {name}")
    destination = RESOURCE_DIR / name
    if matches(destination, asset):
        print(f"OK {name}: size and SHA-256 match", flush=True)
        return
    if check_only:
        raise ValueError(f"Missing or mismatched resource: {destination}")

    print(f"Downloading {name} from {asset['url']}", flush=True)
    request = urllib.request.Request(
        asset["url"], headers={"User-Agent": "RemoteDebugBridge-resource-setup"}
    )
    temporary = None
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            # Limit the response before writing; a failed download must not replace the asset.
            data = response.read(asset["size"] + 1)
        if len(data) != asset["size"]:
            raise ValueError(f"Unexpected download size for {name}: {len(data)}")
        if hashlib.sha256(data).hexdigest() != asset["sha256"]:
            raise ValueError(f"SHA-256 mismatch for {name}")
        with tempfile.NamedTemporaryFile(dir=RESOURCE_DIR, delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
        temporary.chmod(0o644)
        temporary.replace(destination)
        print(f"Ready {name}: SHA-256 verified", flush=True)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify without downloading")
    args = parser.parse_args()
    manifest = json.loads((RESOURCE_DIR / "manifest.json").read_text())
    print(f"scrcpy-server {manifest['version']}", flush=True)
    for asset in manifest["assets"]:
        prepare(asset, args.check)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, urllib.error.URLError) as error:
        print(f"Resource preparation failed: {error}", file=sys.stderr)
        sys.exit(1)
