# Follow Anna: a real mobile app inside an automatic data scenario

Anna's watch data and model forecasts progress automatically. The mobile app is fully interactive: the viewer handles notifications, answers questions, logs migraines and explores Anna's history. There are no automatic taps or answers and no controls that change the data or predictions.

```bash
# After ./run.sh has trained the saved models
.venv/bin/python demo_model/build_data.py
.venv/bin/python -B demo_model/server.py --port 8001
```

Open http://localhost:8001. The Python server runs all three existing LightGBM models when watch data loads. GitHub Pages serves the same computed outputs at `/followanna-model/`.

- Actual daily values come from `simulator/simulate.py`, seed 0. The short case is June 19–21, with earlier example history from January 1. New attacks are never logged automatically.
- `model/base.py` supplies all predictions; only data through the forecast day enters the features. Watch-signal contributions come directly from LightGBM. They describe the model, not causal medical effects.
- The first notification for each day comes from `collection/questions.py`. On a morning anomaly day, the demo additionally schedules an evening check-in, using the same project's question and answer mappings. This is an explicit demo extension beyond the policy's original one-question-per-day limit.
- The automatic parts take about 20 seconds at the default 4× speed; two short user interactions make the case roughly 20–30 seconds. The clock waits while a notification needs an answer. Tap it to use Check-in, or dismiss it. All tabs and migraine details remain usable. Questions never choose an answer, medication or severity for the viewer.
- Multiple answers per day are retained separately in browser state and merged into one model-ready daily label for CSV export. Unknown fields stay blank. The watch-only base model does not refit from those answers; the separate personal layer is not connected.
- Character animation and intraday event times are illustrative; wearable measurements, predictions and policy questions are real code output on simulated data.

The original `app/`, `demo/`, `prototype/` and `prototype_model/` are unchanged.
