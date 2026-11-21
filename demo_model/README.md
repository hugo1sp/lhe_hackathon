# Follow Anna: real model demo

The existing Follow Anna animation, on a separate page with real model outputs and shorter captions. Existing demo folders are unchanged.

```bash
# From the repository root, after ./run.sh
.venv/bin/python demo_model/build_data.py
.venv/bin/python demo_model/server.py --port 8001
```

Open http://localhost:8001. **Live model** reruns the saved models when the page loads. The deployed static page at `/followanna-model/` shows the same outputs as **Model replay**. The animation replays predictions; it does not train models in the browser.

- `build_data.py` uses the real watch simulator (seed 0), feature builder, three LightGBM models, question policy and answer mapper. Model fingerprints are exported in `week.js`.
- The fixed June 15–21 week ends on an actual simulated attack. Every day's displayed risk is the next-day prediction made the previous evening; future outcomes are not model inputs.
- Resting heart rate, sleep hours, stress, HRV, steps and risk are actual daily values. Character motion, intraday timing, suggested actions, severity and optional app details are illustrative. The daily simulator does not predict an exact onset time.
- Automated and manual answers are stored in browser-local storage, with `collection/questions.py` field mappings. Unknown values remain unknown. The base models are watch-only; taps do not refit them or the separate personal layer.
- Display thresholds (15% and 40%) and notification times are demo choices, not clinically validated decisions.

Controls: Play/Pause, speed, Manual, Next event, Restart, or click the timeline. In Manual mode, tap the highlighted watch/phone options yourself.
