"""Coverage-type helpers shared across insight modules.

Normalizes the free-text pff_passCoverageType into clean 'man'/'zone' buckets
and offers simple coverage-level aggregates. The man-vs-zone leaderboard itself
lives in seperation.py (part of the separation contract); this module provides
the reusable normalization so both modules agree on what counts as man vs zone.
"""
from __future__ import annotations

import pandas as pd


def normalize_coverage(series: pd.Series) -> pd.Series:
    """Return a Series of 'man' / 'zone' / 'other'."""
    s = series.fillna("").astype(str).str.strip().str.lower()
    out = s.where(s.isin(["man", "zone"]), other="other")
    return out


def coverage_summary(df: pd.DataFrame) -> list[dict]:
    """Catch rate and avg separation per coverage bucket."""
    cov = normalize_coverage(df["pff_passCoverageType"])
    rows = []
    for name, g in df.groupby(cov):
        comp = pd.to_numeric(g["complete"], errors="coerce").dropna()
        sep = pd.to_numeric(g["sep_nearest"], errors="coerce").dropna()
        rows.append({
            "coverage": str(name),
            "plays": int(len(g)),
            "catch_rate": round(float(comp.mean()), 4) if len(comp) else 0.0,
            "avg_sep": round(float(sep.mean()), 3) if len(sep) else 0.0,
        })
    rows.sort(key=lambda r: r["plays"], reverse=True)
    return rows
