#!/usr/bin/env bash
# Run the whole pipeline: set up environment, then run each step in order.
# Usage: ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -r requirements.txt

# 1. Generate synthetic training population (200 persons with ground truth)
.venv/bin/python simulator/population.py --out data

# 2. Simulate users answering the one-tap questions -> data/labels.csv (model labels).
#    Two passes, like a deployed app: the question policy may only see the model's forecast,
#    never the simulator's true risk. Pass 1 has no forecast yet; pass 2 uses the base model's
#    out-of-fold forecast trained on pass 1.
.venv/bin/python collection/simulate_answers.py --data data
.venv/bin/python model/base.py --data data > /dev/null
.venv/bin/python collection/simulate_answers.py --data data --risk data/base_oof.csv

# 3. Train the shared watch-only base models 1, 2 and 3 days ahead -> data/model_base_d{1,2,3}.txt, data/base_oof.csv
.venv/bin/python model/base.py --data data

# 4. Export demo data for the frontend (docs/, served by GitHub Pages), using the model's forecast
.venv/bin/python frontend/export.py --data data --out docs/data.json
