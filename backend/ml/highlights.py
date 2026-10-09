"""Highlight plays + per-play tracking JSON for the frontend field viewer.

Produces:
  highlight_plays.json: {impossible_catches:[P], missed_chances:[P]}
    P = {game_id, play_id, name, position, p_catch, sep_nearest, depth, description}
    - impossible_catches: completed passes with the LOWEST model p_catch
      (caught despite long odds).
    - missed_chances: incomplete passes with the HIGHEST model p_catch
      (should have been caught).

  plays/play_<gameId>_<playId>.json: full tracking frames for the field viewer:
    {game_id, play_id, description, p_catch, result, throw_frame,
     frames:[{frame_id, ball:{x,y},
              players:[{nfl_id, jersey, team, x, y, is_offense, is_target}]}]}
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config
import index
from common import clean, features as feat_mod

N_HIGHLIGHTS = 12


def _first_str(s: pd.Series) -> str:
    s = s.dropna()
    return str(s.iloc[0]) if len(s) else ""


def _play_record(row: pd.Series) -> dict:
    return {
        "game_id": int(row["gameId"]),
        "play_id": int(row["playId"]),
        "name": str(row.get("displayName", "") or ""),
        "position": str(row.get("officialPosition", "") or ""),
        "p_catch": round(float(row["p_catch"]), 4),
        "sep_nearest": _round(row.get("sep_nearest")),
        "depth": _round(row.get("depth")),
        "description": str(row.get("playDescription", "") or ""),
    }


def _round(v, nd=3):
    try:
        if pd.isna(v):
            return None
        return round(float(v), nd)
    except (TypeError, ValueError):
        return None


def select_highlights(df: pd.DataFrame, p_catch: np.ndarray) -> dict:
    d = df.reset_index(drop=True).copy()
    d["p_catch"] = np.asarray(p_catch, dtype=float)

    completed = d[d["complete"] == 1].sort_values("p_catch", ascending=True)
    incomplete = d[d["complete"] == 0].sort_values("p_catch", ascending=False)

    impossible = [_play_record(r) for _, r in completed.head(N_HIGHLIGHTS).iterrows()]
    missed = [_play_record(r) for _, r in incomplete.head(N_HIGHLIGHTS).iterrows()]
    return {"impossible_catches": impossible, "missed_chances": missed}


def _write_json(path, obj) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)


def _play_tracking_json(play_df: pd.DataFrame, play_row, meta: dict,
                        target_id: int) -> dict:
    off_team, _ = feat_mod._offense_defense_teams(play_df, play_row)
    events = clean.event_frames(play_df)
    max_frame = int(play_df["frameId"].max())
    throw_f = clean.throw_frame_id(events, max_frame)

    frames: list[dict] = []
    for fid, grp in play_df.groupby("frameId"):
        ball = None
        players: list[dict] = []
        for r in grp.itertuples(index=False):
            if r.team == config.FOOTBALL:
                ball = {"x": _f(r.x), "y": _f(r.y)}
                continue
            nid = int(r.nflId) if not pd.isna(r.nflId) else None
            players.append({
                "nfl_id": nid,
                "jersey": _jersey(r.jerseyNumber),
                "team": str(r.team) if not pd.isna(r.team) else "",
                "x": _f(r.x),
                "y": _f(r.y),
                "is_offense": bool(r.team == off_team),
                "is_target": bool(nid is not None and nid == target_id),
            })
        frames.append({
            "frame_id": int(fid),
            "ball": ball if ball is not None else {"x": None, "y": None},
            "players": players,
        })

    result = "complete" if str(play_row.passResult) == config.PASS_COMPLETE else "incomplete"
    return {
        "game_id": meta["game_id"],
        "play_id": meta["play_id"],
        "description": meta["description"],
        "p_catch": meta["p_catch"],
        "result": result,
        "throw_frame": int(throw_f),
        "frames": frames,
    }


def _f(v):
    try:
        if pd.isna(v):
            return None
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def _jersey(v):
    try:
        if pd.isna(v):
            return None
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _clear_play_files() -> int:
    """Remove stale play_*.json files so the directory matches the current run."""
    removed = 0
    for old in config.PLAYS_OUT.glob("play_*.json"):
        old.unlink()
        removed += 1
    return removed


def _export_play_files(highlights: dict, df: pd.DataFrame, p_catch: np.ndarray) -> None:
    """Write a tracking JSON for every highlighted play by re-reading tracking."""
    removed = _clear_play_files()
    print(f"  cleared {removed} stale play files from {config.PLAYS_OUT}")
    d = df.reset_index(drop=True).copy()
    d["p_catch"] = np.asarray(p_catch, dtype=float)

    wanted: dict[tuple[int, int], dict] = {}
    for rec in highlights["impossible_catches"] + highlights["missed_chances"]:
        wanted[(rec["game_id"], rec["play_id"])] = rec

    # Map play -> target nflId and p_catch from the feature table.
    key_to_target: dict[tuple[int, int], int] = {}
    for _, r in d.iterrows():
        key_to_target[(int(r["gameId"]), int(r["playId"]))] = int(r["targetNflId"])

    plays = index.load_plays().set_index(["gameId", "playId"], drop=False)

    # Group wanted plays by game so we read each tracking file at most once.
    by_game: dict[int, list[tuple[int, int]]] = {}
    for (gid, pid) in wanted:
        by_game.setdefault(gid, []).append((gid, pid))

    for gid, keys in by_game.items():
        path = config.TRACKING_DIR / f"tracking_{gid}.csv"
        if not path.exists():
            print(f"  WARN missing tracking file for game {gid}")
            continue
        tdf = clean.load_tracking_file(path)
        for (g, pid) in keys:
            play_df = tdf[(tdf["gameId"] == g) & (tdf["playId"] == pid)]
            if play_df.empty or (g, pid) not in plays.index:
                continue
            play_row = plays.loc[(g, pid)]
            if isinstance(play_row, pd.DataFrame):
                play_row = play_row.iloc[0]
            rec = wanted[(g, pid)]
            meta = {
                "game_id": g,
                "play_id": pid,
                "description": rec["description"],
                "p_catch": rec["p_catch"],
            }
            target_id = key_to_target.get((g, pid), -1)
            obj = _play_tracking_json(play_df, play_row, meta, target_id)
            out = config.PLAYS_OUT / f"play_{g}_{pid}.json"
            _write_json(out, obj)
    print(f"  wrote {len(wanted)} play tracking files -> {config.PLAYS_OUT}")


def run(df: pd.DataFrame, p_catch: np.ndarray) -> None:
    config.ensure_dirs()
    highlights = select_highlights(df, p_catch)
    _write_json(config.ML_OUT / "highlight_plays.json", highlights)
    print(f"  wrote {config.ML_OUT / 'highlight_plays.json'}")
    _export_play_files(highlights, df, p_catch)
