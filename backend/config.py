"""Shared configuration: paths and constants for the whole backend pipeline."""
from __future__ import annotations

from pathlib import Path

# --- Directories -----------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "nfl-big-data-bowl-regional-event-data-main" / "data"
TRACKING_DIR = DATA_DIR / "tracking"

OUTPUTS_DIR = BACKEND_DIR / "outputs"
COMMON_OUT = OUTPUTS_DIR / "common"
INSIGHTS_OUT = OUTPUTS_DIR / "insights"
ML_OUT = OUTPUTS_DIR / "ml"
PLAYS_OUT = ML_OUT / "plays"

# --- Source CSVs -----------------------------------------------------------
GAMES_CSV = DATA_DIR / "games.csv"
PLAYERS_CSV = DATA_DIR / "players.csv"
PLAYS_CSV = DATA_DIR / "plays.csv"
PFF_CSV = DATA_DIR / "pffScoutingData.csv"

# --- Shared data-contract output files -------------------------------------
FEATURES_CSV = COMMON_OUT / "features.csv"
PREDICTIONS_CSV = ML_OUT / "predictions.csv"
MODEL_JOBLIB = ML_OUT / "model.joblib"

# --- Train / test split by game week ---------------------------------------
TRAIN_WEEKS = [1, 2, 3, 4, 5, 6]
TEST_WEEKS = [7, 8]
N_SPLITS = 5  # GroupKFold folds, grouped by gameId

# --- Constants -------------------------------------------------------------
# passResult codes in plays.csv
PASS_COMPLETE = "C"       # completed pass
PASS_INCOMPLETE = "I"     # incomplete
PASS_SACK = "S"           # sack (no forward pass)
PASS_SCRAMBLE = "R"       # scramble (no forward pass)
PASS_INTERCEPTION = "IN"  # interception

# Events in tracking data
EV_SNAP = "ball_snap"
EV_PASS_FORWARD = "pass_forward"
EV_PASS_ARRIVED = "pass_arrived"
EV_CAUGHT = "pass_outcome_caught"
EV_INCOMPLETE = "pass_outcome_incomplete"

FOOTBALL = "football"

# Field geometry (yards)
FIELD_WIDTH = 53.3

# How many tracking files to process. None => all. Lower for a quick smoke run.
MAX_TRACKING_FILES: int | None = None

# Random seed for reproducible model training
RANDOM_SEED = 42


def ensure_dirs() -> None:
    """Create all output directories if they do not already exist."""
    for d in (COMMON_OUT, INSIGHTS_OUT, ML_OUT, PLAYS_OUT):
        d.mkdir(parents=True, exist_ok=True)
