"""Fake smartwatch for the demo user Anna (P0187).

Emits one row per day with the watch signals model/base.py reads, as a
wearable sync would deliver them. Only watch data is written: no attacks,
risk or other ground truth.

Underneath, Anna lives a plausible life: work-stress episodes, weekend
sleep shifts, a 25-day menstrual cycle (RHR up / HRV down in the late luteal
phase), the odd bad night or evening drink. Her migraines are driven by her
triggers (sleep debt, irregular sleep, stress, perimenstrual window) plus
causes no sensor sees, and show up in the watch data as:
  - prodrome on most attacks, 1-2 days before: higher resting HR, lower HRV,
    worse sleep efficiency, higher stress score, a little less activity
  - attack day: broken sleep, far fewer steps, higher HR and stress,
    and the watch is sometimes left off
  - postdrome: a longer night and a quiet day after
Non-wear days and multi-day charging gaps are NaN.

Usage:
  python simulator/simulate.py                      # batch -> data/watch.csv
  python simulator/simulate.py --stream --interval 2  # one JSON line per day
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

WEARABLE_COLS = [
    "sleep_hours", "sleep_efficiency", "sleep_midpoint_h",
    "resting_hr", "hrv_rmssd", "steps", "stress_score",
]
# Anna's baselines, matching app/anna_data.js
ANNA = {
    "person_id": "P0187", "rhr": 68.0, "hrv": 44.0, "sleep_need": 8.1, "midpoint": 3.6,
    "steps": 4400, "stress": 0.38, "cycle_length": 25, "attacks_per_month": 4.9,
    "sens": {"sleep_debt": 1.24, "sleep_irregularity": 0.59, "stress": 0.51, "menstrual": 1.21},
}


def ar1(rng, n, phi, sigma):
    x = np.zeros(n)
    eps = rng.normal(0, sigma, n)
    for t in range(1, n):
        x[t] = phi * x[t - 1] + eps[t]
    return x


def episodes(rng, n, rate, min_len, max_len):
    mask = np.zeros(n, dtype=bool)
    for s in np.flatnonzero(rng.random(n) < rate):
        mask[s:s + rng.integers(min_len, max_len + 1)] = True
    return mask


def z(x):
    return (x - x.mean()) / (x.std() + 1e-9)


def simulate(days, start, seed):
    """Anna's watch data, plus her hidden truth per day for evaluation only (never a model input)."""
    rng = np.random.default_rng(seed)
    a, n = ANNA, days
    dates = pd.date_range(start, periods=n, freq="D")
    dow = dates.day_of_week.to_numpy()
    weekend_night = (dow == 5) | (dow == 6)        # nights ending Sat/Sun morning
    lag1 = lambda x: np.concatenate([[x[0]], x[:-1]])

    # Behaviour and context
    stress = np.clip(a["stress"] + ar1(rng, n, 0.8, 0.07) + 0.3 * episodes(rng, n, 1 / 35, 3, 9), 0, 1)
    drink = rng.random(n) < np.where(weekend_night, 0.25, 0.04)
    bad_night = rng.random(n) < 0.05
    sleep = a["sleep_need"] - 1.3 * (stress - a["stress"]) + 0.7 * weekend_night + ar1(rng, n, 0.3, 0.55)
    midpoint = a["midpoint"] + 1.1 * weekend_night + 0.5 * drink + ar1(rng, n, 0.5, 0.45)
    cycle_day = (np.arange(n) + rng.integers(0, a["cycle_length"])) % a["cycle_length"]  # 0 = menses onset
    perimenstrual = (cycle_day <= 2) | (cycle_day >= a["cycle_length"] - 2)
    late_luteal = cycle_day >= a["cycle_length"] - 6

    # Hidden migraine risk from Anna's triggers, sleep effects lagged a day
    debt = pd.Series(a["sleep_need"] - sleep).rolling(3, min_periods=1).mean().to_numpy()
    irreg = np.abs(midpoint - pd.Series(midpoint).rolling(7, min_periods=1).mean().to_numpy())
    s = a["sens"]
    score = (s["sleep_debt"] * z(lag1(debt)) + s["sleep_irregularity"] * z(lag1(irreg))
             + s["stress"] * z(stress) + 2 * s["menstrual"] * perimenstrual
             + ar1(rng, n, 0.5, 0.9))                 # weather, hormones, ... no sensor sees
    lo, hi = -15.0, 5.0                               # intercept so mean risk hits the target rate
    for _ in range(50):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if (1 / (1 + np.exp(-(mid + score)))).mean() < a["attacks_per_month"] / 30 else (lo, mid)
    risk = 1 / (1 + np.exp(-(lo + score)))
    attack = np.zeros(n, dtype=bool)
    refractory = 0
    for t in range(n):
        attack[t] = rng.random() < risk[t] * (0.3 if refractory else 1.0)
        refractory = 3 if attack[t] else max(0, refractory - 1)

    # Prodrome (most attacks, 1-2 days before) and postdrome (day after)
    prodrome = np.zeros(n)
    for t in np.flatnonzero(attack):
        if rng.random() < 0.75:
            prodrome[max(0, t - rng.integers(1, 3)):t] = rng.lognormal(np.log(0.8), 0.3)
    postdrome = lag1(attack) & ~attack
    att = attack.astype(float)

    # Watch signals
    sleep = np.clip(sleep - 1.8 * bad_night - 0.4 * prodrome - 0.7 * att + 0.8 * postdrome, 3.5, 11.5)
    debt_now = np.clip(a["sleep_need"] - sleep, 0, None)
    rhr = (a["rhr"] + 6 * (stress - a["stress"]) + 0.8 * debt_now + 1.5 * late_luteal + 3 * drink
           + 3.0 * prodrome + 2.0 * att + ar1(rng, n, 0.5, 1.6))
    hrv = a["hrv"] * np.exp(-0.5 * (stress - a["stress"]) - 0.04 * debt_now - 0.08 * late_luteal
                            - 0.2 * drink - 0.15 * prodrome - 0.12 * att + ar1(rng, n, 0.5, 0.12))
    efficiency = np.clip(0.88 - 0.08 * (stress - a["stress"]) - 0.12 * bad_night - 0.04 * drink
                         - 0.05 * prodrome - 0.08 * att + rng.normal(0, 0.03, n), 0.55, 0.98)
    steps = (a["steps"] * np.exp(ar1(rng, n, 0.4, 0.3)) * np.where(dow >= 5, rng.uniform(0.7, 1.5, n), 1.0)
             * (1 - 0.1 * prodrome) * np.where(attack, rng.uniform(0.25, 0.7, n), 1.0) * (1 - 0.2 * postdrome))
    stress_score = np.clip(100 * stress + 12 * prodrome + 15 * att + rng.normal(0, 8, n), 0, 100)

    df = pd.DataFrame({
        "person_id": a["person_id"], "date": dates.strftime("%Y-%m-%d"), "day_of_week": dow,
        "sleep_hours": sleep.round(2), "sleep_efficiency": efficiency.round(3),
        "sleep_midpoint_h": midpoint.round(2), "resting_hr": rhr.round(1), "hrv_rmssd": hrv.round(1),
        "steps": steps.round(), "stress_score": stress_score.round(),
    })
    nonwear = (rng.random(n) < 0.03) | episodes(rng, n, 1 / 60, 1, 3) | (attack & (rng.random(n) < 0.15))
    df.loc[nonwear, WEARABLE_COLS] = np.nan
    truth = pd.DataFrame({"date": df["date"], "true_migraine": attack.astype(int), "true_risk": risk.round(4),
                          "true_prodrome": prodrome.round(3), "true_alcohol": drink.astype(int),
                          "true_stress": stress.round(3)})
    return df, truth


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=180)
    ap.add_argument("--start", default="2026-01-01")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="data/watch.csv")
    ap.add_argument("--stream", action="store_true", help="print one JSON line per day instead of writing a file")
    ap.add_argument("--interval", type=float, default=0.0, help="seconds between days in stream mode")
    args = ap.parse_args()

    df, _ = simulate(args.days, args.start, args.seed)
    if args.stream:
        for row in df.astype(object).where(df.notna(), None).to_dict("records"):
            print(json.dumps(row), flush=True)
            time.sleep(args.interval)
        return
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Wrote {len(df)} days for {ANNA['person_id']} to {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
