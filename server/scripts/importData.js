#!/usr/bin/env node
/**
 * Import the Pro Kabaddi League CSVs into MongoDB.
 *
 * Usage (from the server folder):
 *   npm run import
 *   npm run import -- --data ../dataset
 *   npm run import:reset            # rebuild dataset-derived data
 *
 * The import is idempotent: rows are upserted on their original IDs. Saved live
 * matches are never modified unless --reset is used (and even then, only
 * dataset-derived rows are removed).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import {
  buildTeamDirectory,
  buildTeamMatchStats,
  normalizeRecord,
  parseDateLabel,
  parseResult,
  sampleStd,
  toBoolean,
  toNumber,
  mean,
} from "../services/datasetTransform.js";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Match } from "../models/Match.js";
import { Player } from "../models/Player.js";
import { PlayerMatchStat } from "../models/PlayerMatchStat.js";
import { Team } from "../models/Team.js";
import { TeamMatchStat } from "../models/TeamMatchStat.js";
import { refreshAllTeamAggregates } from "../services/teamStatsService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const dataFlag = args.indexOf("--data");
const dataDir = path.resolve(
  dataFlag >= 0 && args[dataFlag + 1] ? args[dataFlag + 1] : path.join(projectRoot, "dataset")
);

const REQUIRED = {
  "PKL_players.csv": ["player_id", "player_name", "team_id", "match_id", "player_total_points"],
  "PKL_teams.csv": [
    "id",
    "match_id",
    "name",
    "score",
    "stats.raids.successful",
    "stats.raids.total",
    "stats.tackles.successful",
    "stats.tackles.total",
  ],
  "PKL_matches.csv": ["match_id", "result"],
};

function readCsv(filename, { headerCheck = true } = {}) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ${filename}. Place the four PKL CSV exports in ${dataDir} ` +
        "(see dataset/README.md) or pass --data <folder>."
    );
  }

  const rows = parse(fs.readFileSync(filePath), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  }).map(normalizeRecord);

  if (headerCheck && rows.length) {
    const headers = Object.keys(rows[0]);
    const missing = (REQUIRED[filename] || []).filter((column) => !headers.includes(column));
    if (missing.length) {
      throw new Error(`${filename} is missing required columns: ${missing.join(", ")}`);
    }
  }

  console.log(`[read] ${filename}: ${rows.length.toLocaleString()} rows`);
  return rows;
}

function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}

async function bulkUpsert(model, operations) {
  for (const batch of chunk(operations, 800)) {
    await model.bulkWrite(batch, { ordered: false });
  }
}

async function importData() {
  console.log(`[import] dataset folder: ${dataDir}`);
  await connectDatabase();

  const playerRows = readCsv("PKL_players.csv");
  const teamRows = readCsv("PKL_teams.csv");
  const matchRows = readCsv("PKL_matches.csv");

  const { teams: teamDirectory, nameToId } = buildTeamDirectory(teamRows);
  const teamById = new Map(teamDirectory.map((team) => [team.externalId, team]));
  console.log(`[teams] ${teamDirectory.length} canonical teams`);

  const teamMatchStats = buildTeamMatchStats(teamRows);
  const statsByMatch = new Map();
  for (const row of teamMatchStats) {
    if (!statsByMatch.has(row.matchId)) statsByMatch.set(row.matchId, []);
    statsByMatch.get(row.matchId).push(row);
  }

  // ---------- Matches ----------
  const labelCounts = { win: 0, tie: 0, unknown: 0, missing: 0, unmapped: 0 };
  const unknownMatchIds = [];
  const unmappedNames = new Set();
  const matches = [];

  for (const raw of matchRows) {
    const matchId = toNumber(raw.match_id, NaN);
    if (!Number.isFinite(matchId)) continue;

    const sides = (statsByMatch.get(matchId) || []).sort((a, b) => a.teamId - b.teamId);
    if (sides.length !== 2) continue;

    const outcome = parseResult(raw.result, nameToId);
    labelCounts[outcome.kind] = (labelCounts[outcome.kind] || 0) + 1;
    if (outcome.kind === "unknown") unknownMatchIds.push(matchId);
    if (outcome.kind === "unmapped" && outcome.winnerName) unmappedNames.add(outcome.winnerName);

    const teamA = teamById.get(sides[0].teamId);
    const teamB = teamById.get(sides[1].teamId);
    const dateLabel = String(raw.date ?? "").trim();

    matches.push({
      matchId,
      source: "dataset",
      matchDate: parseDateLabel(dateLabel),
      dateLabel,
      seriesName: String(raw.series_name ?? "").trim(),
      status: String(raw.status ?? "Full Time").trim(),
      venue: String(raw.venue_name ?? "").trim(),
      result: String(raw.result ?? "").trim(),
      winnerTeamId: outcome.winnerId,
      tie: outcome.kind === "tie",
      teamA: {
        teamId: sides[0].teamId,
        name: teamA?.name || `Team ${sides[0].teamId}`,
        score: sides[0].score,
      },
      teamB: {
        teamId: sides[1].teamId,
        name: teamB?.name || `Team ${sides[1].teamId}`,
        score: sides[1].score,
      },
    });
  }

  console.log(
    `[matches] ${matches.length} usable fixtures | wins ${labelCounts.win}, ties ${labelCounts.tie}, ` +
      `unknown ${labelCounts.unknown}, unmapped ${labelCounts.unmapped}`
  );
  if (unknownMatchIds.length) {
    console.log(`[warn] results not describing a winner: match ids ${unknownMatchIds.join(", ")}`);
  }
  if (unmappedNames.size) {
    console.log(`[warn] winner names not found in PKL_teams.csv: ${[...unmappedNames].join(", ")}`);
  }

  // ---------- Players ----------
  const appearancesByPlayer = new Map();
  const playerMatchStats = [];

  for (const raw of playerRows) {
    const playerId = toNumber(raw.player_id, NaN);
    const teamId = toNumber(raw.team_id, NaN);
    const matchId = toNumber(raw.match_id, NaN);
    if (!Number.isFinite(playerId) || !Number.isFinite(teamId) || !Number.isFinite(matchId)) {
      continue;
    }

    const points = toNumber(raw.player_total_points);
    const raidPoints = toNumber(raw.player_raid_points_total);
    const tacklePoints = toNumber(raw.player_tackle_points_total);
    const starter = toBoolean(raw.player_on_starter);
    const name = String(raw.player_name ?? "").trim();

    playerMatchStats.push({
      playerId,
      teamId,
      matchId,
      points,
      raidPoints,
      tacklePoints,
      raidsTotal: toNumber(raw.player_raids_total),
      raidsSuccessful: toNumber(raw.player_raids_successful),
      tacklesTotal: toNumber(raw.player_tackles_total),
      tacklesSuccessful: toNumber(raw.player_tackles_successful),
      starter,
      source: "dataset",
    });

    if (!appearancesByPlayer.has(playerId)) appearancesByPlayer.set(playerId, []);
    appearancesByPlayer.get(playerId).push({ teamId, matchId, points, starter, name });
  }

  const players = [];
  for (const [playerId, appearances] of appearancesByPlayer.entries()) {
    const latest = [...appearances].sort((a, b) => b.matchId - a.matchId)[0];
    const points = appearances.map((appearance) => appearance.points);
    const nameCounts = new Map();
    for (const appearance of appearances) {
      if (appearance.name) nameCounts.set(appearance.name, (nameCounts.get(appearance.name) || 0) + 1);
    }
    const name =
      [...nameCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ||
      `Player ${playerId}`;

    const statRows = playerMatchStats.filter((row) => row.playerId === playerId);
    const sum = (key) => statRows.reduce((total, row) => total + (row[key] || 0), 0);

    players.push({
      playerId,
      name,
      shortName: String(
        playerRows.find((row) => toNumber(row.player_id, NaN) === playerId)?.player_short_name ?? ""
      ).trim(),
      teamId: latest.teamId,
      teamName: teamById.get(latest.teamId)?.name || `Team ${latest.teamId}`,
      teamIds: [...new Set(appearances.map((appearance) => appearance.teamId))],
      matches: appearances.length,
      avgPoints: mean(points),
      stdPoints: Math.max(sampleStd(points), 0.1),
      totalPoints: sum("points"),
      raidPoints: sum("raidPoints"),
      tacklePoints: sum("tacklePoints"),
      raidsTotal: sum("raidsTotal"),
      raidsSuccessful: sum("raidsSuccessful"),
      tacklesTotal: sum("tacklesTotal"),
      tacklesSuccessful: sum("tacklesSuccessful"),
      latestMatchId: latest.matchId,
      latestStarter: Boolean(latest.starter),
    });
  }

  console.log(
    `[players] ${players.length} players | ${playerMatchStats.length.toLocaleString()} appearances`
  );

  // ---------- Reset dataset-derived data (optional) ----------
  if (reset) {
    const datasetMatchIds = await Match.distinct("matchId", { source: "dataset" });
    console.log(`[reset] removing ${datasetMatchIds.length} dataset matches and derived rows`);
    await Promise.all([
      Match.deleteMany({ source: "dataset" }),
      PlayerMatchStat.deleteMany({ source: "dataset" }),
      TeamMatchStat.deleteMany({ matchId: { $in: datasetMatchIds } }),
    ]);
  }

  // ---------- Write ----------
  await bulkUpsert(
    Team,
    teamDirectory.map((team) => ({
      updateOne: {
        filter: { externalId: team.externalId },
        update: {
          $set: { name: team.name, shortName: team.shortName, aliases: team.aliases },
          $setOnInsert: { externalId: team.externalId },
        },
        upsert: true,
      },
    }))
  );

  await bulkUpsert(
    Match,
    matches.map((match) => ({
      updateOne: { filter: { matchId: match.matchId }, update: { $set: match }, upsert: true },
    }))
  );

  await bulkUpsert(
    Player,
    players.map((player) => ({
      updateOne: {
        filter: { playerId: player.playerId },
        update: { $set: player },
        upsert: true,
      },
    }))
  );

  await bulkUpsert(
    PlayerMatchStat,
    playerMatchStats.map((row) => ({
      updateOne: {
        filter: { playerId: row.playerId, matchId: row.matchId },
        update: { $set: row },
        upsert: true,
      },
    }))
  );

  await bulkUpsert(
    TeamMatchStat,
    teamMatchStats.map((row) => ({
      updateOne: {
        filter: { teamId: row.teamId, matchId: row.matchId },
        update: {
          $set: {
            teamId: row.teamId,
            matchId: row.matchId,
            score: row.score,
            raidsSuccessful: row.raidsSuccessful,
            raidsTotal: row.raidsTotal,
            tacklesSuccessful: row.tacklesSuccessful,
            tacklesTotal: row.tacklesTotal,
            raidSuccess: row.raidSuccess,
            tackleSuccess: row.tackleSuccess,
            raidRoll5: row.raidRoll5,
            tackleRoll5: row.tackleRoll5,
          },
        },
        upsert: true,
      },
    }))
  );

  console.log("[aggregate] refreshing team records and rolling form from MongoDB");
  await refreshAllTeamAggregates();

  console.log("\n[import] complete");
  console.log(`  teams         : ${teamDirectory.length}`);
  console.log(`  players       : ${players.length}`);
  console.log(`  matches       : ${matches.length}`);
  console.log(`  team rows     : ${teamMatchStats.length}`);
  console.log(`  player rows   : ${playerMatchStats.length}`);
  console.log(
    `  winner labels : ${labelCounts.win} wins, ${labelCounts.tie} ties, ` +
      `${labelCounts.unknown} unknown, ${labelCounts.unmapped} unmapped`
  );
  console.log("\nPKL_events.csv is intentionally not imported: no dashboard feature or ML");
  console.log("model consumes event-level rows in the original notebook.");
  if (unknownMatchIds.length) {
    console.log(
      "\nData issue to note: some matches have no usable winner label "
        + "(statuses such as '1st Half' or 'Unknown'). They remain in match history "
        + "but cannot contribute a win/loss label."
    );
  }
}

importData()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`\n[import] failed: ${error.message}`);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  });
