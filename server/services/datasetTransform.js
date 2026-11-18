/**
 * Pure transformation helpers shared by the CSV importer and the live-save
 * services. They mirror the notebook's Cell 2/3 logic:
 *   - canonical team identities from PKL_teams.csv
 *   - raid/tackle success per team per match
 *   - a rolling mean of the previous five matches per team
 *   - winner parsing from PKL_matches.result
 */

export function normalizeRecord(record) {
  const normalized = {};
  for (const [key, value] of Object.entries(record)) {
    const cleanKey = String(key).replace(/^\uFEFF/, "").trim();
    if (!cleanKey || cleanKey.toLowerCase().startsWith("unnamed:")) continue;
    normalized[cleanKey] = typeof value === "string" ? value.trim() : value;
  }
  return normalized;
}

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === "" || String(value) === "nan";

/**
 * Pick the most common name per team id (alphabetical tie-break) and keep every
 * spelling as an alias. Returns a lookup for matching result strings.
 */
export function buildTeamDirectory(teamRows) {
  const namesById = new Map();
  const shortNamesById = new Map();

  for (const raw of teamRows) {
    const row = normalizeRecord(raw);
    const teamId = toNumber(row.id, NaN);
    if (!Number.isFinite(teamId)) continue;

    const name = String(row.name ?? "").trim();
    if (name && name.toLowerCase() !== "nan") {
      if (!namesById.has(teamId)) namesById.set(teamId, new Map());
      const counts = namesById.get(teamId);
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    const shortName = String(row.short_name ?? "").trim();
    if (shortName && shortName.toLowerCase() !== "nan") {
      if (!shortNamesById.has(teamId)) shortNamesById.set(teamId, new Map());
      const counts = shortNamesById.get(teamId);
      counts.set(shortName, (counts.get(shortName) || 0) + 1);
    }
  }

  const pickMostCommon = (counts) => {
    if (!counts || counts.size === 0) return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };

  const teams = [];
  const nameToId = new Map();

  for (const teamId of [...namesById.keys()].sort((a, b) => a - b)) {
    const counts = namesById.get(teamId);
    const name = pickMostCommon(counts);
    if (!name) continue;
    const aliases = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    const shortName = pickMostCommon(shortNamesById.get(teamId)) || name.slice(0, 3).toUpperCase();

    teams.push({ externalId: teamId, name, shortName, aliases });
    for (const alias of aliases) {
      nameToId.set(alias, teamId);
    }
  }

  // Canonical names always win over a conflicting alias.
  for (const team of teams) {
    nameToId.set(team.name, team.externalId);
  }

  return { teams, nameToId };
}

export function parseResult(result, nameToId) {
  if (isBlank(result)) return { kind: "missing", winnerId: null, winnerName: null };

  const text = String(result).trim();
  const lowered = text.toLowerCase();
  const beatIndex = lowered.indexOf(" beat ");

  if (beatIndex >= 0) {
    const winnerName = text.slice(0, beatIndex).trim();
    const winnerId = nameToId.get(winnerName);
    if (winnerId === undefined) {
      return { kind: "unmapped", winnerId: null, winnerName };
    }
    return { kind: "win", winnerId, winnerName };
  }

  if (lowered.includes("tied") || lowered.includes("drawn") || lowered === "tie") {
    return { kind: "tie", winnerId: null, winnerName: null };
  }

  return { kind: "unknown", winnerId: null, winnerName: text };
}

export function parseDateLabel(label) {
  if (isBlank(label)) return null;
  const text = String(label).trim();

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function todayLabel(date = new Date()) {
  return date.toLocaleDateString("en-US");
}

/**
 * Previous-five-match mean, shifted so the current match is excluded.
 * The notebook chained shift().rolling(), which crossed team boundaries; this
 * helper keeps the window strictly within a single team.
 */
export function withRollingForm(rows) {
  const byTeam = new Map();
  for (const row of rows) {
    if (!byTeam.has(row.teamId)) byTeam.set(row.teamId, []);
    byTeam.get(row.teamId).push(row);
  }

  const result = [];
  for (const teamRows of byTeam.values()) {
    teamRows.sort((a, b) => a.matchId - b.matchId);
    const raidWindow = [];
    const tackleWindow = [];

    for (const row of teamRows) {
      const raidRoll5 =
        raidWindow.length > 0
          ? raidWindow.reduce((sum, value) => sum + value, 0) / raidWindow.length
          : null;
      const tackleRoll5 =
        tackleWindow.length > 0
          ? tackleWindow.reduce((sum, value) => sum + value, 0) / tackleWindow.length
          : null;

      result.push({ ...row, raidRoll5, tackleRoll5 });

      raidWindow.push(row.raidSuccess);
      tackleWindow.push(row.tackleSuccess);
      if (raidWindow.length > 5) raidWindow.shift();
      if (tackleWindow.length > 5) tackleWindow.shift();
    }
  }

  return result.sort((a, b) => a.matchId - b.matchId || a.teamId - b.teamId);
}

export function buildTeamMatchStats(teamRows) {
  const deduped = new Map();

  for (const raw of teamRows) {
    const row = normalizeRecord(raw);
    const teamId = toNumber(row.id, NaN);
    const matchId = toNumber(row.match_id, NaN);
    if (!Number.isFinite(teamId) || !Number.isFinite(matchId)) continue;

    const raidsSuccessful = toNumber(row["stats.raids.successful"]);
    const raidsTotal = toNumber(row["stats.raids.total"]);
    const tacklesSuccessful = toNumber(row["stats.tackles.successful"]);
    const tacklesTotal = toNumber(row["stats.tackles.total"]);

    deduped.set(`${teamId}:${matchId}`, {
      teamId,
      matchId,
      score: toNumber(row.score),
      raidsSuccessful,
      raidsTotal,
      tacklesSuccessful,
      tacklesTotal,
      raidSuccess: raidsTotal > 0 ? raidsSuccessful / raidsTotal : 0,
      tackleSuccess: tacklesTotal > 0 ? tacklesSuccessful / tacklesTotal : 0,
    });
  }

  return withRollingForm([...deduped.values()]);
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sampleStd(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
