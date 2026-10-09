"""Run all insight generators against the shared features table."""
from __future__ import annotations

import pandas as pd

import config
from insights import seperation, positions


def load_features() -> pd.DataFrame:
    if not config.FEATURES_CSV.exists():
        raise FileNotFoundError(
            f"{config.FEATURES_CSV} not found. Run common/features.py first."
        )
    return pd.read_csv(config.FEATURES_CSV)


def run(df: pd.DataFrame | None = None) -> None:
    if df is None:
        df = load_features()
    print("Insights:")
    seperation.run(df)
    positions.run(df)


if __name__ == "__main__":
    run()
