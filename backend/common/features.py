"""Build the shared feature table: one row per targeted pass.

Output: backend/outputs/common/features.csv with columns (exact, snake_case):
  gameId, playId, targetNflId, displayName, officialPosition, complete,
  down, yardsToGo, pff_passCoverageType, defendersInBox, playDescription,
  sep_nearest, sep_second, depth, sideline_dist, rec_speed, rec_accel,
  qb_dist, pressure_dist, time_to_throw, release_speed

The targeted receiver is read from playDescription ("... pass [incomplete]
short|deep left|middle|right to <NAME> ...") and matched by last name (first
initial breaks ties) to the play's offensive pff "Pass Route" players. Target
selection uses only the description, pff roles, players.csv names, and the
first (pre-snap) tracking frame for team; nothing after the throw. Plays with
no unique match are dropped. Separation is the distance from that receiver to
the nearest / second-nearest defender at arrival.
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

import config
import index
from common import clean

# Feature columns in exact contract order (after the identity/context block).
FEATURE_COLS = [
    "sep_nearest", "sep_second", "depth", "sideline_dist",
    "rec_speed", "rec_accel", "qb_dist", "pressure_dist",
    "time_to_throw", "release_speed",
]

OUTPUT_COLS = [
    "gameId", "playId", "targetNflId", "displayName", "officialPosition",
    "complete", "down", "yardsToGo", "pff_passCoverageType", "defendersInBox",
    "playDescription", *FEATURE_COLS,
]


# --- Target receiver from playDescription ----------------------------------
# Name runs from after "to " until the first stop: " to"/" for"/" pushed"/" ran"/
# " tackled", "[", " (" (defender in parens, e.g. "to C.Lamb (L.David)."), or a
# sentence-ending "." (period + space/end, but not the "St." in "A.St. Brown").
# "incomplete " is optional: incompletions read "pass incomplete deep right to".
_NAME_STOP = (
    r"(?=\s+(?:to|for|pushed|ran|tackled)\b|\s*\[|\s+\(|(?<!\bSt)\.(?:\s|$)|$)"
)
_TARGET_RE = re.compile(
    r"pass (?:incomplete )?(?:short|deep) (?:left|middle|right) to "
    r"(?P<name>.+?)" + _NAME_STOP
)
# Interceptions name the intended receiver instead:
#   "pass deep middle intended for R.Griffin INTERCEPTED by K.Dugger at NE 11."
_INTERCEPT_RE = re.compile(
    r"pass (?:incomplete )?(?:short|deep) (?:left|middle|right) intended for "
    r"(?P<name>.+?)(?=\s+INTERCEPTED\b)"
)
_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
ROUTE_ROLE = "Pass Route"  # exact casing in pffScoutingData.csv


def _norm(token: str) -> str:
    return re.sub(r"[^a-z]", "", token.lower())


def parse_target_name(description: str) -> str | None:
    """Return the raw receiver name from the description, e.g. 'A.St. Brown'.

    Tries the completed/incomplete "... to <NAME>" form first, then the
    interception "... intended for <NAME> INTERCEPTED" form.
    """
    text = description or ""
    for pattern in (_TARGET_RE, _INTERCEPT_RE):
        m = pattern.search(text)
        if m:
            return m.group("name").strip()
    return None


def _split_desc_name(name: str) -> tuple[str, list[str]]:
    """'A.St. Brown' -> ('a', ['st', 'brown']); 'Dj.Moore' -> ('dj', ['moore'])."""
    first, last = name.split(".", 1) if "." in name else ("", name)
    last_tokens = [t for t in (_norm(x) for x in last.split()) if t]
    return _norm(first), last_tokens


def _split_display(display_name: str) -> list[str]:
    toks = [t for t in (_norm(x) for x in display_name.split()) if t]
    while len(toks) > 1 and toks[-1] in _SUFFIXES:
        toks.pop()
    return toks


def match_target(name: str, candidates: list[tuple[int, str]]) -> tuple[int | None, str]:
    """Match a description name to (nflId, displayName) candidates.

    Last name must match; the first initial only breaks ties.
    Returns (nflId, "ok") or (None, reason).
    """
    initials, last = _split_desc_name(name)
    if not last:
        return None, "unparseable_name"
    k = len(last)
    hits = []
    for nid, disp in candidates:
        toks = _split_display(disp)
        if len(toks) > k and "".join(toks[-k:]) == "".join(last):
            hits.append((nid, toks))
    if not hits:
        return None, "no_last_name_match"
    if len(hits) > 1 and initials:
        hits = [h for h in hits if h[1][0].startswith(initials)]
    if len(hits) != 1:
        return None, "ambiguous" if hits else "no_initial_match"
    return hits[0][0], "ok"


def route_candidates(play_df: pd.DataFrame, pff_play: pd.DataFrame | None,
                     off_team: str) -> list[tuple[int, str]]:
    """Offensive pff 'Pass Route' players, with team checked on the first frame."""
    if pff_play is None or pff_play.empty:
        return []
    ids = {int(n) for n in pff_play.loc[pff_play["pff_role"] == ROUTE_ROLE, "nflId"].dropna()}
    first = play_df[play_df["frameId"] == play_df["frameId"].min()]
    offense = {int(n) for n in first.loc[first["team"] == off_team, "nflId"].dropna()}
    lookup = index.player_lookup()
    return [(nid, lookup.get(nid, {}).get("name", "")) for nid in sorted(ids & offense)]


def _dist(ax, ay, bx, by) -> float:
    return float(np.hypot(ax - bx, ay - by))


def _frame_slice(play_df: pd.DataFrame, frame_id: int) -> pd.DataFrame:
    return play_df[play_df["frameId"] == frame_id]


def _football_xy(frame: pd.DataFrame):
    fb = frame[frame["team"] == config.FOOTBALL]
    if fb.empty:
        return None
    r = fb.iloc[0]
    return float(r["x"]), float(r["y"])


def _offense_defense_teams(play_df: pd.DataFrame, play_row) -> tuple[str, str]:
    """Map possession/defensive team abbreviations to the tracking 'team' field.

    Tracking 'team' is the team abbreviation (e.g. 'TB','DAL'). plays.csv has
    possessionTeam / defensiveTeam abbreviations too.
    """
    teams = [t for t in play_df["team"].dropna().unique() if t != config.FOOTBALL]
    poss = str(play_row.possessionTeam)
    deff = str(play_row.defensiveTeam)
    off = poss if poss in teams else (teams[0] if teams else poss)
    deff = deff if deff in teams else (teams[1] if len(teams) > 1 else deff)
    return off, deff


def extract_play(play_df: pd.DataFrame, play_row, pff_play: pd.DataFrame,
                 target_id: int) -> dict | None:
    """Extract one feature row for a pass play whose target is already chosen."""
    events = clean.event_frames(play_df)
    max_frame = int(play_df["frameId"].max())

    throw_f = clean.throw_frame_id(events, max_frame)
    arrive_f = clean.arrival_frame_id(events, max_frame)
    snap_f = events.get(config.EV_SNAP, throw_f)

    off_team, def_team = _offense_defense_teams(play_df, play_row)

    arr = _frame_slice(play_df, arrive_f)
    tgt = arr[arr["nflId"] == target_id]
    if tgt.empty:
        return None
    target = tgt.iloc[0]
    tx, ty = float(target["x"]), float(target["y"])

    # Separation: distances to defenders at arrival.
    defs = arr[(arr["team"] == def_team) & arr["nflId"].notna()]
    if defs.empty:
        return None
    ddist = np.sort(np.hypot(defs["x"].to_numpy() - tx, defs["y"].to_numpy() - ty))
    sep_nearest = float(ddist[0])
    sep_second = float(ddist[1]) if len(ddist) > 1 else float("nan")

    # Depth: downfield distance from line of scrimmage (ball x at snap).
    snap_frame = _frame_slice(play_df, snap_f)
    snap_ball = _football_xy(snap_frame) or _football_xy(_frame_slice(play_df, throw_f))
    if snap_ball is None:
        return None
    los_x = snap_ball[0]
    depth = float(tx - los_x)

    sideline_dist = float(min(ty, config.FIELD_WIDTH - ty))

    rec_speed = float(target["s"]) if not pd.isna(target["s"]) else float("nan")
    rec_accel = float(target["a"]) if not pd.isna(target["a"]) else float("nan")

    # QB at throw frame -> distance from target to QB (pressure proxy context).
    throw_frame = _frame_slice(play_df, throw_f)
    qb_dist = float("nan")
    release_speed = float("nan")
    pressure_dist = float("nan")
    if not throw_frame.empty:
        qb_id = None
        if pff_play is not None and not pff_play.empty:
            qbs = pff_play[pff_play["pff_role"] == "Pass"]
            ids = [int(n) for n in qbs["nflId"].dropna().tolist()]
            if ids:
                qb_id = ids[0]
        qb_row = None
        if qb_id is not None:
            m = throw_frame[throw_frame["nflId"].astype("Int64") == qb_id]
            if not m.empty:
                qb_row = m.iloc[0]
        if qb_row is None:
            fb = _football_xy(throw_frame)
            if fb is not None:
                qbx, qby = fb
            else:
                qbx, qby = tx, ty
            release_speed = float("nan")
        else:
            qbx, qby = float(qb_row["x"]), float(qb_row["y"])
            release_speed = float(qb_row["s"]) if not pd.isna(qb_row["s"]) else float("nan")

        qb_dist = _dist(tx, ty, qbx, qby)

        # Pressure: nearest defender to the QB at throw.
        tdefs = throw_frame[(throw_frame["team"] == def_team) & throw_frame["nflId"].notna()]
        if not tdefs.empty:
            pd_arr = np.hypot(tdefs["x"].to_numpy() - qbx, tdefs["y"].to_numpy() - qby)
            pressure_dist = float(np.min(pd_arr))

    # time_to_throw: seconds between snap and throw (10 fps tracking).
    time_to_throw = float((throw_f - snap_f) / 10.0) if throw_f >= snap_f else float("nan")

    info = index.player_lookup().get(target_id, {"name": "", "position": ""})
    complete = 1 if str(play_row.passResult) == config.PASS_COMPLETE else 0

    return {
        "gameId": int(play_row.gameId),
        "playId": int(play_row.playId),
        "targetNflId": target_id,
        "displayName": info["name"],
        "officialPosition": info["position"],
        "complete": complete,
        "down": _num(play_row.down),
        "yardsToGo": _num(play_row.yardsToGo),
        "pff_passCoverageType": _str(play_row.pff_passCoverageType),
        "defendersInBox": _num(play_row.defendersInBox),
        "playDescription": _str(play_row.playDescription),
        "sep_nearest": round(sep_nearest, 3),
        "sep_second": round(sep_second, 3) if not np.isnan(sep_second) else np.nan,
        "depth": round(depth, 3),
        "sideline_dist": round(sideline_dist, 3),
        "rec_speed": round(rec_speed, 3) if not np.isnan(rec_speed) else np.nan,
        "rec_accel": round(rec_accel, 3) if not np.isnan(rec_accel) else np.nan,
        "qb_dist": round(qb_dist, 3) if not np.isnan(qb_dist) else np.nan,
        "pressure_dist": round(pressure_dist, 3) if not np.isnan(pressure_dist) else np.nan,
        "time_to_throw": round(time_to_throw, 3) if not np.isnan(time_to_throw) else np.nan,
        "release_speed": round(release_speed, 3) if not np.isnan(release_speed) else np.nan,
    }


def _num(v):
    try:
        if pd.isna(v):
            return np.nan
        return float(v)
    except (TypeError, ValueError):
        return np.nan


def _str(v):
    if pd.isna(v):
        return ""
    return str(v)


def is_pass_play(play_row, events: dict[str, int]) -> bool:
    """A play counts as a pass if there was a forward pass event."""
    if config.EV_PASS_FORWARD in events or "autoevent_passforward" in events:
        return True
    # Fallback on passResult being a pass outcome (complete/incomplete/int).
    return str(play_row.passResult) in {
        config.PASS_COMPLETE, config.PASS_INCOMPLETE, config.PASS_INTERCEPTION
    }


def build_features() -> pd.DataFrame:
    """Process all tracking files and write features.csv. Returns the frame."""
    config.ensure_dirs()
    plays = index.load_plays().set_index(["gameId", "playId"], drop=False)
    pff = index.load_pff()
    pff_by_play = {k: g for k, g in pff.groupby(["gameId", "playId"])}

    rows: list[dict] = []
    audit: list[dict] = []  # one entry per pass play: match outcome
    extract_failed = 0
    files = clean.tracking_files()
    for i, path in enumerate(files, 1):
        tdf = clean.load_tracking_file(path)
        for (gid, pid), play_df in tdf.groupby(["gameId", "playId"]):
            key = (int(gid), int(pid))
            if key not in plays.index:
                continue
            play_row = plays.loc[key]
            if isinstance(play_row, pd.DataFrame):
                play_row = play_row.iloc[0]
            events = clean.event_frames(play_df)
            if not is_pass_play(play_row, events):
                continue
            pff_play = pff_by_play.get(key)
            desc = _str(play_row.playDescription)

            name = parse_target_name(desc)
            if name is None:
                target_id, reason = None, "no_regex_match"
            else:
                off_team, _ = _offense_defense_teams(play_df, play_row)
                cands = route_candidates(play_df, pff_play, off_team)
                target_id, reason = (match_target(name, cands) if cands
                                     else (None, "no_route_runners"))
            audit.append({"gameId": key[0], "playId": key[1], "parsed": name,
                          "reason": reason, "description": desc})
            if target_id is None:
                continue

            try:
                row = extract_play(play_df, play_row, pff_play, target_id)
            except Exception:
                row = None
            if row is None:
                extract_failed += 1
                continue
            row["parsed_name"] = name
            rows.append(row)
        print(f"  [{i}/{len(files)}] {path.name}: {len(rows)} targeted passes so far")

    out = pd.DataFrame(rows)
    _report_matching(pd.DataFrame(audit), out, extract_failed)
    out = out.reindex(columns=OUTPUT_COLS)
    out.to_csv(config.FEATURES_CSV, index=False)
    print(f"Wrote {len(out)} rows -> {config.FEATURES_CSV}")
    return out


def _report_matching(audit: pd.DataFrame, out: pd.DataFrame, extract_failed: int) -> None:
    """Print match rate, unmatched samples, and matched samples for eyeballing."""
    total = len(audit)
    matched = int((audit["reason"] == "ok").sum()) if total else 0
    print("\n=== Target matching ===")
    print(f"Pass plays: {total}   matched: {matched}   "
          f"match %: {100.0 * matched / total:.2f}%" if total else "No pass plays.")
    if not total:
        return
    print("Unmatched by reason:")
    for reason, n in audit.loc[audit["reason"] != "ok", "reason"].value_counts().items():
        print(f"  {reason:<20} {n}")
    if extract_failed:
        print(f"Matched but dropped in feature extraction (target missing at arrival "
              f"frame, etc.): {extract_failed}")

    with pd.option_context("display.width", 250, "display.max_colwidth", 140):
        un = audit[audit["reason"] != "ok"]
        print("\n10 unmatched descriptions:")
        for r in un.sample(min(10, len(un)), random_state=config.RANDOM_SEED).itertuples():
            print(f"  [{r.reason}] parsed={r.parsed!r}\n      {r.description}")

        if not out.empty:
            s = out.sample(min(10, len(out)), random_state=config.RANDOM_SEED)
            print("\n10 random matched rows (parsed name | displayName | description):")
            for r in s.itertuples():
                print(f"  {r.parsed_name:<16} | {r.displayName:<22} | {r.playDescription[:110]}")
    print()


if __name__ == "__main__":
    build_features()
