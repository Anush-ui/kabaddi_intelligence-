import {
  getHeadToHead,
  getOverview,
  getPlayerPerformance,
} from "../services/analyticsService.js";
import { asyncHandler } from "../utils/http.js";

export const overview = asyncHandler(async (_req, res) => {
  res.json(await getOverview());
});

export const headToHead = asyncHandler(async (req, res) => {
  const { teamA, teamB } = req.query;
  res.json(await getHeadToHead(teamA, teamB));
});

export const playerPerformance = asyncHandler(async (req, res) => {
  const { team, limit } = req.query;
  res.json(await getPlayerPerformance({ teamId: team, limit }));
});
