"""Shared evaluation report for migraine forecasts (base model and personal layer).

report(y, preds, person) prints one compact table, one row per forecast:
  ROC AUC and Brier with 95 % bootstrap CI over persons, PR AUC, Brier skill
  score vs a constant base-rate forecast, mean within-person ROC AUC, and the
  share of attacks warned when the alarm threshold allows at most one false
  alarm per person-week. Then a decile calibration table for the first forecast.

`y` is the ground truth (true attacks), used here for scoring only.
"""

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

N_BOOT = 200


def within_person_auc(y, p, person):
    df = pd.DataFrame({"y": y, "p": p, "g": person})
    aucs = [roc_auc_score(d["y"], d["p"]) for _, d in df.groupby("g") if d["y"].nunique() == 2]
    return np.mean(aucs)


def warned_share(y, p, false_alarms_per_week=1.0):
    """Share of attack days with p above the threshold that allows the false-alarm budget."""
    budget = int(len(y) / 7 * false_alarms_per_week)          # rows are person-days
    neg = np.sort(p[y == 0])[::-1]
    thr = neg[budget] if budget < len(neg) else -np.inf
    return (p[y == 1] > thr).mean(), thr


def bootstrap_ci(y, p, person, rng):
    rows = pd.Series(np.arange(len(y))).groupby(person).apply(np.asarray).to_list()
    auc, brier = [], []
    for _ in range(N_BOOT):
        idx = np.concatenate([rows[i] for i in rng.integers(0, len(rows), len(rows))])
        auc.append(roc_auc_score(y[idx], p[idx]))
        brier.append(brier_score_loss(y[idx], p[idx]))
    return np.percentile(auc, [2.5, 97.5]), np.percentile(brier, [2.5, 97.5])


def calibration_table(y, p, bins=10):
    q = pd.qcut(p, bins, labels=False, duplicates="drop")
    t = pd.DataFrame({"pred": p, "obs": y}).groupby(q).mean()
    return t


def report(y, preds, person, seed=0):
    """Print the comparison of forecasts `preds` ({name: probabilities}) against true attacks `y`."""
    y = np.asarray(y).astype(int)
    person = np.asarray(person)
    rate = y.mean()
    brier_const = brier_score_loss(y, np.full(len(y), rate))
    rng = np.random.default_rng(seed)
    print(f"{len(y)} person-days, {len(np.unique(person))} persons, true attack rate {rate:.3f}, "
          f"constant-forecast Brier {brier_const:.4f}")
    print(f"  {'forecast':<22} {'ROC AUC [95% CI]':<20} {'PR AUC':>6}  {'Brier [95% CI]':<23} {'skill':>6}"
          f"  {'AUC/pers':>8}  {'warned @1 FA/wk':>15}  {'mean p':>6}")
    for name, p in preds.items():
        p = np.asarray(p, dtype=float)
        (a_lo, a_hi), (b_lo, b_hi) = bootstrap_ci(y, p, person, rng)
        brier = brier_score_loss(y, p)
        warned, thr = warned_share(y, p)
        print(f"  {name:<22} {roc_auc_score(y, p):.3f} [{a_lo:.3f},{a_hi:.3f}]  "
              f"{average_precision_score(y, p):>6.3f}  {brier:.4f} [{b_lo:.4f},{b_hi:.4f}]  "
              f"{1 - brier / brier_const:>+6.3f}  {within_person_auc(y, p, person):>8.3f}  "
              f"{warned:>7.0%} (p>{thr:.2f})  {p.mean():>6.3f}")
    name, p = next(iter(preds.items()))
    t = calibration_table(y, np.asarray(p, dtype=float))
    print(f"  Calibration of '{name}' by decile of p:")
    print("    predicted " + " ".join(f"{v:5.2f}" for v in t["pred"]))
    print("    observed  " + " ".join(f"{v:5.2f}" for v in t["obs"]))
