import { Router } from "express";
import {
  compareTeams,
  getRoster,
  getTeam,
  getTeamStats,
  listTeams,
} from "../controllers/teamController.js";

export const teamRoutes = Router();

teamRoutes.get("/", listTeams);
teamRoutes.get("/compare", compareTeams);
teamRoutes.get("/:teamId", getTeam);
teamRoutes.get("/:teamId/stats", getTeamStats);
teamRoutes.get("/:teamId/roster", getRoster);
