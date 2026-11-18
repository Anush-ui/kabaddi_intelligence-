import { mlClient } from "../services/mlClient.js";
import { asyncHandler } from "../utils/http.js";

export const status = asyncHandler(async (_req, res) => {
  const [health, model] = await Promise.all([mlClient.safeHealth(), mlClient.safeModelInfo()]);
  res.json({ health, model });
});

export const modelInfo = asyncHandler(async (_req, res) => {
  res.json({ model: await mlClient.safeModelInfo() });
});
