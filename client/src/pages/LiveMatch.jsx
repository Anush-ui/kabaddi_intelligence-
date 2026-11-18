import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { liveApi, matchApi } from "../services/kabaddi.js";
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
import { BoltIcon, ArrowRightIcon, LiveIcon, RefreshIcon } from "../components/Icons.jsx";
import { axisProps, CHART_COLORS, tooltipProps } from "../utils/chartTheme.js";
import { percent, formatDate } from "../utils/format.js";

const QUICK_POINTS = [1, 2, 3, 4];

export default function LiveMatch() {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useApi(() => liveApi.getSession(), []);
  const [session, setSession] = useState(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [bayesPlayerId, setBayesPlayerId] = useState("");
  const [observed, setObserved] = useState("0");
  const [bayesResult, setBayesResult] = useState(null);

  const [subSide, setSubSide] = useState("A");
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");
  const [subPreview, setSubPreview] = useState(null);

  const [performances, setPerformances] = useState({});
  const [dateLabel, setDateLabel] = useState(() => new Date().toLocaleDateString("en-US"));
  const [venue, setVenue] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (data) setSession(data.session);
  }, [data]);

  useEffect(() => {
    if (!session) return;
    setScoreA(session.scoreA);
    setScoreB(session.scoreB);
  }, [session?.scoreA, session?.scoreB]);

  const onCourt = useMemo(() => {
    if (!session) return [];
    return [
      ...session.teamA.starters.map((player) => ({ ...player, side: "A" })),
      ...session.teamB.starters.map((player) => ({ ...player, side: "B" })),
    ];
  }, [session]);

  const bayesPlayer = onCourt.find((player) => player.playerId === Number(bayesPlayerId));

  const subTeam = session ? (subSide === "A" ? session.teamA : session.teamB) : null;

  useEffect(() => {
    if (!session) return;
    if (!onCourt.some((player) => player.playerId === Number(bayesPlayerId))) {
      setBayesPlayerId(String(onCourt[0]?.playerId ?? ""));
    }

    const team = subSide === "A" ? session.teamA : session.teamB;
    if (!team.starters.some((player) => player.playerId === Number(outId))) {
      setOutId(String(team.starters[0]?.playerId ?? ""));
    }
    if (!team.bench.some((player) => player.playerId === Number(inId))) {
      setInId(String(team.bench[0]?.playerId ?? ""));
    }
  }, [session, subSide, onCourt, bayesPlayerId, outId, inId]);

  useEffect(() => {
    if (!session) return;
    const players = [
      ...session.teamA.starters,
      ...session.teamA.bench,
      ...session.teamB.starters,
      ...session.teamB.bench,
    ];
    setPerformances((current) => {
      let changed = false;
      const next = { ...current };
      for (const player of players) {
        if (next[player.playerId] === undefined) {
          next[player.playerId] = "0";
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [session]);

  const timeline = useMemo(
    () =>
      (session?.timeline || []).map((event, index) => ({
        name: event.label || `Event ${index + 1}`,
        probability: Math.round((event.probabilityA || 0) * 100),
        type: event.type,
      })),
    [session]
  );

  async function applyScore(nextA, nextB) {
    setBusy("score");
    setActionError(null);
    setNotice(null);
    try {
      const result = await liveApi.updateScore({
        scoreA: Number(nextA),
        scoreB: Number(nextB),
      });
      setSession(result.session);
      setNotice(`Score updated to ${nextA}–${nextB}. Win probability recalculated.`);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function quickScore(side, delta) {
    if (!session || busy) return;
    const nextA = side === "A" ? session.scoreA + delta : session.scoreA;
    const nextB = side === "B" ? session.scoreB + delta : session.scoreB;
    setScoreA(nextA);
    setScoreB(nextB);
    applyScore(nextA, nextB);
  }

  async function applyBayesian() {
    if (!bayesPlayer) return;
    setBusy("bayes");
    setActionError(null);
    setNotice(null);
    try {
      const result = await liveApi.bayesian({
        playerId: bayesPlayer.playerId,
        observedPoints: Number(observed),
      });
      setSession(result.session);
      setBayesResult(result.update);
      setNotice(`Bayesian update applied for ${result.update.player.name}.`);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function previewSubstitution() {
    if (!outId || !inId) return;
    setBusy("preview");
    setActionError(null);
    setNotice(null);
    try {
      const preview = await liveApi.previewSubstitution({
        side: subSide,
        outPlayerId: Number(outId),
        inPlayerId: Number(inId),
      });
      setSubPreview(preview);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function applySubstitution() {
    if (!outId || !inId) return;
    setBusy("sub");
    setActionError(null);
    setNotice(null);
    try {
      const result = await liveApi.applySubstitution({
        side: subSide,
        outPlayerId: Number(outId),
        inPlayerId: Number(inId),
      });
      setSession(result.session);
      setSubPreview(null);
      setNotice(
        `${result.substitution.inPlayer.name} replaced ${result.substitution.outPlayer.name}. Probability recalculated.`
      );
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveMatch() {
    setBusy("save");
    setActionError(null);
    setNotice(null);
    try {
      const payload = {
        performances: Object.entries(performances).map(([playerId, points]) => ({
          playerId: Number(playerId),
          points: Number(points) || 0,
        })),
        dateLabel,
        venue,
        notes,
      };
      const result = await matchApi.create(payload);
      navigate(`/matches/${result.match.id}`);
    } catch (err) {
      setActionError(getErrorMessage(err));
      setBusy(null);
    }
  }

  async function discardMatch() {
    if (!window.confirm("Discard this live match? Scores and timeline will be cleared.")) return;
    setBusy("reset");
    try {
      await liveApi.reset();
      setSession(null);
      navigate("/setup");
    } catch (err) {
      setActionError(getErrorMessage(err));
      setBusy(null);
    }
  }

  if (loading) return <PageLoader label="Loading live match" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  if (!session) {
    return (
      <div className="fade-in">
        <PageHeader
          eyebrow="Live command post"
          title="No match in progress"
          subtitle="Build a lineup in Match Setup to open the live prediction dashboard."
        />
        <Card>
          <div className="empty-state">
            <div className="empty-icon">
              <LiveIcon width={26} height={26} />
            </div>
            <h3>Start a match first</h3>
            <p>
              Select two franchises and confirm a starting seven. Your live session is stored in
              MongoDB, so scores and the probability timeline survive a page reload.
            </p>
            <Link to="/setup" className="btn btn-primary">
              Open match setup
              <ArrowRightIcon width={15} height={15} />
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const allPlayers = [
    ...session.teamA.starters,
    ...session.teamA.bench,
    ...session.teamB.starters,
    ...session.teamB.bench,
  ];

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Live command post"
        title={`${session.teamA.name} vs ${session.teamB.name}`}
        subtitle={`Model: ${session.modelName || "not available"} · ${session.timeline.length} timeline events recorded`}
        actions={
          <>
            <span className="live-pill">
              <span className="badge-dot" />
              Live
            </span>
            <Link to="/setup" className="btn btn-secondary">
              Match setup
            </Link>
            <button type="button" className="btn btn-danger" onClick={discardMatch} disabled={busy === "reset"}>
              {busy === "reset" ? <Spinner size={14} /> : null}
              Discard
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

      <div className="grid-2 live-main-grid" style={{ marginBottom: 16 }}>
        <Card>
          <div className="scoreboard">
            <div className="score-team score-a">
              <div className="score-name">{session.teamA.name}</div>
              <div className="score-value">{session.scoreA}</div>
              <div className="quick-scores">
                {QUICK_POINTS.map((points) => (
                  <button
                    key={points}
                    type="button"
                    className="quick-btn a"
                    onClick={() => quickScore("A", points)}
                    disabled={Boolean(busy)}
                  >
                    +{points}
                  </button>
                ))}
              </div>
            </div>
            <div className="score-mid">VS</div>
            <div className="score-team score-b">
              <div className="score-name">{session.teamB.name}</div>
              <div className="score-value">{session.scoreB}</div>
              <div className="quick-scores">
                {QUICK_POINTS.map((points) => (
                  <button
                    key={points}
                    type="button"
                    className="quick-btn b"
                    onClick={() => quickScore("B", points)}
                    disabled={Boolean(busy)}
                  >
                    +{points}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <ProbabilityBar
              probabilityA={session.probabilityA}
              teamA={session.teamA.name}
              teamB={session.teamB.name}
            />
            <div className="prob-meta">
              <span>
                Base model {percent(session.baseProbabilityA, 1)} · score shift{" "}
                {(session.scoreShift >= 0 ? "+" : "") + (session.scoreShift * 100).toFixed(1)} pts
              </span>
              <span>ROC-AUC {session.modelRocAuc ? session.modelRocAuc.toFixed(3) : "—"}</span>
            </div>
          </div>

          {session.features && (
            <div className="feature-strip">
              <span>
                Raid A <strong>{percent(session.features.raid_success_A, 0)}</strong>
              </span>
              <span>
                Tackle A <strong>{percent(session.features.tackle_success_A, 0)}</strong>
              </span>
              <span>
                Raid B <strong>{percent(session.features.raid_success_B, 0)}</strong>
              </span>
              <span>
                Tackle B <strong>{percent(session.features.tackle_success_B, 0)}</strong>
              </span>
              <span>
                Diff <strong>{session.features.score_diff > 0 ? "+" : ""}{session.features.score_diff}</strong>
              </span>
            </div>
          )}

          <div className="divider" />

          <div className="score-inputs">
            <div className="field">
              <label className="label" htmlFor="score-a">
                {session.teamA.name} score
              </label>
              <input
                id="score-a"
                type="number"
                min="0"
                max="200"
                className="input"
                value={scoreA}
                onChange={(event) => setScoreA(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="score-b">
                {session.teamB.name} score
              </label>
              <input
                id="score-b"
                type="number"
                min="0"
                max="200"
                className="input"
                value={scoreB}
                onChange={(event) => setScoreB(event.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => applyScore(scoreA, scoreB)}
            disabled={busy === "score"}
          >
            {busy === "score" ? <Spinner size={15} /> : <BoltIcon width={15} height={15} />}
            {busy === "score" ? "Recalculating…" : "Update score & predict"}
          </button>
        </Card>

        <Card title="Probability timeline" subtitle="Every score, Bayes update and substitution">
          <div className="chart-box" style={{ height: 286 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" height={40} />
                <YAxis domain={[0, 100]} {...axisProps} />
                <Tooltip {...tooltipProps} formatter={(value) => [`${value}%`, "Team A win"]} />
                <Line
                  type="monotone"
                  dataKey="probability"
                  stroke={CHART_COLORS.teamA}
                  strokeWidth={2.4}
                  dot={{ r: 2.5, fill: CHART_COLORS.teamA }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="timeline-list" style={{ marginTop: 10 }}>
            {[...session.timeline]
              .slice(-4)
              .reverse()
              .map((event, index) => (
                <div className="timeline-item" key={`${event.at}-${index}`}>
                  <Badge
                    tone={
                      event.type === "bayesian"
                        ? "info"
                        : event.type === "substitution"
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {event.type}
                  </Badge>
                  <span className="muted" style={{ flex: 1 }}>
                    {event.label}
                  </span>
                  <strong>{percent(event.probabilityA, 1)}</strong>
                </div>
              ))}
          </div>
        </Card>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card title="Bayesian player update" subtitle="Career form versus tonight's output">
          <div className="field">
            <label className="label" htmlFor="bayes-player">
              Player on court
            </label>
            <select
              id="bayes-player"
              className="select"
              value={bayesPlayerId}
              onChange={(event) => setBayesPlayerId(event.target.value)}
            >
              <optgroup label={session.teamA.name}>
                {session.teamA.starters.map((player) => (
                  <option key={player.playerId} value={player.playerId}>
                    {player.name} · avg {Number(player.mu).toFixed(2)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={session.teamB.name}>
                {session.teamB.starters.map((player) => (
                  <option key={player.playerId} value={player.playerId}>
                    {player.name} · avg {Number(player.mu).toFixed(2)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="row between wrap" style={{ marginBottom: 12 }}>
            <div>
              <div className="stat-label">Expected points</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>
                {bayesPlayer ? `${Number(bayesPlayer.mu).toFixed(2)} ± ${Number(bayesPlayer.std).toFixed(2)}` : "—"}
              </div>
            </div>
            <Badge tone={bayesPlayer?.side === "A" ? "info" : "danger"}>
              {bayesPlayer?.side === "A" ? session.teamA.name : session.teamB.name}
            </Badge>
          </div>

          <div className="field">
            <label className="label" htmlFor="observed-points">
              Actual points scored
            </label>
            <input
              id="observed-points"
              type="number"
              min="0"
              max="60"
              className="input"
              value={observed}
              onChange={(event) => setObserved(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={applyBayesian}
            disabled={!bayesPlayer || busy === "bayes"}
          >
            {busy === "bayes" ? <Spinner size={15} /> : null}
            {busy === "bayes" ? "Applying update…" : "Apply Bayesian update"}
          </button>

          {bayesResult && (
            <div className="alert alert-info" style={{ marginTop: 12 }}>
              <div className="alert-content">
                <strong>
                  {bayesResult.player.name}: {bayesResult.observedPoints} vs expected{" "}
                  {Number(bayesResult.expectedPoints).toFixed(2)} pts
                </strong>
                <span>
                  Deviation {bayesResult.deviation >= 0 ? "+" : ""}
                  {Number(bayesResult.deviation).toFixed(2)} · z ={" "}
                  {bayesResult.zScore === null ? "—" : Number(bayesResult.zScore).toFixed(2)} · LR ={" "}
                  {Number(bayesResult.likelihoodRatio).toFixed(2)}
                </span>
                <span>
                  Win probability {percent(bayesResult.priorProbabilityA, 1)} to{" "}
                  <strong>{percent(bayesResult.posteriorProbabilityA, 1)}</strong> (
                  {bayesResult.adjustment >= 0 ? "+" : ""}
                  {(bayesResult.adjustment * 100).toFixed(1)} pts)
                </span>
              </div>
            </div>
          )}

          <p className="hint" style={{ marginTop: 10 }}>
            Posterior odds = prior odds × exp(0.4 × z-score). The update models the selected
            player's side winning, so a Team B overperformance moves Team A's probability down.
          </p>
        </Card>

        <Card title="Substitution simulation" subtitle="Preview the lineup impact before applying">
          <div className="tab-bar" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab ${subSide === "A" ? "active" : ""}`}
              onClick={() => {
                setSubSide("A");
                setSubPreview(null);
              }}
            >
              {session.teamA.name}
            </button>
            <button
              type="button"
              className={`tab ${subSide === "B" ? "active" : ""}`}
              onClick={() => {
                setSubSide("B");
                setSubPreview(null);
              }}
            >
              {session.teamB.name}
            </button>
          </div>

          <div className="field">
            <label className="label" htmlFor="sub-out">
              Remove from starters
            </label>
            <select
              id="sub-out"
              className="select"
              value={outId}
              onChange={(event) => {
                setOutId(event.target.value);
                setSubPreview(null);
              }}
            >
              {subTeam?.starters.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.name} · avg {Number(player.mu).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="sub-in">
              Bring in from bench
            </label>
            <select
              id="sub-in"
              className="select"
              value={inId}
              onChange={(event) => {
                setInId(event.target.value);
                setSubPreview(null);
              }}
              disabled={!subTeam?.bench.length}
            >
              {subTeam?.bench.length ? (
                subTeam.bench.map((player) => (
                  <option key={player.playerId} value={player.playerId}>
                    {player.name} · avg {Number(player.mu).toFixed(2)}
                  </option>
                ))
              ) : (
                <option value="">No bench players available</option>
              )}
            </select>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={previewSubstitution}
              disabled={!outId || !inId || busy === "preview"}
            >
              {busy === "preview" ? <Spinner size={14} /> : null}
              Preview impact
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={applySubstitution}
              disabled={!outId || !inId || busy === "sub"}
            >
              {busy === "sub" ? <Spinner size={14} /> : <RefreshIcon width={14} height={14} />}
              Apply sub
            </button>
          </div>

          {subPreview && (
            <div className="alert alert-success" style={{ marginTop: 12 }}>
              <div className="alert-content">
                <strong>
                  {subPreview.outPlayer.name} → {subPreview.inPlayer.name}
                </strong>
                <span>
                  {percent(subPreview.currentProbability, 1)} to{" "}
                  <strong>{percent(subPreview.projectedProbability, 1)}</strong> (
                  {subPreview.delta >= 0 ? "+" : ""}
                  {(subPreview.delta * 100).toFixed(2)} pts)
                </span>
                <span>
                  Lineup strength {Number(subPreview.lineupStrengthBefore).toFixed(2)} →{" "}
                  {Number(subPreview.lineupStrengthAfter).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <p className="hint" style={{ marginTop: 10 }}>
            The preview uses the same two-layer probability as the live dashboard, so the delta is a
            like-for-like lineup effect.
          </p>
        </Card>
      </div>

      <Card
        title="Save completed match"
        subtitle="Player points are stored in MongoDB and refresh career averages, team form and the model context"
      >
        <div className="grid-2" style={{ marginBottom: 14 }}>
          {[
            { team: session.teamA, side: "A", tone: "info" },
            { team: session.teamB, side: "B", tone: "danger" },
          ].map(({ team, side, tone }) => (
            <div className="performance-team" key={side}>
              <h4>
                <Badge tone={tone}>{side}</Badge>
                {team.name}
              </h4>
              <div className="performance-grid">
                {[...team.starters, ...team.bench].map((player) => (
                  <div className="performance-row" key={player.playerId}>
                    <span title={player.name}>{player.name}</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="80"
                      aria-label={`Points for ${player.name}`}
                      value={performances[player.playerId] ?? "0"}
                      onChange={(event) =>
                        setPerformances((current) => ({
                          ...current,
                          [player.playerId]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid-3" style={{ marginBottom: 12 }}>
          <div className="field">
            <label className="label" htmlFor="match-date">
              Match date
            </label>
            <input
              id="match-date"
              className="input"
              value={dateLabel}
              onChange={(event) => setDateLabel(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="venue">
              Venue
            </label>
            <input
              id="venue"
              className="input"
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="notes">
              Coach notes
            </label>
            <input
              id="notes"
              className="input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="row between wrap">
          <span className="hint">
            Recorded {allPlayers.length} squad players · current score {session.scoreA}–
            {session.scoreB} · {formatDate(new Date())}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveMatch}
            disabled={busy === "save"}
          >
            {busy === "save" ? <Spinner size={15} /> : null}
            {busy === "save" ? "Saving report…" : "Save match to database"}
          </button>
        </div>
      </Card>
    </div>
  );
}
