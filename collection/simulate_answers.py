"""Simulate how users answer the one-tap questions, producing model-ready labels.

Runs the question policy over every simulated person-day, lets a simulated user
answer from the ground truth (or ignore the question), and encodes each answer
with the field mapping in questions.py. Self-reported attacks (the "Log migraine
now" button) are included too.

Output data/labels.csv has one row per person-day with any input, columns
person_id, date, question, answer + questions.FIELDS. Join it with daily.csv
on (person_id, date); days without a row, and empty fields, are unknown.

Usage:
  python collection/simulate_answers.py --data data --seed 0
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from questions import FIELDS, LOG_NOW, QUESTIONS, pick_questions

ANSWER_RATE = 0.85  # share of questions a user answers rather than ignores


def intensity_label(i):
    return "Mild" if i <= 2 else "Moderate" if i == 3 else "Severe"


def answer(qid, row, rng):
    """The option label a truthful user picks, given the day's ground truth."""
    attack = row.true_migraine == 1
    if qid == "attack_check":
        return intensity_label(row.intensity) if attack else "No"
    if qid == "prodrome":
        return ["No", "A little", "Clearly"][int(row.prodrome)]
    if qid == "anomaly":
        if row.true_illness:
            return "Sick"
        if attack:
            return "Headache"
        return "Stress" if row.stress_score > 70 else "Nothing"
    return "Yes" if attack else "No"  # no_data, checkin


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)

    daily = pd.read_csv(Path(args.data) / "daily.csv")
    rows = []
    for pid, d in daily.groupby("person_id"):
        d = d.reset_index(drop=True)
        # Truth the simulated user answers from: prodrome = attack in the next 1-2 days
        nxt = d["true_migraine"].shift(-1, fill_value=0) + d["true_migraine"].shift(-2, fill_value=0)
        d["prodrome"] = np.where(nxt > 0, rng.choice([1, 2], len(d)), 0)
        d["intensity"] = np.where(d["migraine_intensity"] > 0, d["migraine_intensity"],
                                  rng.choice([2, 3, 4], len(d)))
        for q, r in zip(pick_questions(d, d["true_risk"].to_numpy()), d.itertuples()):
            if r.migraine:  # user tapped "Log migraine now"
                rows.append({"person_id": pid, "date": r.date, "question": "log_now", "answer": "",
                             **LOG_NOW, "intensity": r.migraine_intensity})
            elif q and rng.random() < ANSWER_RATE:
                label = answer(q["id"], r, rng)
                fields = dict(QUESTIONS[q["id"]][1])[label]
                rows.append({"person_id": pid, "date": r.date, "question": q["id"], "answer": label, **fields})

    labels = pd.DataFrame(rows, columns=["person_id", "date", "question", "answer"] + FIELDS)
    labels.to_csv(Path(args.data) / "labels.csv", index=False)
    n = len(daily)
    print(f"Wrote {len(labels)} labelled person-days ({len(labels) / n:.0%} of days) to {args.data}/labels.csv")
    print(f"migraine label known on {labels['migraine'].notna().sum() / n:.0%} of days, "
          f"{(labels['migraine'] == 1).sum() / (daily['true_migraine'] == 1).sum():.0%} of attacks captured")


if __name__ == "__main__":
    main()
