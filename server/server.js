import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { mlClient } from "./services/mlClient.js";

async function start() {
  await connectDatabase();

  const health = await mlClient.safeHealth();
  if (health.modelReady) {
    console.log(
      `[ml] ready at ${env.mlServiceUrl} | ${health.bestModel?.name} (ROC-AUC ${health.bestModel?.rocAuc})`
    );
  } else {
    console.warn(
      `[ml] not ready at ${env.mlServiceUrl}. ${health.message || "Train the model: cd ml-service && python -m app.train"}`
    );
  }

  const server = app.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("[api] failed to start:", error.message);
  process.exit(1);
});
