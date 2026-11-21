"""Personal layer: correct the shared watch-only base forecast with what only the user can tell us.

The base model (model/base.py) is the same for everyone and sees only smartwatch
signals. This layer adds, per user, the inputs the watch does not measure:

  - one-tap answers from labels.csv (prodrome, stress, illness, alcohol, intensity)
  - migraine history from those answers (last label, 7/30-day counts, recency)
  - what is known in advance about tomorrow (perimenstrual window, weekend)
  - the user's own watch z-scores and answer x watch interactions, so the layer can
    learn person-specific links (e.g. "my sleep debt matters", "low HRV while sick is
    not a migraine sign") that one shared model cannot.

Model: logistic regression on top of the base forecast,

    logit p = logit(p_base) + w_u . x

`logit(p_base)` is a fixed offset, so w_u = 0 means "use the base as is". Each user's
w_u gets a Gaussian prior centred on a population layer w_pop (fit on other users),
which in turn is shrunk towards 0. A new user with few answers therefore gets
base + population effects of their answers; w_u moves away from w_pop only as far as
their own answers support. Every input is optional: unknown answers are "no
information" (all indicators 0, never "No"), the cycle window is 0 for users without
a cycle, and there is no intercept, so a user with no inputs gets exactly p_base.
(Without an intercept the layer does not fix the base's calibration; that belongs in
the base model.)

Evaluation (scored on `true_migraine` for every day, answered or not):
  - Population layer: 5-fold person-grouped (w_pop never sees the test user).
  - Personal layer: walk-forward per test user, refit every week on the labels the
    user had given up to that day, predict the next week.
  Prints base vs base + population vs base + personal, and how the gain grows when
  the same users give more answers (a random share of labels.csv kept).

Finding on the simulator data: the population layer gives the whole gain; per-user
deviations tie it at best (also with perfect labels), because the simulated
predictability comes mostly from prodrome physiology, not from per-person trigger
sensitivities (the simulator's true risk only reaches ROC AUC ~0.73). The per-user
prior is therefore strong (--lam 30): it never hurts and can pick up real
individual differences when they exist.

Usage:
  python model/personal.py --data data [--lam 30]
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

WATCH = ["hrv_rmssd", "resting_hr", "sleep_hours", "stress_score", "steps"]
WARMUP = 28     # days needed for the personal watch baseline
REFIT = 7       # refit each user's layer weekly
LAM_POP = 1.0   # prior precision of the population layer around 0


def build(daily, labels, base):
    """One row per person-day t: features known at end of day t, target = migraine on t+1."""
    d = (daily.merge(labels.drop(columns="question").rename(columns={"migraine": "label"}),
                     on=["person_id", "date"], how="left")
         .merge(base, on=["person_id", "date"], how="left")
         .sort_values(["person_id", "date"]).reset_index(drop=True))
    g = d.groupby("person_id")
    rolling = lambda s, w, f: getattr(s.shift(1).rolling(w, min_periods=7), f)()
    yes = lambda c: (d[c] == 1).astype(float)  # unknown -> 0, same as "No" only for 'yes' flags

    z = {}
    for c in WATCH:
        z[c] = ((d[c] - g[c].transform(rolling, 28, "mean")) / g[c].transform(rolling, 28, "std")).clip(-4, 4)
    sleep_debt = (-z["sleep_hours"]).groupby(d["person_id"]).transform(
        lambda s: s.rolling(3, min_periods=1).mean())
    irreg = (d["sleep_midpoint_h"] - g["sleep_midpoint_h"].transform(
        lambda s: s.rolling(7, min_periods=1).mean())).abs()

    known_pos = (d["label"] == 1).astype(float)
    last_pos = d["date"].where(d["label"] == 1).groupby(d["person_id"]).ffill()
    days_since = (d["date"] - last_pos).dt.days
    cycle_ahead = g["cycle_day"].shift(-1)
    cycle_len = g["cycle_day"].transform(lambda s: s.expanding().max())  # learned from the user's own data
    prodrome = d["prodrome"] / 2

    X = pd.DataFrame({
        # history from answers
        "label_yes": yes("label"),
        "label_no": (d["label"] == 0).astype(float),
        "migraines_7d": known_pos.groupby(d["person_id"]).transform(lambda s: s.rolling(7, min_periods=1).sum()) / 2,
        "migraines_30d": known_pos.groupby(d["person_id"]).transform(lambda s: s.rolling(30, min_periods=1).sum()) / 8,
        "recent_migraine": np.exp(-days_since / 3).fillna(0),
        # today's one-tap answers
        "prodrome": prodrome.fillna(0),
        "prodrome_no": (d["prodrome"] == 0).astype(float),
        "prodrome_yesterday": prodrome.groupby(d["person_id"]).shift(1).fillna(0),
        "stress_yes": yes("stress"),
        "illness_yes": yes("illness"),
        "alcohol_yes": yes("alcohol"),
        "intensity": (d["intensity"] - 3).fillna(0),
        # tomorrow, known in advance
        "perimenstrual_ahead": ((cycle_ahead <= 4) | (cycle_ahead >= cycle_len - 1)).astype(float),
        "weekend_ahead": ((d["day_of_week"] + 1) % 7 >= 5).astype(float),
        # the user's own watch signals, for person-specific sensitivities
        **{f"{c}_z": z[c].fillna(0) for c in WATCH},
        "sleep_debt_3d": sleep_debt.fillna(0),
        "sleep_irregularity": irreg.fillna(0),
        # answers x watch: separate confounders from pre-migraine changes
        "stress_x_hrv": yes("stress") * z["hrv_rmssd"].fillna(0),
        "illness_x_hrv": yes("illness") * z["hrv_rmssd"].fillna(0),
        "illness_x_rhr": yes("illness") * z["resting_hr"].fillna(0),
    })

    p = d["p_base"].clip(1e-4, 1 - 1e-4)
    meta = pd.DataFrame({
        "person_id": d["person_id"], "date": d["date"], "day": g.cumcount(),
        "offset": np.log(p / (1 - p)), "p_base": p,
        "y": g["label"].shift(-1), "y_true": g["true_migraine"].shift(-1),
    })
    keep = (meta["day"] >= WARMUP) & meta["y_true"].notna() & meta["p_base"].notna()
    return X[keep].reset_index(drop=True), meta[keep].reset_index(drop=True)


def fit(X, offset, y, prior, lam):
    """MAP logistic regression with fixed offset and N(prior, 1/lam) on the weights."""
    def loss(w):
        eta = offset + X @ w
        p = 1 / (1 + np.exp(-eta))
        diff = w - prior
        nll = np.sum(np.logaddexp(0, eta) - y * eta)
        return nll + 0.5 * lam * diff @ diff, X.T @ (p - y) + lam * diff
    return minimize(loss, prior.copy(), jac=True, method="L-BFGS-B").x


def predict(X, offset, w):
    return 1 / (1 + np.exp(-(offset + X @ w)))


def evaluate(X, meta, lam):
    Xv, off = X.to_numpy(), meta["offset"].to_numpy()
    y = meta["y"].to_numpy()
    labelled = ~np.isnan(y)
    p_pop, p_per = np.zeros(len(X)), np.zeros(len(X))
    zero = np.zeros(X.shape[1])
    pop_weights = []

    for tr, te in GroupKFold(5).split(Xv, groups=meta["person_id"]):
        tr = tr[labelled[tr]]
        w_pop = fit(Xv[tr], off[tr], y[tr], zero, LAM_POP)
        pop_weights.append(w_pop)
        p_pop[te] = predict(Xv[te], off[te], w_pop)

        for _, rows in meta.iloc[te].groupby("person_id").groups.items():
            rows = np.asarray(rows)
            days = meta["day"].to_numpy()[rows]
            for start in range(days.min(), days.max() + 1, REFIT):
                block = rows[(days >= start) & (days < start + REFIT)]
                train = rows[(days + 1 <= start) & labelled[rows]]  # target day already answered
                w = fit(Xv[train], off[train], y[train], w_pop, lam) if len(train) else w_pop
                p_per[block] = predict(Xv[block], off[block], w)

    return p_pop, p_per, pd.DataFrame(pop_weights, columns=X.columns).mean()


def scores(y, p):
    return roc_auc_score(y, p), average_precision_score(y, p), brier_score_loss(y, p)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data")
    ap.add_argument("--lam", type=float, default=30.0, help="prior precision pulling each user to the population layer")
    args = ap.parse_args()
    data = Path(args.data)

    daily = pd.read_csv(data / "daily.csv", parse_dates=["date"])
    labels = pd.read_csv(data / "labels.csv", parse_dates=["date"])
    base_path = data / "base_oof.csv"
    if not base_path.exists():
        raise SystemExit(f"{base_path} not found - run model/base.py first (writes out-of-fold p_base)")
    base = pd.read_csv(base_path, parse_dates=["date"])

    X, meta = build(daily, labels, base)
    p_pop, p_per, w_pop = evaluate(X, meta, args.lam)
    y = meta["y_true"].astype(int).to_numpy()

    print(f"{len(X)} person-days, {meta['person_id'].nunique()} users, {X.shape[1]} personal features, "
          f"true attack rate {y.mean():.3f}")
    print("Scored on true attacks on every day (answered or not); personal layer refit weekly, walk-forward\n")
    print(f"  {'model':<30} ROC AUC  PR AUC  Brier")
    for name, p in [("base (watch only)", meta["p_base"]), ("base + population layer", p_pop),
                    ("base + personal layer", p_per)]:
        print(f"  {name:<30} {scores(y, p)[0]:.3f}    {scores(y, p)[1]:.3f}   {scores(y, p)[2]:.4f}")

    print("\nMore answers -> better forecast: same users with a share of their answers dropped at random")
    print(f"  {'answers kept':<14} {'per week':>8}  ROC AUC  PR AUC  Brier    AUC gain vs base")
    rng = np.random.default_rng(0)
    n_days = daily.groupby("person_id").size().mean()
    base_auc = scores(y, meta["p_base"])[0]
    for keep in [0.0, 0.25, 0.5, 1.0]:
        kept = labels[rng.random(len(labels)) < keep]
        Xk, mk = build(daily, kept, base)
        _, pk, _ = evaluate(Xk, mk, args.lam)
        s = scores(mk["y_true"].astype(int), pk)
        print(f"  {keep:<14.0%} {7 * len(kept) / daily['person_id'].nunique() / n_days:>8.1f}  "
              f"{s[0]:.3f}    {s[1]:.3f}   {s[2]:.4f}   {s[0] - base_auc:+.3f}")

    print("\nPopulation layer: largest effects on top of the base (log-odds per unit):")
    for name, v in w_pop.sort_values(key=abs, ascending=False).head(8).items():
        print(f"  {name:<22} {v:+.2f}")


if __name__ == "__main__":
    main()
