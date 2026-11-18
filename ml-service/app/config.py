"""Configuration for the Kabaddi ML microservice.

Every path can be overridden with environment variables so the service can run
from a different working directory on Windows.
"""

from __future__ import annotations

import os
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = SERVICE_DIR.parent

DATA_DIR = Path(os.getenv("PKL_DATA_DIR", PROJECT_DIR / "dataset")).resolve()
ARTIFACTS_DIR = Path(os.getenv("ML_ARTIFACTS_DIR", SERVICE_DIR / "artifacts")).resolve()

MODEL_PATH = ARTIFACTS_DIR / "model.joblib"
METADATA_PATH = ARTIFACTS_DIR / "model_metadata.json"

DATA_FILES = {
    "players": "PKL_players.csv",
    "teams": "PKL_teams.csv",
    "matches": "PKL_matches.csv",
}

# The four model features are intentionally identical to the notebook
# (Kabaddi_Coach_Dashboard_v10.ipynb, Cell 1). Score difference is NOT a model
# feature: it is applied afterwards as a sigmoid shift, exactly like the
# notebook's predict_win().
FEATURES = [
    "raid_success_A",
    "tackle_success_A",
    "raid_success_B",
    "tackle_success_B",
]

# Bayesian performance update constants (notebook: bayes_update()).
BAYES_ALPHA = 0.4
BAYES_LR_MIN = 1e-3
BAYES_LR_MAX = 1e3

# Live score layer (notebook: predict_win()).
SCORE_SHIFT_SCALE = 4.0
SCORE_SHIFT_WEIGHT = 0.5
PROBABILITY_FLOOR = 0.02
PROBABILITY_CEILING = 0.98

# Team quality adjustment applied to the rolling raid/tackle rates based on the
# selected starting seven (notebook: compute_features()).
RAID_LINEUP_WEIGHT = 0.15
TACKLE_LINEUP_WEIGHT = 0.12
RAID_FEATURE_FLOOR = 0.25
RAID_FEATURE_CEILING = 0.80
TACKLE_FEATURE_FLOOR = 0.25
TACKLE_FEATURE_CEILING = 0.80

DEFAULT_RAID_SUCCESS = 0.50
DEFAULT_TACKLE_SUCCESS = 0.40
DEFAULT_TEAM_AVG_MU = 1.0

MIN_TRAINING_ROWS = 10
RANDOM_STATE = 42

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ML_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5000",
    ).split(",")
    if origin.strip()
]

TRAIN_TOKEN = os.getenv("ML_TRAIN_TOKEN", "").strip()
