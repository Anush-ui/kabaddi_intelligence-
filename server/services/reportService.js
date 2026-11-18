import { escapeCsv } from "./datasetTransform.js";

function percent(value) {
  return value === null || value === undefined ? "" : `${(Number(value) * 100).toFixed(1)}%`;
}

export function buildReportData(match, teamStats = []) {
  const lineups = match.lineups || {};
  return {
    match: {
      id: match._id.toString(),
      matchId: match.matchId,
      source: match.source,
      date: match.matchDate,
      dateLabel: match.dateLabel,
      seriesName: match.seriesName,
      status: match.status,
      venue: match.venue,
      result: match.result,
      winnerTeamId: match.winnerTeamId,
      tie: match.tie,
      notes: match.notes,
      teamA: match.teamA,
      teamB: match.teamB,
      prediction: match.prediction,
    },
    lineups,
    performances: match.playerPerformances || [],
    timeline: match.timeline || [],
    teamStats,
  };
}

export function buildReportCsv(match, teamStats = []) {
  const lines = [];
  const push = (...values) => lines.push(values.map(escapeCsv).join(","));

  push("Kabaddi Coach Intelligence Dashboard - Match Report");
  push("Match ID", match.matchId);
  push("Source", match.source === "manual" ? "Saved live match" : "Imported PKL dataset");
  push("Date", match.dateLabel || "");
  push("Series", match.seriesName || "");
  push("Venue", match.venue || "");
  push("Status", match.status || "");
  push("Result", match.result || "");
  push("");

  push("Scoreboard");
  push("Team", "Score");
  push(match.teamA.name, match.teamA.score);
  push(match.teamB.name, match.teamB.score);
  push("");

  push("Win Probability Snapshot");
  push("Team A win probability", percent(match.prediction?.probabilityA));
  push("Base model probability", percent(match.prediction?.baseProbabilityA));
  push("Model", match.prediction?.modelName || "");
  if (match.prediction?.features) {
    push("Feature", "Value");
    for (const [key, value] of Object.entries(match.prediction.features)) {
      push(key, typeof value === "number" ? value.toFixed(4) : value);
    }
  }
  push("");

  if (match.playerPerformances?.length) {
    push("Player Performances");
    push("Player", "Team", "Starter", "Points", "Raid points", "Tackle points");
    for (const performance of match.playerPerformances) {
      const teamName =
        performance.teamId === match.teamA.teamId ? match.teamA.name : match.teamB.name;
      push(
        performance.name,
        teamName,
        performance.starter ? "Yes" : "No",
        performance.points,
        performance.raidPoints ?? "",
        performance.tacklePoints ?? ""
      );
    }
    push("");
  }

  if (teamStats.length) {
    push("Team Match Statistics");
    push("Team", "Score", "Raid success", "Tackle success", "Raids", "Tackles");
    for (const row of teamStats) {
      const teamName = row.teamId === match.teamA.teamId ? match.teamA.name : match.teamB.name;
      push(
        teamName,
        row.score,
        percent(row.raidSuccess),
        percent(row.tackleSuccess),
        `${row.raidsSuccessful}/${row.raidsTotal}`,
        `${row.tacklesSuccessful}/${row.tacklesTotal}`
      );
    }
    push("");
  }

  if (match.timeline?.length) {
    push("Probability Timeline");
    push("Event", "Team A win probability", "Score A", "Score B", "Recorded at");
    for (const event of match.timeline) {
      push(
        event.label,
        percent(event.probabilityA),
        event.scoreA,
        event.scoreB,
        event.at ? new Date(event.at).toISOString() : ""
      );
    }
  }

  return lines.join("\r\n");
}
