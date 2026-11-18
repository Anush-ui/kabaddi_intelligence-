import { Match } from "../models/Match.js";
import { Player } from "../models/Player.js";
import { PlayerMatchStat } from "../models/PlayerMatchStat.js";
import { ApiError, asyncHandler } from "../utils/http.js";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function playerDto(player) {
  return {
    playerId: player.playerId,
    name: player.name,
    shortName: player.shortName,
    teamId: player.teamId,
    teamName: player.teamName,
    matches: player.matches,
    avgPoints: player.avgPoints,
    stdPoints: player.stdPoints,
    totalPoints: player.totalPoints,
    raidPoints: player.raidPoints,
    tacklePoints: player.tacklePoints,
    raidsTotal: player.raidsTotal,
    raidsSuccessful: player.raidsSuccessful,
    tacklesTotal: player.tacklesTotal,
    tacklesSuccessful: player.tacklesSuccessful,
    latestStarter: player.latestStarter,
    raidSuccessRate: player.raidsTotal > 0 ? player.raidsSuccessful / player.raidsTotal : 0,
    tackleSuccessRate: player.tacklesTotal > 0 ? player.tacklesSuccessful / player.tacklesTotal : 0,
  };
}

export const listPlayers = asyncHandler(async (req, res) => {
  const { page, limit, search, team, sort, order, minMatches } = req.query;

  const conditions = [{ matches: { $gte: minMatches } }];
  if (team) conditions.push({ teamIds: team });
  if (search) {
    conditions.push({ name: new RegExp(escapeRegex(search), "i") });
  }
  const filter = { $and: conditions };

  const [players, total] = await Promise.all([
    Player.find(filter)
      .sort({ [sort]: order === "asc" ? 1 : -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Player.countDocuments(filter),
  ]);

  res.json({
    players: players.map(playerDto),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getPlayer = asyncHandler(async (req, res) => {
  const playerId = Number(req.params.playerId);
  if (!Number.isFinite(playerId)) throw new ApiError(400, "Invalid player id.");

  const player = await Player.findOne({ playerId }).lean();
  if (!player) throw new ApiError(404, "Player not found.");

  const appearances = await PlayerMatchStat.find({ playerId }).sort({ matchId: -1 }).limit(12).lean();
  const matches = await Match.find({ matchId: { $in: appearances.map((row) => row.matchId) } })
    .select("matchId matchDate dateLabel teamA teamB result tie winnerTeamId seriesName")
    .lean();
  const matchById = new Map(matches.map((match) => [match.matchId, match]));

  const recent = appearances.map((row) => {
    const match = matchById.get(row.matchId);
    const opponent = match
      ? match.teamA.teamId === row.teamId
        ? match.teamB.name
        : match.teamA.name
      : "";
    return {
      matchId: row.matchId,
      date: match?.matchDate ?? null,
      opponent,
      points: row.points,
      raidPoints: row.raidPoints,
      tacklePoints: row.tacklePoints,
      starter: row.starter,
      result: match?.result || "",
    };
  });

  res.json({ player: playerDto(player), recent });
});

export const getPlayersByTeam = asyncHandler(async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isFinite(teamId)) throw new ApiError(400, "Invalid team id.");

  const players = await Player.find({ teamId }).sort({ avgPoints: -1, name: 1 }).lean();
  res.json({ players: players.map(playerDto) });
});
