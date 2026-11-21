"""Migraine forecast 1, 2 and 3 days ahead with LightGBM on simulator data.

Features come from data available up to day t: wearable signals, their
deviation from the person's own 28-day baseline, sleep regularity, cycle day,
and migraine history from the one-tap answers (labels.csv). The target is the
answered migraine label for day t+h (h = 1, 2, 3; one model per horizon);
days without an answer are unknown and not used for training. Besides today's
data, each horizon only gets what is known in advance for day t+h: its cycle
day and day of week.

LightGBM was picked after comparing 9 model families with person-grouped CV
(logreg, naive Bayes, kNN, MLP, random forest, extra trees, hist GB, XGBoost,
LightGBM). LightGBM, XGBoost and the MLP tied at the top (within fold noise);
LightGBM handles non-wear gaps natively and is fast and explainable.

Evaluation uses 5-fold CV grouped by person (no person in both train and
test) and scores against the ground-truth attacks (`true_migraine`) on every
day, including days the user never answered.

Usage:
  python model/train_lgbm.py --data data [--horizons 1 2 3]
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

WEARABLE_COLS = ["sleep_hours", "sleep_efficiency", "sleep_midpoint_h",
                 "resting_hr", "hrv_rmssd", "steps", "stress_score"]
PARAMS = dict(n_estimators=600, learning_rate=0.02, num_leaves=15, min_child_samples=100,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.6, verbose=-1)


def build_features(daily, labels, horizon=1):
    """One row per person-day with features known at the end of day t, target day t+horizon."""
    d = daily.merge(labels[["person_id", "date", "migraine"]].rename(columns={"migraine": "label"}),
                    on=["person_id", "date"], how="left").sort_values(["person_id", "date"])
    d = d.reset_index(drop=True)
    g = d.groupby("person_id")
    roll = lambda col, w, f, shift=0: g[col].transform(
        lambda s: getattr(s.shift(shift).rolling(w, min_periods=min(w, 7)), f)())

    X = pd.DataFrame(index=d.index)
    for c in WEARABLE_COLS:
        base, sd = roll(c, 28, "mean", 1), roll(c, 28, "std", 1)
        X[c] = d[c]
        X[c + "_z"] = (d[c] - base) / sd                      # vs personal baseline
        X[c + "_z_lag1"] = (g[c].shift(1) - base) / sd
        X[c + "_3d"] = g[c].transform(lambda s: s.rolling(3, min_periods=1).mean())
    X["sleep_midpoint_irreg"] = (d["sleep_midpoint_h"] - roll("sleep_midpoint_h", 7, "mean")).abs()
    X["nonwear"] = d["resting_hr"].isna().astype(int)
    X["cycle_day_ahead"] = g["cycle_day"].shift(-horizon)   # known in advance for menstruating users
    X["dow_ahead"] = (d["day_of_week"] + horizon) % 7

    # Migraine history from answered labels (unknown days count as no known attack)
    known = d["label"].fillna(0)
    X["label_today"] = d["label"]
    X["migraines_7d"] = known.groupby(d["person_id"]).transform(lambda s: s.rolling(7, min_periods=1).sum())
    X["migraines_30d"] = known.groupby(d["person_id"]).transform(lambda s: s.rolling(30, min_periods=1).sum())
    last = d["date"].where(d["label"] == 1).groupby(d["person_id"]).ffill()
    X["days_since_migraine"] = (d["date"] - last).dt.days

    meta = pd.DataFrame({"person_id": d["person_id"], "date": d["date"],
                         "y": g["label"].shift(-horizon), "y_true": g["true_migraine"].shift(-horizon)})
    keep = meta["y_true"].notna() & (g.cumcount() >= 28).to_numpy()  # need baseline and a target day
    return X[keep], meta[keep]


def train_horizon(daily, labels, horizon, data):
    X, meta = build_features(daily, labels, horizon)
    labelled = meta["y"].notna().to_numpy()
    print(f"\n=== {horizon} day(s) ahead ===")
    print(f"{len(X)} person-days, {labelled.mean():.0%} with a known label for the target day, "
          f"{X.shape[1]} features")

    p = np.zeros(len(X))
    for tr, te in GroupKFold(5).split(X, groups=meta["person_id"]):
        tr = tr[labelled[tr]]
        model = LGBMClassifier(**PARAMS).fit(X.iloc[tr], meta["y"].iloc[tr].astype(int))
        p[te] = model.predict_proba(X.iloc[te])[:, 1]

    y_true = meta["y_true"].astype(int)
    scores = {"roc_auc": roc_auc_score(y_true, p), "pr_auc": average_precision_score(y_true, p),
              "brier": brier_score_loss(y_true, p), "base_rate": y_true.mean(),
              "brier_const": brier_score_loss(y_true, np.full(len(p), y_true.mean()))}
    print(f"Person-grouped 5-fold CV, scored on true attacks every day (rate {scores['base_rate']:.3f})")
    print(f"  ROC AUC  {scores['roc_auc']:.3f}   (random = 0.500)")
    print(f"  PR AUC   {scores['pr_auc']:.3f}   (random = {scores['base_rate']:.3f})")
    print(f"  Brier    {scores['brier']:.4f}  (constant base rate = {scores['brier_const']:.4f})")
    risk = meta.assign(p=p).merge(daily[["person_id", "date", "true_risk"]].assign(
        date=lambda x: x["date"] - pd.Timedelta(days=horizon)), on=["person_id", "date"])["true_risk"]
    print(f"  Simulator's true risk, for reference: ROC AUC {roc_auc_score(y_true, risk):.3f} "
          f"(the model can exceed it: the simulated prodrome is caused by the realised attack)")

    model = LGBMClassifier(**PARAMS).fit(X[labelled], meta["y"][labelled].astype(int))
    path = data / f"model_lgbm_d{horizon}.txt"
    model.booster_.save_model(path)
    top = pd.Series(model.booster_.feature_importance("gain"), X.columns).nlargest(8)
    print("Top features (gain share):")
    for name, v in (top / model.booster_.feature_importance("gain").sum()).items():
        print(f"  {name:<24} {v:.3f}")
    print(f"Saved model to {path}")
    return scores


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data")
    ap.add_argument("--horizons", type=int, nargs="+", default=[1, 2, 3])
    args = ap.parse_args()
    data = Path(args.data)

    daily = pd.read_csv(data / "daily.csv", parse_dates=["date"])
    labels = pd.read_csv(data / "labels.csv", parse_dates=["date"])
    results = {h: train_horizon(daily, labels, h, data) for h in args.horizons}

    print("\nSummary (person-grouped CV, true attacks):")
    print("  days ahead  ROC AUC  PR AUC  Brier   Brier(const)")
    for h, r in results.items():
        print(f"  {h:>10}  {r['roc_auc']:.3f}    {r['pr_auc']:.3f}   {r['brier']:.4f}  {r['brier_const']:.4f}")


if __name__ == "__main__":
    main()
