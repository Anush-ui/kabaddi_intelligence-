import { Router } from "express";
import { modelInfo, status } from "../controllers/mlController.js";

export const mlRoutes = Router();

mlRoutes.get("/status", status);
mlRoutes.get("/model-info", modelInfo);
