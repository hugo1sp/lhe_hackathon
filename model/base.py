"""Shared base model: next-day migraine forecast from smartwatch data only.

Layer 1 of the two-layer design. One LightGBM for all users that sees only
watch-derived features: wearable signals, their deviation from the person's
own 28-day baseline, yesterday's deviation, 3-day means, sleep regularity and
non-wear. No cycle day, day of week or migraine history: those belong to the
per-user personal layer (model/personal.py), which builds on p_base.

The target is the answered migraine label for day t+1 (labels.csv); days
without an answer are not used for training. Evaluation uses 5-fold CV grouped
by person and scores against ground-truth attacks (`true_migraine`) on every
day, including days the user never answered.

Outputs:
  data/model_base.txt  LightGBM model trained on all labelled days
  data/base_oof.csv    person_id,date,p_base: out-of-fold P(migraine on date+1)
                       for every person-day kept by build_features

Usage:
  python model/base.py --data data
"""

import argparse
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

WEARABLE_COLS = ["sleep_hours", "sleep_efficiency", "sleep_midpoint_h",
                 "resting_hr", "hrv_rmssd", "steps", "stress_score"]
PARAMS = dict(n_estimators=600, learning_rate=0.02, num_leaves=15, min_child_samples=100,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.6, verbose=-1)
MODEL_PATH = Path(__file__).resolve().parent.parent / "data" / "model_base.txt"


def build_features(daily, labels=None):
    """One row per person-day with 28 days of baseline; watch features known at the end of day t.

    meta has person_id, date and, when available, y (answered label for t+1)
    and y_true (true attack on t+1).
    """
    d = daily.sort_values(["person_id", "date"]).reset_index(drop=True)
    if labels is not None:
        d = d.merge(labels[["person_id", "date", "migraine"]].rename(columns={"migraine": "label"}),
                    on=["person_id", "date"], how="left")
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

    meta = pd.DataFrame({"person_id": d["person_id"], "date": d["date"]})
    if labels is not None:
        meta["y"] = g["label"].shift(-1)
    if "true_migraine" in d:
        meta["y_true"] = g["true_migraine"].shift(-1)
    keep = (g.cumcount() >= 28).to_numpy()                    # need a personal baseline
    return X[keep], meta[keep]


def predict_base(daily, model_path=MODEL_PATH):
    """P(migraine tomorrow) from watch data with the saved model -> person_id,date,p_base."""
    X, meta = build_features(daily)
    booster = lgb.Booster(model_file=str(model_path))
    return meta[["person_id", "date"]].assign(p_base=booster.predict(X)).reset_index(drop=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data")
    data = Path(ap.parse_args().data)

    daily = pd.read_csv(data / "daily.csv", parse_dates=["date"])
    labels = pd.read_csv(data / "labels.csv", parse_dates=["date"])
    X, meta = build_features(daily, labels)
    labelled = meta["y"].notna().to_numpy()
    print(f"{len(X)} person-days, {labelled.mean():.0%} with a known label for the next day, "
          f"{X.shape[1]} watch-only features")

    p = np.zeros(len(X))
    for tr, te in GroupKFold(5).split(X, groups=meta["person_id"]):
        tr = tr[labelled[tr]]
        model = LGBMClassifier(**PARAMS).fit(X.iloc[tr], meta["y"].iloc[tr].astype(int))
        p[te] = model.predict_proba(X.iloc[te])[:, 1]
    meta[["person_id", "date"]].assign(p_base=p).to_csv(data / "base_oof.csv", index=False,
                                                         date_format="%Y-%m-%d")

    scored = meta["y_true"].notna().to_numpy()                # last day has no next day
    y_true, ps = meta["y_true"][scored].astype(int), p[scored]
    rate = y_true.mean()
    print(f"Person-grouped 5-fold CV, scored on true attacks every day (rate {rate:.3f})")
    print(f"  ROC AUC  {roc_auc_score(y_true, ps):.3f}   (random = 0.500)")
    print(f"  PR AUC   {average_precision_score(y_true, ps):.3f}   (random = {rate:.3f})")
    print(f"  Brier    {brier_score_loss(y_true, ps):.4f}  "
          f"(constant base rate = {brier_score_loss(y_true, np.full(len(ps), rate)):.4f})")
    risk = meta[scored].merge(daily[["person_id", "date", "true_risk"]].assign(
        date=lambda x: x["date"] - pd.Timedelta(days=1)), on=["person_id", "date"])["true_risk"]
    print(f"  Simulator's true risk, for reference: ROC AUC {roc_auc_score(y_true, risk):.3f}")

    model = LGBMClassifier(**PARAMS).fit(X[labelled], meta["y"][labelled].astype(int))
    model.booster_.save_model(data / "model_base.txt")
    gain = model.booster_.feature_importance("gain")
    print("Top features (gain share):")
    for name, v in (pd.Series(gain, X.columns).nlargest(8) / gain.sum()).items():
        print(f"  {name:<24} {v:.3f}")
    print(f"Saved model to {data / 'model_base.txt'} and OOF predictions to {data / 'base_oof.csv'}")


if __name__ == "__main__":
    main()
