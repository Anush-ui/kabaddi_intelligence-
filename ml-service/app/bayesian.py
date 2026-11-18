"""Bayesian player-performance update (notebook Cell 5: bayes_update)."""

from __future__ import annotations

import math

from . import config


def bayesian_update(
    prior: float,
    observed: float,
    mu: float,
    std: float,
    alpha: float = config.BAYES_ALPHA,
) -> dict[str, float | None]:
    """Shift a win probability using the player's deviation from career form.

    posterior odds = prior odds * exp(alpha * (observed - mu) / std)
    """
    prior = min(max(float(prior), 1e-6), 1 - 1e-6)
    observed = float(observed)
    mu = float(mu)
    std = float(std)

    if std <= 0:
        return {
            "prior": prior,
            "posterior": prior,
            "deviation": observed - mu,
            "zScore": None,
            "likelihoodRatio": 1.0,
            "adjustment": 0.0,
        }

    z_score = (observed - mu) / std
    likelihood_ratio = math.exp(alpha * z_score)
    likelihood_ratio = max(config.BAYES_LR_MIN, min(config.BAYES_LR_MAX, likelihood_ratio))

    odds = (prior / (1.0 - prior + 1e-12)) * likelihood_ratio
    posterior = odds / (1.0 + odds)
    posterior = min(max(posterior, 0.0), 1.0)

    return {
        "prior": prior,
        "posterior": posterior,
        "deviation": observed - mu,
        "zScore": z_score,
        "likelihoodRatio": likelihood_ratio,
        "adjustment": posterior - prior,
    }
