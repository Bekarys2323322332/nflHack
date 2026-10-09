"""Separation insights derived from the shared features table.

Produces three contract outputs:
  separation_leaderboard.json
  separation_curve.json
  man_vs_zone.json
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config

MIN_TARGETS = 8  # minimum targets to appear on a leaderboard


def _write(name: str, obj) -> None:
    path = config.INSIGHTS_OUT / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    print(f"  wrote {path}")


def separation_leaderboard(df: pd.DataFrame) -> list[dict]:
    """Per-receiver average separation and catch rate (min targets filter)."""
    rows: list[dict] = []
    for nid, g in df.groupby("targetNflId"):
        targets = int(len(g))
        if targets < MIN_TARGETS:
            continue
        rows.append({
            "nfl_id": int(nid),
            "name": _first_str(g["displayName"]),
            "position": _first_str(g["officialPosition"]),
            "targets": targets,
            "catch_rate": _rate(g["complete"]),
            "avg_sep": _mean(g["sep_nearest"]),
            "avg_release_speed": _mean(g["release_speed"]),
        })
    rows.sort(key=lambda r: r["avg_sep"], reverse=True)
    return rows


def separation_curve(df: pd.DataFrame) -> list[dict]:
    """Catch rate as a function of separation band."""
    bands = [
        ("0-1", 0.0, 1.0),
        ("1-2", 1.0, 2.0),
        ("2-3", 2.0, 3.0),
        ("3-4", 3.0, 4.0),
        ("4-6", 4.0, 6.0),
        ("6+", 6.0, float("inf")),
    ]
    out: list[dict] = []
    sep = df["sep_nearest"]
    for label, lo, hi in bands:
        mask = (sep >= lo) & (sep < hi)
        sub = df[mask]
        if len(sub) == 0:
            out.append({"band": label, "plays": 0, "catch_rate": 0.0})
        else:
            out.append({
                "band": label,
                "plays": int(len(sub)),
                "catch_rate": _rate(sub["complete"]),
            })
    return out


def man_vs_zone(df: pd.DataFrame) -> list[dict]:
    """Per-receiver separation split by man vs zone coverage."""
    cov = df["pff_passCoverageType"].fillna("")
    is_man = cov.str.strip().str.lower() == "man"
    is_zone = cov.str.strip().str.lower() == "zone"

    rows: list[dict] = []
    for nid, g in df.groupby("targetNflId"):
        gm = g[is_man.loc[g.index]]
        gz = g[is_zone.loc[g.index]]
        tm, tz = len(gm), len(gz)
        if tm + tz < MIN_TARGETS or tm == 0 or tz == 0:
            continue
        sep_man = _mean(gm["sep_nearest"])
        sep_zone = _mean(gz["sep_nearest"])
        rows.append({
            "nfl_id": int(nid),
            "name": _first_str(g["displayName"]),
            "position": _first_str(g["officialPosition"]),
            "sep_man": sep_man,
            "sep_zone": sep_zone,
            "diff": round(sep_man - sep_zone, 3),
            "targets_man": int(tm),
            "targets_zone": int(tz),
        })
    rows.sort(key=lambda r: r["diff"], reverse=True)
    return rows


# --- helpers ---------------------------------------------------------------
def _rate(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    return round(float(s.mean()), 4) if len(s) else 0.0


def _mean(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    return round(float(s.mean()), 3) if len(s) else 0.0


def _first_str(s: pd.Series) -> str:
    s = s.dropna()
    return str(s.iloc[0]) if len(s) else ""


def run(df: pd.DataFrame) -> None:
    config.ensure_dirs()
    _write("separation_leaderboard.json", separation_leaderboard(df))
    _write("separation_curve.json", separation_curve(df))
    _write("man_vs_zone.json", man_vs_zone(df))
