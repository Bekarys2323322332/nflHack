"""Loaders for the static (non-tracking) CSVs: games, players, plays, pff.

Each loader normalizes dtypes and NA handling so downstream code can rely on
consistent types. These frames are small and are cached in-process.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd

import config


_NA_TOKENS = {"NA", "N/A", "None", "", "nan"}


def _to_num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


@lru_cache(maxsize=1)
def load_games() -> pd.DataFrame:
    df = pd.read_csv(config.GAMES_CSV)
    df["gameId"] = df["gameId"].astype("int64")
    return df


@lru_cache(maxsize=1)
def load_players() -> pd.DataFrame:
    df = pd.read_csv(config.PLAYERS_CSV)
    df["nflId"] = _to_num(df["nflId"]).astype("Int64")
    df["displayName"] = df["displayName"].astype("string")
    df["officialPosition"] = df["officialPosition"].astype("string")
    return df


@lru_cache(maxsize=1)
def load_plays() -> pd.DataFrame:
    df = pd.read_csv(config.PLAYS_CSV, na_values=list(_NA_TOKENS), keep_default_na=True)
    df["gameId"] = df["gameId"].astype("int64")
    df["playId"] = df["playId"].astype("int64")
    for col in ("down", "yardsToGo", "defendersInBox", "quarter"):
        if col in df.columns:
            df[col] = _to_num(df[col])
    for col in ("passResult", "pff_passCoverage", "pff_passCoverageType",
                "offenseFormation", "dropBackType", "playDescription"):
        if col in df.columns:
            df[col] = df[col].astype("string")
    return df


@lru_cache(maxsize=1)
def load_pff() -> pd.DataFrame:
    df = pd.read_csv(config.PFF_CSV, na_values=list(_NA_TOKENS), keep_default_na=True)
    df["gameId"] = df["gameId"].astype("int64")
    df["playId"] = df["playId"].astype("int64")
    df["nflId"] = _to_num(df["nflId"]).astype("Int64")
    for col in ("pff_role", "pff_positionLinedUp"):
        if col in df.columns:
            df[col] = df[col].astype("string")
    return df


@lru_cache(maxsize=1)
def player_lookup() -> dict[int, dict]:
    """nflId -> {name, position}."""
    players = load_players()
    out: dict[int, dict] = {}
    for row in players.itertuples(index=False):
        if pd.isna(row.nflId):
            continue
        out[int(row.nflId)] = {
            "name": str(row.displayName) if not pd.isna(row.displayName) else "",
            "position": str(row.officialPosition) if not pd.isna(row.officialPosition) else "",
        }
    return out
