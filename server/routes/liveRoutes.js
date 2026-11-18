import { Router } from "express";
import {
  applySub,
  bayesian,
  previewSub,
  readSession,
  reset,
  setScore,
  startSession,
} from "../controllers/liveController.js";
import { validate } from "../middleware/validate.js";
import {
  bayesianSchema,
  createLiveSchema,
  substitutionSchema,
  updateScoreSchema,
} from "../validators/schemas.js";

export const liveRoutes = Router();

liveRoutes.get("/session", readSession);
liveRoutes.post("/session", validate(createLiveSchema), startSession);
liveRoutes.delete("/session", reset);
liveRoutes.patch("/score", validate(updateScoreSchema), setScore);
liveRoutes.post("/bayesian", validate(bayesianSchema), bayesian);
liveRoutes.post("/substitution/preview", validate(substitutionSchema), previewSub);
liveRoutes.post("/substitution", validate(substitutionSchema), applySub);
