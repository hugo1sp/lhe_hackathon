"""Random forest classifier on synthetic_migraine.parquet.

Predicts migraine_occurrence (0/1) from sleep, mood, stress, hydration and
screen time, and reports probability-quality metrics on a held-out split.

Usage:
  python model/train_rf.py --data synthetic_migraine.parquet
"""

import argparse

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import cross_val_score, train_test_split

TARGET = "migraine_occurrence"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="synthetic_migraine.parquet")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    df = pd.read_parquet(args.data)
    X, y = df.drop(columns=TARGET), df[TARGET]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=args.seed)

    # The signal is weak and mostly additive (driven by sleep), so heavy
    # regularisation (large leaves, shallow trees) beats deeper forests in CV.
    model = RandomForestClassifier(n_estimators=500, min_samples_leaf=200, max_depth=8,
                                   max_features=2, n_jobs=-1, random_state=args.seed)

    cv_auc = cross_val_score(model, X_train, y_train, cv=5, scoring="roc_auc", n_jobs=-1)
    print(f"5-fold CV ROC AUC (train): {cv_auc.mean():.3f} +/- {cv_auc.std():.3f}")

    model.fit(X_train, y_train)
    p = model.predict_proba(X_test)[:, 1]
    base_rate = y_train.mean()

    print(f"\nTest set ({len(y_test)} rows, positive rate {y_test.mean():.3f})")
    print(f"  ROC AUC   {roc_auc_score(y_test, p):.3f}   (random = 0.500)")
    print(f"  PR AUC    {average_precision_score(y_test, p):.3f}   (random = {y_test.mean():.3f})")
    print(f"  Brier     {brier_score_loss(y_test, p):.4f}  (constant base rate = "
          f"{brier_score_loss(y_test, [base_rate] * len(y_test)):.4f})")
    print(f"  Accuracy  {accuracy_score(y_test, p >= 0.5):.3f}   (majority class = "
          f"{max(y_test.mean(), 1 - y_test.mean()):.3f})")

    imp = permutation_importance(model, X_test, y_test, scoring="roc_auc",
                                 n_repeats=5, random_state=args.seed, n_jobs=-1)
    print("\nPermutation importance (drop in test ROC AUC):")
    for name, m, s in sorted(zip(X.columns, imp.importances_mean, imp.importances_std),
                             key=lambda t: -t[1]):
        print(f"  {name:<16} {m:+.4f} +/- {s:.4f}")


if __name__ == "__main__":
    main()
