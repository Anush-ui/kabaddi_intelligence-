import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { matchApi } from "../services/kabaddi.js";
import { getErrorMessage } from "../services/api.js";
import { useApi } from "../hooks/useApi.js";
import {
  Badge,
  Card,
  ErrorState,
  PageHeader,
  PageLoader,
  Spinner,
} from "../components/UI.jsx";
import ProbabilityBar from "../components/ProbabilityBar.jsx";
import { ArrowRightIcon, DownloadIcon } from "../components/Icons.jsx";
import { axisProps, CHART_COLORS, tooltipProps } from "../utils/chartTheme.js";
import { decimal, formatDate, percent } from "../utils/format.js";

export default function MatchReport() {
  const { id } = useParams();
  const { data, loading, error, refresh } = useApi(() => matchApi.get(id), [id]);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [notes, setNotes] = useState("");

  const match = data?.match;

  useEffect(() => {
    if (match) setNotes(match.notes || "");
  }, [match]);

  async function download(format) {
    setBusy(format);
    setActionError(null);
    try {
      await matchApi.downloadReport(id, format);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveNotes() {
    setBusy("notes");
    setActionError(null);
    setNotice(null);
    try {
      await matchApi.update(id, { notes });
      await refresh();
      setNotice("Coach notes updated.");
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <PageLoader label="Loading match report" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!match) return <ErrorState message="Match report not found." />;

  const timelineData = (match.timeline || []).map((event, index) => ({
    name: event.label || `#${index + 1}`,
    probability: Math.round((event.probabilityA || 0) * 100),
  }));

  const teamStats = (match.teamStats || []).map((row) => ({
    ...row,
    name: row.teamId === match.teamA.teamId ? match.teamA.name : match.teamB.name,
  }));

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow={match.source === "manual" ? "Saved coaching report" : "Imported PKL fixture"}
        title={`${match.teamA.name} vs ${match.teamB.name}`}
        subtitle={match.result}
        actions={
          <>
            <Link to="/matches" className="btn btn-secondary">
              Back to history
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => download("json")}
              disabled={Boolean(busy)}
            >
              {busy === "json" ? <Spinner size={14} /> : <DownloadIcon width={15} height={15} />}
              JSON
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => download("csv")}
              disabled={Boolean(busy)}
            >
              {busy === "csv" ? <Spinner size={14} /> : <DownloadIcon width={15} height={15} />}
              Download report
            </button>
          </>
        }
      />

      {actionError && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          {actionError}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" style={{ marginBottom: 14 }}>
          {notice}
        </div>
      )}

      <div className="stack">
        <Card>
          <div className="scoreboard">
            <div className="score-team score-a">
              <div className="score-name">{match.teamA.name}</div>
              <div className="score-value">{match.teamA.score}</div>
            </div>
            <div className="score-mid">VS</div>
            <div className="score-team score-b">
              <div className="score-name">{match.teamB.name}</div>
              <div className="score-value">{match.teamB.score}</div>
            </div>
          </div>

          <div className="row between wrap" style={{ marginTop: 8 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <Badge tone={match.tie ? "warn" : "success"}>
                {match.tie
                  ? "Match tied"
                  : `${
                      match.winnerTeamId === match.teamA.teamId
                        ? match.teamA.name
                        : match.teamB.name
                    } won`}
              </Badge>
              <span className="muted" style={{ fontSize: 11 }}>
                {match.dateLabel || formatDate(match.date)} · {match.seriesName || "PKL"}
                {match.venue ? ` · ${match.venue}` : ""}
              </span>
            </div>
            <Badge tone={match.source === "manual" ? "info" : "neutral"}>
              {match.source === "manual" ? "Saved match" : "Dataset fixture"}
            </Badge>
          </div>

          {match.prediction?.probabilityA !== null && match.prediction?.probabilityA !== undefined && (
            <div style={{ marginTop: 16 }}>
              <ProbabilityBar
                probabilityA={match.prediction.probabilityA}
                teamA={match.teamA.name}
                teamB={match.teamB.name}
              />
              <div className="prob-meta">
                <span>Base model {percent(match.prediction.baseProbabilityA, 1)}</span>
                <span>
                  Score shift{" "}
                  {match.prediction.scoreShift >= 0 ? "+" : ""}
                  {((match.prediction.scoreShift || 0) * 100).toFixed(1)} pts
                </span>
                <span>{match.prediction.modelName || "—"}</span>
              </div>
            </div>
          )}
        </Card>

        <div className="grid-2">
          <Card title="Prediction snapshot" subtitle="Model features and final probability">
            {match.prediction?.features ? (
              <>
                <div className="preview-stats">
                  <div className="preview-stat">
                    <span>Raid A</span>
                    <strong>{percent(match.prediction.features.raid_success_A, 1)}</strong>
                  </div>
                  <div className="preview-stat">
                    <span>Tackle A</span>
                    <strong>{percent(match.prediction.features.tackle_success_A, 1)}</strong>
                  </div>
                  <div className="preview-stat">
                    <span>Raid B</span>
                    <strong>{percent(match.prediction.features.raid_success_B, 1)}</strong>
                  </div>
                  <div className="preview-stat">
                    <span>Tackle B</span>
                    <strong>{percent(match.prediction.features.tackle_success_B, 1)}</strong>
                  </div>
                </div>
                <div className="summary-list" style={{ marginTop: 12 }}>
                  <div className="summary-row">
                    <span>Model</span>
                    <strong>{match.prediction.modelName || "—"}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Team A win probability</span>
                    <strong>{percent(match.prediction.probabilityA, 1)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Base model probability</span>
                    <strong>{percent(match.prediction.baseProbabilityA, 1)}</strong>
                  </div>
                </div>
              </>
            ) : (
              <p className="hint">
                Imported dataset fixtures do not include a saved win-probability snapshot. Start a
                live match to generate one.
              </p>
            )}
          </Card>

          <Card title="Team match statistics" subtitle="Raid and tackle efficiency for this fixture">
            {teamStats.length === 0 ? (
              <p className="hint">No team statistics stored for this match.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th className="num">Score</th>
                      <th className="num">Raid</th>
                      <th className="num">Tackle</th>
                      <th className="num">Raids</th>
                      <th className="num">Tackles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamStats.map((row) => (
                      <tr key={row.teamId}>
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        <td className="num">{row.score}</td>
                        <td className="num">{percent(row.raidSuccess, 1)}</td>
                        <td className="num">{percent(row.tackleSuccess, 1)}</td>
                        <td className="num">
                          {row.raidsSuccessful}/{row.raidsTotal}
                        </td>
                        <td className="num">
                          {row.tacklesSuccessful}/{row.tacklesTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card title="Player performances" subtitle="Points recorded when the match was saved">
          {match.performances.length === 0 ? (
            <p className="hint">
              This imported fixture has no saved player points. Player-level rows exist in the
              dataset, but the original notebook did not store them in match reports.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>Role</th>
                    <th className="num">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {match.performances.map((performance) => (
                    <tr key={performance.playerId}>
                      <td>
                        <strong>{performance.name}</strong>
                      </td>
                      <td className="muted">
                        {performance.teamId === match.teamA.teamId
                          ? match.teamA.name
                          : match.teamB.name}
                      </td>
                      <td>
                        <Badge tone={performance.starter ? "success" : "neutral"}>
                          {performance.starter ? "Starter" : "Bench"}
                        </Badge>
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {performance.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {timelineData.length > 1 && (
          <Card title="Win probability timeline" subtitle="Team A probability across the match">
            <div className="chart-box chart-lg">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" height={40} />
                  <YAxis domain={[0, 100]} {...axisProps} />
                  <Tooltip {...tooltipProps} formatter={(value) => [`${value}%`, "Team A win"]} />
                  <Line
                    type="monotone"
                    dataKey="probability"
                    stroke={CHART_COLORS.teamA}
                    strokeWidth={2.2}
                    dot={{ r: 2.5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <div className="grid-2">
          <Card title="Coach notes" subtitle="Stored with the match report">
            {match.source === "manual" ? (
              <>
                <div className="field">
                  <label className="label" htmlFor="report-notes">
                    Notes
                  </label>
                  <textarea
                    id="report-notes"
                    className="textarea"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add tactical observations…"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={saveNotes}
                  disabled={busy === "notes"}
                >
                  {busy === "notes" ? <Spinner size={14} /> : null}
                  Save notes
                </button>
              </>
            ) : (
              <p className="hint">Notes are editable on matches saved from the live dashboard.</p>
            )}
          </Card>

          <Card title="Report details">
            <div className="summary-list">
              <div className="summary-row">
                <span>Match ID</span>
                <strong>#{match.matchId}</strong>
              </div>
              <div className="summary-row">
                <span>Status</span>
                <strong>{match.status}</strong>
              </div>
              <div className="summary-row">
                <span>Series</span>
                <strong>{match.seriesName || "—"}</strong>
              </div>
              <div className="summary-row">
                <span>Venue</span>
                <strong>{match.venue || "—"}</strong>
              </div>
              <div className="summary-row">
                <span>Model</span>
                <strong>{match.prediction?.modelName || "—"}</strong>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Link to="/head-to-head" className="btn btn-ghost btn-sm">
                Compare franchises
                <ArrowRightIcon width={14} height={14} />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
