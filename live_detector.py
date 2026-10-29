"""Watch Firebase /latest, run the ML model, and write status/valve commands.
Set FIREBASE_API_KEY, FIREBASE_EMAIL and FIREBASE_PASSWORD in the environment
if Realtime Database rules require authenticated access.
"""
import time
import joblib
import pandas as pd
from common import FEATURES, db_get, db_put, make_features

CONSECUTIVE_TO_TRIP = 3
model = joblib.load("model.joblib")

db_put("command", {"valve": "open"})
print("Detector running. Waiting for readings...")
last_ts, streak = None, 0
while True:
    try:
        r = db_get("latest", timeout=10)
        if r and r.get("ts") != last_ts:
            last_ts = r["ts"]
            row = make_features(pd.DataFrame([r]))
            leak = int(model.predict(row[FEATURES])[0])
            streak = streak + 1 if leak else 0
            state = "leak" if leak else "normal"
            db_put("status", {"state": state, "ts": last_ts})
            print(f"ts={last_ts} in={r['inlet_flow']} out={r['outlet_flow']} -> {state} (streak {streak})")
            if streak >= CONSECUTIVE_TO_TRIP:
                db_put("command", {"valve": "close", "reason": "three_consecutive_leak_predictions", "ts": int(time.time())})
                print(">>> LEAK CONFIRMED: sent valve close")
                streak = 0
    except Exception as e:
        print("Error:", e)
    time.sleep(1)
