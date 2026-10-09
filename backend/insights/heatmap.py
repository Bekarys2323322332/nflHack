"""Build the field heatmap: backend/outputs/insights/heatmap.json.

The output shape is the contract the frontend already consumes (see
frontend/src/api.ts, types HeatmapData / HeatmapGrid / HeatmapTopic /
HeatmapRow). `grid` and `topics` below are copied verbatim from
frontend/scripts/generate-mock-data.mjs so the real file is a drop-in
replacement for the mock, with one deliberate change: the separation topic's
description says "when the ball is thrown" instead of "arrives", because that
is the frame the numbers are actually measured at.

Everything is measured at the THROW frame (first pass_forward /
autoevent_passforward, via common.clean.throw_frame_id). No frame after the
throw is read. Tracking files are loaded one at a time.

Grid, as documented in api.ts:
  x_bin  lower edge of a depth bin, in yards past the line of scrimmage
         (negative = behind the line, offense always moving right)
  y_bin  index into grid.y_zones, lanes from the offense's left sideline

Topics and where their numbers come from:
  throw_locations  one entry per row of outputs/common/features.csv
  separation       same rows, value_sum = sum of sep_nearest
  catch_rate       same rows, catches = sum of complete
  player_density   every player on the field at the throw frame of those plays
"""
from __future__ import annotations

import json
from collections import defaultdict

import pandas as pd

import config
import index
from common import clean

OUT_JSON = config.INSIGHTS_OUT / "heatmap.json"

# --- Grid: copied unchanged from generate-mock-data.mjs --------------------
GRID = {
    "x_bin_size": 5,
    "x_min": -5,
    "x_max": 40,
    "min_plays": 10,
    "y_zones": [
        {"y0": 0, "y1": 12, "label": "left sideline",
         "phrase": "outside the numbers (left)"},
        {"y0": 12, "y1": 23.6, "label": "left of the hash",
         "phrase": "inside the numbers (left)"},
        {"y0": 23.6, "y1": 29.7, "label": "middle of the field",
         "phrase": "up the middle"},
        {"y0": 29.7, "y1": 41.3, "label": "right of the hash",
         "phrase": "inside the numbers (right)"},
        {"y0": 41.3, "y1": 53.3, "label": "right sideline",
         "phrase": "outside the numbers (right)"},
    ],
}

# --- Topics: copied unchanged from generate-mock-data.mjs ------------------
# Only exception: the separation description now reads "is thrown", not
# "arrives", to match the frame the features are measured at.
TOPICS = [
    {
        "id": "throw_locations",
        "label": "Where throws go",
        "description": "Every pass target, grouped by depth past the line of "
                       "scrimmage and by lane across the field.",
        "kind": "count",
        "unit": "throws",
        "positions": ["WR", "TE", "RB"],
        "takeaway": "Most throws go {depth}, {lateral}.",
    },
    {
        "id": "separation",
        "label": "Space at the throw",
        "description": "Average yards between the target and the nearest "
                       "defender when the ball is thrown.",
        "kind": "mean",
        "unit": "yds",
        "positions": ["WR", "TE", "RB"],
        "takeaway": "Receivers find the most space {depth}, {lateral}, "
                    "averaging {value}.",
    },
    {
        "id": "catch_rate",
        "label": "Catch rate",
        "description": "The share of targets that ended in a catch.",
        "kind": "rate",
        "unit": "%",
        "positions": ["WR", "TE", "RB"],
        "takeaway": "Targets are caught most often {depth}, {lateral}, at {value}.",
    },
    {
        "id": "player_density",
        "label": "Player density",
        "description": "Where every player stands when the ball is thrown, with "
                       "all plays aligned at the line of scrimmage.",
        "kind": "count",
        "unit": "players",
        "positions": ["QB", "WR", "TE", "RB", "DB", "LB", "DL"],
        "takeaway": "Players crowd most {depth}, {lateral}.",
    },
]

TOPIC_IDS = [t["id"] for t in TOPICS]

# officialPosition -> the position chips the player_density topic offers.
# Anything not listed here (OL, FB, ...) is dropped.
DENSITY_POSITIONS = {
    "QB": "QB",
    "WR": "WR",
    "TE": "TE",
    "RB": "RB",
    "CB": "DB", "SS": "DB", "FS": "DB", "DB": "DB",
    "ILB": "LB", "MLB": "LB", "OLB": "LB", "LB": "LB",
    "DE": "DL", "DT": "DL", "NT": "DL",
}

# coverage keeps the mock's values; pff_passCoverageType "Other" has no mock
# bucket, so those plays are dropped.
COVERAGES = {"man": "man", "zone": "zone"}


# --- Binning ---------------------------------------------------------------
def x_bin(x_rel: float) -> int | None:
    """Floor x_rel to a multiple of x_bin_size, or None if outside the grid."""
    if x_rel is None or pd.isna(x_rel):
        return None
    if not (GRID["x_min"] <= x_rel < GRID["x_max"]):
        return None
    size = GRID["x_bin_size"]
    return int(size * (int(x_rel // size)))


def y_bin(y: float) -> int | None:
    """Index of the y_zone containing y, or None if off the field."""
    if y is None or pd.isna(y):
        return None
    zones = GRID["y_zones"]
    for i, z in enumerate(zones):
        if z["y0"] <= y < z["y1"]:
            return i
    if y == zones[-1]["y1"]:  # exactly the right sideline
        return len(zones) - 1
    return None


# --- Play context ----------------------------------------------------------
def play_context() -> dict[tuple[int, int], tuple[int, str]]:
    """(gameId, playId) -> (down, coverage) for plays usable in the heatmap."""
    plays = index.load_plays()
    out: dict[tuple[int, int], tuple[int, str]] = {}
    for r in plays.itertuples(index=False):
        if pd.isna(r.down):
            continue
        cov_raw = "" if pd.isna(r.pff_passCoverageType) else str(r.pff_passCoverageType)
        cov = COVERAGES.get(cov_raw.strip().lower())
        if cov is None:
            continue
        out[(int(r.gameId), int(r.playId))] = (int(r.down), cov)
    return out


def load_features() -> pd.DataFrame:
    if not config.FEATURES_CSV.exists():
        raise FileNotFoundError(
            f"{config.FEATURES_CSV} not found. Run common/features.py first."
        )
    return pd.read_csv(config.FEATURES_CSV)


def _football_x(frame: pd.DataFrame) -> float | None:
    fb = frame[frame["team"] == config.FOOTBALL]
    if fb.empty:
        return None
    x = float(fb.iloc[0]["x"])
    return None if pd.isna(x) else x


# --- Aggregation -----------------------------------------------------------
class Cells:
    """Sums per (topic, x_bin, y_bin, position, down, coverage)."""

    def __init__(self) -> None:
        self.data: dict[tuple, list[float]] = defaultdict(lambda: [0, 0.0, 0])

    def add(self, topic: str, xb: int, yb: int, position: str, down: int,
            coverage: str, count: int = 1, value: float = 0.0,
            catches: int = 0) -> None:
        cell = self.data[(topic, xb, yb, position, down, coverage)]
        cell[0] += count
        cell[1] += value
        cell[2] += catches

    def rows(self) -> list[dict]:
        order = {t: i for i, t in enumerate(TOPIC_IDS)}
        keys = sorted(
            self.data,
            key=lambda k: (order.get(k[0], len(order)), k[3], k[5], k[1], k[2], k[4]),
        )
        out = []
        for k in keys:
            count, value_sum, catches = self.data[k]
            if count == 0:  # nothing measured here
                continue
            topic, xb, yb, position, down, coverage = k
            value = round(float(value_sum), 2)
            out.append({
                "topic": topic,
                "x_bin": int(xb),
                "y_bin": int(yb),
                "position": position,
                "down": int(down),
                "coverage": coverage,
                "count": int(count),
                # Whole numbers serialize as 0 rather than 0.0, like the mock.
                "value_sum": int(value) if value == int(value) else value,
                "catches": int(catches),
            })
        return out


def build() -> tuple[dict, dict]:
    config.ensure_dirs()
    feats = load_features()
    ctx = play_context()
    positions = {nid: info["position"] for nid, info in index.player_lookup().items()}

    # (gameId, playId) -> the features row for that targeted pass.
    by_play = {(int(r.gameId), int(r.playId)): r
               for r in feats.itertuples(index=False)}

    cells = Cells()
    stats = {
        "plays_seen": 0, "no_context": 0, "target_missing": 0,
        "target_off_grid": 0, "no_snap_ball": 0,
        "density_players": 0, "density_off_grid": 0, "density_no_position": 0,
    }

    files = clean.tracking_files()
    for i, path in enumerate(files, 1):
        tdf = clean.load_tracking_file(path)
        # Only plays that produced a features row matter here.
        games = {int(g) for g in tdf["gameId"].unique()}
        wanted = {k[1] for k in by_play if k[0] in games}
        tdf = tdf[tdf["playId"].isin(wanted)]
        if tdf.empty:
            print(f"  [{i}/{len(files)}] {path.name}: no targeted passes")
            continue

        for (gid, pid), play_df in tdf.groupby(["gameId", "playId"]):
            key = (int(gid), int(pid))
            frow = by_play.get(key)
            if frow is None:
                continue
            stats["plays_seen"] += 1
            if key not in ctx:
                stats["no_context"] += 1
                continue
            down, coverage = ctx[key]

            events = clean.event_frames(play_df)
            max_frame = int(play_df["frameId"].max())
            throw_f = clean.throw_frame_id(events, max_frame)
            snap_f = events.get(config.EV_SNAP, throw_f)
            if snap_f > throw_f:  # malformed event order; snap precedes throw
                snap_f = throw_f

            thr = play_df[play_df["frameId"] == throw_f]
            if thr.empty:
                stats["target_missing"] += 1
                continue

            # --- Target topics: x from features.depth, y from the throw frame.
            tgt = thr[thr["nflId"] == int(frow.targetNflId)]
            if tgt.empty:
                stats["target_missing"] += 1
            else:
                xb = x_bin(frow.depth)
                yb = y_bin(float(tgt.iloc[0]["y"]))
                if xb is None or yb is None:
                    stats["target_off_grid"] += 1
                else:
                    pos = str(frow.officialPosition)
                    sep = pd.to_numeric(frow.sep_nearest, errors="coerce")
                    complete = 0 if pd.isna(frow.complete) else int(frow.complete)
                    cells.add("throw_locations", xb, yb, pos, down, coverage)
                    cells.add("separation", xb, yb, pos, down, coverage,
                              value=0.0 if pd.isna(sep) else float(sep))
                    cells.add("catch_rate", xb, yb, pos, down, coverage,
                              catches=complete)

            # --- Density: every player at the throw frame, aligned at the LOS.
            snap_x = _football_x(play_df[play_df["frameId"] == snap_f])
            if snap_x is None:
                snap_x = _football_x(thr)
            if snap_x is None:
                stats["no_snap_ball"] += 1
                continue
            players = thr[(thr["team"] != config.FOOTBALL) & thr["nflId"].notna()]
            for p in players.itertuples(index=False):
                stats["density_players"] += 1
                pos = DENSITY_POSITIONS.get(positions.get(int(p.nflId), ""))
                if pos is None:
                    stats["density_no_position"] += 1
                    continue
                xb = x_bin(float(p.x) - snap_x)
                yb = y_bin(float(p.y))
                if xb is None or yb is None:
                    stats["density_off_grid"] += 1
                    continue
                cells.add("player_density", xb, yb, pos, down, coverage)

        print(f"  [{i}/{len(files)}] {path.name}: "
              f"{stats['plays_seen']} plays, {len(cells.data)} cells so far")

    return {"grid": GRID, "topics": TOPICS, "rows": cells.rows()}, stats


def _report(data: dict, stats: dict) -> None:
    rows = data["rows"]
    print("\n=== Heatmap ===")
    print("Rows per topic:")
    for topic in TOPIC_IDS:
        sel = [r for r in rows if r["topic"] == topic]
        plays = sum(r["count"] for r in sel)
        print(f"  {topic:<16} {len(sel):>6} rows   {plays:>8} count")
    print(f"  {'TOTAL':<16} {len(rows):>6} rows")

    size = OUT_JSON.stat().st_size
    print(f"\nFile: {OUT_JSON}  ({size:,} bytes, {size / 1024:.1f} KiB)")

    labels = [z["label"] for z in GRID["y_zones"]]
    busiest: dict[tuple[int, int], int] = defaultdict(int)
    for r in rows:
        if r["topic"] == "throw_locations":
            busiest[(r["x_bin"], r["y_bin"])] += r["count"]
    top = sorted(busiest.items(), key=lambda kv: kv[1], reverse=True)[:5]
    print("\n5 busiest throw_locations cells:")
    size_x = GRID["x_bin_size"]
    for (xb, yb), n in top:
        print(f"  x {xb:>3} to {xb + size_x:<3} yds | {labels[yb]:<20} | {n:>5} throws")

    dropped = ", ".join(f"{k}={v}" for k, v in stats.items())
    print(f"\nDiagnostics: {dropped}\n")


def run() -> dict:
    data, stats = build()
    config.ensure_dirs()
    OUT_JSON.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    _report(data, stats)
    return data


if __name__ == "__main__":
    run()
