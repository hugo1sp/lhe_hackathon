"""Question policy: decide which single one-tap question (if any) to ask a user each day.

Instead of a daily diary, the forecast decides when asking is worth it, so each
answer gives the model as much information as possible:

  1. attack_check - activity crashed vs. the personal baseline: confirm or rule out an attack.
  2. prodrome     - forecast risk is high for this person: capture early warning signs and check the forecast.
  3. anomaly      - a physiological signal is off: ask why, so the model can separate
                    confounders (stress, illness, alcohol) from pre-migraine changes.
  4. no_data      - the watch recorded nothing: the label is the only data we get that day.
  5. checkin      - nothing asked for a few days: secure a confirmed "no migraine" day.

At most one question per day, using only data available up to that day.
"""

import numpy as np
import pandas as pd

# Each option maps to the structured fields it sets for that person-day, so every tap
# becomes model-ready data. Fields never set by an answer stay unknown (NaN) - not 0.
#   migraine   0/1, the label
#   intensity  1-5, same scale as mBrain21 / `migraine_intensity` (mild=2, moderate=3, severe=4)
#   prodrome   0-2, early warning signs
#   stress, illness, alcohol  0/1, confounders the wearable cannot tell apart
NO, YES = {"migraine": 0}, {"migraine": 1}
QUESTIONS = {
    "attack_check": ("Your activity dropped sharply today. Did you have a migraine?", [
        ("No", NO),
        ("Mild", {"migraine": 1, "intensity": 2}),
        ("Moderate", {"migraine": 1, "intensity": 3}),
        ("Severe", {"migraine": 1, "intensity": 4}),
    ]),
    "prodrome": ("Your migraine risk is high. Any early warning signs (stiff neck, yawning, light sensitivity)?", [
        ("No", {"prodrome": 0}), ("A little", {"prodrome": 1}), ("Clearly", {"prodrome": 2}),
    ]),
    "anomaly": ("Your {signal} was unusual last night. Anything going on?", [
        ("Nothing", {"stress": 0, "illness": 0, "alcohol": 0}),
        ("Stress", {"stress": 1}), ("Sick", {"illness": 1}), ("Alcohol", {"alcohol": 1}),
        ("Headache", YES),
    ]),
    "no_data": ("Your watch has no data today. Did you have a migraine?", [("No", NO), ("Yes", YES)]),
    "checkin": ("Any migraine today?", [("No", NO), ("Yes", YES)]),
}
# Always-available one-tap button; the app adds the time of the tap as `onset`.
LOG_NOW = YES
FIELDS = ["migraine", "intensity", "onset", "prodrome", "stress", "illness", "alcohol"]

HIGH_RISK_Q = 0.9      # risk above the person's own 90th percentile counts as high
ANOMALY_Z = 2.0        # deviation from the personal baseline, in standard deviations
STEPS_DROP = 0.6       # steps below 60 % of the personal baseline
CHECKIN_GAP_DAYS = 2   # fallback check-in when nothing was asked for this many days

# Signal -> (label shown to the user, direction that counts as unusual)
ANOMALY_SIGNALS = {"hrv_rmssd": ("HRV", -1), "resting_hr": ("resting heart rate", 1), "sleep_hours": ("sleep", -1)}


def baseline(x):
    """Personal baseline from the previous 28 days (excludes the current day)."""
    prev = x.shift(1).rolling(28, min_periods=7)
    return prev.mean(), prev.std()


def pick_questions(days, risk):
    """One question id (or None) per row of a single person's `days`, given forecast `risk`."""
    steps_mean, _ = baseline(days["steps"])
    z = {}
    for col, (_, sign) in ANOMALY_SIGNALS.items():
        mean, std = baseline(days[col])
        z[col] = sign * (days[col] - mean) / std

    risk = pd.Series(risk)
    high_risk = risk > risk.shift(1).expanding(14).quantile(HIGH_RISK_Q)

    out, since_last = [], CHECKIN_GAP_DAYS
    for t in range(len(days)):
        no_data = pd.isna(days["steps"].iat[t])
        anomalies = [c for c in ANOMALY_SIGNALS if z[c].iat[t] > ANOMALY_Z]
        if not no_data and days["steps"].iat[t] < STEPS_DROP * steps_mean.iat[t]:
            q = {"id": "attack_check"}
        elif high_risk.iat[t]:
            q = {"id": "prodrome"}
        elif anomalies:
            q = {"id": "anomaly", "signal": max(anomalies, key=lambda c: z[c].iat[t])}
        elif no_data:
            q = {"id": "no_data"}
        elif since_last >= CHECKIN_GAP_DAYS:
            q = {"id": "checkin"}
        else:
            q = None
        out.append(q)
        since_last = 0 if q else since_last + 1
    return out


def render(q):
    """Question dict -> {id, text, options: [{label, set}]} for the app."""
    text, options = QUESTIONS[q["id"]]
    if "signal" in q:
        text = text.format(signal=ANOMALY_SIGNALS[q["signal"]][0])
    return {"id": q["id"], "text": text, "options": [{"label": l, "set": f} for l, f in options]}


if __name__ == "__main__":
    # Quick summary of how often each question fires on the simulated data.
    daily = pd.read_csv("data/daily.csv")
    ids, attack = [], []
    for _, d in daily.groupby("person_id"):
        d = d.reset_index(drop=True)
        ids += [q["id"] if q else "none" for q in pick_questions(d, d["true_risk"].to_numpy())]
        attack += list(d["true_migraine"] == 1)
    ids, attack = pd.Series(ids), pd.Series(attack)
    print(ids.value_counts().to_string())
    print(f"questions per week: {7 * (ids != 'none').mean():.1f}")
    print(f"attack days that get a question: {(ids[attack] != 'none').mean():.0%}")
