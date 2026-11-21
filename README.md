# Migraine forecast from wearable data

**Live demo: https://hugo1sp.github.io/lhe_hackathon/**

Forecasts the likelihood of a migraine from smartwatch data (sleep, resting heart rate, HRV, activity, stress). Collecting good data is the main bottleneck for existing solutions, so data collection is our focus: instead of a daily diary, the app asks at most one one-tap question per day, only when the answer is informative.

## Run

```bash
./run.sh
```

Runs the whole pipeline: generates synthetic data, simulates users answering the questions, and exports data for the site. Every push to `main` runs the same pipeline on GitHub Actions and redeploys the live demo.

## Layout

- `simulator/` – synthetic wearable + migraine data, calibrated against public datasets (`datasets/stats.py`)
- `collection/` – question policy for data collection and simulated answers
- `frontend/export.py` – exports data for the site
- `docs/` – the site (GitHub Pages)

Demo uses simulated data only.
