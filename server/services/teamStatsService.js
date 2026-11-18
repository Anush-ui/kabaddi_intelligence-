import { Match } from "../models/Match.js";
import { Player } from "../models/Player.js";
import { Team } from "../models/Team.js";
import { TeamMatchStat } from "../models/TeamMatchStat.js";
import { mean, withRollingForm } from "./datasetTransform.js";
import { ApiError } from "../utils/http.js";

export async function getTeamOrThrow(teamId) {
  const team = await Team.findOne({ externalId: teamId });
  if (!team) throw new ApiError(404, `Team ${teamId} was not found.`);
  return team;
}

/**
 * Prediction context for one team, mirroring the notebook caches:
 *  - latest rolling raid/tackle form
 *  - mean career points of every player who has appeared for the team
 */
export async function buildTeamContext(teamId) {
  const team = await getTeamOrThrow(teamId);
  const latest = await TeamMatchStat.findOne({ teamId }).sort({ matchId: -1 }).lean();

  const [aggregate] = await Player.aggregate([
    { $match: { teamIds: teamId, matches: { $gt: 0 } } },
    { $group: { _id: null, avgMu: { $avg: "$avgPoints" } } },
  ]);

  return {
    id: team.externalId,
    name: team.name,
    raidSuccess: latest?.raidRoll5 ?? team.latestRaidRoll5 ?? 0.5,
    tackleSuccess: latest?.tackleRoll5 ?? team.latestTackleRoll5 ?? 0.4,
    avgMu: aggregate?.avgMu || team.avgPlayerMu || 1,
  };
}

export async function getTeamTrend(teamId, limit = 12) {
  const rows = await TeamMatchStat.find({ teamId }).sort({ matchId: -1 }).limit(limit).lean();
  return rows.reverse().map((row) => ({
    matchId: row.matchId,
    score: row.score,
    raidSuccess: Number((row.raidSuccess * 100).toFixed(1)),
    tackleSuccess: Number((row.tackleSuccess * 100).toFixed(1)),
  }));
}

/**
 * Recompute rolling form and aggregate record for a team. Used after import and
 * after a live match is saved (the notebook refreshed the same caches and wrote
 * the CSVs on save).
 */
export async function refreshTeamAggregates(teamId) {
  const stats = await TeamMatchStat.find({ teamId }).sort({ matchId: 1 }).lean();
  const rolled = withRollingForm(stats);

  if (rolled.length) {
    await TeamMatchStat.bulkWrite(
      rolled.map((row) => ({
        updateOne: {
          filter: { teamId: row.teamId, matchId: row.matchId },
          update: { $set: { raidRoll5: row.raidRoll5, tackleRoll5: row.tackleRoll5 } },
        },
      })),
      { ordered: false }
    );
  }

  const matches = await Match.find({
    $or: [{ "teamA.teamId": teamId }, { "teamB.teamId": teamId }],
  })
    .select("winnerTeamId tie")
    .lean();

  const wins = matches.filter((match) => match.winnerTeamId === teamId).length;
  const ties = matches.filter((match) => match.tie).length;
  const losses = matches.length - wins - ties;
  const decisive = wins + losses;

  const [aggregate] = await Player.aggregate([
    { $match: { teamIds: teamId, matches: { $gt: 0 } } },
    { $group: { _id: null, avgMu: { $avg: "$avgPoints" } } },
  ]);

  const latest = rolled.length ? rolled[rolled.length - 1] : null;
  const payload = {
    matchesPlayed: matches.length,
    wins,
    losses,
    ties,
    winRate: decisive > 0 ? wins / decisive : 0,
    avgRaidSuccess: mean(stats.map((row) => row.raidSuccess)),
    avgTackleSuccess: mean(stats.map((row) => row.tackleSuccess)),
    latestRaidRoll5: latest?.raidRoll5 ?? null,
    latestTackleRoll5: latest?.tackleRoll5 ?? null,
    avgPlayerMu: aggregate?.avgMu || 0,
  };

  await Team.updateOne({ externalId: teamId }, { $set: payload });
  return payload;
}

export async function refreshAllTeamAggregates() {
  const teams = await Team.find().select("externalId").lean();
  for (const team of teams) {
    await refreshTeamAggregates(team.externalId);
  }
}
