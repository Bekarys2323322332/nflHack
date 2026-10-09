"""End-to-end pipeline: features -> insights -> ML outputs.

Usage (from the backend/ directory):
  python run_all.py                 # full run on all tracking files
  python run_all.py --max-files 5   # quick run on first 5 tracking files
  python run_all.py --skip-features # reuse existing features.csv

Then serve the artifacts:
  uvicorn api.main:app --port 8000
"""
from __future__ import annotations

import argparse
import time

import config


def main() -> None:
    parser = argparse.ArgumentParser(description="NFL BDB backend pipeline")
    parser.add_argument("--max-files", type=int, default=None,
                        help="limit number of tracking files (quick runs)")
    parser.add_argument("--skip-features", action="store_true",
                        help="reuse existing features.csv instead of rebuilding")
    args = parser.parse_args()

    if args.max_files is not None:
        config.MAX_TRACKING_FILES = args.max_files

    config.ensure_dirs()
    start = time.time()

    # Import after config so MAX_TRACKING_FILES is respected.
    from common import features as features_mod
    from insights import run as insights_run
    from ml import run as ml_run

    if args.skip_features:
        if not config.FEATURES_CSV.exists():
            raise SystemExit("features.csv missing; run without --skip-features")
        import pandas as pd
        df = pd.read_csv(config.FEATURES_CSV)
        print(f"Loaded existing features: {len(df)} rows")
    else:
        print("=== Building features ===")
        df = features_mod.build_features()

    print("=== Insights ===")
    insights_run.run(df)

    print("=== ML ===")
    ml_run.run(df)

    print(f"\nDone in {time.time() - start:.1f}s. Outputs under {config.OUTPUTS_DIR}")


if __name__ == "__main__":
    main()
