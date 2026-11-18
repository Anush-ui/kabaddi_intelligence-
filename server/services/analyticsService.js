import { Match } from "../models/Match.js";
import { Player } from "../models/Player.js";
import { Team } from "../models/Team.js";
import { TeamMatchStat } from "../models/TeamMatchStat.js";
import { mlClient } from "./mlClient.js";
import { getTeamOrThrow, getTeamTrend } from "./teamStatsService.js";

export async function getOverview() {
  const [teams, playerCount, datasetMatches, savedMatches, recentSaved, recentDataset, leaders] =
    await Promise.all([
      Team.find().sort({ winRate: -1, wins: -1 }).lean(),
      Player.countDocuments(),
      Match.countDocuments({ source: "dataset" }),
      Match.countDocuments({ source: "manual" }),
      Match.find({ source: "manual" }).sort({ createdAt: -1 }).limit(5).lean(),
      Match.find({ source: "dataset" }).sort({ matchDate: -1 }).limit(5).lean(),
      Player.find({ matches: { $gte: 5 } })
        .sort({ avgPoints: -1 })
        .limit(5)
        .select("playerId name teamId teamName avgPoints matches totalPoints raidPoints tacklePoints")
        .lean(),
    ]);

  const model = await mlClient.safeModelInfo();
  const healthy = Boolean(model?.ready);

  return {
    counts: {
      teams: teams.length,
      players: playerCount,
      datasetMatches,
      savedMatches,
      totalMatches: datasetMatches + savedMatches,
    },
    model: healthy
      ? {
          ready: true,
          bestModel: model.bestModel,
          models: model.models,
          dataset: model.dataset,
          trainedAt: model.trainedAt,
          features: model.features,
        }
      : { ready: false, message: model?.message || "ML service is offline." },
    topTeams: teams
      .filter((team) => team.matchesPlayed > 0)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 6)
      .map((team) => ({
        teamId: team.externalId,
        name: team.name,
        shortName: team.shortName,
        matchesPlayed: team.matchesPlayed,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        winRate: team.winRate,
        avgRaidSuccess: team.avgRaidSuccess,
        avgTackleSuccess: team.avgTackleSuccess,
      })),
    leaders,
    recentSaved,
    recentDataset,
  };
}

export async function getHeadToHead(teamAId, teamBId) {
  if (teamAId === teamBId) {
    throw Object.assign(new Error("Choose two different teams."), { statusCode: 400 });
  }

  const [teamA, teamB] = await Promise.all([getTeamOrThrow(teamAId), getTeamOrThrow(teamBId)]);

  const matches = await Match.find({
    $and: [
      { $or: [{ "teamA.teamId": teamAId }, { "teamB.teamId": teamAId }] },
      { $or: [{ "teamA.teamId": teamBId }, { "teamB.teamId": teamBId }] },
    ],
  })
    .sort({ matchDate: -1, matchId: -1 })
    .lean();

  let winsA = 0;
  let winsB = 0;
  let ties = 0;

  for (const match of matches) {
    if (match.tie || !match.winnerTeamId) {
      ties += 1;
    } else if (match.winnerTeamId === teamAId) {
      winsA += 1;
    } else if (match.winnerTeamId === teamBId) {
      winsB += 1;
    }
  }

  const matchIds = matches.map((match) => match.matchId);
  const statRows = matchIds.length
    ? await TeamMatchStat.find({
        matchId: { $in: matchIds },
        teamId: { $in: [teamAId, teamBId] },
      }).lean()
    : [];

  const statsFor = (teamId) => statRows.filter((row) => row.teamId === teamId);
  const average = (rows, key) =>
    rows.length ? rows.reduce((sum, row) => sum + (row[key] || 0), 0) / rows.length : 0;

  const statsA = statsFor(teamAId);
  const statsB = statsFor(teamBId);

  const recent = matches.slice(0, 8).map((match) => {
    const aIsHome = match.teamA.teamId === teamAId;
    const scoreA = aIsHome ? match.teamA.score : match.teamB.score;
    const scoreB = aIsHome ? match.teamB.score : match.teamA.score;
    return {
      matchId: match.matchId,
      date: match.matchDate,
      dateLabel: match.dateLabel,
      seriesName: match.seriesName,
      result: match.result,
      tie: match.tie,
      winnerTeamId: match.winnerTeamId,
      scoreA,
      scoreB,
    };
  });

  return {
    teamA: { teamId: teamA.externalId, name: teamA.name, shortName: teamA.shortName },
    teamB: { teamId: teamB.externalId, name: teamB.name, shortName: teamB.shortName },
    played: matches.length,
    winsA,
    winsB,
    ties,
    comparison: {
      raidSuccessA: average(statsA, "raidSuccess"),
      tackleSuccessA: average(statsA, "tackleSuccess"),
      raidSuccessB: average(statsB, "raidSuccess"),
      tackleSuccessB: average(statsB, "tackleSuccess"),
      overall: {
        teamA: {
          winRate: teamA.winRate,
          avgRaidSuccess: teamA.avgRaidSuccess,
          avgTackleSuccess: teamA.avgTackleSuccess,
        },
        teamB: {
          winRate: teamB.winRate,
          avgRaidSuccess: teamB.avgRaidSuccess,
          avgTackleSuccess: teamB.avgTackleSuccess,
        },
      },
    },
    recent,
    trendA: await getTeamTrend(teamAId, 10),
    trendB: await getTeamTrend(teamBId, 10),
  };
}

export async function getPlayerPerformance({ teamId, limit = 10 } = {}) {
  const filter = teamId ? { teamIds: teamId } : {};
  const top = await Player.find({ ...filter, matches: { $gte: 3 } })
    .sort({ avgPoints: -1 })
    .limit(limit)
    .lean();

  const [topRaiders, topTacklers] = await Promise.all([
    Player.find({ ...filter, matches: { $gte: 3 } })
      .sort({ raidPoints: -1 })
      .limit(limit)
      .lean(),
    Player.find({ ...filter, matches: { $gte: 3 } })
      .sort({ tacklePoints: -1 })
      .limit(limit)
      .lean(),
  ]);

  const containing = (player) => ({
    playerId: player.playerId,
    name: player.name,
    teamId: player.teamId,
    teamName: player.teamName,
    matches: player.matches,
    avgPoints: player.avgPoints,
    totalPoints: player.totalPoints,
    raidPoints: player.raidPoints,
    tacklePoints: player.tacklePoints,
  });

  return {
    topScorers: top.map(containing),
    topRaiders: topRaiders.map(containing),
    topTacklers: topTacklers.map(containing),
  };
}
