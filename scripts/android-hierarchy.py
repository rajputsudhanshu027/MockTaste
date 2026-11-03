"""Read a live Android hierarchy without waiting for its countdown to stop."""
import os
import json
from pathlib import Path
import sys
import time

root = Path(__file__).resolve().parent.parent
sdk = Path(os.environ.get("ANDROID_HOME", root / ".android-tools/sdk"))
os.environ.setdefault("ADBUTILS_ADB_PATH", str(sdk / "platform-tools/adb"))

import uiautomator2 as u2

device = u2.connect(sys.argv[1])

def dump():
    global device
    for attempt in range(3):
        try:
            device.jsonrpc.setConfigurator({"waitForIdleTimeout": 0, "waitForSelectorTimeout": 0})
            return device.dump_hierarchy(compressed=False, pretty=False)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(0.3)
            device = u2.connect(sys.argv[1])

if "--stream" in sys.argv:
    for command in sys.stdin:
        try:
            print(json.dumps({"xml": dump()}), flush=True)
        except Exception as error:
            print(json.dumps({"error": str(error)}), flush=True)
else:
    sys.stdout.write(dump())
