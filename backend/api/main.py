"""FastAPI service exposing the precomputed insight / ML JSON artifacts.

Endpoints:
  GET /api/insights/{name}            -> outputs/insights/{name}.json
  GET /api/ml/{name}                  -> outputs/ml/{name}.json
  GET /api/ml/plays/{gameId}/{playId} -> outputs/ml/plays/play_<g>_<p>.json

Run from the backend/ directory:
  uvicorn api.main:app --port 8000
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import config

app = FastAPI(title="NFL Big Data Bowl API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _read_json(path: Path):
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{path.name} not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"invalid JSON in {path.name}: {exc}")


def _safe_name(name: str) -> str:
    """Prevent path traversal; allow only a bare file stem."""
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="invalid name")
    return name[:-5] if name.endswith(".json") else name


@app.get("/")
def root():
    return {"service": "nfl-bdb", "status": "ok",
            "endpoints": ["/api/insights/{name}", "/api/ml/{name}",
                          "/api/ml/plays/{gameId}/{playId}"]}


@app.get("/api/insights/{name}")
def get_insight(name: str):
    stem = _safe_name(name)
    return _read_json(config.INSIGHTS_OUT / f"{stem}.json")


@app.get("/api/ml/{name}")
def get_ml(name: str):
    stem = _safe_name(name)
    return _read_json(config.ML_OUT / f"{stem}.json")


@app.get("/api/ml/plays/{game_id}/{play_id}")
def get_play(game_id: int, play_id: int):
    return _read_json(config.PLAYS_OUT / f"play_{game_id}_{play_id}.json")
