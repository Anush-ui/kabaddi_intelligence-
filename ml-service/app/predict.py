"""Win-probability prediction and substitution simulation.

Notebook parity:
  * Layer 1 - the saved ML model scores the four raid/tackle features.
  * Layer 2 - live score difference is applied as a sigmoid shift afterwards.
  * Lineup quality adjusts the team form features, exactly as compute_features().
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from . import config


class ModelNotTrainedError(Exception):
    """Raised when the Joblib artifact is missing."""


_model: Any | None = None
_metadata: dict[str, Any] | None = None


def _paths() -> tuple[Path, Path]:
    return config.MODEL_PATH, config.METADATA_PATH


def load_artifacts(force: bool = False) -> tuple[Any, dict[str, Any]]:
    global _model, _metadata
    if _model is not None and _metadata is not None and not force:
        return _model, _metadata

    model_path, metadata_path = _paths()
    if not model_path.exists() or not metadata_path.exists():
        raise ModelNotTrainedError(
            "The win-probability model has not been trained yet. From the ml-service "
            "folder run: python -m app.train"
        )

    _model = joblib.load(model_path)
    _metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    return _model, _metadata


def model_status() -> dict[str, Any]:
    """Never raises: used by /health and the dashboard status pill."""
    model_path, metadata_path = _paths()
    ready = model_path.exists() and metadata_path.exists()
    payload: dict[str, Any] = {
        "ready": ready,
        "modelPath": str(model_path),
        "features": config.FEATURES,
        "bestModel": None,
        "trainedAt": None,
    }
    if ready:
        try:
            _, metadata = load_artifacts()
            payload["bestModel"] = metadata.get("bestModel")
            payload["trainedAt"] = metadata.get("trainedAt")
            payload["dataset"] = metadata.get("dataset")
        except Exception as exc:  # corrupted artifact should be reported, not hidden
            payload["ready"] = False
            payload["error"] = str(exc)
    return payload


def _mean(values: list[float]) -> float:
    return float(np.mean(values)) if values else 0.0


def lineup_strength(players: list[dict[str, Any]]) -> float:
    return _mean([float(player.get("mu") or 0.0) for player in players])


def compute_features(
    team_a: dict[str, Any],
    team_b: dict[str, Any],
    starters_a: list[dict[str, Any]],
    starters_b: list[dict[str, Any]],
    score_a: float,
    score_b: float,
) -> dict[str, float]:
    """Notebook compute_features(), with the backend supplying team/player stats."""
    raid_a = float(team_a.get("raidSuccess", config.DEFAULT_RAID_SUCCESS))
    tackle_a = float(team_a.get("tackleSuccess", config.DEFAULT_TACKLE_SUCCESS))
    raid_b = float(team_b.get("raidSuccess", config.DEFAULT_RAID_SUCCESS))
    tackle_b = float(team_b.get("tackleSuccess", config.DEFAULT_TACKLE_SUCCESS))

    avg_a = float(team_a.get("avgMu") or config.DEFAULT_TEAM_AVG_MU)
    avg_b = float(team_b.get("avgMu") or config.DEFAULT_TEAM_AVG_MU)

    selection_a = lineup_strength(starters_a)
    selection_b = lineup_strength(starters_b)

    adj_a = (selection_a - avg_a) / (avg_a + 1e-6)
    adj_b = (selection_b - avg_b) / (avg_b + 1e-6)

    return {
        "raid_success_A": float(
            np.clip(
                raid_a * (1 + config.RAID_LINEUP_WEIGHT * adj_a),
                config.RAID_FEATURE_FLOOR,
                config.RAID_FEATURE_CEILING,
            )
        ),
        "tackle_success_A": float(
            np.clip(
                tackle_a * (1 + config.TACKLE_LINEUP_WEIGHT * adj_a),
                config.TACKLE_FEATURE_FLOOR,
                config.TACKLE_FEATURE_CEILING,
            )
        ),
        "raid_success_B": float(
            np.clip(
                raid_b * (1 + config.RAID_LINEUP_WEIGHT * adj_b),
                config.RAID_FEATURE_FLOOR,
                config.RAID_FEATURE_CEILING,
            )
        ),
        "tackle_success_B": float(
            np.clip(
                tackle_b * (1 + config.TACKLE_LINEUP_WEIGHT * adj_b),
                config.TACKLE_FEATURE_FLOOR,
                config.TACKLE_FEATURE_CEILING,
            )
        ),
        "score_diff": float(score_a) - float(score_b),
    }


def _base_probability(model: Any, features: dict[str, float]) -> float:
    frame = pd.DataFrame(
        [[float(features[name]) for name in config.FEATURES]], columns=config.FEATURES
    )
    return float(model.predict_proba(frame)[0, 1])


def _score_shift(score_diff: float) -> float:
    return (
        1.0 / (1.0 + math.exp(-score_diff / config.SCORE_SHIFT_SCALE)) - 0.5
    ) * config.SCORE_SHIFT_WEIGHT


def finalize_probability(base_probability: float, features: dict[str, float]) -> dict[str, float]:
    shift = _score_shift(float(features.get("score_diff", 0.0)))
    probability = float(
        np.clip(
            base_probability + shift,
            config.PROBABILITY_FLOOR,
            config.PROBABILITY_CEILING,
        )
    )
    return {
        "probabilityA": probability,
        "baseProbabilityA": base_probability,
        "scoreShift": shift,
    }


def predict_win(payload: dict[str, Any]) -> dict[str, Any]:
    """Two-layer prediction, identical in structure to the notebook."""
    model, metadata = load_artifacts()

    features = compute_features(
        payload["teamA"],
        payload["teamB"],
        payload["startersA"],
        payload["startersB"],
        payload.get("scoreA", 0),
        payload.get("scoreB", 0),
    )
    base_probability = _base_probability(model, features)
    result = finalize_probability(base_probability, features)

    return {
        **result,
        "probabilityB": 1.0 - result["probabilityA"],
        "features": features,
        "lineupStrengthA": lineup_strength(payload["startersA"]),
        "lineupStrengthB": lineup_strength(payload["startersB"]),
        "model": metadata.get("bestModel", {}).get("name"),
        "modelRocAuc": metadata.get("bestModel", {}).get("rocAuc"),
        "scoreA": payload.get("scoreA", 0),
        "scoreB": payload.get("scoreB", 0),
    }


def simulate_substitution(payload: dict[str, Any]) -> dict[str, Any]:
    """Preview a starter/bench swap using the same two-layer probability.

    The notebook compared a score-shifted live probability with an unshifted
    model probability. Here both sides use the same final probability so the
    displayed impact is a like-for-like lineup effect.
    """
    side = payload["side"]
    out_id = int(payload["outPlayerId"])
    in_id = int(payload["inPlayerId"])

    starters_a = [dict(player) for player in payload["startersA"]]
    starters_b = [dict(player) for player in payload["startersB"]]
    bench_a = [dict(player) for player in payload.get("benchA", [])]
    bench_b = [dict(player) for player in payload.get("benchB", [])]

    starters = starters_a if side == "A" else starters_b
    bench = bench_a if side == "A" else bench_b

    out_player = next((player for player in starters if int(player["id"]) == out_id), None)
    in_player = next((player for player in bench if int(player["id"]) == in_id), None)

    if out_player is None:
        raise ValueError("The player being replaced is not in the starting lineup.")
    if in_player is None:
        raise ValueError("The replacement player is not on the bench.")
    if out_id == in_id:
        raise ValueError("Choose two different players.")

    starters[starters.index(out_player)] = in_player
    bench[bench.index(in_player)] = out_player

    before = predict_win({**payload, "startersA": payload["startersA"], "startersB": payload["startersB"]})
    after = predict_win({**payload, "startersA": starters_a, "startersB": starters_b})

    return {
        "currentProbability": before["probabilityA"],
        "projectedProbability": after["probabilityA"],
        "delta": after["probabilityA"] - before["probabilityA"],
        "currentBaseProbability": before["baseProbabilityA"],
        "projectedBaseProbability": after["baseProbabilityA"],
        "currentFeatures": before["features"],
        "projectedFeatures": after["features"],
        "lineupStrengthBefore": before["lineupStrengthA"] if side == "A" else before["lineupStrengthB"],
        "lineupStrengthAfter": after["lineupStrengthA"] if side == "A" else after["lineupStrengthB"],
        "outPlayer": {"id": out_id, "name": out_player.get("name", ""), "mu": out_player.get("mu", 0)},
        "inPlayer": {"id": in_id, "name": in_player.get("name", ""), "mu": in_player.get("mu", 0)},
        "side": side,
    }
