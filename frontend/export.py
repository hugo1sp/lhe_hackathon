"""Export a small slice of the simulated data as JSON for the static frontend.

Writes docs/data.json, which docs/index.html loads. The risk shown, and the
risk the question policy sees, is the base model's out-of-fold next-day
forecast (base_oof.csv from model/base.py); NaN for the first 28 days.

Usage:
  python frontend/export.py --data data --out docs/data.json
"""

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "collection"))
from questions import pick_questions, render  # noqa: E402

SIGNALS = ["sleep_hours", "resting_hr", "hrv_rmssd", "steps", "stress_score"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="docs/data.json")
    ap.add_argument("--n-persons", type=int, default=8)
    ap.add_argument("--days", type=int, default=60)
    args = ap.parse_args()

    persons = pd.read_csv(Path(args.data) / "persons.csv").head(args.n_persons)
    daily = pd.read_csv(Path(args.data) / "daily.csv").merge(
        pd.read_csv(Path(args.data) / "base_oof.csv")[["person_id", "date", "p_base"]],
        on=["person_id", "date"], how="left")

    out = []
    for p in persons.itertuples():
        d = daily[daily.person_id == p.person_id].reset_index(drop=True)
        qs = pick_questions(d, d["p_base"].to_numpy())[-args.days:]
        d = d.tail(args.days)
        out.append({
            "id": p.person_id,
            "sex": p.sex,
            "age": int(p.age),
            "days": [
                {
                    "date": r.date,
                    "risk": None if pd.isna(r.p_base) else round(float(r.p_base), 4),
                    "migraine": int(r.migraine),
                    "question": render(q) if q else None,
                    **{s: (None if pd.isna(getattr(r, s)) else float(getattr(r, s))) for s in SIGNALS},
                }
                for r, q in zip(d.itertuples(), qs)
            ],
        })

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, separators=(",", ":")))
    print(f"Wrote {args.out} ({len(out)} persons x {args.days} days)")


if __name__ == "__main__":
    main()
