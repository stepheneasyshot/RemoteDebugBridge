#!/usr/bin/env python3
"""macOS regression: relaunching the built app must not create another instance.

Start the bundled app first. Run this with a mirror active to also check that
relaunching preserves its ADB tunnels. No device input is sent.
"""

import argparse
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]


def app_pids():
    output = subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True)
    return {
        int(pid)
        for line in output.splitlines()
        if len(fields := line.strip().split(maxsplit=1)) == 2
        for pid, command in [fields]
        if command.startswith(str(ROOT / "target"))
        and command.endswith("/remote-debug-bridge")
    }


def tunnels(adb):
    output = subprocess.check_output([adb, "forward", "--list"], text=True)
    return sorted(line for line in output.splitlines() if "localabstract:scrcpy_" in line)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default="adb")
    args = parser.parse_args()
    binary = ROOT / "target/debug/bundle/macos/remote-debug-bridge.app/Contents/MacOS/remote-debug-bridge"
    original = app_pids()
    assert len(original) == 1, f"Expected one running application, got {len(original)}"
    original_tunnels = tunnels(args.adb)
    for _ in range(5):
        with subprocess.Popen([str(binary)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE) as child:
            try:
                _, error = child.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                child.terminate()
                child.communicate(timeout=5)
                raise AssertionError("Second application did not exit within 5 seconds") from None
            assert child.returncode == 0, error.decode(errors="replace")
        assert app_pids() == original, "Relaunch created or replaced the active application"
        assert tunnels(args.adb) == original_tunnels, "Relaunch changed the active mirror tunnels"
    print("PASS: 5 relaunches, one original application, unchanged ADB tunnels")


if __name__ == "__main__":
    main()
