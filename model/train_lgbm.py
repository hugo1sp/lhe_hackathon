"""Next-day migraine forecast with LightGBM on simulator data.

Features come from data available up to day t: wearable signals, their
deviation from the person's own 28-day baseline, sleep regularity, cycle day,
and migraine history from the one-tap answers (labels.csv). The target is the
answered migraine label for day t+1; days without an answer are unknown and
not used for training.

LightGBM was picked after comparing 9 model families with person-grouped CV
(logreg, naive Bayes, kNN, MLP, random forest, extra trees, hist GB, XGBoost,
LightGBM). LightGBM, XGBoost and the MLP tied at the top (within fold noise);
LightGBM handles non-wear gaps natively and is fast and explainable.

Evaluation uses 5-fold CV grouped by person (no person in both train and
test) and scores against the ground-truth attacks (`true_migraine`) on every
day, including days the user never answered.

Usage:
  python model/train_lgbm.py --data data
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


def build_features(daily, labels):
    """One row per person-day with features known at the end of day t."""
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
    X["cycle_day_tomorrow"] = g["cycle_day"].shift(-1)
    X["dow_tomorrow"] = (d["day_of_week"] + 1) % 7

    # Migraine history from answered labels (unknown days count as no known attack)
    known = d["label"].fillna(0)
    X["label_today"] = d["label"]
    X["migraines_7d"] = known.groupby(d["person_id"]).transform(lambda s: s.rolling(7, min_periods=1).sum())
    X["migraines_30d"] = known.groupby(d["person_id"]).transform(lambda s: s.rolling(30, min_periods=1).sum())
    last = d["date"].where(d["label"] == 1).groupby(d["person_id"]).ffill()
    X["days_since_migraine"] = (d["date"] - last).dt.days

    meta = pd.DataFrame({"person_id": d["person_id"], "date": d["date"],
                         "y": g["label"].shift(-1), "y_true": g["true_migraine"].shift(-1)})
    keep = meta["y_true"].notna() & (g.cumcount() >= 28).to_numpy()  # need baseline and a tomorrow
    return X[keep], meta[keep]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data")
    args = ap.parse_args()
    data = Path(args.data)

    daily = pd.read_csv(data / "daily.csv", parse_dates=["date"])
    labels = pd.read_csv(data / "labels.csv", parse_dates=["date"])
    X, meta = build_features(daily, labels)
    labelled = meta["y"].notna().to_numpy()
    print(f"{len(X)} person-days, {labelled.mean():.0%} with a known label for tomorrow, "
          f"{X.shape[1]} features")

    p = np.zeros(len(X))
    for tr, te in GroupKFold(5).split(X, groups=meta["person_id"]):
        tr = tr[labelled[tr]]
        model = LGBMClassifier(**PARAMS).fit(X.iloc[tr], meta["y"].iloc[tr].astype(int))
        p[te] = model.predict_proba(X.iloc[te])[:, 1]

    y_true = meta["y_true"].astype(int)
    print(f"\nPerson-grouped 5-fold CV, scored on true attacks every day (rate {y_true.mean():.3f})")
    print(f"  ROC AUC  {roc_auc_score(y_true, p):.3f}   (random = 0.500)")
    print(f"  PR AUC   {average_precision_score(y_true, p):.3f}   (random = {y_true.mean():.3f})")
    print(f"  Brier    {brier_score_loss(y_true, p):.4f}  (constant base rate = "
          f"{brier_score_loss(y_true, np.full(len(p), y_true.mean())):.4f})")
    risk = meta.assign(p=p).merge(daily[["person_id", "date", "true_risk"]].assign(
        date=lambda x: x["date"] - pd.Timedelta(days=1)), on=["person_id", "date"])["true_risk"]
    print(f"  Simulator's true risk, for reference: ROC AUC {roc_auc_score(y_true, risk):.3f} "
          f"(the model can exceed it: the simulated prodrome is caused by the realised attack)")

    model = LGBMClassifier(**PARAMS).fit(X[labelled], meta["y"][labelled].astype(int))
    model.booster_.save_model(data / "model_lgbm.txt")
    top = pd.Series(model.booster_.feature_importance("gain"), X.columns).nlargest(8)
    print("\nTop features (gain share):")
    for name, v in (top / model.booster_.feature_importance("gain").sum()).items():
        print(f"  {name:<24} {v:.3f}")
    print(f"\nSaved model to {data / 'model_lgbm.txt'}")


if __name__ == "__main__":
    main()
