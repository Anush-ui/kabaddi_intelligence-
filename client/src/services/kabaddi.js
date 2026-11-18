import { api, downloadFile } from "./api.js";

const data = (response) => response.data;

export const authApi = {
  register: (payload) => api.post("/auth/register", payload).then(data),
  login: (payload) => api.post("/auth/login", payload).then(data),
  me: () => api.get("/auth/me").then(data),
};

export const teamApi = {
  list: () => api.get("/teams").then(data),
  get: (teamId) => api.get(`/teams/${teamId}`).then(data),
  stats: (teamId) => api.get(`/teams/${teamId}/stats`).then(data),
  roster: (teamId) => api.get(`/teams/${teamId}/roster`).then(data),
  compare: (teamA, teamB) =>
    api.get("/teams/compare", { params: { teamA, teamB } }).then(data),
};

export const playerApi = {
  list: (params) => api.get("/players", { params }).then(data),
  get: (playerId) => api.get(`/players/${playerId}`).then(data),
  byTeam: (teamId) => api.get(`/players/team/${teamId}`).then(data),
};

export const matchApi = {
  list: (params) => api.get("/matches", { params }).then(data),
  history: (params) => api.get("/matches/history", { params }).then(data),
  get: (id) => api.get(`/matches/${id}`).then(data),
  create: (payload) => api.post("/matches", payload).then(data),
  update: (id, payload) => api.put(`/matches/${id}`, payload).then(data),
  downloadReport: (id, format = "csv") =>
    downloadFile(`/matches/${id}/report?format=${format}`, `match-${id}-report.${format}`),
};

export const liveApi = {
  getSession: () => api.get("/live/session").then(data),
  start: (payload) => api.post("/live/session", payload).then(data),
  updateScore: (payload) => api.patch("/live/score", payload).then(data),
  bayesian: (payload) => api.post("/live/bayesian", payload).then(data),
  previewSubstitution: (payload) => api.post("/live/substitution/preview", payload).then(data),
  applySubstitution: (payload) => api.post("/live/substitution", payload).then(data),
  reset: () => api.delete("/live/session").then(data),
};

export const analyticsApi = {
  overview: () => api.get("/analytics/overview").then(data),
  headToHead: (teamA, teamB) =>
    api.get("/analytics/head-to-head", { params: { teamA, teamB } }).then(data),
  playerPerformance: (params) =>
    api.get("/analytics/player-performance", { params }).then(data),
};

export const mlApi = {
  status: () => api.get("/ml/status").then(data),
  modelInfo: () => api.get("/ml/model-info").then(data),
};
