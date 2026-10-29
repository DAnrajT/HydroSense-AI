"""Train and compare models, then save the best one to model.joblib.

Usage:
    python train_model.py                  # use dataset.csv only
    python train_model.py --synthetic 5000 # add 5000 synthetic rows
"""
import argparse
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from common import FEATURES, make_features

parser = argparse.ArgumentParser()
parser.add_argument("--synthetic", type=int, default=0, help="number of synthetic rows to add")
args = parser.parse_args()
rng = np.random.default_rng(42)


def synthetic(n):
    """Generate noisy normal and leak rows, including hard cases (very small leaks)."""
    rows = []
    for _ in range(n):
        leak = rng.random() < 0.5
        pin = rng.uniform(1.5, 4.5)
        qi = 0.0 if rng.random() < 0.05 else rng.uniform(0.5, 15)
        if leak:
            frac = rng.choice([rng.uniform(0.02, 0.08), rng.uniform(0.08, 0.3), rng.uniform(0.3, 0.7)],
                              p=[0.3, 0.45, 0.25])
            qo = qi * (1 - frac)
            p = pin - 0.1 * frac * 10 * rng.uniform(0.5, 1.5)
        else:
            qo = qi * (1 + rng.normal(0, 0.03))
            p = pin - rng.uniform(0, 0.15)
        qi_m = max(0, qi * (1 + rng.normal(0, 0.03)))
        qo_m = max(0, qo * (1 + rng.normal(0, 0.03)))
        rows.append((qi_m, qo_m, max(0, p), int(leak and qi > 0)))
    return pd.DataFrame(rows, columns=["inlet_flow", "outlet_flow", "pressure", "label"])


if __import__("os").path.exists("dataset.csv"):
    df = pd.read_csv("dataset.csv")[["inlet_flow", "outlet_flow", "pressure", "label"]]
    print(f"Real/mimic rows loaded: {len(df)}")
else:
    df = pd.DataFrame(columns=["inlet_flow", "outlet_flow", "pressure", "label"])
    print("dataset.csv not found; training will use synthetic examples only.")
if args.synthetic:
    df = pd.concat([df, synthetic(args.synthetic)], ignore_index=True)
    print(f"Rows after adding synthetic examples: {len(df)}")

if len(df) == 0 or df["label"].nunique() < 2:
    raise SystemExit("Need both normal and leak examples. Collect both labels or use --synthetic for a demonstration model.")

df = make_features(df)
X, y = df[FEATURES], df["label"]
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

models = {
    "Decision Tree": DecisionTreeClassifier(max_depth=6, random_state=42),
    "Random Forest": RandomForestClassifier(n_estimators=150, random_state=42),
    "SVM": make_pipeline(StandardScaler(), SVC(kernel="rbf", C=3)),
}

best_name, best_f1, best_model = None, -1, None
print(f"\n{'Model':<15}{'Acc':>8}{'Prec':>8}{'Recall':>8}{'F1':>8}")
for name, m in models.items():
    m.fit(X_tr, y_tr)
    pred = m.predict(X_te)
    f1 = f1_score(y_te, pred)
    print(f"{name:<15}{accuracy_score(y_te, pred):8.3f}{precision_score(y_te, pred):8.3f}"
          f"{recall_score(y_te, pred):8.3f}{f1:8.3f}")
    print("  confusion matrix [[TN FP] [FN TP]]:", confusion_matrix(y_te, pred).tolist())
    if f1 > best_f1:
        best_name, best_f1, best_model = name, f1, m

joblib.dump(best_model, "model.joblib")
print(f"\nBest model: {best_name} (F1 {best_f1:.3f}) saved to model.joblib")
