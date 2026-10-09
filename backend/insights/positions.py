"""Position-group insights derived from the shared features table.

Produces positions.json:
  {
    summary: [{position, targets, catch_rate, median_depth, median_sep,
               median_time_to_throw}],
    by_depth: [{position, depth_band, plays, catch_rate}]
  }
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config

# Depth bands in yards past the line of scrimmage.
DEPTH_BANDS = [
    ("behind_los", -float("inf"), 0.0),
    ("short", 0.0, 10.0),
    ("intermediate", 10.0, 20.0),
    ("deep", 20.0, float("inf")),
]

MIN_TARGETS = 10


def _med(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    return round(float(s.median()), 3) if len(s) else 0.0


def _rate(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    return round(float(s.mean()), 4) if len(s) else 0.0


def summary(df: pd.DataFrame) -> list[dict]:
    rows: list[dict] = []
    for pos, g in df.groupby(df["officialPosition"].fillna("")):
        if str(pos) == "" or len(g) < MIN_TARGETS:
            continue
        rows.append({
            "position": str(pos),
            "targets": int(len(g)),
            "catch_rate": _rate(g["complete"]),
            "median_depth": _med(g["depth"]),
            "median_sep": _med(g["sep_nearest"]),
            "median_time_to_throw": _med(g["time_to_throw"]),
        })
    rows.sort(key=lambda r: r["targets"], reverse=True)
    return rows


def _depth_band(v: float) -> str:
    if pd.isna(v):
        return "unknown"
    for name, lo, hi in DEPTH_BANDS:
        if lo <= v < hi:
            return name
    return "unknown"


def by_depth(df: pd.DataFrame) -> list[dict]:
    d = df.copy()
    d["depth_band"] = pd.to_numeric(d["depth"], errors="coerce").map(_depth_band)
    d["position"] = d["officialPosition"].fillna("")

    # Keep only positions that pass the min-targets bar in the summary.
    keep = {r["position"] for r in summary(df)}
    rows: list[dict] = []
    for (pos, band), g in d.groupby(["position", "depth_band"]):
        if str(pos) not in keep or band == "unknown":
            continue
        rows.append({
            "position": str(pos),
            "depth_band": str(band),
            "plays": int(len(g)),
            "catch_rate": _rate(g["complete"]),
        })
    # Stable ordering: position, then band order.
    band_order = {name: i for i, (name, _, _) in enumerate(DEPTH_BANDS)}
    rows.sort(key=lambda r: (r["position"], band_order.get(r["depth_band"], 99)))
    return rows


def run(df: pd.DataFrame) -> None:
    config.ensure_dirs()
    obj = {"summary": summary(df), "by_depth": by_depth(df)}
    path = config.INSIGHTS_OUT / "positions.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    print(f"  wrote {path}")
