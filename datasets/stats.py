"""Summary statistics from the reference datasets, used to calibrate simulator/simulate.py.

Nothing is written to disk: files are streamed from Kaggle's public download
API straight into memory (~6 MB). mBrain21 is 48 GB in total, but its headache
diaries live in four small event_dump.csv files, which is all we read.

  - jonvdrdo/mbrain21: metadata/MBRAIN21-00{1..4}/event_dump.csv
  - hebaqueen/migraine-dataset-from-wearable-devices: the single daily CSV

Usage:
  python datasets/stats.py
"""

import argparse
import ast
import collections
import io
import urllib.parse
import urllib.request
import zipfile

import pandas as pd


API = "https://www.kaggle.com/api/v1/datasets/download"


def kaggle_csv(dataset, file_name=None, **kw):
    url = f"{API}/{dataset}"
    if file_name:
        url += "?fileName=" + urllib.parse.quote(file_name, safe="")
    with urllib.request.urlopen(url) as r:
        buf = io.BytesIO(r.read())
    if zipfile.is_zipfile(buf):  # Kaggle zips all but the smallest files
        with zipfile.ZipFile(buf) as z:
            buf = io.BytesIO(z.read(z.namelist()[0]))
    return pd.read_csv(buf, **kw)


def mbrain():
    for i in range(1, 5):
        name = f"MBRAIN21-00{i}"
        d = kaggle_csv("jonvdrdo/mbrain21", f"metadata/{name}/event_dump.csv", low_memory=False)
        d = d[d["deprecated"].isna()]
        span = (pd.to_datetime(d["time"], unit="ms").max() - pd.to_datetime(d["time"], unit="ms").min()).days
        hd = d[d["type"] == "headache"]
        start = pd.to_datetime(hd["time"], unit="ms")
        dur_h = (pd.to_datetime(hd["endTime"], unit="ms", errors="coerce") - start).dt.total_seconds() / 3600
        hdays = start.dt.normalize().nunique()
        diary = (d["type"] == "daily-record").sum()
        triggers = collections.Counter(
            x["name_en"] for s in hd["triggers"].dropna() for x in ast.literal_eval(s) if x.get("isChecked"))
        print(f"{name}: {span} days, {hdays} headache days ({hdays / span * 30:.1f}/month), "
              f"median duration {dur_h.median():.1f} h, diary filled {diary / span:.0%} of days")
        print(f"  intensity (1-5): {hd['intensity'].value_counts().sort_index().to_dict()}")
        print(f"  onset hour median: {start.dt.hour.median():.0f}")
        print(f"  top triggers: {dict(triggers.most_common(5))}")


def heba():
    h = kaggle_csv("hebaqueen/migraine-dataset-from-wearable-devices")
    per_user = h.groupby("user_id")["migraine_occurrence"].mean() * 30
    print(f"\nheba: {h['user_id'].nunique()} users, {len(h)} days")
    print(f"  sleep_hours mean {h['sleep_hours'].mean():.2f} sd {h['sleep_hours'].std():.2f}; "
          f"on migraine days {h.loc[h['migraine_occurrence'] == 1, 'sleep_hours'].mean():.2f} "
          f"vs {h.loc[h['migraine_occurrence'] == 0, 'sleep_hours'].mean():.2f}")
    print(f"  migraine days/month per user: median {per_user.median():.1f} "
          f"(implausibly high - dataset looks synthetic itself)")
    print(f"  severity (1-3) on migraine days: "
          f"{h.loc[h['migraine_occurrence'] == 1, 'migraine_severity'].value_counts(normalize=True).sort_index().round(2).to_dict()}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.parse_args()
    mbrain()
    heba()


if __name__ == "__main__":
    main()
