import { Match } from "../models/Match.js";
import { TeamMatchStat } from "../models/TeamMatchStat.js";
import { matchSummary, saveSessionAsMatch, updateMatch } from "../services/matchService.js";
import { buildReportCsv, buildReportData } from "../services/reportService.js";
import { ApiError, asyncHandler } from "../utils/http.js";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findMatch(identifier) {
  const query = /^[0-9a-fA-F]{24}$/.test(identifier)
    ? { _id: identifier }
    : { matchId: Number(identifier) };
  const match = await Match.findOne(query);
  if (!match) throw new ApiError(404, "Match not found.");
  return match;
}

export const listMatches = asyncHandler(async (req, res) => {
  const { page, limit, source, team, q } = req.query;

  const conditions = [];
  if (source) conditions.push({ source });
  if (team) {
    conditions.push({ $or: [{ "teamA.teamId": team }, { "teamB.teamId": team }] });
  }
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    conditions.push({
      $or: [{ result: regex }, { "teamA.name": regex }, { "teamB.name": regex }, { seriesName: regex }],
    });
  }

  const filter = conditions.length ? { $and: conditions } : {};
  const [matches, total] = await Promise.all([
    Match.find(filter)
      .sort({ matchDate: -1, matchId: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Match.countDocuments(filter),
  ]);

  res.json({
    matches: matches.map(matchSummary),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getMatch = asyncHandler(async (req, res) => {
  const match = await findMatch(req.params.id);
  const teamStats = await TeamMatchStat.find({ matchId: match.matchId }).lean();
  res.json({ match: buildReportData(match, teamStats), raw: matchSummary(match) });
});

export const createMatch = asyncHandler(async (req, res) => {
  const match = await saveSessionAsMatch(req.user._id, req.body);
  res.status(201).json({
    message: "Match saved to MongoDB. Player and team statistics were refreshed.",
    match: matchSummary(match),
  });
});

export const editMatch = asyncHandler(async (req, res) => {
  const match = await findMatch(req.params.id);
  const updated = await updateMatch(match._id, req.user._id, req.body);
  res.json({ match: matchSummary(updated) });
});

export const downloadReport = asyncHandler(async (req, res) => {
  const match = await findMatch(req.params.id);
  const teamStats = await TeamMatchStat.find({ matchId: match.matchId }).lean();
  const format = String(req.query.format || "csv").toLowerCase();

  if (format === "json") {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="match-${match.matchId}-report.json"`
    );
    return res.json(buildReportData(match, teamStats));
  }

  if (format !== "csv") {
    throw new ApiError(400, "Report format must be csv or json.");
  }

  const csv = buildReportCsv(match, teamStats);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="match-${match.matchId}-report.csv"`);
  // BOM keeps Excel happy with the dashboard's unicode names.
  return res.send(`\uFEFF${csv}`);
});
