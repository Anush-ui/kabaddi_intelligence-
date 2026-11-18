import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { analyticsRoutes } from "./routes/analyticsRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { liveRoutes } from "./routes/liveRoutes.js";
import { matchRoutes } from "./routes/matchRoutes.js";
import { mlRoutes } from "./routes/mlRoutes.js";
import { playerRoutes } from "./routes/playerRoutes.js";
import { teamRoutes } from "./routes/teamRoutes.js";

export const app = express();

app.disable("x-powered-by");
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.isProduction ? "combined" : "dev"));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "kabaddi-coach-server", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/teams", requireAuth, teamRoutes);
app.use("/api/players", requireAuth, playerRoutes);
app.use("/api/matches", requireAuth, matchRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/live", requireAuth, liveRoutes);
app.use("/api/ml", requireAuth, mlRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
