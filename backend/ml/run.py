"""Run the full ML pipeline against the shared features table."""
from __future__ import annotations

import pandas as pd

import config
from ml import train, coe, highlights


def load_features() -> pd.DataFrame:
    if not config.FEATURES_CSV.exists():
        raise FileNotFoundError(
            f"{config.FEATURES_CSV} not found. Run common/features.py first."
        )
    return pd.read_csv(config.FEATURES_CSV)


def run(df: pd.DataFrame | None = None) -> None:
    if df is None:
        df = load_features()
    print("ML:")
    result = train.train(df)
    # train() may drop rows with NaN target; align predictions to that subset.
    used = df.dropna(subset=[train.TARGET]).reset_index(drop=True)
    coe.run(used, result.p_full)
    highlights.run(used, result.p_full)


if __name__ == "__main__":
    run()
