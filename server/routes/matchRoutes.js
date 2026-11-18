import { Router } from "express";
import {
  createMatch,
  downloadReport,
  editMatch,
  getMatch,
  listMatches,
} from "../controllers/matchController.js";
import { validate } from "../middleware/validate.js";
import { matchListQuery, saveMatchSchema, updateMatchSchema } from "../validators/schemas.js";

export const matchRoutes = Router();

matchRoutes.get("/", validate(matchListQuery, "query"), listMatches);
matchRoutes.get("/history", validate(matchListQuery, "query"), listMatches);
matchRoutes.post("/", validate(saveMatchSchema), createMatch);
matchRoutes.get("/:id", getMatch);
matchRoutes.put("/:id", validate(updateMatchSchema), editMatch);
matchRoutes.get("/:id/report", downloadReport);
