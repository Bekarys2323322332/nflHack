"""Train catch-probability models and emit metrics / importance / calibration.

Produces:
  model_metrics.json      {best_model, n_plays, models:[{name, auc, log_loss, brier}]}
  feature_importance.json [{feature, importance}]
  calibration.json        [{bin, plays, mean_pred, actual}]

Also returns the fitted best model and the feature matrix so coe.py and
highlights.py can reuse predictions without retraining.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import config

# Features fed to the catch-probability model (subset of the contract columns).
MODEL_FEATURES = [
    "sep_nearest", "sep_second", "depth", "sideline_dist",
    "rec_speed", "rec_accel", "qb_dist", "pressure_dist",
    "time_to_throw", "release_speed", "down", "yardsToGo", "defendersInBox",
]
TARGET = "complete"


@dataclass
class TrainResult:
    model: Pipeline
    best_name: str
    features: list[str]
    X: pd.DataFrame
    y: pd.Series
    p_full: np.ndarray  # predictions on the full dataset from the best model


def _build_models() -> dict[str, Pipeline]:
    seed = config.RANDOM_SEED
    return {
        "logistic_regression": Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, random_state=seed)),
        ]),
        "random_forest": Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("clf", RandomForestClassifier(
                n_estimators=300, max_depth=6, min_samples_leaf=20,
                random_state=seed, n_jobs=-1)),
        ]),
        "gradient_boosting": Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("clf", GradientBoostingClassifier(random_state=seed)),
        ]),
    }


def _calibration(y_true: np.ndarray, p: np.ndarray, n_bins: int = 10) -> list[dict]:
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    out: list[dict] = []
    idx = np.clip(np.digitize(p, edges[1:-1], right=False), 0, n_bins - 1)
    for b in range(n_bins):
        mask = idx == b
        plays = int(mask.sum())
        if plays == 0:
            out.append({"bin": b + 1, "plays": 0, "mean_pred": 0.0, "actual": 0.0})
        else:
            out.append({
                "bin": b + 1,
                "plays": plays,
                "mean_pred": round(float(p[mask].mean()), 4),
                "actual": round(float(y_true[mask].mean()), 4),
            })
    return out


def _importance(model: Pipeline, features: list[str]) -> list[dict]:
    clf = model.named_steps["clf"]
    if hasattr(clf, "feature_importances_"):
        vals = np.asarray(clf.feature_importances_, dtype=float)
    elif hasattr(clf, "coef_"):
        vals = np.abs(np.asarray(clf.coef_, dtype=float)).ravel()
    else:
        vals = np.zeros(len(features))
    total = vals.sum()
    if total > 0:
        vals = vals / total
    rows = [{"feature": f, "importance": round(float(v), 4)}
            for f, v in zip(features, vals)]
    rows.sort(key=lambda r: r["importance"], reverse=True)
    return rows


def _write(name: str, obj) -> None:
    path = config.ML_OUT / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    print(f"  wrote {path}")


def train(df: pd.DataFrame) -> TrainResult:
    config.ensure_dirs()
    data = df.dropna(subset=[TARGET]).copy()
    feats = [c for c in MODEL_FEATURES if c in data.columns]
    X = data[feats].apply(pd.to_numeric, errors="coerce")
    y = data[TARGET].astype(int)

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=config.RANDOM_SEED, stratify=y
    )

    models = _build_models()
    metrics: list[dict] = []
    fitted: dict[str, Pipeline] = {}
    for name, pipe in models.items():
        pipe.fit(X_tr, y_tr)
        fitted[name] = pipe
        p_te = pipe.predict_proba(X_te)[:, 1]
        metrics.append({
            "name": name,
            "auc": round(float(roc_auc_score(y_te, p_te)), 4),
            "log_loss": round(float(log_loss(y_te, p_te, labels=[0, 1])), 4),
            "brier": round(float(brier_score_loss(y_te, p_te)), 4),
        })

    # Best model = highest AUC.
    best = max(metrics, key=lambda m: m["auc"])
    best_name = best["name"]
    best_model = fitted[best_name]

    # Refit best model on all data for downstream predictions.
    best_model.fit(X, y)
    p_full = best_model.predict_proba(X)[:, 1]

    # Calibration computed on held-out test set of the best model.
    p_te_best = fitted[best_name].predict_proba(X_te)[:, 1]
    calib = _calibration(y_te.to_numpy(), p_te_best)

    _write("model_metrics.json", {
        "best_model": best_name,
        "n_plays": int(len(data)),
        "models": metrics,
    })
    _write("feature_importance.json", _importance(best_model, feats))
    _write("calibration.json", calib)

    return TrainResult(
        model=best_model, best_name=best_name, features=feats,
        X=X, y=y, p_full=p_full,
    )
