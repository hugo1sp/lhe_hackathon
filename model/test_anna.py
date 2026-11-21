"""Test on Anna: shared base model alone vs base + a personal layer from her own answers.

1. Anna is a new user. The saved base model (trained on the population, Anna not
   in it) forecasts migraine tomorrow from her watch data (simulator/simulate.py).
2. Each day the app asks at most one one-tap question (collection/questions.py,
   picked from the base forecast). Simulated Anna answers 85 % of them truthfully
   and logs 80 % of her attacks with "Log migraine now".
3. A personal layer, trained only on Anna's own records, corrects the base:
       logit p = logit(p_base) + w . x
   x = her answers (early warning signs, stress, alcohol, recent attacks) and
   answer x watch-deviation interactions (e.g. stress x HRV). L2 prior on w
   towards 0, so with no answers p = p_base. Refit every week, walk-forward:
   only records whose day has already passed.

Her true attacks come from the simulator's hidden truth and are used for
scoring only.

Usage:
  python model/test_anna.py [--days 365] [--seed 0]
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "simulator"), str(ROOT / "collection")]
from base import predict_base  # noqa: E402
from metrics import calibration_table, warned_share  # noqa: E402
from questions import QUESTIONS, pick_questions  # noqa: E402
from simulate import simulate  # noqa: E402
from simulate_answers import answer  # noqa: E402

ANSWER_RATE = 0.85   # share of questions Anna answers
LOG_RATE = 0.8       # share of attacks Anna logs herself
LAM = 5.0            # L2 prior precision on the personal weights
REFIT = 7


def simulate_answers(d, risk, truth, rng):
    """Anna's records: one row per day with any input (fields as in questions.QUESTIONS)."""
    d = d.merge(truth, on="date").assign(true_illness=0)
    felt = np.where(d["true_prodrome"] > 0, rng.random(len(d)) < 0.7, rng.random(len(d)) < 0.08)
    d["prodrome"] = np.where(felt, rng.choice([1, 2], len(d)), 0)
    d["intensity"] = rng.choice([2, 3, 4], len(d))
    rows = []
    for q, r in zip(pick_questions(d, risk), d.itertuples()):
        if r.true_migraine and rng.random() < LOG_RATE:
            rows.append({"date": r.date, "question": "log_now", "migraine": 1})
        elif q and rng.random() < ANSWER_RATE:
            label = answer(q["id"], r, rng)
            if label == "Nothing" and r.true_alcohol:   # answer() has no alcohol case
                label = "Alcohol"
            rows.append({"date": r.date, "question": q["id"], **dict(QUESTIONS[q["id"]][1])[label]})
    return pd.DataFrame(rows), pick_questions(d, risk)


def layer_features(d, rec):
    """Non-watch inputs known at the end of day t, and their interactions with watch deviations."""
    d = d.merge(rec, on="date", how="left")
    yes = lambda c: (d[c] == 1).astype(float) if c in d else pd.Series(0.0, index=d.index)
    z = {}
    for c in ["hrv_rmssd", "resting_hr", "sleep_hours"]:
        prev = d[c].shift(1).rolling(28, min_periods=7)
        z[c] = ((d[c] - prev.mean()) / prev.std()).clip(-4, 4).fillna(0)
    logged = (d["migraine"] == 1).astype(float)
    last = d["date"].where(logged == 1).ffill()
    prodrome = (d["prodrome"] / 2).fillna(0) if "prodrome" in d else pd.Series(0.0, index=d.index)
    stress, alcohol = yes("stress"), yes("alcohol")
    X = pd.DataFrame({
        "early_warning_signs": prodrome,
        "early_warning_yesterday": prodrome.shift(1).fillna(0),
        "answered_stress": stress,
        "answered_alcohol": alcohol,
        "migraine_today": logged,
        "recent_migraine": np.exp(-(d["date"] - last).dt.days / 3).fillna(0),
        "migraines_30d": logged.rolling(30, min_periods=1).sum() / 4,
        "stress_x_low_hrv": stress * -z["hrv_rmssd"],
        "stress_x_high_rhr": stress * z["resting_hr"],
        "alcohol_x_low_hrv": alcohol * -z["hrv_rmssd"],
        "alcohol_x_high_rhr": alcohol * z["resting_hr"],
        "warning_x_low_hrv": prodrome * -z["hrv_rmssd"],
        "warning_x_short_sleep": prodrome * -z["sleep_hours"],
    })
    y = logged.shift(-1)                                   # recorded migraine tomorrow, unrecorded = 0
    return X, y


def fit(X, offset, y):
    def loss(w):
        eta = offset + X @ w
        return (np.sum(np.logaddexp(0, eta) - y * eta) + 0.5 * LAM * w @ w,
                X.T @ (1 / (1 + np.exp(-eta)) - y) + LAM * w)
    return minimize(loss, np.zeros(X.shape[1]), jac=True, method="L-BFGS-B").x


def scores(y, p):
    return roc_auc_score(y, p), average_precision_score(y, p), brier_score_loss(y, p)


def week_bootstrap(y, ps, day, rng, n=1000):
    """95 % CI for ROC AUC and Brier of each forecast, resampling whole weeks (keeps autocorrelation)."""
    weeks = [np.flatnonzero(day // 7 == w) for w in np.unique(day // 7)]
    out = {k: ([], []) for k in ps}
    diff = []
    for _ in range(n):
        i = np.concatenate([weeks[j] for j in rng.integers(0, len(weeks), len(weeks))])
        if y[i].min() == y[i].max():
            continue
        for k, p in ps.items():
            out[k][0].append(roc_auc_score(y[i], p[i]))
            out[k][1].append(brier_score_loss(y[i], p[i]))
        diff.append(out["layer"][0][-1] - out["base"][0][-1])
    ci = lambda v: np.percentile(v, [2.5, 97.5])
    return {k: (ci(a), ci(b)) for k, (a, b) in out.items()}, ci(diff)


def run(days, seed):
    """One simulated year of Anna: base and base + layer forecasts for tomorrow, scored on her true attacks."""
    rng = np.random.default_rng(seed)
    watch, truth = simulate(days, "2026-01-01", seed)
    for df in (watch, truth):
        df["date"] = pd.to_datetime(df["date"])
    base = predict_base(watch)[["date", "p_base"]]
    d = watch.merge(base, on="date", how="left")
    rec, asked = simulate_answers(d, d["p_base"].fillna(0).to_numpy(), truth, rng)

    X, y = layer_features(d, rec)
    p_base = d["p_base"].clip(1e-4, 1 - 1e-4)
    off = np.log(p_base / (1 - p_base)).to_numpy()
    day = np.arange(len(d))
    p_layer = np.full(len(d), np.nan)
    w = np.zeros(X.shape[1])
    for start in range(28, len(d), REFIT):
        train = (day + 1 < start) & d["p_base"].notna().to_numpy() & y.notna().to_numpy()
        if train.any():
            w = fit(X.to_numpy()[train], off[train], y.to_numpy()[train])
        block = slice(start, start + REFIT)
        p_layer[block] = 1 / (1 + np.exp(-(off[block] + X.to_numpy()[block] @ w)))

    target = truth["true_migraine"].shift(-1)
    ok = d["p_base"].notna().to_numpy() & target.notna().to_numpy()
    return dict(y=target[ok].astype(int).to_numpy(), base=p_base[ok].to_numpy(), layer=p_layer[ok],
                truth=truth["true_risk"].shift(-1)[ok].to_numpy(), day=day[ok], rec=rec, dates=d["date"],
                n_asked=sum(q is not None for q in asked), attacks=int(truth["true_migraine"].sum()),
                weights=pd.Series(w, X.columns))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--repeat", type=int, default=20, help="extra simulated years of Anna (seeds 1..N)")
    args = ap.parse_args()

    r = run(args.days, args.seed)
    y, rec, names = r["y"], r["rec"], {"base": "base alone (watch)", "layer": "base + personal layer",
                                        "truth": "simulator true risk (ref.)"}
    const = brier_score_loss(y, np.full(len(y), y.mean()))
    print(f"Anna (P0187), seed {args.seed}, {args.days} days, {r['attacks']} true attack days; "
          f"{r['n_asked']} questions ({7 * r['n_asked'] / args.days:.1f}/week), {len(rec)} records "
          f"({(rec['question'] == 'log_now').sum()} self-logged attacks)")
    print(f"Forecast for tomorrow on {len(y)} days (from day 29), {y.sum()} attacks, rate {y.mean():.3f}, "
          f"constant-forecast Brier {const:.4f}. CI: 1000 bootstraps over weeks")
    ci, diff = week_bootstrap(y, {k: r[k] for k in names}, r["day"], np.random.default_rng(0))
    print(f"  {'forecast':<27} {'ROC AUC [95% CI]':<20} PR AUC  {'Brier [95% CI]':<24} skill   "
          f"warned @1 FA/wk  mean p")
    for k, name in names.items():
        a, pr, b = scores(y, r[k])
        warned, thr = warned_share(y, r[k])
        (alo, ahi), (blo, bhi) = ci[k]
        print(f"  {name:<27} {a:.3f} [{alo:.3f},{ahi:.3f}]  {pr:.3f}   {b:.4f} [{blo:.4f},{bhi:.4f}]  "
              f"{1 - b / const:+.3f}  {warned:>6.0%} (p>{thr:.2f})  {r[k].mean():.3f}")
    print(f"  AUC gain of the layer: {roc_auc_score(y, r['layer']) - roc_auc_score(y, r['base']):+.3f} "
          f"[{diff[0]:+.3f},{diff[1]:+.3f}]")
    for k in ["base", "layer"]:
        t = calibration_table(y, r[k], bins=5)
        print(f"  Calibration '{names[k]}' by quintile:  predicted "
              + " ".join(f"{v:.2f}" for v in t["pred"]) + "   observed " + " ".join(f"{v:.2f}" for v in t["obs"]))

    print("\nOver time (ROC AUC / Brier per period, records collected before the period):")
    for lo in range(28, args.days, 56):
        i = (r["day"] >= lo) & (r["day"] < lo + 56)
        if not i.any() or y[i].min() == y[i].max():
            continue
        (ab, _, bb), (al, _, bl) = scores(y[i], r["base"][i]), scores(y[i], r["layer"][i])
        n = (rec["date"] < r["dates"].iloc[lo]).sum()
        print(f"  days {lo + 1:>3}-{min(lo + 56, args.days):<3}  base {ab:.3f} / {bb:.4f}   "
              f"+ layer {al:.3f} / {bl:.4f}   ({n} records so far)")

    print("\nWhat the layer learned about Anna (final weights, log-odds on top of the base):")
    for name, v in r["weights"].sort_values(key=abs, ascending=False).head(6).items():
        print(f"  {name:<24} {v:+.2f}")

    if args.repeat:
        rows = []
        for seed in range(1, args.repeat + 1):
            o = run(args.days, seed)
            sb, sl = scores(o["y"], o["base"]), scores(o["y"], o["layer"])
            c = brier_score_loss(o["y"], np.full(len(o["y"]), o["y"].mean()))
            rows.append([sb[0], sl[0], sb[1], sl[1], 1 - sb[2] / c, 1 - sl[2] / c,
                         roc_auc_score(o["y"], o["truth"])])
        t = pd.DataFrame(rows, columns=["auc_base", "auc_layer", "pr_base", "pr_layer",
                                        "skill_base", "skill_layer", "auc_truth"])
        print(f"\nRepeated over {args.repeat} other simulated years of Anna (seeds 1-{args.repeat}): "
              "mean [2.5-97.5 percentile]")
        for c in t.columns:
            lo, hi = np.percentile(t[c], [2.5, 97.5])
            print(f"  {c:<12} {t[c].mean():+.3f} [{lo:+.3f},{hi:+.3f}]")
        print(f"  layer beats base on AUC in {(t['auc_layer'] > t['auc_base']).sum()}/{len(t)} years, "
              f"on Brier in {(t['skill_layer'] > t['skill_base']).sum()}/{len(t)}")


if __name__ == "__main__":
    main()
