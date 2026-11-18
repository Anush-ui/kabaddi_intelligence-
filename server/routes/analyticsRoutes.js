import { Router } from "express";
import {
  headToHead,
  overview,
  playerPerformance,
} from "../controllers/analyticsController.js";
import { validate } from "../middleware/validate.js";
import {
  headToHeadQuery,
  playerPerformanceQuery,
} from "../validators/schemas.js";

export const analyticsRoutes = Router();

analyticsRoutes.get("/overview", overview);
analyticsRoutes.get("/head-to-head", validate(headToHeadQuery, "query"), headToHead);
analyticsRoutes.get(
  "/player-performance",
  validate(playerPerformanceQuery, "query"),
  playerPerformance
);
