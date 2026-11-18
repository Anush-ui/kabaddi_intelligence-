import { Match } from "../models/Match.js";
import { Player } from "../models/Player.js";
import { PlayerMatchStat } from "../models/PlayerMatchStat.js";
import { Team } from "../models/Team.js";
import { TeamMatchStat } from "../models/TeamMatchStat.js";
import { getHeadToHead } from "../services/analyticsService.js";
import { getTeamOrThrow, getTeamTrend } from "../services/teamStatsService.js";
import { ApiError, asyncHandler } from "../utils/http.js";

function teamDto(team) {
  return {
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
    latestRaidRoll5: team.latestRaidRoll5,
    latestTackleRoll5: team.latestTackleRoll5,
    avgPlayerMu: team.avgPlayerMu,
  };
}

export const listTeams = asyncHandler(async (_req, res) => {
  const teams = await Team.find().sort({ name: 1 }).lean();
  res.json({ teams: teams.map(teamDto) });
});

export const getTeam = asyncHandler(async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isFinite(teamId)) throw new ApiError(400, "Invalid team id.");

  const team = await getTeamOrThrow(teamId);
  const roster = await Player.find({ teamId })
    .sort({ avgPoints: -1 })
    .select("playerId name avgPoints matches latestStarter")
    .lean();

  res.json({
    team: {
      ...teamDto(team),
      aliases: team.aliases,
      rosterSize: roster.length,
      roster,
    },
  });
});

export const getTeamStats = asyncHandler(async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isFinite(teamId)) throw new ApiError(400, "Invalid team id.");

  const team = await getTeamOrThrow(teamId);

  const recentStats = await TeamMatchStat.find({ teamId }).sort({ matchId: -1 }).limit(20).lean();
  const matchIds = recentStats.map((row) => row.matchId);
  const matches = await Match.find({ matchId: { $in: matchIds } }).lean();
  const matchById = new Map(matches.map((match) => [match.matchId, match]));

  const history = recentStats
    .filter((row) => matchById.has(row.matchId))
    .map((row) => {
      const match = matchById.get(row.matchId);
      const isA = match.teamA.teamId === teamId;
      const opponent = isA ? match.teamB : match.teamA;
      const scoreFor = isA ? match.teamA.score : match.teamB.score;
      const scoreAgainst = isA ? match.teamB.score : match.teamA.score;
      return {
        matchId: match.matchId,
        date: match.matchDate,
        dateLabel: match.dateLabel,
        opponent: opponent.name,
        opponentId: opponent.teamId,
        scoreFor,
        scoreAgainst,
        raidSuccess: Number((row.raidSuccess * 100).toFixed(1)),
        tackleSuccess: Number((row.tackleSuccess * 100).toFixed(1)),
        result:
          match.tie || !match.winnerTeamId
            ? "Tie"
            : match.winnerTeamId === teamId
              ? "Win"
              : "Loss",
      };
    });

  const squad = await Player.find({ teamId })
    .sort({ avgPoints: -1 })
    .limit(5)
    .select("playerId name avgPoints matches raidPoints tacklePoints latestStarter")
    .lean();

  res.json({
    team: teamDto(team),
    trend: await getTeamTrend(teamId, 12),
    history,
    squad,
  });
});

export const getRoster = asyncHandler(async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isFinite(teamId)) throw new ApiError(400, "Invalid team id.");

  const team = await getTeamOrThrow(teamId);

  // The notebook's roster_for_team() uses the players who appeared in the
  // team's most recent match, with that match's starter flags. This keeps the
  // match-setup squad to a realistic 12-man roster instead of every player who
  // has ever represented the club.
  const latest = await TeamMatchStat.findOne({ teamId }).sort({ matchId: -1 }).lean();
  let roster = [];

  if (latest) {
    const appearances = await PlayerMatchStat.find({ teamId, matchId: latest.matchId }).lean();
    const players = await Player.find({ playerId: { $in: appearances.map((row) => row.playerId) } })
      .select(
        "playerId name shortName teamId teamName matches avgPoints stdPoints totalPoints raidPoints tacklePoints latestStarter"
      )
      .lean();
    const byId = new Map(players.map((player) => [player.playerId, player]));

    roster = appearances
      .map((appearance) => {
        const player = byId.get(appearance.playerId);
        if (!player) return null;
        return {
          ...player,
          teamId,
          latestStarter: Boolean(appearance.starter),
          latestMatchId: latest.matchId,
          id: player.playerId,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.avgPoints - a.avgPoints || a.name.localeCompare(b.name));
  } else {
    roster = await Player.find({ teamId }).sort({ avgPoints: -1, name: 1 }).lean();
  }

  res.json({ team: teamDto(team), players: roster });
});

export const compareTeams = asyncHandler(async (req, res) => {
  const teamA = Number(req.query.teamA);
  const teamB = Number(req.query.teamB);
  if (!Number.isFinite(teamA) || !Number.isFinite(teamB)) {
    throw new ApiError(400, "Provide two team ids.");
  }
  const comparison = await getHeadToHead(teamA, teamB);
  res.json(comparison);
});
