"""Simulate how users answer the one-tap questions, producing model-ready labels.

Runs the question policy over every simulated person-day, lets a simulated user
answer from the ground truth (or ignore the question), and encodes each answer
with the field mapping in questions.py. Self-reported attacks (the "Log migraine
now" button) are included too.

Output data/labels.csv has one row per person-day with any input, columns
person_id, date, question, answer + questions.FIELDS. Join it with daily.csv
on (person_id, date); days without a row, and empty fields, are unknown.

The policy sees only what the app would know: the model's forecast p_base from
--risk (a CSV with person_id,date,p_base, e.g. data/base_oof.csv), never the
simulator's true risk. Without --risk there is no forecast yet (bootstrap pass),
so the forecast-driven "prodrome" question never fires.

Usage:
  python collection/simulate_answers.py --data data --seed 0 [--risk data/base_oof.csv]
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


def add_truth(d, rng):
    """Add the truth a simulated user answers from (one person's days, in order)."""
    # Users notice a real prodrome 70 % of the time and report false alarms on 8 % of other days
    felt = np.where(d["true_prodrome"] > 0, rng.random(len(d)) < 0.7, rng.random(len(d)) < 0.08)
    d["prodrome"] = np.where(felt, rng.choice([1, 2], len(d)), 0)
    d["intensity"] = np.where(d["migraine_intensity"] > 0, d["migraine_intensity"],
                              rng.choice([2, 3, 4], len(d)))
    return d


def respond(r, q, rng):
    """The labels.csv row a user produces on day `r` when asked `q` (None if no input)."""
    if r.migraine:  # user tapped "Log migraine now"
        return {"person_id": r.person_id, "date": r.date, "question": "log_now", "answer": "",
                **LOG_NOW, "intensity": r.migraine_intensity}
    if q and rng.random() < ANSWER_RATE:
        label = answer(q["id"], r, rng)
        return {"person_id": r.person_id, "date": r.date, "question": q["id"], "answer": label,
                **dict(QUESTIONS[q["id"]][1])[label]}
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--risk", help="CSV with person_id,date,p_base: the forecast the policy sees")
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)

    daily = pd.read_csv(Path(args.data) / "daily.csv")
    if args.risk:
        daily = daily.merge(pd.read_csv(args.risk)[["person_id", "date", "p_base"]],
                            on=["person_id", "date"], how="left")
    else:
        daily["p_base"] = np.nan
    rows = []
    for _, d in daily.groupby("person_id"):
        d = add_truth(d.reset_index(drop=True), rng)
        for q, r in zip(pick_questions(d, d["p_base"].to_numpy()), d.itertuples()):
            row = respond(r, q, rng)
            if row:
                rows.append(row)

    labels = pd.DataFrame(rows, columns=["person_id", "date", "question", "answer"] + FIELDS)
    labels.to_csv(Path(args.data) / "labels.csv", index=False)
    n = len(daily)
    print(f"Wrote {len(labels)} labelled person-days ({len(labels) / n:.0%} of days) to {args.data}/labels.csv")
    print(f"migraine label known on {labels['migraine'].notna().sum() / n:.0%} of days, "
          f"{(labels['migraine'] == 1).sum() / (daily['true_migraine'] == 1).sum():.0%} of attacks captured")


if __name__ == "__main__":
    main()
