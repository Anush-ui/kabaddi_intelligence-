import { Router } from "express";
import {
  getPlayer,
  getPlayersByTeam,
  listPlayers,
} from "../controllers/playerController.js";
import { validate } from "../middleware/validate.js";
import { playerListQuery } from "../validators/schemas.js";

export const playerRoutes = Router();

playerRoutes.get("/", validate(playerListQuery, "query"), listPlayers);
playerRoutes.get("/team/:teamId", getPlayersByTeam);
playerRoutes.get("/:playerId", getPlayer);
