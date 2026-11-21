"""Synthetic wearable + migraine data simulator.

Generates one row per person per day with smartwatch-style signals and
migraine attacks driven by person-specific triggers.

Generation order per person:
  1. Behaviour/context: stress, sleep, activity, menstrual cycle, illness.
  2. Latent migraine risk from that person's triggers (lagged 0-1 days).
  3. Attacks sampled from the risk, with a refractory period after each.
  4. Physiology (resting HR, HRV, sleep efficiency), incl. a 1-2 day
     prodrome before some attacks - the signal a model should learn to
     detect. Its frequency and strength vary per person, and part of the
     risk comes from unobserved causes, so attacks are only partly predictable.
  5. Data-quality issues: non-wear days and unreported attacks.

Parameters are calibrated against two reference datasets (see datasets/stats.py):
mBrain21 (attack frequency, intensity, diary compliance) and the hebaqueen
daily migraine dataset (sleep duration).

Columns prefixed `true_` are ground truth for evaluation only and must not
be used as model features.

Usage:
  python simulator/simulate.py --n-persons 200 --days 270 --seed 42 --out data
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

TRIGGERS = ["sleep_debt", "sleep_irregularity", "stress", "menstrual"]
# mBrain21 headache intensity counts for 1..5: 1, 30, 66, 27, 2
INTENSITY_P = np.array([1, 30, 66, 27, 2]) / 126
WEARABLE_COLS = [
    "sleep_hours", "sleep_efficiency", "sleep_midpoint_h",
    "resting_hr", "hrv_rmssd", "steps", "stress_score",
]


def ar1(rng, n, phi, sigma):
    """Mean-zero AR(1) series."""
    x = np.zeros(n)
    eps = rng.normal(0, sigma, n)
    for t in range(1, n):
        x[t] = phi * x[t - 1] + eps[t]
    return x


def episodes(rng, n, rate_per_day, min_len, max_len):
    """Binary mask of random episodes (stress periods, illness)."""
    mask = np.zeros(n, dtype=bool)
    for start in np.flatnonzero(rng.random(n) < rate_per_day):
        mask[start:start + rng.integers(min_len, max_len + 1)] = True
    return mask


def zscore(x):
    return (x - x.mean()) / (x.std() + 1e-9)


def make_person(rng, pid):
    female = rng.random() < 0.75  # migraine is ~3x more common in women
    menstruating = female and rng.random() < 0.7
    sens = {t: (rng.uniform(0.5, 1.5) if rng.random() < 0.5 else 0.0) for t in TRIGGERS}
    if not menstruating:
        sens["menstrual"] = 0.0
    if not any(sens.values()):
        sens[rng.choice(TRIGGERS[:3])] = rng.uniform(0.5, 1.5)
    return {
        "person_id": pid,
        "sex": "F" if female else "M",
        "age": int(rng.integers(18, 60)),
        "menstruating": menstruating,
        "cycle_length": int(np.clip(rng.normal(28, 2), 24, 35)),
        "base_rhr": rng.normal(62, 6),
        "base_hrv": rng.lognormal(np.log(45), 0.3),
        "sleep_need": rng.normal(7.7, 0.5),  # heba: mean sleep 7.71 h
        "base_midpoint": rng.normal(3.5, 0.8),  # hours after midnight
        "base_steps": max(2000, rng.normal(8000, 2500)),
        # mBrain21: 4.3-12.2 headache days/month across its 4 participants
        "attacks_per_month": float(np.clip(rng.lognormal(np.log(10), 0.5), 3, 25)),  # target before refractory damping
        "nonwear_prob": rng.uniform(0.02, 0.15),
        "underreport_prob": rng.uniform(0.0, 0.4),  # mBrain21: diary filled on 59-100% of days
        # Not every attack has a physiological prodrome, and how clearly it shows varies by person
        "prodrome_prob": rng.beta(2, 2),
        "prodrome_strength": rng.lognormal(np.log(0.5), 0.5),
        **{f"sens_{t}": v for t, v in sens.items()},
    }


def solve_intercept(score, target_rate):
    """Bisection for intercept b so mean(sigmoid(b + score)) == target_rate."""
    lo, hi = -15.0, 5.0
    for _ in range(50):
        mid = (lo + hi) / 2
        if (1 / (1 + np.exp(-(mid + score)))).mean() < target_rate:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def simulate_person(rng, p, start, n):
    dates = pd.date_range(start, periods=n, freq="D")
    dow = dates.day_of_week.to_numpy()
    weekend = dow >= 5

    # 1. Behaviour / context
    stress = np.clip(0.3 + ar1(rng, n, 0.8, 0.08)
                     + 0.35 * episodes(rng, n, 1 / 40, 3, 10), 0, 1)
    illness = episodes(rng, n, 1 / 90, 2, 6)
    bad_night = rng.random(n) < 0.05

    sleep = (p["sleep_need"] - 1.2 * (stress - 0.3) + 0.6 * weekend
             + ar1(rng, n, 0.3, 0.6) - 2.0 * bad_night)
    sleep = np.clip(sleep, 3, 11)
    midpoint = p["base_midpoint"] + 1.0 * weekend + ar1(rng, n, 0.5, 0.5)
    steps = (p["base_steps"] * np.exp(ar1(rng, n, 0.4, 0.3))
             * np.where(weekend, rng.uniform(0.7, 1.3), 1.0)
             * np.where(illness, 0.4, 1.0))

    if p["menstruating"]:
        offset = rng.integers(0, p["cycle_length"])
        cycle_day = (np.arange(n) + offset) % p["cycle_length"]  # 0 = menses onset
        # Perimenstrual window: 2 days before to 3 days after onset
        menstrual = ((cycle_day <= 3) | (cycle_day >= p["cycle_length"] - 2)).astype(float)
        cycle_day = cycle_day + 1.0
    else:
        cycle_day = np.full(n, np.nan)
        menstrual = np.zeros(n)

    # 2. Latent risk from triggers (sleep effects lagged one day)
    sleep_debt = pd.Series(p["sleep_need"] - sleep).rolling(3, min_periods=1).mean().to_numpy()
    irregularity = np.abs(midpoint - pd.Series(midpoint).rolling(7, min_periods=1).mean().to_numpy())
    lag1 = lambda x: np.concatenate([[x[0]], x[:-1]])
    drivers = {
        "sleep_debt": zscore(lag1(sleep_debt)),
        "sleep_irregularity": zscore(lag1(irregularity)),
        "stress": zscore(stress),
        "menstrual": 2.0 * menstrual,
    }
    score = sum(p[f"sens_{t}"] * drivers[t] for t in TRIGGERS)
    score = score + ar1(rng, n, 0.5, 0.9)  # unobserved causes (weather, hormones, ...) no sensor sees
    intercept = solve_intercept(score, p["attacks_per_month"] / 30)
    risk = 1 / (1 + np.exp(-(intercept + score)))

    # 3. Sample attacks with a refractory period
    attack = np.zeros(n, dtype=bool)
    refractory = 0
    for t in range(n):
        r = risk[t] * (0.3 if refractory > 0 else 1.0)
        attack[t] = rng.random() < r
        refractory = 3 if attack[t] else max(0, refractory - 1)

    # 4. Physiology incl. prodrome (1-2 days before) and attack-day effects
    prodrome = np.zeros(n)
    for t in np.flatnonzero(attack):
        if rng.random() < p["prodrome_prob"]:
            prodrome[max(0, t - rng.integers(1, 3)):t] = p["prodrome_strength"]
    attack_f = attack.astype(float)

    rhr = (p["base_rhr"] + 6 * (stress - 0.3) + 0.8 * np.clip(p["sleep_need"] - sleep, 0, None)
           + 5 * illness + 2.0 * prodrome + 1.5 * attack_f + ar1(rng, n, 0.5, 2.0))
    hrv = (p["base_hrv"] * np.exp(-0.5 * (stress - 0.3) - 0.04 * np.clip(p["sleep_need"] - sleep, 0, None)
                                  - 0.2 * illness - 0.12 * prodrome - 0.08 * attack_f
                                  + ar1(rng, n, 0.5, 0.15)))
    efficiency = np.clip(0.9 - 0.08 * stress - 0.05 * prodrome - 0.1 * bad_night
                         + rng.normal(0, 0.05, n), 0.5, 0.99)
    steps = steps * np.where(attack, rng.uniform(0.4, 1.0, n), 1.0)  # some attacks barely slow you down
    stress_score = np.clip(100 * stress + rng.normal(0, 8, n), 0, 100)

    df = pd.DataFrame({
        "person_id": p["person_id"],
        "date": dates,
        "day_of_week": dow,
        "sleep_hours": sleep.round(2),
        "sleep_efficiency": efficiency.round(3),
        "sleep_midpoint_h": midpoint.round(2),
        "resting_hr": rhr.round(1),
        "hrv_rmssd": hrv.round(1),
        "steps": steps.round().astype(int),
        "stress_score": stress_score.round(),
        "cycle_day": cycle_day,
        "true_migraine": attack.astype(int),
        "true_risk": risk.round(4),
        "true_illness": illness.astype(int),
        "true_prodrome": prodrome.round(3),
    })

    # 5. Data quality: non-wear days (occasionally multi-day gaps), unreported attacks
    nonwear = (rng.random(n) < p["nonwear_prob"]) | episodes(rng, n, 1 / 120, 2, 7)
    df[WEARABLE_COLS] = df[WEARABLE_COLS].astype(float)
    df.loc[nonwear, WEARABLE_COLS] = np.nan
    reported = attack & (rng.random(n) >= p["underreport_prob"])
    df.insert(df.columns.get_loc("true_migraine"), "migraine", reported.astype(int))
    # Self-reported intensity 1-5 (0 = no report), pooled mBrain21 distribution
    intensity = rng.choice([1, 2, 3, 4, 5], size=n, p=INTENSITY_P)
    df.insert(df.columns.get_loc("true_migraine"), "migraine_intensity", np.where(reported, intensity, 0))
    return df


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n-persons", type=int, default=200)
    ap.add_argument("--days", type=int, default=270)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--start", default="2026-01-01")
    ap.add_argument("--out", default="data")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    persons = [make_person(rng, f"P{i:04d}") for i in range(args.n_persons)]
    daily = pd.concat([simulate_person(rng, p, args.start, args.days) for p in persons],
                      ignore_index=True)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(persons).to_csv(out / "persons.csv", index=False)
    daily.to_csv(out / "daily.csv", index=False)
    print(f"Wrote {len(persons)} persons, {len(daily)} rows to {out}/")


if __name__ == "__main__":
    main()
