"""Dataset loading, validation and feature engineering.

This module mirrors Cell 2 and Cell 3 of Kabaddi_Coach_Dashboard_v10.ipynb,
with one deliberate difference: the notebook generated random win labels when
no winner column existed. That fallback is removed. If the real winner labels
cannot be derived from the dataset, training stops with a clear data error.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import config


class DataValidationError(Exception):
    """Raised when the supplied dataset cannot support honest ML training."""


REQUIRED_COLUMNS: dict[str, list[str]] = {
    "players": ["player_id", "player_name", "team_id", "match_id", "player_total_points"],
    "teams": [
        "id",
        "match_id",
        "name",
        "score",
        "stats.raids.successful",
        "stats.raids.total",
        "stats.tackles.successful",
        "stats.tackles.total",
    ],
    "matches": ["match_id", "result"],
}


def _read_csv(key: str, data_dir: Path) -> pd.DataFrame:
    filename = config.DATA_FILES[key]
    path = Path(data_dir) / filename
    if not path.exists():
        raise DataValidationError(
            f"Missing dataset file '{filename}'. Expected it at {path}. "
            "Place PKL_players.csv, PKL_teams.csv, PKL_events.csv and "
            "PKL_matches.csv in the dataset/ folder."
        )
    try:
        frame = pd.read_csv(path)
    except Exception as exc:  # pragma: no cover - pandas raises many types
        raise DataValidationError(f"Could not parse {filename}: {exc}") from exc

    frame.columns = [str(column).strip() for column in frame.columns]
    frame = frame.loc[:, ~frame.columns.str.startswith("unnamed:")]
    frame = frame.drop(columns=["index"], errors="ignore")

    missing = [column for column in REQUIRED_COLUMNS[key] if column not in frame.columns]
    if missing:
        raise DataValidationError(
            f"{filename} is missing required columns: {', '.join(missing)}. "
            "The import expects the original Pro Kabaddi League export."
        )
    return frame


def load_dataset(data_dir: str | Path | None = None) -> dict[str, pd.DataFrame]:
    """Load the three CSVs used by the model (events are not used by the ML flow)."""
    root = Path(data_dir) if data_dir else config.DATA_DIR
    return {key: _read_csv(key, root) for key in config.DATA_FILES}


def canonical_teams(teams: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Build stable team identities from the raw team rows.

    Some teams appear under more than one spelling (e.g. "Dabang Delhi" and
    "Dabang Delhi K.C."). The most frequent spelling becomes the canonical name
    and every spelling is kept as an alias for result parsing and head-to-head.
    """
    named = teams.dropna(subset=["name"]).copy()
    if named.empty:
        raise DataValidationError("PKL_teams.csv has no team names.")

    named["name"] = named["name"].astype(str).str.strip()
    named = named[named["name"] != ""]

    counts = (
        named.groupby(["id", "name"]).size().reset_index(name="rows")
        .sort_values(["id", "rows", "name"], ascending=[True, False, True])
    )
    canonical: dict[int, str] = {}
    for team_id, group in counts.groupby("id"):
        canonical[int(team_id)] = str(group.iloc[0]["name"])

    short_names: dict[int, str] = {}
    if "short_name" in named.columns:
        for team_id, group in named.dropna(subset=["short_name"]).groupby("id"):
            modes = group["short_name"].astype(str).str.strip().value_counts()
            if not modes.empty:
                short_names[int(team_id)] = str(modes.index[0])

    aliases: dict[int, list[str]] = {}
    for team_id, group in named.groupby("id"):
        values = [str(value).strip() for value in group["name"].unique()]
        aliases[int(team_id)] = sorted(set(values))

    teams_meta: list[dict[str, Any]] = []
    for team_id in sorted(canonical):
        teams_meta.append(
            {
                "id": int(team_id),
                "name": canonical[team_id],
                "shortName": short_names.get(int(team_id), canonical[team_id][:3].upper()),
                "aliases": aliases.get(int(team_id), []),
            }
        )

    name_to_id: dict[str, int] = {}
    for team_id, names in aliases.items():
        for name in names:
            name_to_id[name] = int(team_id)
    # Canonical names always win over a conflicting alias.
    for team_id, name in canonical.items():
        name_to_id[name] = int(team_id)

    return teams_meta, name_to_id


def parse_result(result: Any, name_to_id: dict[str, int]) -> dict[str, Any]:
    """Parse a PKL_matches.result string into a structured outcome.

    Returns kind: win | tie | unknown | missing.
    """
    if result is None or (isinstance(result, float) and math.isnan(result)):
        return {"kind": "missing", "winnerId": None, "winnerName": None}

    text = str(result).strip()
    if not text:
        return {"kind": "missing", "winnerId": None, "winnerName": None}

    lowered = text.lower()
    if " beat " in lowered:
        # Preserve original casing of the winner name.
        winner_name = text.split(" beat ")[0].strip()
        if " beat " not in text:
            winner_name = text[: lowered.index(" beat ")].strip()
        winner_id = name_to_id.get(winner_name)
        if winner_id is None:
            return {"kind": "unmapped", "winnerId": None, "winnerName": winner_name}
        return {"kind": "win", "winnerId": winner_id, "winnerName": winner_name}

    if "tied" in lowered or "drawn" in lowered or lowered in {"tie", "match tie"}:
        return {"kind": "tie", "winnerId": None, "winnerName": None}

    return {"kind": "unknown", "winnerId": None, "winnerName": text}


def build_team_match_stats(teams: pd.DataFrame) -> pd.DataFrame:
    """Recreate the rolling raid/tackle form features from Cell 3."""
    frame = teams.copy().sort_values(["id", "match_id"]).reset_index(drop=True)

    for column in [
        "stats.raids.successful",
        "stats.raids.total",
        "stats.tackles.successful",
        "stats.tackles.total",
    ]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)

    frame["raid_success"] = np.where(
        frame["stats.raids.total"] > 0,
        frame["stats.raids.successful"] / frame["stats.raids.total"],
        0.0,
    )
    frame["tackle_success"] = np.where(
        frame["stats.tackles.total"] > 0,
        frame["stats.tackles.successful"] / frame["stats.tackles.total"],
        0.0,
    )

    frame = frame.drop_duplicates(subset=["id", "match_id"], keep="last")

    grouped = frame.groupby("id", group_keys=False)
    frame["raid_roll5"] = grouped["raid_success"].apply(
        lambda series: series.shift(1).rolling(5, min_periods=1).mean()
    )
    frame["tackle_roll5"] = grouped["tackle_success"].apply(
        lambda series: series.shift(1).rolling(5, min_periods=1).mean()
    )

    return frame[
        [
            "id",
            "match_id",
            "name",
            "score",
            "stats.raids.successful",
            "stats.raids.total",
            "stats.tackles.successful",
            "stats.tackles.total",
            "raid_success",
            "tackle_success",
            "raid_roll5",
            "tackle_roll5",
        ]
    ].rename(columns={"id": "team_id"})


def build_match_features(team_stats: pd.DataFrame) -> pd.DataFrame:
    """Pair the two team rows of each match (notebook: Cell 3 rows loop)."""
    rows: list[dict[str, Any]] = []
    for match_id, group in team_stats.groupby("match_id", sort=True):
        if group.shape[0] != 2:
            continue
        first, second = group.iloc[0], group.iloc[1]
        rows.append(
            {
                "match_id": int(match_id),
                "teamA_id": int(first["team_id"]),
                "teamB_id": int(second["team_id"]),
                "raid_success_A": first["raid_roll5"],
                "tackle_success_A": first["tackle_roll5"],
                "raid_success_B": second["raid_roll5"],
                "tackle_success_B": second["tackle_roll5"],
            }
        )
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise DataValidationError("No match has exactly two team rows; cannot build features.")
    return frame


def build_training_frame(
    match_features: pd.DataFrame,
    matches: pd.DataFrame,
    name_to_id: dict[str, int],
) -> tuple[pd.DataFrame, pd.Series, dict[str, Any]]:
    """Attach real winner labels. No random fallback is ever used."""
    matches = matches.copy()
    matches["match_id"] = pd.to_numeric(matches["match_id"], errors="coerce")

    outcomes = matches["result"].map(lambda value: parse_result(value, name_to_id))
    matches["_kind"] = [outcome["kind"] for outcome in outcomes]
    matches["_winner_id"] = [outcome["winnerId"] for outcome in outcomes]
    matches["_winner_name"] = [outcome["winnerName"] for outcome in outcomes]

    frame = match_features.merge(
        matches[["match_id", "_kind", "_winner_id", "_winner_name"]],
        on="match_id",
        how="left",
    )

    frame["_kind"] = frame["_kind"].fillna("missing")
    frame["winA"] = (frame["_winner_id"] == frame["teamA_id"]).astype(int)

    label_counts = {
        "decisive": int((frame["_kind"] == "win").sum()),
        "ties": int((frame["_kind"] == "tie").sum()),
        "unknown": int((frame["_kind"] == "unknown").sum()),
        "missing": int((frame["_kind"] == "missing").sum()),
        "unmappedWinner": int((frame["_kind"] == "unmapped").sum()),
    }

    diagnostics = {
        "datasetMatches": int(len(matches)),
        "featureMatches": int(len(frame)),
        "labelCounts": label_counts,
        "unmappedWinnerNames": sorted(
            {
                str(name)
                for name in frame.loc[frame["_kind"] == "unmapped", "_winner_name"].dropna().unique()
            }
        ),
        "winnerSource": "PKL_matches.result",
    }

    usable = frame.dropna(subset=["winA"])
    if len(usable) < config.MIN_TRAINING_ROWS:
        raise DataValidationError(
            "Not enough labelled matches to train an honest model: "
            f"{len(usable)} usable rows (need at least {config.MIN_TRAINING_ROWS})."
        )

    if label_counts["decisive"] == 0:
        raise DataValidationError(
            "No winner labels could be derived from PKL_matches.csv. The 'result' "
            "column does not contain '<team> beat <team>' or tied/drawn outcomes. "
            "Training was stopped instead of generating random labels."
        )

    if usable["winA"].nunique() < 2:
        raise DataValidationError(
            "Winner labels contain only one class; a classifier cannot be trained."
        )

    X = usable[config.FEATURES].apply(pd.to_numeric, errors="coerce").fillna(0.5)
    y = usable["winA"].astype(int)

    diagnostics["trainingRows"] = int(len(usable))
    diagnostics["winRate"] = float(y.mean())
    return X, y, diagnostics


def player_distributions(players: pd.DataFrame) -> dict[int, dict[str, float]]:
    """Career points distribution per player (notebook: player_dist)."""
    distributions: dict[int, dict[str, float]] = {}
    if "player_total_points" not in players.columns:
        return distributions

    points = pd.to_numeric(players["player_total_points"], errors="coerce")
    frame = players.assign(_points=points)

    for player_id, group in frame.groupby("player_id"):
        values = group["_points"].dropna()
        if len(values) > 2:
            distributions[int(player_id)] = {
                "mu": float(values.mean()),
                "std": float(max(values.std(), 0.1)),
            }
    return distributions


def dataset_summary(players: pd.DataFrame, teams: pd.DataFrame, matches: pd.DataFrame) -> dict[str, int]:
    return {
        "playerRows": int(len(players)),
        "playerCount": int(players["player_id"].nunique()),
        "teamRows": int(len(teams)),
        "teamCount": int(teams["id"].nunique()),
        "matchCount": int(matches["match_id"].nunique()),
    }
