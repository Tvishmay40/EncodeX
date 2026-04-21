import json
import random
import time
import urllib.request

# Set your Firebase Realtime DB node URL, for example:
# https://your-project-id-default-rtdb.firebaseio.com/telemetry/ROB-A.json
FIREBASE_NODE_URL = "https://your-project-id-default-rtdb.firebaseio.com/telemetry/ROB-A.json"


def post_payload(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        FIREBASE_NODE_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


while True:
    packet = {
        "temp": round(54 + random.uniform(-2, 8), 2),
        "vib": round(1.2 + random.uniform(-0.2, 1.3), 2),
        "pres": round(28 + random.uniform(-1, 3), 2),
        "rpm": round(900 + random.uniform(-40, 60), 0),
        "kw": round(14 + random.uniform(-1, 3), 2),
        "co2": round(3 + random.uniform(-0.4, 0.8), 2),
        "ts": int(time.time()),
    }
    code = post_payload(packet)
    print(f"Uploaded telemetry packet (status={code}): {packet}")
    time.sleep(2)
