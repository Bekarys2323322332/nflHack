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
    # result.data is the row subset actually modelled (week-joined, NaN target
    # dropped) and result.p is aligned to it: out-of-fold for train-week plays,
    # refit-model predictions for test-week plays.
    coe.run(result.data, result.p)
    highlights.run(result.data, result.p)


if __name__ == "__main__":
    run()
