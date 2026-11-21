"""Export actual model inference for the separate Follow Anna demo.

Run after ./run.sh: .venv/bin/python demo_model/build_data.py
The static page replays these outputs; server.py runs fresh inference on each sync.
"""
import hashlib
import json
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / name) for name in ("simulator", "collection", "model")]
from base import HORIZONS, WEARABLE_COLS, build_features, p_col, with_dow
from questions import pick_questions, render
from simulate import ANNA, simulate

DEFAULT_INDEX = 169  # June 19; a fixed date, not a week selected for successful predictions.
SIGNALS = {
    "sleep_hours": ("Sleep", "h"), "sleep_efficiency": ("Sleep efficiency", "%"),
    "sleep_midpoint_h": ("Sleep midpoint", "h"), "resting_hr": ("Resting heart rate", "bpm"),
    "hrv_rmssd": ("HRV", "ms"), "steps": ("Steps", "steps"), "stress_score": ("Stress", "/100"),
}


def clean(value):
    return None if pd.isna(value) else round(float(value), 6)


class Demo:
    def __init__(self):
        self.watch, self.truth = simulate(365, "2026-01-01", seed=0)
        self.models = {h: lgb.Booster(model_file=str(ROOT / "data" / f"model_base_d{h}.txt"))
                       for h in HORIZONS}
        self.meta = {
            "person": {"name": "Anna", "id": ANNA["person_id"]},
            "defaultIndex": DEFAULT_INDEX, "firstIndex": 28, "lastIndex": len(self.watch) - 1,
            "models": [{"horizon": h, "file": f"data/model_base_d{h}.txt",
                        "sha256": hashlib.sha256((ROOT / "data" / f"model_base_d{h}.txt").read_bytes()).hexdigest()}
                       for h in HORIZONS],
        }

    def infer(self, end):
        """Only watch data through this evening is allowed into model inference."""
        watch = self.watch.iloc[:end + 1].assign(date=lambda d: pd.to_datetime(d.date))
        X, meta = build_features(watch)
        forecasts = meta[["person_id", "date"]].copy()
        for h, model in self.models.items():
            forecasts[p_col(h)] = model.predict(with_dow(X, meta, h))
        contributions = self.models[1].predict(with_dow(X, meta, 1), pred_contrib=True)
        return forecasts, X, contributions

    def describe(self, index, forecasts, X, contributions):
        watch = self.watch.iloc[:index + 1].reset_index(drop=True)
        by_date = forecasts.set_index("date")
        risk_today = by_date.p_base.reindex(pd.to_datetime(watch.date) - pd.Timedelta(days=1)).to_numpy()
        q = pick_questions(watch, risk_today)[-1]
        today = watch.iloc[-1]
        date = pd.Timestamp(today.date)
        row = by_date.loc[date]
        baseline = watch.iloc[max(0, index - 28):index]
        signals = [{"key": key, "name": name, "unit": unit, "value": clean(today[key]),
                    "baseline": clean(baseline[key].mean())} for key, (name, unit) in SIGNALS.items()]
        groups = {}
        values = contributions[forecasts.date.eq(date).to_numpy()][0]
        for feature, value in zip(X.columns.tolist() + ["dow_ahead"], values[:-1]):
            key = next((c for c in SIGNALS if feature.startswith(c)), None)
            name = SIGNALS[key][0] if key else {"dow_ahead": "Target weekday", "nonwear": "Missing watch data",
                                                "sleep_midpoint_irreg": "Sleep timing"}.get(feature, feature)
            groups[name] = groups.get(name, 0.0) + float(value)
        history = []
        for i in range(max(29, index - 13), index + 1):
            day = pd.Timestamp(watch.date.iat[i])
            prior = by_date.loc[day - pd.Timedelta(days=1)]
            history.append({"date": str(day.date()), "risk": clean(prior.p_base),
                            "outcome": int(self.truth.true_migraine.iat[i]) if i < index else None})
        return {
            "index": index, "date": str(date.date()), "historyDays": index,
            "signals": signals, "watchPresent": bool(today[WEARABLE_COLS].notna().any()),
            "forecast": [{"horizon": h, "date": str((date + pd.Timedelta(days=h)).date()),
                          "probability": clean(row[p_col(h)])} for h in HORIZONS],
            "question": render(q) if q else None,
            "contributions": [{"name": name, "value": clean(value)}
                              for name, value in sorted(groups.items(), key=lambda item: abs(item[1]), reverse=True)[:4]],
            "history": history, "outcome": int(self.truth.true_migraine.iat[index]),
        }

    def snapshot(self, index):
        if not 28 <= index < len(self.watch):
            raise ValueError("Day index must be between 28 and 364")
        forecasts, X, contributions = self.infer(index)
        return {"meta": self.meta, "day": self.describe(index, forecasts, X, contributions)}


    def week(self):
        """Fixed June 15-21 week: an actual simulated attack, not a scripted outcome."""
        start, end = 165, 171
        forecasts, X, contributions = self.infer(end)
        days = []
        for index in range(start, end + 1):
            snap = self.describe(index, forecasts, X, contributions)
            w, tr = self.watch.iloc[index], self.truth.iloc[index]
            date = pd.Timestamp(w.date)
            day = {
                "name": date.strftime("%a"), "date": date.day, "iso": w.date,
                "risk": snap["history"][-1]["risk"],
                "sleep": float(w.sleep_hours), "eff": float(w.sleep_efficiency),
                "mid": float(w.sleep_midpoint_h), "rhr": float(w.resting_hr),
                "hrv": float(w.hrv_rmssd), "stress": int(w.stress_score), "steps": int(w.steps),
                "migraine": int(tr.true_migraine), "outlook": snap["forecast"],
            }
            q = snap["question"]
            if q and index != end:
                # Seeded demo responses use the existing answer mapper; viewers may choose freely.
                from simulate_answers import answer
                person = pd.Series({"true_migraine": int(tr.true_migraine), "intensity": 3,
                                    "prodrome": int(tr.true_prodrome > 0), "true_illness": 0,
                                    "stress_score": w.stress_score})
                day["question"] = {**q, "answer": answer(q["id"], person, None)}
            days.append(day)
        assert sum(d["migraine"] for d in days) == 1 and days[-1]["migraine"] == 1
        baseline = self.watch.iloc[end - 28:end]
        base = {name: clean(baseline[key].mean()) for key, name in
                [("sleep_hours", "sleep"), ("resting_hr", "rhr"), ("hrv_rmssd", "hrv"),
                 ("stress_score", "stress"), ("steps", "steps")]}
        return {"person": self.meta["person"], "source": "simulator/simulate.py + model/base.py + collection/questions.py",
                "models": self.meta["models"], "month": "Jun", "days": days, "base": base}


def main():
    week = Demo().week()
    path = Path(__file__).with_name("week.js")
    path.write_text("// Generated by demo_model/build_data.py from saved LightGBM models.\n"
                    "window.MODEL_LIVE = false;\nwindow.WEEK = " + json.dumps(week, separators=(",", ":"), allow_nan=False) + ";\n")
    print(f"Wrote {len(week['days'])} model-driven days to {path}")


if __name__ == "__main__":
    main()
