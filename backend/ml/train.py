"""Train catch-probability models with a week-based train/test split.

Split: week comes from games.csv. Train = weeks 1-6, test = weeks 7-8. Model
selection runs entirely inside the train set using GroupKFold(5) grouped by
gameId, so no two frames from the same game land on both sides of a fold. The
best model is chosen by cross-validated log loss (lowest), refit on the whole
train set, and scored once on the test set.

Produces:
  model_metrics.json  {best_model, n_plays, n_train, n_test, train_weeks,
                       test_weeks, models:[{name, cv_auc, cv_log_loss,
                       cv_brier}], test:{auc, log_loss, brier, accuracy},
                       baseline_test:{auc, log_loss, brier}}
  feature_importance.json [{feature, importance}]  permutation importance on test
  calibration.json        [{bin, plays, mean_pred, actual}]  on test
  predictions.csv         per-play p_catch with a split column
  model.joblib            the fitted best pipeline

Predictions for every play: out-of-fold for train plays (never from a model
that saw the play), refit-model predictions for test plays.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, brier_score_loss, log_loss,
                             roc_auc_score)
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import config
import index

# Features fed to the catch-probability model (subset of the contract columns).
MODEL_FEATURES = [
    "sep_nearest", "sep_second", "depth", "sideline_dist",
    "rec_speed", "rec_accel", "qb_dist", "pressure_dist",
    "time_to_throw", "release_speed", "down", "yardsToGo", "defendersInBox",
]
TARGET = "complete"
GROUP = "gameId"


@dataclass
class TrainResult:
    model: Pipeline          # best pipeline, refit on the full train set
    best_name: str
    features: list[str]
    data: pd.DataFrame       # rows used, with week/split columns, index reset
    p: np.ndarray            # p_catch aligned to `data` (OOF on train, model on test)
    split: pd.Series         # "train"/"test" aligned to `data`
    metrics: dict            # the model_metrics.json payload


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


def attach_week(df: pd.DataFrame) -> pd.DataFrame:
    """Join week from games.csv and label each play train/test."""
    games = index.load_games()[["gameId", "week"]]
    out = df.merge(games, on="gameId", how="left")
    missing = int(out["week"].isna().sum())
    if missing:
        print(f"  WARN {missing} plays have no week in games.csv; dropped")
        out = out[out["week"].notna()]
    out["week"] = out["week"].astype(int)
    out["split"] = np.where(out["week"].isin(config.TEST_WEEKS), "test",
                            np.where(out["week"].isin(config.TRAIN_WEEKS),
                                     "train", "unused"))
    unused = int((out["split"] == "unused").sum())
    if unused:
        print(f"  note {unused} plays fall outside train/test weeks; dropped")
        out = out[out["split"] != "unused"]
    return out.reset_index(drop=True)


def _scores(y: np.ndarray, p: np.ndarray) -> tuple[float, float, float]:
    return (float(roc_auc_score(y, p)),
            float(log_loss(y, p, labels=[0, 1])),
            float(brier_score_loss(y, p)))


def _oof_predictions(pipe: Pipeline, X: pd.DataFrame, y: pd.Series,
                     groups: pd.Series) -> np.ndarray:
    """GroupKFold out-of-fold probabilities; each row scored by a model
    that never saw its game."""
    oof = np.full(len(X), np.nan)
    gkf = GroupKFold(n_splits=config.N_SPLITS)
    for tr_idx, va_idx in gkf.split(X, y, groups=groups):
        fold = clone(pipe)
        fold.fit(X.iloc[tr_idx], y.iloc[tr_idx])
        oof[va_idx] = fold.predict_proba(X.iloc[va_idx])[:, 1]
    if np.isnan(oof).any():
        raise RuntimeError("GroupKFold left rows unscored")
    return oof


def _calibration(y_true: np.ndarray, p: np.ndarray, n_bins: int = 10) -> list[dict]:
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1], right=False), 0, n_bins - 1)
    out: list[dict] = []
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


def _importance(model: Pipeline, X_te: pd.DataFrame, y_te: pd.Series,
                features: list[str]) -> list[dict]:
    """Permutation importance on the TEST set: mean drop in ROC AUC when a
    feature is shuffled. Model-agnostic and measured on held-out data."""
    r = permutation_importance(
        model, X_te, y_te, scoring="roc_auc", n_repeats=10,
        random_state=config.RANDOM_SEED, n_jobs=-1,
    )
    rows = [{"feature": f, "importance": round(float(v), 4)}
            for f, v in zip(features, r.importances_mean)]
    rows.sort(key=lambda d: d["importance"], reverse=True)
    return rows


def _write(name: str, obj) -> None:
    path = config.ML_OUT / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    print(f"  wrote {path}")


# --- printing --------------------------------------------------------------
def _table(headers: list[str], rows: list[list[str]], indent: str = "  ") -> str:
    widths = [max(len(headers[i]), *(len(r[i]) for r in rows)) if rows
              else len(headers[i]) for i in range(len(headers))]
    line = indent + "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    rule = indent + "  ".join("-" * widths[i] for i in range(len(headers)))
    body = [indent + "  ".join(str(c).ljust(widths[i]) for i, c in enumerate(r))
            for r in rows]
    return "\n".join([line, rule, *body])


def _print_metrics(m: dict) -> None:
    print("\n=== Split ===")
    print(_table(
        ["", "weeks", "plays", "games"],
        [["train", str(m["train_weeks"]), str(m["n_train"]), str(m["n_train_games"])],
         ["test", str(m["test_weeks"]), str(m["n_test"]), str(m["n_test_games"])],
         ["total", "-", str(m["n_plays"]), "-"]],
    ))

    print(f"\n=== Model selection: GroupKFold({config.N_SPLITS}) by gameId, "
          f"train weeks only (best = lowest cv_log_loss) ===")
    rows = []
    for d in m["models"]:
        mark = "  <-- best" if d["name"] == m["best_model"] else ""
        rows.append([d["name"], f"{d['cv_auc']:.4f}", f"{d['cv_log_loss']:.4f}",
                     f"{d['cv_brier']:.4f}" + mark])
    print(_table(["model", "cv_auc", "cv_log_loss", "cv_brier"], rows))

    print(f"\n=== Held-out test (weeks {m['test_weeks']}), "
          f"{m['best_model']} refit on all train ===")
    t, b = m["test"], m["baseline_test"]
    print(_table(
        ["", "auc", "log_loss", "brier", "accuracy"],
        [[m["best_model"], f"{t['auc']:.4f}", f"{t['log_loss']:.4f}",
          f"{t['brier']:.4f}", f"{t['accuracy']:.4f}"],
         ["baseline (train rate)", f"{b['auc']:.4f}", f"{b['log_loss']:.4f}",
          f"{b['brier']:.4f}", "-"]],
    ))
    print(f"  baseline always predicts the train completion rate "
          f"({m['baseline_rate']:.4f})")


def _print_table_json(title: str, rows: list[dict], headers: list[str]) -> None:
    print(f"\n=== {title} ===")
    print(_table(headers, [[f"{r[h]:.4f}" if isinstance(r[h], float) else str(r[h])
                            for h in headers] for r in rows]))


def train(df: pd.DataFrame) -> TrainResult:
    config.ensure_dirs()

    data = attach_week(df.dropna(subset=[TARGET]).copy())
    feats = [c for c in MODEL_FEATURES if c in data.columns]
    X = data[feats].apply(pd.to_numeric, errors="coerce")
    y = data[TARGET].astype(int)

    is_train = (data["split"] == "train").to_numpy()
    is_test = ~is_train
    X_tr, y_tr = X[is_train].reset_index(drop=True), y[is_train].reset_index(drop=True)
    X_te, y_te = X[is_test].reset_index(drop=True), y[is_test].reset_index(drop=True)
    g_tr = data.loc[is_train, GROUP].reset_index(drop=True)
    if len(X_te) == 0 or len(X_tr) == 0:
        raise RuntimeError("train or test split is empty; check week configuration")

    # --- model selection: GroupKFold on the train set only -----------------
    models = _build_models()
    cv_rows: list[dict] = []
    oof_by_model: dict[str, np.ndarray] = {}
    for name, pipe in models.items():
        oof = _oof_predictions(pipe, X_tr, y_tr, g_tr)
        oof_by_model[name] = oof
        auc, ll, br = _scores(y_tr.to_numpy(), oof)
        cv_rows.append({"name": name, "cv_auc": round(auc, 4),
                        "cv_log_loss": round(ll, 4), "cv_brier": round(br, 4)})

    # Best by cross-validated log loss (lower is better).
    best = min(cv_rows, key=lambda d: d["cv_log_loss"])
    best_name = best["name"]

    # --- refit best on all train, score once on test -----------------------
    best_model = clone(models[best_name])
    best_model.fit(X_tr, y_tr)
    p_te = best_model.predict_proba(X_te)[:, 1]
    t_auc, t_ll, t_br = _scores(y_te.to_numpy(), p_te)
    t_acc = float(accuracy_score(y_te, (p_te >= 0.5).astype(int)))

    # Baseline: always predict the train completion rate.
    base_rate = float(y_tr.mean())
    p_base = np.full(len(y_te), base_rate)
    b_auc, b_ll, b_br = _scores(y_te.to_numpy(), p_base)

    # --- predictions for every play ----------------------------------------
    p_all = np.empty(len(data))
    p_all[is_train] = oof_by_model[best_name]
    p_all[is_test] = p_te

    metrics = {
        "best_model": best_name,
        "n_plays": int(len(data)),
        "n_train": int(is_train.sum()),
        "n_test": int(is_test.sum()),
        "train_weeks": list(config.TRAIN_WEEKS),
        "test_weeks": list(config.TEST_WEEKS),
        "models": cv_rows,
        "test": {"auc": round(t_auc, 4), "log_loss": round(t_ll, 4),
                 "brier": round(t_br, 4), "accuracy": round(t_acc, 4)},
        "baseline_test": {"auc": round(b_auc, 4), "log_loss": round(b_ll, 4),
                          "brier": round(b_br, 4)},
        # Extra context for the printed tables.
        "baseline_rate": round(base_rate, 4),
        "n_train_games": int(data.loc[is_train, GROUP].nunique()),
        "n_test_games": int(data.loc[is_test, GROUP].nunique()),
    }

    calib = _calibration(y_te.to_numpy(), p_te)
    imp = _importance(best_model, X_te, y_te, feats)

    _write("model_metrics.json", metrics)
    _write("feature_importance.json", imp)
    _write("calibration.json", calib)

    # predictions.csv with the split column.
    preds = pd.DataFrame({
        "gameId": data["gameId"].to_numpy(),
        "playId": data["playId"].to_numpy(),
        "targetNflId": data["targetNflId"].to_numpy(),
        "displayName": data["displayName"].to_numpy(),
        "officialPosition": data["officialPosition"].to_numpy(),
        "week": data["week"].to_numpy(),
        "split": data["split"].to_numpy(),
        "complete": y.to_numpy(),
        "p_catch": np.round(p_all, 6),
    })
    preds.to_csv(config.PREDICTIONS_CSV, index=False)
    print(f"  wrote {config.PREDICTIONS_CSV}")

    joblib.dump(best_model, config.MODEL_JOBLIB)
    print(f"  wrote {config.MODEL_JOBLIB}")

    # --- print everything as tables ----------------------------------------
    _print_metrics(metrics)
    _print_table_json("Feature importance (permutation, test set, drop in AUC)",
                      imp, ["feature", "importance"])
    _print_table_json("Calibration (test set)", calib,
                      ["bin", "plays", "mean_pred", "actual"])
    print(f"\n  predictions.csv: "
          f"{int((preds.split == 'train').sum())} train (out-of-fold), "
          f"{int((preds.split == 'test').sum())} test (refit model)\n")

    return TrainResult(
        model=best_model, best_name=best_name, features=feats,
        data=data, p=p_all, split=data["split"], metrics=metrics,
    )
