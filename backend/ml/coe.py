"""Catch-Over-Expected (COE) leaderboard.

For each targeted pass we have an expected catch probability (p_catch) from the
model. COE sums (actual - expected) per receiver: positive means they catch more
than a model expects given the situation (separation, depth, pressure, etc.).

Produces coe_leaderboard.json:
  [{nfl_id, name, position, targets, catches, expected, coe, coe_per_target, avg_sep}]
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config

MIN_TARGETS = 8


def _write(name: str, obj) -> None:
    path = config.ML_OUT / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    print(f"  wrote {path}")


def _first_str(s: pd.Series) -> str:
    s = s.dropna()
    return str(s.iloc[0]) if len(s) else ""


def build(df: pd.DataFrame, p_catch: np.ndarray) -> list[dict]:
    d = df.copy()
    d = d.reset_index(drop=True)
    d["p_catch"] = np.asarray(p_catch, dtype=float)

    rows: list[dict] = []
    for nid, g in d.groupby("targetNflId"):
        targets = int(len(g))
        if targets < MIN_TARGETS:
            continue
        catches = int(pd.to_numeric(g["complete"], errors="coerce").fillna(0).sum())
        expected = float(g["p_catch"].sum())
        coe = catches - expected
        sep = pd.to_numeric(g["sep_nearest"], errors="coerce").dropna()
        rows.append({
            "nfl_id": int(nid),
            "name": _first_str(g["displayName"]),
            "position": _first_str(g["officialPosition"]),
            "targets": targets,
            "catches": catches,
            "expected": round(expected, 3),
            "coe": round(coe, 3),
            "coe_per_target": round(coe / targets, 4),
            "avg_sep": round(float(sep.mean()), 3) if len(sep) else 0.0,
        })
    rows.sort(key=lambda r: r["coe"], reverse=True)
    return rows


def run(df: pd.DataFrame, p_catch: np.ndarray) -> None:
    config.ensure_dirs()
    _write("coe_leaderboard.json", build(df, p_catch))
