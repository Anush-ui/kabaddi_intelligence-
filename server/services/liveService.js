import { LiveSession } from "../models/LiveSession.js";
import { Player } from "../models/Player.js";
import { mlClient } from "./mlClient.js";
import { buildTeamContext, getTeamOrThrow } from "./teamStatsService.js";
import { ApiError } from "../utils/http.js";

const MAX_STARTERS = 7;
const MIN_STARTERS = 5;
const MAX_BENCH = 7;

function assertLineup(side, starters, bench) {
  if (!Array.isArray(starters) || starters.length < MIN_STARTERS || starters.length > MAX_STARTERS) {
    throw new ApiError(400, `Team ${side} needs between ${MIN_STARTERS} and ${MAX_STARTERS} starters.`);
  }
  if (!Array.isArray(bench) || bench.length > MAX_BENCH) {
    throw new ApiError(400, `Team ${side} can have at most ${MAX_BENCH} bench players.`);
  }
  const ids = [...starters, ...bench].map(Number);
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, `Team ${side} contains the same player twice.`);
  }
}

function toMlPlayer(player) {
  return {
    id: player.playerId,
    name: player.name,
    mu: player.mu,
    std: player.std,
  };
}

function sessionTeam(team, players) {
  return {
    teamId: team.externalId,
    name: team.name,
    shortName: team.shortName,
    players,
  };
}

export function serializeSession(session) {
  if (!session) return null;
  const value = session.toObject ? session.toObject() : session;
  return {
    teamA: {
      teamId: value.teamA.teamId,
      name: value.teamA.name,
      shortName: value.teamA.shortName,
      score: value.scoreA,
      starters: value.startersA,
      bench: value.benchA,
    },
    teamB: {
      teamId: value.teamB.teamId,
      name: value.teamB.name,
      shortName: value.teamB.shortName,
      score: value.scoreB,
      starters: value.startersB,
      bench: value.benchB,
    },
    scoreA: value.scoreA,
    scoreB: value.scoreB,
    features: value.features,
    probabilityA: value.probabilityA,
    baseProbabilityA: value.baseProbabilityA,
    scoreShift: value.scoreShift,
    modelName: value.modelName,
    modelRocAuc: value.modelRocAuc,
    timeline: value.timeline,
    updatedAt: value.updatedAt,
  };
}

async function getSessionOrThrow(userId) {
  const session = await LiveSession.findOne({ user: userId });
  if (!session) {
    throw new ApiError(404, "No live match is in progress. Start one from Match Setup.");
  }
  return session;
}

async function loadPlayerSnapshots(playerIds) {
  const players = await Player.find({ playerId: { $in: playerIds } }).lean();
  const map = new Map(players.map((player) => [player.playerId, player]));
  return playerIds.map((id) => {
    const player = map.get(Number(id));
    if (!player) throw new ApiError(404, `Player ${id} was not found.`);
    return {
      playerId: player.playerId,
      name: player.name,
      mu: player.avgPoints,
      std: player.stdPoints,
      matches: player.matches,
    };
  });
}

function validateTeamOwnership(side, snapshots, teamId, playersById) {
  for (const snapshot of snapshots) {
    const player = playersById.get(snapshot.playerId);
    if (!player || !player.teamIds?.includes(teamId)) {
      throw new ApiError(400, `Player ${snapshot.playerId} does not belong to Team ${side}.`);
    }
  }
}

async function computePrediction(session) {
  const [teamAContext, teamBContext] = await Promise.all([
    buildTeamContext(session.teamA.teamId),
    buildTeamContext(session.teamB.teamId),
  ]);

  const payload = {
    teamA: teamAContext,
    teamB: teamBContext,
    startersA: session.startersA.map(toMlPlayer),
    startersB: session.startersB.map(toMlPlayer),
    scoreA: session.scoreA,
    scoreB: session.scoreB,
  };

  const prediction = await mlClient.predict(payload);
  return { prediction, contexts: { teamA: teamAContext, teamB: teamBContext } };
}

function applyPrediction(session, prediction) {
  session.features = prediction.features;
  session.probabilityA = prediction.probabilityA;
  session.baseProbabilityA = prediction.baseProbabilityA;
  session.scoreShift = prediction.scoreShift;
  session.modelName = prediction.model || "";
  session.modelRocAuc = prediction.modelRocAuc ?? null;
}

export async function getSession(userId) {
  const session = await LiveSession.findOne({ user: userId });
  return serializeSession(session);
}

export async function createSession(userId, body) {
  const { teamAId, teamBId, startersA, benchA, startersB, benchB } = body;

  if (teamAId === teamBId) {
    throw new ApiError(400, "Choose two different teams.");
  }

  assertLineup("A", startersA, benchA);
  assertLineup("B", startersB, benchB);

  const [teamA, teamB] = await Promise.all([getTeamOrThrow(teamAId), getTeamOrThrow(teamBId)]);

  const allIds = [...startersA, ...benchA, ...startersB, ...benchB].map(Number);
  if (new Set(allIds).size !== allIds.length) {
    throw new ApiError(400, "A player cannot appear on both teams.");
  }

  const players = await Player.find({ playerId: { $in: allIds } }).lean();
  const playersById = new Map(players.map((player) => [player.playerId, player]));

  const starterIdsA = startersA.map(Number);
  const starterIdsB = startersB.map(Number);
  const benchIdsA = benchA.map(Number);
  const benchIdsB = benchB.map(Number);

  const snapshotA = await loadPlayerSnapshots([...starterIdsA, ...benchIdsA]);
  const snapshotB = await loadPlayerSnapshots([...starterIdsB, ...benchIdsB]);

  validateTeamOwnership("A", snapshotA, teamAId, playersById);
  validateTeamOwnership("B", snapshotB, teamBId, playersById);

  const mapA = new Map(snapshotA.map((player) => [player.playerId, player]));
  const mapB = new Map(snapshotB.map((player) => [player.playerId, player]));

  const session = new LiveSession({
    user: userId,
    teamA: { teamId: teamA.externalId, name: teamA.name, shortName: teamA.shortName },
    teamB: { teamId: teamB.externalId, name: teamB.name, shortName: teamB.shortName },
    startersA: starterIdsA.map((id) => mapA.get(id)),
    benchA: benchIdsA.map((id) => mapA.get(id)),
    startersB: starterIdsB.map((id) => mapB.get(id)),
    benchB: benchIdsB.map((id) => mapB.get(id)),
    scoreA: 0,
    scoreB: 0,
  });

  const { prediction } = await computePrediction(session);
  applyPrediction(session, prediction);
  session.timeline = [
    {
      label: "Start",
      probabilityA: prediction.probabilityA,
      scoreA: 0,
      scoreB: 0,
      type: "start",
      at: new Date(),
    },
  ];

  await session.save();

  return {
    session: serializeSession(session),
    prediction,
  };
}

export async function updateScore(userId, { scoreA, scoreB }) {
  const session = await getSessionOrThrow(userId);
  session.scoreA = scoreA;
  session.scoreB = scoreB;

  const { prediction } = await computePrediction(session);
  applyPrediction(session, prediction);
  session.timeline.push({
    label: `${scoreA}-${scoreB}`,
    probabilityA: prediction.probabilityA,
    scoreA,
    scoreB,
    type: "score",
    at: new Date(),
  });

  await session.save();
  return { session: serializeSession(session), prediction };
}

function findOnCourt(session, playerId) {
  const inA = session.startersA.find((player) => player.playerId === playerId);
  if (inA) return { player: inA, side: "A" };
  const inB = session.startersB.find((player) => player.playerId === playerId);
  if (inB) return { player: inB, side: "B" };
  return null;
}

export async function applyBayesianUpdate(userId, { playerId, observedPoints }) {
  const session = await getSessionOrThrow(userId);
  const found = findOnCourt(session, Number(playerId));
  if (!found) {
    throw new ApiError(400, "Select a player who is currently on court.");
  }

  const { player, side } = found;
  if (!player.matches || player.matches <= 2) {
    throw new ApiError(400, "That player does not have enough match history for a Bayesian update.");
  }

  // The Bayesian formula always models "does this side win". For a Team B
  // player we flip the prior, then flip the posterior back to Team A.
  const priorForSide = side === "A" ? session.probabilityA : 1 - session.probabilityA;
  const result = await mlClient.bayesian({
    prior: priorForSide,
    observed: observedPoints,
    mu: player.mu,
    std: player.std,
  });

  const posteriorA = side === "A" ? result.posterior : 1 - result.posterior;
  const previousA = session.probabilityA;
  session.probabilityA = posteriorA;
  session.timeline.push({
    label: `${player.name.split(" ")[0]}: ${observedPoints} pts`,
    probabilityA: posteriorA,
    scoreA: session.scoreA,
    scoreB: session.scoreB,
    type: "bayesian",
    at: new Date(),
  });

  await session.save();

  return {
    session: serializeSession(session),
    update: {
      player: { playerId: player.playerId, name: player.name, side },
      expectedPoints: player.mu,
      stdPoints: player.std,
      observedPoints,
      deviation: result.deviation,
      zScore: result.zScore,
      likelihoodRatio: result.likelihoodRatio,
      priorProbabilityA: previousA,
      posteriorProbabilityA: posteriorA,
      adjustment: posteriorA - previousA,
      alpha: result.alpha,
    },
  };
}

function predictionPayload(session) {
  return {
    teamA: null,
    teamB: null,
    startersA: session.startersA.map(toMlPlayer),
    startersB: session.startersB.map(toMlPlayer),
    benchA: session.benchA.map(toMlPlayer),
    benchB: session.benchB.map(toMlPlayer),
    scoreA: session.scoreA,
    scoreB: session.scoreB,
  };
}

async function withTeamContexts(session) {
  const [teamA, teamB] = await Promise.all([
    buildTeamContext(session.teamA.teamId),
    buildTeamContext(session.teamB.teamId),
  ]);
  return { teamA, teamB };
}

function assertSwap(session, side, outPlayerId, inPlayerId) {
  const starters = side === "A" ? session.startersA : session.startersB;
  const bench = side === "A" ? session.benchA : session.benchB;
  const outPlayer = starters.find((player) => player.playerId === outPlayerId);
  const inPlayer = bench.find((player) => player.playerId === inPlayerId);

  if (!outPlayer) throw new ApiError(400, "The outgoing player is not in the starting seven.");
  if (!inPlayer) throw new ApiError(400, "The incoming player is not on the bench.");
  return { outPlayer, inPlayer };
}

export async function previewSubstitution(userId, body) {
  const session = await getSessionOrThrow(userId);
  const side = body.side;
  const outPlayerId = Number(body.outPlayerId);
  const inPlayerId = Number(body.inPlayerId);
  assertSwap(session, side, outPlayerId, inPlayerId);

  const contexts = await withTeamContexts(session);
  const payload = {
    ...predictionPayload(session),
    teamA: contexts.teamA,
    teamB: contexts.teamB,
    side,
    outPlayerId,
    inPlayerId,
  };

  return mlClient.substitutionImpact(payload);
}

export async function applySubstitution(userId, body) {
  const session = await getSessionOrThrow(userId);
  const side = body.side;
  const outPlayerId = Number(body.outPlayerId);
  const inPlayerId = Number(body.inPlayerId);
  const { outPlayer, inPlayer } = assertSwap(session, side, outPlayerId, inPlayerId);

  if (side === "A") {
    session.startersA = session.startersA.map((player) =>
      player.playerId === outPlayerId ? inPlayer : player
    );
    session.benchA = session.benchA.map((player) =>
      player.playerId === inPlayerId ? outPlayer : player
    );
  } else {
    session.startersB = session.startersB.map((player) =>
      player.playerId === outPlayerId ? inPlayer : player
    );
    session.benchB = session.benchB.map((player) =>
      player.playerId === inPlayerId ? outPlayer : player
    );
  }

  const { prediction } = await computePrediction(session);
  applyPrediction(session, prediction);
  session.timeline.push({
    label: `Sub: ${inPlayer.name.split(" ")[0]} for ${outPlayer.name.split(" ")[0]}`,
    probabilityA: prediction.probabilityA,
    scoreA: session.scoreA,
    scoreB: session.scoreB,
    type: "substitution",
    at: new Date(),
  });

  await session.save();

  return {
    session: serializeSession(session),
    prediction,
    substitution: {
      side,
      outPlayer: { playerId: outPlayer.playerId, name: outPlayer.name },
      inPlayer: { playerId: inPlayer.playerId, name: inPlayer.name },
    },
  };
}

export async function resetSession(userId) {
  await LiveSession.deleteOne({ user: userId });
  return { ok: true };
}
