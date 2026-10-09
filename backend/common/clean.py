"""Tracking-data cleaning and normalization helpers.

Tracking frames are large (one CSV per game, ~90k rows each). We read them one
game at a time and normalize orientation so every play moves left->right. This
makes geometric features (depth, direction) consistent regardless of which way
the offense was driving.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

import config

_NA_TOKENS = {"NA", "N/A", "None", "", "nan"}


def tracking_files() -> list[Path]:
    files = sorted(config.TRACKING_DIR.glob("tracking_*.csv"))
    if config.MAX_TRACKING_FILES is not None:
        files = files[: config.MAX_TRACKING_FILES]
    return files


def load_tracking_file(path: Path) -> pd.DataFrame:
    """Load one tracking CSV and normalize so all plays go left->right.

    After normalization, x increases in the direction of offensive travel, so a
    receiver "downfield" has larger x than at the snap. y is mirrored to match.
    """
    df = pd.read_csv(path, na_values=list(_NA_TOKENS), keep_default_na=True)
    df["gameId"] = df["gameId"].astype("int64")
    df["playId"] = df["playId"].astype("int64")
    df["frameId"] = df["frameId"].astype("int64")
    df["nflId"] = pd.to_numeric(df["nflId"], errors="coerce").astype("Int64")

    for col in ("x", "y", "s", "a", "dis", "o", "dir"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["team"] = df["team"].astype("string")
    df["event"] = df["event"].astype("string")

    # Normalize direction: flip plays going left so everything faces right.
    left = df["playDirection"] == "left"
    df.loc[left, "x"] = 120.0 - df.loc[left, "x"]
    df.loc[left, "y"] = config.FIELD_WIDTH - df.loc[left, "y"]
    # Angles (o, dir) are measured clockwise from north; mirror by 180 - a mod 360.
    for col in ("o", "dir"):
        df.loc[left, col] = (180.0 - df.loc[left, col]) % 360.0

    return df


def event_frames(play_df: pd.DataFrame) -> dict[str, int]:
    """Return {event_name: frameId} for the first occurrence of each event."""
    ev = play_df.dropna(subset=["event"])
    ev = ev[ev["event"] != "None"]
    out: dict[str, int] = {}
    for name, grp in ev.groupby("event"):
        out[str(name)] = int(grp["frameId"].min())
    return out


def throw_frame_id(events: dict[str, int], max_frame: int) -> int:
    """Best available 'ball thrown' frame."""
    for key in (config.EV_PASS_FORWARD, "autoevent_passforward"):
        if key in events:
            return events[key]
    if config.EV_SNAP in events:
        return events[config.EV_SNAP]
    return min(max_frame, 1)


def arrival_frame_id(events: dict[str, int], max_frame: int) -> int:
    """Best available 'ball arrives at receiver' frame."""
    for key in (config.EV_PASS_ARRIVED, config.EV_CAUGHT,
                config.EV_INCOMPLETE, "pass_outcome_interception"):
        if key in events:
            return events[key]
    return max_frame
