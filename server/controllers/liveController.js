import {
  applyBayesianUpdate,
  applySubstitution,
  createSession,
  getSession,
  previewSubstitution,
  resetSession,
  updateScore,
} from "../services/liveService.js";
import { asyncHandler } from "../utils/http.js";

export const readSession = asyncHandler(async (req, res) => {
  res.json({ session: await getSession(req.user._id) });
});

export const startSession = asyncHandler(async (req, res) => {
  const result = await createSession(req.user._id, req.body);
  res.status(201).json(result);
});

export const setScore = asyncHandler(async (req, res) => {
  res.json(await updateScore(req.user._id, req.body));
});

export const bayesian = asyncHandler(async (req, res) => {
  res.json(await applyBayesianUpdate(req.user._id, req.body));
});

export const previewSub = asyncHandler(async (req, res) => {
  res.json(await previewSubstitution(req.user._id, req.body));
});

export const applySub = asyncHandler(async (req, res) => {
  res.json(await applySubstitution(req.user._id, req.body));
});

export const reset = asyncHandler(async (req, res) => {
  res.json(await resetSession(req.user._id));
});
