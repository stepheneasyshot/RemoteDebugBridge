#!/usr/bin/env python3
"""Prepare the pinned official ADB resources; --check performs offline verification."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1] / 'src-tauri/resources/adb'


def matches(data, record):
    return len(data) == record['size'] and hashlib.sha256(data).hexdigest() == record['sha256']


def verify(archive):
    for record in archive['files']:
        path = ROOT / archive['platform'] / record['path']
        if not path.is_file() or not matches(path.read_bytes(), record):
            return False
        if path.name == 'adb' and os.name != 'nt' and not os.access(path, os.X_OK):
            return False
    return True


def prepare(archive, check):
    platform = archive['platform']
    if verify(archive):
        print(f'OK {platform}: size, SHA-256 and executable permissions')
        return
    if check:
        raise ValueError(f'Missing or mismatched ADB resources: {platform}')
    print(f'Downloading {archive["url"]}', flush=True)
    with urllib.request.urlopen(archive['url'], timeout=120) as response:
        data = response.read(archive['size'] + 1)
    if not matches(data, archive) or hashlib.sha1(data).hexdigest() != archive['sha1']:
        raise ValueError(f'Archive checksum mismatch: {platform}')
    with zipfile.ZipFile(io.BytesIO(data)) as bundle:
        # Read only pinned files; never extract arbitrary archive paths.
        contents = []
        for record in archive['files']:
            relative = Path(record['path'])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Invalid resource path')
            content = bundle.read('platform-tools/' + record['path'])
            if not matches(content, record):
                raise ValueError(f'File checksum mismatch: {record["path"]}')
            contents.append((relative, content))
        for relative, content in contents:
            destination = ROOT / platform / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as output:
                temporary = Path(output.name)
                output.write(content)
            try:
                temporary.chmod(0o755 if relative.name == 'adb' else 0o644)
                temporary.replace(destination)
            finally:
                temporary.unlink(missing_ok=True)
    if not verify(archive):
        raise ValueError(f'Resource verification failed: {platform}')
    print(f'Ready {platform}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    print(f'Platform-Tools {manifest["version"]}')
    for archive in manifest['archives']:
        prepare(archive, args.check)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f'ADB preparation failed: {error}', file=sys.stderr)
        sys.exit(1)
