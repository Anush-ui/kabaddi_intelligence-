/**
 * End-to-end API check for the Express + MongoDB + FastAPI stack.
 *
 * It registers a throwaway user, drives a full match lifecycle and verifies the
 * analytics and report endpoints. Run it against a scratch database so the test
 * match does not pollute your dashboard data:
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/kabaddi_coach_test npm run import
 *   PORT=5001 MONGODB_URI=mongodb://127.0.0.1:27017/kabaddi_coach_test node server.js
 *   API_BASE=http://127.0.0.1:5001/api node scripts/e2eCheck.js
 */

const base = process.env.API_BASE || "http://127.0.0.1:5000/api";
let failures = 0;

function check(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
}

async function request(path, { method = "GET", token, body, raw = false } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return raw ? text : text ? JSON.parse(text) : null;
}

async function attempt(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

function pickLineup(roster) {
  const starters = roster.filter((player) => player.latestStarter).slice(0, 7);
  const bench = roster
    .filter((player) => !starters.some((starter) => starter.playerId === player.playerId))
    .slice(0, 5);
  return {
    starters: starters.map((player) => player.playerId),
    bench: bench.map((player) => player.playerId),
  };
}

async function main() {
  const stamp = Date.now();
  const email = `e2e${stamp}@example.com`;

  const health = await request("/health");
  check("server health", health.status === "ok");

  const unauth = await attempt(() => request("/teams"));
  check("unauthenticated teams rejected", unauth.ok === false && unauth.error.status === 401);

  const registered = await request("/auth/register", {
    method: "POST",
    body: { name: "E2E Coach", email, password: "kabaddi1234" },
  });
  check("register returns JWT", Boolean(registered.token && registered.user.email === email));

  const loggedIn = await request("/auth/login", {
    method: "POST",
    body: { email, password: "kabaddi1234" },
  });
  const token = loggedIn.token;
  check("login returns JWT", Boolean(token));

  const me = await request("/auth/me", { token });
  check("GET /auth/me", me.user.email === email);

  const { teams } = await request("/teams", { token });
  check("teams list", teams.length === 12, `${teams.length} teams`);
  const [teamA, teamB] = [...teams].sort((a, b) => a.teamId - b.teamId);

  const statsA = await request(`/teams/${teamA.teamId}/stats`, { token });
  check(
    "team stats + trend",
    statsA.trend.length > 0 && statsA.history.length > 0,
    `${teamA.name}: ${statsA.history.length} matches`
  );

  const rosterA = await request(`/teams/${teamA.teamId}/roster`, { token });
  const rosterB = await request(`/teams/${teamB.teamId}/roster`, { token });
  check(
    "rosters return a full squad",
    rosterA.players.length >= 7 && rosterB.players.length >= 7,
    `${rosterA.players.length} / ${rosterB.players.length} players`
  );

  const lineupA = pickLineup(rosterA.players);
  const lineupB = pickLineup(rosterB.players);
  check(
    "starting sevens available",
    lineupA.starters.length === 7 && lineupB.starters.length === 7
  );

  const sameTeam = await attempt(() =>
    request("/live/session", {
      method: "POST",
      token,
      body: {
        teamAId: teamA.teamId,
        teamBId: teamA.teamId,
        startersA: lineupA.starters,
        benchA: lineupA.bench,
        startersB: lineupB.starters,
        benchB: lineupB.bench,
      },
    })
  );
  check("same-team selection rejected", sameTeam.ok === false && sameTeam.error.status === 400);

  const started = await request("/live/session", {
    method: "POST",
    token,
    body: {
      teamAId: teamA.teamId,
      teamBId: teamB.teamId,
      startersA: lineupA.starters,
      benchA: lineupA.bench,
      startersB: lineupB.starters,
      benchB: lineupB.bench,
    },
  });
  const initialProb = started.session.probabilityA;
  check(
    "live session created + predicted",
    started.session.teamA.starters.length === 7 && initialProb > 0 && initialProb < 1,
    `${(initialProb * 100).toFixed(1)}%`
  );

  const scored = await request("/live/score", {
    method: "PATCH",
    token,
    body: { scoreA: 40, scoreB: 10 },
  });
  check(
    "score update recalculates probability",
    scored.session.probabilityA > initialProb,
    `${(initialProb * 100).toFixed(1)}% -> ${(scored.session.probabilityA * 100).toFixed(1)}%`
  );
  check("probability timeline grows", scored.session.timeline.length === 2);

  const starterA = started.session.teamA.starters[0];
  const bayesA = await request("/live/bayesian", {
    method: "POST",
    token,
    body: { playerId: starterA.playerId, observedPoints: Math.min(60, starterA.mu + 8) },
  });
  check(
    "Bayesian update raises Team A probability",
    bayesA.update.adjustment > 0,
    `+${(bayesA.update.adjustment * 100).toFixed(1)} pts at z=${bayesA.update.zScore?.toFixed(2)}`
  );

  const starterB = started.session.teamB.starters[0];
  const bayesB = await request("/live/bayesian", {
    method: "POST",
    token,
    body: { playerId: starterB.playerId, observedPoints: Math.min(60, starterB.mu + 8) },
  });
  check(
    "Team B Bayesian update lowers Team A probability",
    bayesB.update.adjustment < 0,
    `${(bayesB.update.adjustment * 100).toFixed(1)} pts`
  );

  const outPlayer = started.session.teamA.starters[6];
  const inPlayer = started.session.teamA.bench[0];
  const preview = await request("/live/substitution/preview", {
    method: "POST",
    token,
    body: { side: "A", outPlayerId: outPlayer.playerId, inPlayerId: inPlayer.playerId },
  });
  check("substitution preview", typeof preview.delta === "number", `${(preview.delta * 100).toFixed(2)} pts`);

  const applied = await request("/live/substitution", {
    method: "POST",
    token,
    body: { side: "A", outPlayerId: outPlayer.playerId, inPlayerId: inPlayer.playerId },
  });
  check(
    "substitution applied",
    applied.session.teamA.starters.some((player) => player.playerId === inPlayer.playerId) &&
      applied.session.teamA.bench.some((player) => player.playerId === outPlayer.playerId)
  );

  const current = await request("/live/session", { token });
  const performances = [
    ...current.session.teamA.starters,
    ...current.session.teamA.bench,
    ...current.session.teamB.starters,
    ...current.session.teamB.bench,
  ].map((player) => ({ playerId: player.playerId, points: 3 }));

  const saved = await request("/matches", {
    method: "POST",
    token,
    body: {
      performances,
      dateLabel: "11/17/2026",
      venue: "Test Arena",
      notes: "Automated end-to-end check",
    },
  });
  check("match saved to MongoDB", Boolean(saved.match?.id), `matchId ${saved.match.matchId}`);

  const afterSave = await request("/live/session", { token });
  check("live session cleared after save", afterSave.session === null);

  const history = await request("/matches/history?source=manual", { token });
  check(
    "match history contains saved match",
    history.matches.some((match) => match.matchId === saved.match.matchId)
  );

  const detail = await request(`/matches/${saved.match.id}`, { token });
  check(
    "match report detail",
    detail.match.performances.length > 0 && detail.match.teamStats.length === 2
  );

  const reportCsv = await request(`/matches/${saved.match.id}/report?format=csv`, {
    token,
    raw: true,
  });
  check(
    "CSV report download",
    reportCsv.includes("Kabaddi Coach Intelligence Dashboard") &&
      reportCsv.includes("Player Performances")
  );

  const updated = await request(`/matches/${saved.match.id}`, {
    method: "PUT",
    token,
    body: { notes: "Updated by e2e" },
  });
  check("match update", updated.match.matchId === saved.match.matchId);

  const playerSearch = await request(
    `/players?team=${teamA.teamId}&search=&sort=avgPoints&order=desc&page=1&limit=5`,
    { token }
  );
  check(
    "player search/filter/pagination",
    playerSearch.players.length === 5 && playerSearch.pagination.total >= 5,
    `${playerSearch.pagination.total} players match the team filter`
  );

  const playerDetail = await request(`/players/${playerSearch.players[0].playerId}`, { token });
  check("player detail + recent form", playerDetail.recent.length > 0, `${playerDetail.recent.length} appearances`);

  const h2h = await request(
    `/analytics/head-to-head?teamA=${teamA.teamId}&teamB=${teamB.teamId}`,
    { token }
  );
  check(
    "head-to-head analytics",
    h2h.played > 0 && h2h.winsA + h2h.winsB + h2h.ties === h2h.played,
    `${h2h.played} meetings`
  );

  const overview = await request("/analytics/overview", { token });
  check(
    "dashboard overview + live ML model",
    overview.counts.teams === 12 && overview.model.ready === true,
    `${overview.counts.savedMatches} saved match(es)`
  );

  const performance = await request("/analytics/player-performance?limit=5", { token });
  check(
    "player performance analytics",
    performance.topScorers.length === 5 && performance.topRaiders.length === 5
  );

  const comparison = await request(
    `/teams/compare?teamA=${teamA.teamId}&teamB=${teamB.teamId}`,
    { token }
  );
  check("team comparison", comparison.trendA.length > 0 && comparison.trendB.length > 0);

  const mlStatus = await request("/ml/status", { token });
  check(
    "ML status proxied",
    mlStatus.health.modelReady === true && mlStatus.model.ready === true
  );

  console.log(failures === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E check aborted:", error.message);
  process.exit(1);
});
