"""FastAPI entry point for the Kabaddi ML microservice.

Run from the ml-service folder:
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .bayesian import bayesian_update
from .predict import ModelNotTrainedError, model_status, predict_win, simulate_substitution
from .preprocessing import DataValidationError
from .schemas import BayesianRequest, PredictionRequest, SubstitutionRequest
from .train import train_models

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("kabaddi-ml")

app = FastAPI(
    title="Kabaddi Coach ML Service",
    version="1.0.0",
    description=(
        "Win-probability predictions, Bayesian player updates and substitution "
        "simulation for the Kabaddi Coach Intelligence Dashboard."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ModelNotTrainedError)
async def model_not_trained_handler(_: Request, exc: ModelNotTrainedError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc), "code": "MODEL_NOT_TRAINED"})


@app.exception_handler(DataValidationError)
async def data_validation_handler(_: Request, exc: DataValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc), "code": "DATA_VALIDATION"})


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "kabaddi-ml",
        "status": "ok",
        "docs": "/docs",
        "features": config.FEATURES,
    }


@app.get("/health")
def health() -> dict[str, Any]:
    status = model_status()
    return {
        "status": "ok",
        "modelReady": status["ready"],
        "bestModel": status.get("bestModel"),
        "trainedAt": status.get("trainedAt"),
        "features": config.FEATURES,
        "dataset": status.get("dataset"),
        **({"error": status["error"]} if status.get("error") else {}),
    }


@app.get("/model-info")
def model_info() -> dict[str, Any]:
    status = model_status()
    if not status["ready"]:
        return {
            "status": "not_trained",
            "ready": False,
            "message": (
                "No trained model artifact was found. Run 'python -m app.train' in "
                "the ml-service folder after placing the PKL CSVs in dataset/."
            ),
        }
    from .predict import load_artifacts

    _, metadata = load_artifacts()
    return {"status": "ready", "ready": True, **metadata}


@app.post("/train")
def train(request: Request) -> dict[str, Any]:
    if config.TRAIN_TOKEN:
        if request.headers.get("x-train-token", "") != config.TRAIN_TOKEN:
            raise HTTPException(status_code=403, detail="Invalid training token.")

    metadata = train_models()
    logger.info("Model retrained: %s", metadata["bestModel"])
    return {
        "status": "trained",
        "bestModel": metadata["bestModel"],
        "models": metadata["models"],
        "trainedAt": metadata["trainedAt"],
        "dataset": metadata["dataset"],
    }


@app.post("/predict")
def predict(payload: PredictionRequest) -> dict[str, Any]:
    return predict_win(payload.model_dump())


@app.post("/bayesian-update")
def bayesian(payload: BayesianRequest) -> dict[str, Any]:
    result = bayesian_update(
        prior=payload.prior,
        observed=payload.observed,
        mu=payload.mu,
        std=payload.std,
    )
    result["alpha"] = config.BAYES_ALPHA
    return result


@app.post("/substitution-impact")
def substitution(payload: SubstitutionRequest) -> dict[str, Any]:
    try:
        return simulate_substitution(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
