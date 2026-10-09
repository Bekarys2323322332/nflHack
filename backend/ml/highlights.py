"""Export play files for the frontend simulation.

Plays are chosen from the TEST set only (weeks in config.TEST_WEEKS), so every
p_catch shown came from a model that never saw that game:
  impossible_catch  10 lowest-p_catch completions
  missed_chance     10 highest-p_catch incompletions
  interception      all interceptions, up to 15
  normal            40 random remaining plays (fixed seed)

Produces:
  play_index.json  [{game_id, play_id, name, position, result, result_label,
                     p_catch, category, description, down, yards_to_go, coverage}]
  plays/play_<gameId>_<playId>.json
                   {game_id, play_id, description, result, result_label,
                    p_catch, throw_frame, line_of_scrimmage_x,
                    receiver: {nfl_id, name, position, jersey},
                    options: [{nfl_id, name, jersey, p_catch}],
                    frames: [{frame_id, ball: {x, y},
                              players: [{nfl_id, jersey, team, x, y,
                                         is_offense, is_target}]}]}
  highlight_plays.json  kept for the original data contract

Frames run from the snap frame to the throw frame inclusive, with play
direction standardized left->right by clean.load_tracking_file.

options: at the throw frame, the same features are recomputed for every route
runner on the play as if he had been the target, then scored with the saved
model.joblib. This shows who the best available option was.
"""
from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd

import config
import index
from common import clean, features as feat_mod
from ml.train import MODEL_FEATURES

N_IMPOSSIBLE = 10
N_MISSED = 10
N_INTERCEPTIONS = 15
N_NORMAL = 40

RESULT_LABELS = {"C": "Caught", "I": "Incomplete", "IN": "Intercepted"}


# --- small helpers ---------------------------------------------------------
def _write_json(path, obj) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)


def _f(v, nd=2):
    try:
        if pd.isna(v):
            return None
        return round(float(v), nd)
    except (TypeError, ValueError):
        return None


def _int(v):
    try:
        if pd.isna(v):
            return None
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _s(v) -> str:
    return "" if pd.isna(v) else str(v)


# --- selection -------------------------------------------------------------
def select_plays(df: pd.DataFrame, p_catch: np.ndarray) -> pd.DataFrame:
    """Pick the simulation plays from the test split. Returns a frame with a
    'category' column, one row per chosen play."""
    d = df.reset_index(drop=True).copy()
    d["p_catch"] = np.asarray(p_catch, dtype=float)

    if "split" in d.columns:
        d = d[d["split"] == "test"].copy()
    else:
        print("  WARN no split column; selecting from all plays")

    # passResult drives the result / result_label fields and the categories.
    plays = index.load_plays()[["gameId", "playId", "passResult",
                                "pff_passCoverage", "pff_passCoverageType"]]
    d = d.merge(plays, on=["gameId", "playId"], how="left")
    d["passResult"] = d["passResult"].astype("string").fillna("")

    chosen: list[pd.DataFrame] = []
    used: set[tuple[int, int]] = set()

    def take(subset: pd.DataFrame, category: str, n: int) -> None:
        keys = [(int(r.gameId), int(r.playId)) for r in subset.itertuples()]
        mask = [k not in used for k in keys]
        sub = subset[mask].head(n).copy()
        if sub.empty:
            return
        sub["category"] = category
        used.update((int(r.gameId), int(r.playId)) for r in sub.itertuples())
        chosen.append(sub)

    take(d[d["passResult"] == "C"].sort_values("p_catch", ascending=True),
         "impossible_catch", N_IMPOSSIBLE)
    take(d[d["passResult"] == "I"].sort_values("p_catch", ascending=False),
         "missed_chance", N_MISSED)
    take(d[d["passResult"] == "IN"].sort_values("p_catch", ascending=False),
         "interception", N_INTERCEPTIONS)

    rest = d[[(int(r.gameId), int(r.playId)) not in used for r in d.itertuples()]]
    if not rest.empty:
        rng = np.random.default_rng(config.RANDOM_SEED)
        k = min(N_NORMAL, len(rest))
        pick = rng.choice(len(rest), size=k, replace=False)
        take(rest.iloc[np.sort(pick)], "normal", k)

    out = pd.concat(chosen, ignore_index=True) if chosen else d.head(0).copy()
    return out


def _index_record(row) -> dict:
    result = _s(row.passResult)
    coverage = _s(getattr(row, "pff_passCoverage", "")) or _s(
        getattr(row, "pff_passCoverageType", ""))
    return {
        "game_id": int(row.gameId),
        "play_id": int(row.playId),
        "name": _s(row.displayName),
        "position": _s(row.officialPosition),
        "result": result,
        "result_label": RESULT_LABELS.get(result, result),
        "p_catch": round(float(row.p_catch), 4),
        "category": str(row.category),
        "description": _s(row.playDescription),
        "down": _int(row.down),
        "yards_to_go": _int(row.yardsToGo),
        "coverage": coverage,
    }


# --- per-play export -------------------------------------------------------
def _load_model():
    if not config.MODEL_JOBLIB.exists():
        print(f"  WARN {config.MODEL_JOBLIB} missing; options will be empty")
        return None
    return joblib.load(config.MODEL_JOBLIB)


def _options(play_df: pd.DataFrame, play_row, pff_play, model,
             off_team: str) -> list[dict]:
    """Score every route runner on the play as if he had been the target."""
    if model is None:
        return []
    cands = feat_mod.route_candidates(play_df, pff_play, off_team)
    if not cands:
        return []

    jerseys = _jersey_map(play_df)
    rows, meta = [], []
    for nid, name in cands:
        try:
            f = feat_mod.extract_play(play_df, play_row, pff_play, nid)
        except Exception:
            f = None
        if f is None:
            continue
        rows.append({c: f.get(c, np.nan) for c in MODEL_FEATURES})
        meta.append((nid, name))
    if not rows:
        return []

    X = pd.DataFrame(rows, columns=MODEL_FEATURES).apply(pd.to_numeric, errors="coerce")
    try:
        probs = model.predict_proba(X)[:, 1]
    except Exception as exc:
        print(f"  WARN options prediction failed: {exc}")
        return []

    opts = [{"nfl_id": int(nid), "name": name,
             "jersey": jerseys.get(int(nid)), "p_catch": round(float(p), 4)}
            for (nid, name), p in zip(meta, probs)]
    opts.sort(key=lambda o: o["p_catch"], reverse=True)
    return opts


def _jersey_map(play_df: pd.DataFrame) -> dict[int, int | None]:
    out: dict[int, int | None] = {}
    sub = play_df.dropna(subset=["nflId"])
    for nid, grp in sub.groupby("nflId"):
        out[int(nid)] = _int(grp["jerseyNumber"].iloc[0])
    return out


def _play_file(play_df: pd.DataFrame, play_row, rec: dict, target_id: int,
               model) -> dict | None:
    """Build the per-play JSON: snap->throw frames plus receiver and options."""
    events = clean.event_frames(play_df)
    max_frame = int(play_df["frameId"].max())
    throw_f, _ = feat_mod.throw_frame_id(events, max_frame)
    snap_f = events.get(config.EV_SNAP, throw_f)
    if snap_f > throw_f:
        snap_f = throw_f

    off_team, _def_team = feat_mod._offense_defense_teams(play_df, play_row)

    los_x = None
    snap_ball = feat_mod._football_xy(play_df[play_df["frameId"] == snap_f])
    if snap_ball is not None:
        los_x = round(float(snap_ball[0]), 2)

    window = play_df[(play_df["frameId"] >= snap_f) & (play_df["frameId"] <= throw_f)]
    if window.empty:
        return None

    frames: list[dict] = []
    for fid, grp in window.groupby("frameId"):
        ball = {"x": None, "y": None}
        players: list[dict] = []
        for r in grp.itertuples(index=False):
            if r.team == config.FOOTBALL:
                ball = {"x": _f(r.x), "y": _f(r.y)}
                continue
            nid = _int(r.nflId)
            players.append({
                "nfl_id": nid,
                "jersey": _int(r.jerseyNumber),
                "team": _s(r.team),
                "x": _f(r.x),
                "y": _f(r.y),
                "is_offense": bool(r.team == off_team),
                "is_target": bool(nid is not None and nid == target_id),
            })
        frames.append({"frame_id": int(fid), "ball": ball, "players": players})

    pff = index.load_pff()
    pff_play = pff[(pff["gameId"] == rec["game_id"]) & (pff["playId"] == rec["play_id"])]

    jerseys = _jersey_map(play_df)
    info = index.player_lookup().get(target_id, {"name": "", "position": ""})

    return {
        "game_id": rec["game_id"],
        "play_id": rec["play_id"],
        "description": rec["description"],
        "result": rec["result"],
        "result_label": rec["result_label"],
        "p_catch": rec["p_catch"],
        "throw_frame": int(throw_f),
        "line_of_scrimmage_x": los_x,
        "receiver": {
            "nfl_id": int(target_id),
            "name": info["name"],
            "position": info["position"],
            "jersey": jerseys.get(int(target_id)),
        },
        "options": _options(play_df, play_row, pff_play, model, off_team),
        "frames": frames,
    }


def _clear_play_files() -> int:
    """Remove stale play_*.json files so the directory matches the current run."""
    removed = 0
    for old in config.PLAYS_OUT.glob("play_*.json"):
        old.unlink()
        removed += 1
    return removed


def export(selected: pd.DataFrame) -> list[dict]:
    """Write play_index.json and one JSON per selected play."""
    removed = _clear_play_files()
    print(f"  cleared {removed} stale play files from {config.PLAYS_OUT}")

    model = _load_model()
    plays = index.load_plays().set_index(["gameId", "playId"], drop=False)

    records = [_index_record(r) for r in selected.itertuples()]
    by_key = {(r["game_id"], r["play_id"]): r for r in records}
    targets = {(int(r.gameId), int(r.playId)): int(r.targetNflId)
               for r in selected.itertuples()}

    by_game: dict[int, list[int]] = {}
    for gid, pid in by_key:
        by_game.setdefault(gid, []).append(pid)

    written: set[tuple[int, int]] = set()
    for gid in sorted(by_game):
        path = config.TRACKING_DIR / f"tracking_{gid}.csv"
        if not path.exists():
            print(f"  WARN missing tracking file for game {gid}")
            continue
        tdf = clean.load_tracking_file(path)
        for pid in sorted(by_game[gid]):
            play_df = tdf[(tdf["gameId"] == gid) & (tdf["playId"] == pid)]
            if play_df.empty or (gid, pid) not in plays.index:
                continue
            play_row = plays.loc[(gid, pid)]
            if isinstance(play_row, pd.DataFrame):
                play_row = play_row.iloc[0]
            obj = _play_file(play_df, play_row, by_key[(gid, pid)],
                             targets[(gid, pid)], model)
            if obj is None:
                continue
            _write_json(config.PLAYS_OUT / f"play_{gid}_{pid}.json", obj)
            written.add((gid, pid))

    # Index only advertises plays whose file actually exists.
    final = [r for r in records if (r["game_id"], r["play_id"]) in written]
    _write_json(config.ML_OUT / "play_index.json", final)
    print(f"  wrote {config.ML_OUT / 'play_index.json'} ({len(final)} plays)")
    print(f"  wrote {len(written)} play files -> {config.PLAYS_OUT}")

    counts = pd.Series([r["category"] for r in final]).value_counts().to_dict()
    opt_counts = []
    for r in final:
        p = config.PLAYS_OUT / f"play_{r['game_id']}_{r['play_id']}.json"
        opt_counts.append(len(json.loads(p.read_text(encoding="utf-8"))["options"]))
    print("  categories: " + "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    if opt_counts:
        print(f"  options per play: min={min(opt_counts)} "
              f"median={int(np.median(opt_counts))} max={max(opt_counts)} "
              f"(empty on {sum(1 for c in opt_counts if c == 0)} plays)")
    return final


def _legacy_highlights(selected: pd.DataFrame) -> None:
    """Keep highlight_plays.json from the original data contract."""
    def recs(category: str) -> list[dict]:
        sub = selected[selected["category"] == category]
        return [{
            "game_id": int(r.gameId),
            "play_id": int(r.playId),
            "name": _s(r.displayName),
            "position": _s(r.officialPosition),
            "p_catch": round(float(r.p_catch), 4),
            "sep_nearest": _f(r.sep_nearest, 3),
            "depth": _f(r.depth, 3),
            "description": _s(r.playDescription),
        } for r in sub.itertuples()]

    obj = {"impossible_catches": recs("impossible_catch"),
           "missed_chances": recs("missed_chance")}
    _write_json(config.ML_OUT / "highlight_plays.json", obj)
    print(f"  wrote {config.ML_OUT / 'highlight_plays.json'}")


def run(df: pd.DataFrame, p_catch: np.ndarray) -> None:
    config.ensure_dirs()
    selected = select_plays(df, p_catch)
    if selected.empty:
        print("  WARN no plays selected")
        return
    _legacy_highlights(selected)
    export(selected)
