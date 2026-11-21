"""Live backend for the Migrai app: Anna's fake watch + the base model, one day at a time.

The simulator (simulator/simulate.py) plays Anna's smartwatch. The server reveals her
watch data up to "today", runs the saved base models (data/model_base_d{1,2,3}.txt) and the
question policy (collection/questions.py) on it, and serves the result as /anna_data.js in
the format app.js reads. POST /next syncs one more day from the watch; POST /reset starts over.

Past migraines in History are Anna's simulated attacks before today (as if she logged them);
today and onward she logs them herself in the app. Cycle day is not part of the
watch simulator, so it is left empty.

Usage: .venv/bin/python app/server.py [--port 8000]   then open http://localhost:8000
"""

import argparse
import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "simulator"), str(ROOT / "collection"), str(ROOT / "model")]
from base import predict_base  # noqa: E402
from questions import pick_questions  # noqa: E402
from simulate import ANNA as PERSON, simulate  # noqa: E402

START_DAY = 176                     # 2026-06-25: six months of history
WATCH, TRUTH = simulate(365, "2026-01-01", seed=0)
COLS = {"sleep_hours": "sleep", "sleep_efficiency": "eff", "sleep_midpoint_h": "mid", "resting_hr": "rhr",
        "hrv_rmssd": "hrv", "steps": "steps", "stress_score": "stress"}
state = {"today": START_DAY}


def num(v, k):
    return None if pd.isna(v) else round(float(v), 3 if k == "eff" else 2)


def anna():
    """Everything the app knows tonight: watch data so far, forecasts, questions."""
    d = WATCH.iloc[:state["today"]].reset_index(drop=True)
    f = predict_base(d.assign(date=pd.to_datetime(d.date)), ROOT / "data")
    f = f.assign(date=f.date.dt.strftime("%Y-%m-%d")).set_index("date").reindex(d.date).reset_index()
    risk = f["p_base"].shift(1)                   # forecast for day t, made on the evening of t-1
    qs = pick_questions(d, risk.to_numpy())
    days = []
    for i, r in d.iterrows():
        t = TRUTH.iloc[i]
        row = {"date": r.date, "cd": None, "mig": int(t.true_migraine) if i < len(d) - 1 else 0}
        for c, k in COLS.items():
            row[k] = num(r[c], k)
            row["b_" + k] = num(d[c].iloc[max(0, i - 14):i].mean() if i >= 5 else None, k)
        row["risk"] = None if pd.isna(risk.iat[i]) else round(float(risk.iat[i]), 3)
        if row["mig"]:
            row["log"] = {"t": "14:00", "int": None, "meds": [], "src": "tap"}
        if qs[i]:
            row["q"] = qs[i]["id"] + (":" + qs[i]["signal"] if "signal" in qs[i] else "")
        days.append(row)
    last = f.iloc[-1]
    ahead = lambda h: str((pd.Timestamp(d.date.iat[-1]) + pd.Timedelta(days=h)).date())
    return {
        "live": True,
        "person": {"id": PERSON["person_id"], "name": "Anna", "age": 23, "cycle_length": PERSON["cycle_length"],
                   "triggers": PERSON["sens"]},
        "outlook": {"made": d.date.iat[-1], ahead(1): num(last.p_base, "eff"),
                    ahead(2): num(last.p_base_d2, "eff"), ahead(3): num(last.p_base_d3, "eff")},
        "days": days,
    }


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] != "/anna_data.js":
            return super().do_GET()
        body = ("const ANNA = " + json.dumps(anna(), separators=(",", ":")) + ";\n").encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/next":
            state["today"] = min(state["today"] + 1, len(WATCH))
        elif self.path == "/reset":
            state["today"] = START_DAY
        else:
            return self.send_error(404)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    port = ap.parse_args().port
    print(f"Migrai on http://localhost:{port}")
    ThreadingHTTPServer(("", port), partial(Handler, directory=str(ROOT / "app"))).serve_forever()
