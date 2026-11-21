"""Benchmark: does our question policy collect better data than random questions or a diary?

At the same budget of answered questions per week, the same simulated users answer
truthfully from the simulator's ground truth, and we score the base + personal layer
(model/personal.py) trained on what each strategy collected:

  policy  our one-tap question policy (collection/questions.py), driven by the base
          forecast p_base (what the app knows), not by the simulator's true risk.
          Below its natural rate, lower-priority question types are dropped first
          (attack_check > prodrome > anomaly > no_data > checkin, using population-
          average rates, so the choice is online); above it, extra days get a check-in.
  random  "Any migraine today?" on random days.
  diary   a full daily diary: every day, migraine + intensity + warning signs + stress +
          illness. 7 entries a week - the upper bound, at much higher burden.

In every strategy users also tap "Log migraine now" during attacks (daily.csv
`migraine`); those taps are not counted in the budget. Every question is answered
(no ignoring), so strategies differ only in which days are asked and what is asked.
Questions go to days without a log tap, so at most ~5.9 a week; budget 7 means every
such day (the diary row: an entry on every day without a tap).

Scoring as in personal.py: true attacks on every day, population layer from other
users (5-fold by person), personal layer walk-forward per user. 95 % CIs from a
bootstrap over persons; gains vs base are paired.

Usage:
  python model/benchmark_collection.py --data data [--budgets 1 2 3.6 7] [--boot 1000]
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "collection"))
from metrics import N_BOOT, warned_share, within_person_auc  # noqa: E402
from personal import build, evaluate  # noqa: E402
from questions import FIELDS, LOG_NOW, QUESTIONS, pick_questions  # noqa: E402
from simulate_answers import answer  # noqa: E402

PRIORITY = ["attack_check", "prodrome", "anomaly", "no_data", "checkin"]
COLS = ["person_id", "date", "question", "answer"] + FIELDS


def add_truth(d, rng):
    """What a simulated user can report (same rules as collection/simulate_answers.py)."""
    felt = np.where(d["true_prodrome"] > 0, rng.random(len(d)) < 0.7, rng.random(len(d)) < 0.08)
    d["prodrome"] = np.where(felt, rng.choice([1, 2], len(d)), 0)
    d["intensity"] = np.where(d["migraine_intensity"] > 0, d["migraine_intensity"], rng.choice([2, 3, 4], len(d)))
    return d


def ask(r, qid):
    label = answer(qid, r, None)
    return {"person_id": r.person_id, "date": r.date, "question": qid, "answer": label,
            **dict(QUESTIONS[qid][1])[label]}


def diary_entry(r):
    attack = r.true_migraine == 1
    return {"person_id": r.person_id, "date": r.date, "question": "diary", "answer": "",
            "migraine": int(attack), "intensity": r.intensity if attack else np.nan,
            "prodrome": r.prodrome, "stress": int(r.stress_score > 70), "illness": r.true_illness, "alcohol": 0}


def policy_keep_rates(qids, budget):
    """Per-type probability of asking, filling the weekly budget in priority order."""
    per_week = 7 * pd.Series(qids).value_counts(normalize=False) / len(qids)
    rates, left = {}, budget
    for q in PRIORITY:
        n = per_week.get(q, 0.0)
        rates[q] = min(1.0, left / n) if n > 0 else 0.0
        left = max(0.0, left - n)
    return rates, left  # left > 0: budget for extra check-ins on unasked days


def collect(people, strategy, budget, rng):
    """labels.csv-style rows a strategy collects at a budget (answered questions per week)."""
    # Questions go to days without a log tap; spread the weekly budget over those days
    free = [q for d in people.values() for q, logged in zip(d["_q"], d["migraine"]) if not logged]
    n_days = sum(len(d) for d in people.values())
    budget = budget * n_days / len(free)  # per week of tap-free days
    rows = []
    if strategy == "policy":
        qids = [q["id"] if q else None for q in free]
        rates, extra = policy_keep_rates(qids, budget)
        n_free = sum(q is None for q in qids) / len(qids) * 7
        p_extra = min(1.0, extra / n_free) if n_free else 0.0
    for d in people.values():
        for r, q in zip(d.itertuples(), d["_q"]):
            if r.migraine:
                rows.append({"person_id": r.person_id, "date": r.date, "question": "log_now", "answer": "",
                             **LOG_NOW, "intensity": r.migraine_intensity})
            elif strategy == "diary":
                rows.append(diary_entry(r))
            elif strategy == "random" and rng.random() < budget / 7:
                rows.append(ask(r, "checkin"))
            elif strategy == "policy":
                if q and rng.random() < rates[q["id"]]:
                    rows.append(ask(r, q["id"]))
                elif not q and rng.random() < p_extra:
                    rows.append(ask(r, "checkin"))
    return pd.DataFrame(rows, columns=COLS)


def bootstrap(meta, y, p, p_base, n_boot, rng):
    """Point estimate and 95 % CI over persons for AUC, Brier and paired AUC gain vs base."""
    idx = meta.groupby("person_id").indices
    persons = list(idx)
    def stats(rows):
        a = roc_auc_score(y[rows], p[rows])
        return a, brier_score_loss(y[rows], p[rows]), a - roc_auc_score(y[rows], p_base[rows])
    point = stats(np.arange(len(y)))
    boots = np.array([stats(np.concatenate([idx[persons[i]] for i in rng.integers(0, len(persons), len(persons))]))
                      for _ in range(n_boot)])
    lo, hi = np.percentile(boots, [2.5, 97.5], axis=0)
    return point, lo, hi


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data")
    ap.add_argument("--budgets", type=float, nargs="+", default=[1, 2, 3.6, 7])
    ap.add_argument("--boot", type=int, default=N_BOOT)
    ap.add_argument("--lam", type=float, default=30.0)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    data = Path(args.data)
    rng = np.random.default_rng(args.seed)

    daily = pd.read_csv(data / "daily.csv", parse_dates=["date"])
    base = pd.read_csv(data / "base_oof.csv", parse_dates=["date"])[["person_id", "date", "p_base"]]
    risk = daily.merge(base, on=["person_id", "date"], how="left")["p_base"]
    people = {}
    for pid, d in daily.assign(_risk=risk).groupby("person_id"):
        d = add_truth(d.reset_index(drop=True), rng)
        d["_q"] = pick_questions(d, d["_risk"].to_numpy())  # policy sees the forecast, not true risk
        people[pid] = d
    n_person_days = len(daily)

    runs = [("log taps only", "random", 0.0)]
    runs += [(s, s, b) for b in args.budgets for s in ["policy", "random"]]
    runs += [("diary", "diary", 7.0)]

    print("Same users, same truth; base + personal layer trained on what each strategy collected.")
    print("Scored on true attacks on every day; 95 % CI from bootstrap over persons; AUC/pers = mean")
    print("within-person ROC AUC; warned = share of attacks warned at <= 1 false alarm per person-week.\n")
    print(f"  {'strategy':<14} {'budget':>6} {'asked/wk':>8}  {'ROC AUC':<20} {'Brier':<23} "
          f"{'AUC gain vs base':<23} {'AUC/pers':>8} {'warned':>6}")
    base_row = None
    for name, strategy, budget in runs:
        labels = collect(people, strategy, budget, rng)
        asked = 7 * (labels["question"] != "log_now").sum() / n_person_days
        X, meta = build(daily, labels, base)
        _, p, _ = evaluate(X, meta, args.lam)
        y, p_base = meta["y_true"].astype(int).to_numpy(), meta["p_base"].to_numpy()
        (auc, brier, gain), lo, hi = bootstrap(meta, y, p, p_base, args.boot, np.random.default_rng(args.seed))
        if base_row is None:
            (b_auc, b_brier, _), b_lo, b_hi = bootstrap(meta, y, p_base, p_base, args.boot,
                                                        np.random.default_rng(args.seed))
            print(f"  {'base (watch)':<14} {'-':>6} {'0.0':>8}  {b_auc:.3f} [{b_lo[0]:.3f}, {b_hi[0]:.3f}]  "
                  f"{b_brier:.4f} [{b_lo[1]:.4f}, {b_hi[1]:.4f}]  {'':<23} "
                  f"{within_person_auc(y, p_base, meta['person_id']):>8.3f} {warned_share(y, p_base)[0]:>6.0%}")
            base_row = True
        print(f"  {name:<14} {budget:>6.1f} {asked:>8.1f}  {auc:.3f} [{lo[0]:.3f}, {hi[0]:.3f}]  "
              f"{brier:.4f} [{lo[1]:.4f}, {hi[1]:.4f}]  {gain:+.3f} [{lo[2]:+.3f}, {hi[2]:+.3f}]  "
              f"{within_person_auc(y, p, meta['person_id']):>8.3f} {warned_share(y, p)[0]:>6.0%}")


if __name__ == "__main__":
    main()
