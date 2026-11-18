"""Request/response validation for the ML service."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class PlayerRef(BaseModel):
    id: int
    name: str = ""
    mu: float = Field(default=0.0, ge=-50, le=100)
    std: float = Field(default=0.0, ge=0, le=100)


class TeamContext(BaseModel):
    id: int
    name: str = ""
    raidSuccess: float = Field(default=0.5, ge=0, le=1)
    tackleSuccess: float = Field(default=0.4, ge=0, le=1)
    avgMu: float = Field(default=1.0, ge=0, le=100)


class PredictionRequest(BaseModel):
    teamA: TeamContext
    teamB: TeamContext
    startersA: list[PlayerRef] = Field(min_length=1, max_length=7)
    startersB: list[PlayerRef] = Field(min_length=1, max_length=7)
    scoreA: int = Field(default=0, ge=0, le=200)
    scoreB: int = Field(default=0, ge=0, le=200)

    @model_validator(mode="after")
    def teams_must_differ(self) -> "PredictionRequest":
        if self.teamA.id == self.teamB.id:
            raise ValueError("Team A and Team B must be different teams.")
        return self

    @field_validator("startersA", "startersB")
    @classmethod
    def unique_players(cls, players: list[PlayerRef]) -> list[PlayerRef]:
        ids = [player.id for player in players]
        if len(ids) != len(set(ids)):
            raise ValueError("A starting lineup cannot contain the same player twice.")
        return players


class BayesianRequest(BaseModel):
    prior: float = Field(ge=0.0, le=1.0)
    observed: float = Field(ge=-10, le=100)
    mu: float = Field(ge=0, le=100)
    std: float = Field(ge=0, le=100)


class SubstitutionRequest(PredictionRequest):
    side: Literal["A", "B"]
    outPlayerId: int
    inPlayerId: int
    benchA: list[PlayerRef] = Field(default_factory=list, max_length=12)
    benchB: list[PlayerRef] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def different_players(self) -> "SubstitutionRequest":
        if self.outPlayerId == self.inPlayerId:
            raise ValueError("Choose two different players for the substitution.")
        return self
