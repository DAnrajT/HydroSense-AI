"""Download readings from Firebase /readings into dataset.csv."""
import pandas as pd
from common import db_get

data = db_get("readings", timeout=30)
if not data:
    raise SystemExit("No readings found. Sign in to the app and send some sensor readings first.")

df = pd.DataFrame(list(data.values()))
required = {"ts", "inlet_flow", "outlet_flow", "pressure", "label"}
missing = required.difference(df.columns)
if missing:
    raise SystemExit("Firebase readings are missing required fields: " + ", ".join(sorted(missing)))
df = df.sort_values("ts").reset_index(drop=True)
df.to_csv("dataset.csv", index=False)
print(f"Saved {len(df)} rows to dataset.csv")
print(df["label"].value_counts().rename({0: "normal (0)", 1: "leak (1)"}))
