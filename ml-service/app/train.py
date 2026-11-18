"""Train the five notebook models and persist the best one with Joblib.

Run from the ml-service folder:
    python -m app.train
    python -m app.train --data ../dataset --out artifacts
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.naive_bayes import GaussianNB
from sklearn.svm import SVC

from . import config
from .preprocessing import (
    DataValidationError,
    build_match_features,
    build_team_match_stats,
    build_training_frame,
    canonical_teams,
    dataset_summary,
    load_dataset,
)


def _build_estimators() -> list[tuple[str, str, Any]]:
    """The same five candidates, with the same hyper-parameters as the notebook."""
    return [
        ("logistic_regression", "Logistic Regression", LogisticRegression(max_iter=5000)),
        (
            "random_forest",
            "Random Forest",
            RandomForestClassifier(n_estimators=300, random_state=config.RANDOM_STATE),
        ),
        (
            "gradient_boosting",
            "Gradient Boosting",
            GradientBoostingClassifier(n_estimators=200, random_state=config.RANDOM_STATE),
        ),
        ("gaussian_naive_bayes", "Gaussian Naive Bayes", GaussianNB()),
        (
            "svm_rbf",
            "Support Vector Machine",
            SVC(kernel="rbf", probability=True, C=1.0, random_state=config.RANDOM_STATE),
        ),
    ]


def _feature_weights(model: Any) -> dict[str, Any] | None:
    if hasattr(model, "coef_"):
        return {
            "basis": "coefficient",
            "values": {
                feature: float(value)
                for feature, value in zip(config.FEATURES, np.ravel(model.coef_))
            },
            "intercept": float(np.ravel(model.intercept_)[0])
            if hasattr(model, "intercept_")
            else None,
        }
    if hasattr(model, "feature_importances_"):
        return {
            "basis": "importance",
            "values": {
                feature: float(value)
                for feature, value in zip(config.FEATURES, model.feature_importances_)
            },
            "intercept": None,
        }
    return None


def _score_shift_examples(base_probability: float, score_diffs: list[int]) -> list[dict[str, float]]:
    examples = []
    for score_diff in score_diffs:
        shift = (1.0 / (1.0 + np.exp(-score_diff / config.SCORE_SHIFT_SCALE)) - 0.5) * config.SCORE_SHIFT_WEIGHT
        probability = float(
            np.clip(base_probability + shift, config.PROBABILITY_FLOOR, config.PROBABILITY_CEILING)
        )
        examples.append({"scoreDiff": score_diff, "probabilityA": probability})
    return examples


def train_models(
    data_dir: str | Path | None = None,
    artifacts_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Train all candidates, select by mean CV ROC-AUC, save the winner."""
    root = Path(data_dir) if data_dir else config.DATA_DIR
    out_dir = Path(artifacts_dir) if artifacts_dir else config.ARTIFACTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_dataset(root)
    teams_meta, name_to_id = canonical_teams(dataset["teams"])
    team_stats = build_team_match_stats(dataset["teams"])
    match_features = build_match_features(team_stats)
    X, y, diagnostics = build_training_frame(match_features, dataset["matches"], name_to_id)

    n_splits = max(2, min(5, int(y.value_counts().min())))
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=config.RANDOM_STATE)

    candidates: list[dict[str, Any]] = []
    fitted: dict[str, Any] = {}

    for key, name, estimator in _build_estimators():
        try:
            scores = cross_val_score(estimator, X, y, cv=cv, scoring="roc_auc")
            mean_score = float(scores.mean())
            candidates.append(
                {
                    "key": key,
                    "name": name,
                    "rocAuc": round(mean_score, 4),
                    "foldScores": [round(float(score), 4) for score in scores],
                    "status": "ok",
                }
            )
            fitted[key] = (name, estimator, mean_score)
        except Exception as exc:  # a single candidate must not kill training
            candidates.append(
                {
                    "key": key,
                    "name": name,
                    "rocAuc": None,
                    "foldScores": [],
                    "status": "failed",
                    "error": str(exc),
                }
            )

    if not fitted:
        raise DataValidationError("All five candidate models failed to train.")

    best_key = max(fitted, key=lambda k: fitted[k][2])
    best_name, best_estimator, best_score = fitted[best_key]
    best_estimator.fit(X, y)
    joblib.dump(best_estimator, out_dir / "model.joblib")

    example = pd.DataFrame([[0.52, 0.45, 0.52, 0.45]], columns=config.FEATURES)
    base_probability = float(best_estimator.predict_proba(example)[0, 1])

    metadata: dict[str, Any] = {
        "status": "ready",
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "bestModel": {
            "key": best_key,
            "name": best_name,
            "rocAuc": round(best_score, 4),
        },
        "models": sorted(
            candidates,
            key=lambda candidate: (candidate["rocAuc"] is None, -(candidate["rocAuc"] or 0)),
        ),
        "features": config.FEATURES,
        "crossValidation": {
            "strategy": "StratifiedKFold",
            "folds": n_splits,
            "shuffle": True,
            "randomState": config.RANDOM_STATE,
            "scoring": "roc_auc",
        },
        "dataset": {
            **dataset_summary(dataset["players"], dataset["teams"], dataset["matches"]),
            **diagnostics,
            "teamCount": len(teams_meta),
        },
        "labelPolicy": (
            "Labels come only from PKL_matches.result. '<team> beat <team>' is a win; "
            "tied/drawn results are labelled as Team A not winning, matching the "
            "notebook's binary winA target. No random labels are ever generated."
        ),
        "featureEngineering": {
            "teamForm": (
                "Per-team raid and tackle success for every match, taken from "
                "PKL_teams.csv stats.raids.* and stats.tackles.*"
            ),
            "rollingWindow": (
                "Mean of the team's previous 5 matches (shifted so the current match "
                "is excluded). Missing history is filled with 0.5 before training."
            ),
            "notebookCorrection": (
                "The notebook chained groupby().shift().rolling(), so the rolling mean "
                "crossed team boundaries at the first rows of each team. This service "
                "rolls strictly within each team. Features, candidates and model "
                "selection are unchanged; the boundary correction slightly changes "
                "CV scores."
            ),
        },
        "featureWeights": _feature_weights(best_estimator),
        "baselineExample": {
            "features": dict(zip(config.FEATURES, [0.52, 0.45, 0.52, 0.45])),
            "baseProbabilityA": base_probability,
            "scoreShiftExamples": _score_shift_examples(base_probability, [0, 5, 10, -5, -10]),
        },
        "runtime": {
            "python": ".".join(str(part) for part in __import__("sys").version_info[:3]),
            "sklearn": sklearn.__version__,
            "pandas": pd.__version__,
            "numpy": np.__version__,
        },
        "artifacts": {
            "modelPath": str((out_dir / "model.joblib").name),
            "metadataPath": str((out_dir / "model_metadata.json").name),
        },
    }

    (out_dir / "model_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the Kabaddi win-probability models.")
    parser.add_argument("--data", default=str(config.DATA_DIR), help="Folder containing the PKL CSVs")
    parser.add_argument("--out", default=str(config.ARTIFACTS_DIR), help="Folder for model artifacts")
    args = parser.parse_args()

    metadata = train_models(Path(args.data), Path(args.out))
    dataset = metadata["dataset"]
    print(f"Training rows : {dataset['trainingRows']}")
    print(f"Win rate      : {dataset['winRate']:.1%}")
    print(f"Features      : {', '.join(metadata['features'])}")
    print()
    for model in metadata["models"]:
        if model["status"] == "ok":
            print(f"  {model['name']:<26} ROC-AUC = {model['rocAuc']:.4f}")
        else:
            print(f"  {model['name']:<26} FAILED: {model.get('error')}")
    print()
    print(f"Best model    : {metadata['bestModel']['name']} (ROC-AUC = {metadata['bestModel']['rocAuc']})")
    print(f"Artifacts     : {Path(args.out).resolve()}")


if __name__ == "__main__":
    main()
