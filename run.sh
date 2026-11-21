#!/usr/bin/env bash
# Run the whole pipeline: set up environment, then run each step in order.
# Usage: ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -r requirements.txt

# 1. Generate synthetic data
.venv/bin/python simulator/simulate.py --out data

# 2. Simulate users answering the one-tap questions -> data/labels.csv (model labels)
.venv/bin/python collection/simulate_answers.py --data data

# 3. Export demo data for the frontend (docs/, served by GitHub Pages)
.venv/bin/python frontend/export.py --data data --out docs/data.json

# 4. Train the shared watch-only base model (next day) -> data/model_base.txt, data/base_oof.csv
.venv/bin/python model/base.py --data data
