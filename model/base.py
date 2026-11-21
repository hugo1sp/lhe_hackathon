"""Shared base model: migraine forecast 1, 2 and 3 days ahead from smartwatch data.

Layer 1 of the two-layer design. One LightGBM per horizon, shared by all
users. Rule: only inputs every user has without answering anything, i.e.
watch-derived features (wearable signals, their deviation from the person's
own 28-day baseline, yesterday's deviation, 3-day means, sleep regularity,
non-wear) plus the day of week of the target day (known in advance). No cycle
day, sex, age or migraine history: those belong to the per-user personal
layer (model/personal.py), which builds on p_base.

The target is the user's own record for day t+h, read like a diary: a logged
or answered migraine is 1, every other day 0. Training only on answered days
would bias the forecast upwards: most positive labels come from "Log migraine
now" taps, which happen only on attack days, so answered days are ~44 %
migraine against ~20 % in truth. That selection depends on the outcome itself,
so it cannot be weighted away; unanswered days are ~97 % attack-free, so
counting them as 0 keeps the forecast close to the true rate (slightly below,
by the share of attacks never logged).

Evaluation uses 5-fold CV grouped by person and scores against ground-truth
attacks (`true_migraine`) on every day (model/metrics.py). `true_migraine` is
never used for training. Reference rows: each person's own attack frequency
from their records up to day t, and the simulator's true risk.

Outputs:
  data/model_base_d{1,2,3}.txt  LightGBM per horizon, trained on all person-days
  data/base_oof.csv             person_id,date,p_base,p_base_d2,p_base_d3: out-of-fold
                                P(migraine on date+1 / +2 / +3) for every person-day
                                kept by build_features (p_base is next day)

Usage:
  python model/base.py --data data
"""

import argparse
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.model_selection import GroupKFold

from metrics import report

WEARABLE_COLS = ["sleep_hours", "sleep_efficiency", "sleep_midpoint_h",
                 "resting_hr", "hrv_rmssd", "steps", "stress_score"]
PARAMS = dict(n_estimators=300, learning_rate=0.02, num_leaves=7, min_child_samples=300,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.6, verbose=-1)
HORIZONS = [1, 2, 3]
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def p_col(h):
    return "p_base" if h == 1 else f"p_base_d{h}"


def build_features(daily, labels=None):
    """One row per person-day with 28 days of baseline; watch features known at the end of day t.

    meta has person_id, date and, when available, y{h} (recorded migraine on t+h,
    unrecorded = 0), y_true{h} (true attack on t+h) for each horizon h, and
    hist_rate (share of days up to t with a recorded migraine).
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
        recorded = (d["label"] == 1).astype(float)
        meta["hist_rate"] = recorded.groupby(d["person_id"]).cumsum() / (g.cumcount() + 1)
    for h in HORIZONS:
        if labels is not None:
            meta[f"y{h}"] = recorded.groupby(d["person_id"]).shift(-h)
        if "true_migraine" in d:
            meta[f"y_true{h}"] = g["true_migraine"].shift(-h)
    keep = (g.cumcount() >= 28).to_numpy()                    # need a personal baseline
    return X[keep], meta[keep]


def with_dow(X, meta, h):
    """Add the target day's weekday (Mon=0), known in advance for every horizon."""
    return X.assign(dow_ahead=(meta["date"] + pd.Timedelta(days=h)).dt.day_of_week.to_numpy())


def predict_base(daily, data=DATA_DIR):
    """Forecast from watch data with the saved models -> person_id,date,p_base,p_base_d2,p_base_d3."""
    X, meta = build_features(daily)
    out = meta[["person_id", "date"]].reset_index(drop=True)
    for h in HORIZONS:
        out[p_col(h)] = lgb.Booster(model_file=str(Path(data) / f"model_base_d{h}.txt")).predict(with_dow(X, meta, h))
    return out


def train_horizon(X, meta, daily, h, data):
    X = with_dow(X, meta, h)
    y = meta[f"y{h}"]
    train = y.notna().to_numpy()                              # last h days have no target day
    print(f"\n=== {h} day(s) ahead: {X.shape[1]} features (watch + target weekday), "
          f"recorded migraine rate {y.mean():.3f} ===")

    p = np.zeros(len(X))
    for tr, te in GroupKFold(5).split(X, groups=meta["person_id"]):
        tr = tr[train[tr]]
        model = LGBMClassifier(**PARAMS).fit(X.iloc[tr], y.iloc[tr].astype(int))
        p[te] = model.predict_proba(X.iloc[te])[:, 1]

    scored = meta[f"y_true{h}"].notna().to_numpy()
    m = meta[scored]
    risk = m.merge(daily[["person_id", "date", "true_risk"]].assign(
        date=lambda x: x["date"] - pd.Timedelta(days=h)), on=["person_id", "date"], how="left")["true_risk"]
    report(m[f"y_true{h}"], {"base (watch)": p[scored], "own attack history": m["hist_rate"],
                             "simulator true risk": risk}, m["person_id"])

    model = LGBMClassifier(**PARAMS).fit(X[train], y[train].astype(int))
    path = data / f"model_base_d{h}.txt"
    model.booster_.save_model(path)
    gain = pd.Series(model.booster_.feature_importance("gain"), X.columns)
    top = ", ".join(f"{k} {v:.2f}" for k, v in (gain / gain.sum()).nlargest(4).items())
    print(f"  Top features (gain share): {top}. Saved {path}")
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data")
    data = Path(ap.parse_args().data)

    daily = pd.read_csv(data / "daily.csv", parse_dates=["date"])
    labels = pd.read_csv(data / "labels.csv", parse_dates=["date"])
    X, meta = build_features(daily, labels)

    print("Person-grouped 5-fold CV, scored on true attacks on every day")
    oof = meta[["person_id", "date"]].copy()
    for h in HORIZONS:
        oof[p_col(h)] = train_horizon(X, meta, daily, h, data)
    oof.to_csv(data / "base_oof.csv", index=False, date_format="%Y-%m-%d")
    print(f"\nSaved out-of-fold predictions to {data / 'base_oof.csv'}")


if __name__ == "__main__":
    main()
