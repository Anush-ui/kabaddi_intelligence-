import { LiveSession } from "../models/LiveSession.js";
import { Match } from "../models/Match.js";
import { Player } from "../models/Player.js";
import { PlayerMatchStat } from "../models/PlayerMatchStat.js";
import { Team } from "../models/Team.js";
import { TeamMatchStat } from "../models/TeamMatchStat.js";
import { mean, parseDateLabel, sampleStd, todayLabel } from "./datasetTransform.js";
import { refreshTeamAggregates } from "./teamStatsService.js";
import { ApiError } from "../utils/http.js";

export async function nextMatchId() {
  const last = await Match.findOne().sort({ matchId: -1 }).select("matchId").lean();
  return (last?.matchId ?? 9000) + 1;
}

export function matchSummary(match) {
  return {
    id: match._id.toString(),
    matchId: match.matchId,
    source: match.source,
    date: match.matchDate,
    dateLabel: match.dateLabel,
    seriesName: match.seriesName,
    status: match.status,
    result: match.result,
    tie: match.tie,
    winnerTeamId: match.winnerTeamId,
    teamA: match.teamA,
    teamB: match.teamB,
    probabilityA: match.prediction?.probabilityA ?? null,
    createdAt: match.createdAt,
  };
}

async function refreshPlayerAggregates(playerIds) {
  if (!playerIds.length) return;

  const stats = await PlayerMatchStat.find({ playerId: { $in: playerIds } }).lean();
  const teams = await Team.find({ externalId: { $in: stats.map((row) => row.teamId) } }).lean();
  const teamNames = new Map(teams.map((team) => [team.externalId, team.name]));

  const byPlayer = new Map();
  for (const row of stats) {
    if (!byPlayer.has(row.playerId)) byPlayer.set(row.playerId, []);
    byPlayer.get(row.playerId).push(row);
  }

  const operations = [];
  for (const [playerId, rows] of byPlayer.entries()) {
    const points = rows.map((row) => row.points || 0);
    const latest = [...rows].sort((a, b) => b.matchId - a.matchId)[0];
    const sum = (key) => rows.reduce((total, row) => total + (row[key] || 0), 0);

    operations.push({
      updateOne: {
        filter: { playerId },
        update: {
          $set: {
            matches: rows.length,
            avgPoints: mean(points),
            stdPoints: Math.max(sampleStd(points), 0.1),
            totalPoints: sum("points"),
            raidPoints: sum("raidPoints"),
            tacklePoints: sum("tacklePoints"),
            raidsTotal: sum("raidsTotal"),
            raidsSuccessful: sum("raidsSuccessful"),
            tacklesTotal: sum("tacklesTotal"),
            tacklesSuccessful: sum("tacklesSuccessful"),
            teamId: latest.teamId,
            teamName: teamNames.get(latest.teamId) || "",
            teamIds: [...new Set(rows.map((row) => row.teamId))],
            latestMatchId: latest.matchId,
            latestStarter: Boolean(latest.starter),
          },
        },
      },
    });
  }

  if (operations.length) {
    await Player.bulkWrite(operations, { ordered: false });
  }
}

/**
 * Turn the current live session into a stored match. This migrates the
 * notebook's save_match_to_db(): append player rows, match row and team rows,
 * then refresh the player/team caches. MongoDB replaces the CSV writes.
 */
export async function saveSessionAsMatch(userId, body) {
  const session = await LiveSession.findOne({ user: userId });
  if (!session) {
    throw new ApiError(404, "There is no live match to save. Start one from Match Setup.");
  }

  const allLineupPlayers = [
    ...session.startersA.map((player) => ({ ...player.toObject(), teamId: session.teamA.teamId, side: "A", starter: true })),
    ...session.benchA.map((player) => ({ ...player.toObject(), teamId: session.teamA.teamId, side: "A", starter: false })),
    ...session.startersB.map((player) => ({ ...player.toObject(), teamId: session.teamB.teamId, side: "B", starter: true })),
    ...session.benchB.map((player) => ({ ...player.toObject(), teamId: session.teamB.teamId, side: "B", starter: false })),
  ];

  const submitted = new Map(
    (body.performances || []).map((performance) => [Number(performance.playerId), performance])
  );

  const performances = allLineupPlayers.map((player) => {
    const entry = submitted.get(player.playerId);
    return {
      playerId: player.playerId,
      name: player.name,
      teamId: player.teamId,
      starter: player.starter,
      points: Number(entry?.points ?? 0),
      raidPoints:
        entry?.raidPoints === undefined || entry?.raidPoints === null
          ? null
          : Number(entry.raidPoints),
      tacklePoints:
        entry?.tacklePoints === undefined || entry?.tacklePoints === null
          ? null
          : Number(entry.tacklePoints),
    };
  });

  const { scoreA, scoreB } = session;
  const tie = scoreA === scoreB;
  const winnerTeamId = tie ? null : scoreA > scoreB ? session.teamA.teamId : session.teamB.teamId;
  const winnerName = tie
    ? null
    : scoreA > scoreB
      ? session.teamA.name
      : session.teamB.name;
  const loserName = tie
    ? null
    : scoreA > scoreB
      ? session.teamB.name
      : session.teamA.name;

  const result = tie
    ? `Match Tied (${scoreA} - ${scoreB})`
    : `${winnerName} beat ${loserName} (${scoreA} - ${scoreB})`;

  const dateLabel = body.dateLabel?.trim() || todayLabel();
  const matchDate = parseDateLabel(dateLabel) || new Date();
  const matchId = await nextMatchId();

  const features = session.features || {};
  const teamStatRows = [
    {
      teamId: session.teamA.teamId,
      matchId,
      score: scoreA,
      raidsSuccessful: Math.round((features.raid_success_A ?? 0.5) * 10),
      raidsTotal: 10,
      tacklesSuccessful: Math.round((features.tackle_success_A ?? 0.4) * 10),
      tacklesTotal: 10,
      raidSuccess: features.raid_success_A ?? 0.5,
      tackleSuccess: features.tackle_success_A ?? 0.4,
    },
    {
      teamId: session.teamB.teamId,
      matchId,
      score: scoreB,
      raidsSuccessful: Math.round((features.raid_success_B ?? 0.5) * 10),
      raidsTotal: 10,
      tacklesSuccessful: Math.round((features.tackle_success_B ?? 0.4) * 10),
      tacklesTotal: 10,
      raidSuccess: features.raid_success_B ?? 0.5,
      tackleSuccess: features.tackle_success_B ?? 0.4,
    },
  ];

  let createdMatch = null;
  try {
    createdMatch = await Match.create({
      matchId,
      source: "manual",
      matchDate,
      dateLabel,
      seriesName: "Live Match",
      status: "Full Time",
      venue: body.venue || "",
      result,
      winnerTeamId,
      tie,
      teamA: { teamId: session.teamA.teamId, name: session.teamA.name, score: scoreA },
      teamB: { teamId: session.teamB.teamId, name: session.teamB.name, score: scoreB },
      lineups: {
        startersA: session.startersA.map(({ playerId, name, mu }) => ({ playerId, name, mu })),
        benchA: session.benchA.map(({ playerId, name, mu }) => ({ playerId, name, mu })),
        startersB: session.startersB.map(({ playerId, name, mu }) => ({ playerId, name, mu })),
        benchB: session.benchB.map(({ playerId, name, mu }) => ({ playerId, name, mu })),
      },
      playerPerformances: performances,
      prediction: {
        probabilityA: session.probabilityA,
        baseProbabilityA: session.baseProbabilityA,
        scoreShift: session.scoreShift,
        features: session.features,
        modelName: session.modelName,
      },
      timeline: session.timeline,
      notes: body.notes || "",
      createdBy: userId,
    });

    await PlayerMatchStat.insertMany(
      performances.map((performance) => {
        const lineupPlayer = allLineupPlayers.find(
          (player) => player.playerId === performance.playerId
        );
        return {
          playerId: performance.playerId,
          teamId: performance.teamId,
          matchId,
          points: performance.points,
          raidPoints: performance.raidPoints,
          tacklePoints: performance.tacklePoints,
          raidsTotal: 0,
          raidsSuccessful: 0,
          tacklesTotal: 0,
          tacklesSuccessful: 0,
          starter: performance.starter,
          source: "manual",
        };
      })
    );

    await TeamMatchStat.insertMany(teamStatRows);

    await refreshPlayerAggregates(performances.map((performance) => performance.playerId));
    await refreshTeamAggregates(session.teamA.teamId);
    await refreshTeamAggregates(session.teamB.teamId);

    await LiveSession.deleteOne({ user: userId });
  } catch (error) {
    // Best-effort rollback so a failed save cannot leave duplicate match rows.
    if (createdMatch) {
      await Match.deleteOne({ _id: createdMatch._id }).catch(() => {});
    }
    await PlayerMatchStat.deleteMany({ matchId, source: "manual" }).catch(() => {});
    await TeamMatchStat.deleteMany({ matchId }).catch(() => {});
    throw error;
  }

  return createdMatch;
}

export async function updateMatch(matchId, userId, body) {
  const match = await Match.findOne({ _id: matchId }).catch(() => null);
  if (!match) throw new ApiError(404, "Match not found.");
  if (match.source !== "manual") {
    throw new ApiError(403, "Imported dataset matches are read-only.");
  }
  if (String(match.createdBy) !== String(userId)) {
    throw new ApiError(403, "You can only edit matches you saved.");
  }

  if (body.notes !== undefined) match.notes = body.notes;
  if (body.venue !== undefined) match.venue = body.venue;
  await match.save();
  return match;
}
