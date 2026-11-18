import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { liveApi, teamApi } from "../services/kabaddi.js";
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
import { BoltIcon, ShieldIcon } from "../components/Icons.jsx";
import { axisProps, CHART_COLORS, tooltipProps } from "../utils/chartTheme.js";
import { percent, teamBadge } from "../utils/format.js";

const MAX_STARTERS = 7;
const MIN_STARTERS = 5;

function initializeLineup(players) {
  const starters = players.filter((player) => player.latestStarter).slice(0, MAX_STARTERS);
  const starterIds = new Set(starters.map((player) => player.playerId));
  return {
    starters,
    bench: players.filter((player) => !starterIds.has(player.playerId)),
  };
}

function TeamTrend({ stats, color }) {
  if (!stats?.trend?.length) return <p className="hint">No recent form available.</p>;

  const data = stats.trend.map((row, index) => ({
    name: index + 1,
    raid: row.raidSuccess,
    tackle: row.tackleSuccess,
  }));

  return (
    <div className="chart-box chart-sm" style={{ marginTop: 10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis domain={[0, 100]} {...axisProps} />
          <Tooltip {...tooltipProps} formatter={(value) => [`${value}%`]} />
          <Line
            type="monotone"
            dataKey="raid"
            stroke={color}
            strokeWidth={2}
            dot={false}
            name="Raid"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="tackle"
            stroke={CHART_COLORS.muted}
            strokeWidth={1.6}
            strokeDasharray="3 3"
            dot={false}
            name="Tackle"
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MatchSetup() {
  const navigate = useNavigate();
  const { data: teamsData, loading: teamsLoading, error: teamsError, refresh } = useApi(
    () => teamApi.list(),
    []
  );

  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [squads, setSquads] = useState(null);
  const [lineups, setLineups] = useState(null);
  const [stats, setStats] = useState({ A: null, B: null });
  const [loadingSquads, setLoadingSquads] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  const teams = teamsData?.teams || [];
  const teamA = useMemo(() => teams.find((team) => team.teamId === Number(teamAId)), [teams, teamAId]);
  const teamB = useMemo(() => teams.find((team) => team.teamId === Number(teamBId)), [teams, teamBId]);
  const sameTeam = Boolean(teamAId && teamBId && teamAId === teamBId);

  useEffect(() => {
    setSquads(null);
    setLineups(null);
    setStats({ A: null, B: null });
    setError(null);

    if (!teamAId || !teamBId || teamAId === teamBId) return;

    let cancelled = false;
    setLoadingStats(true);
    Promise.all([teamApi.stats(Number(teamAId)), teamApi.stats(Number(teamBId))])
      .then(([a, b]) => {
        if (!cancelled) setStats({ A: a, B: b });
      })
      .catch(() => {
        if (!cancelled) setStats({ A: null, B: null });
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamAId, teamBId]);

  async function buildSquads() {
    setError(null);
    if (!teamAId || !teamBId) {
      setError("Select both teams first.");
      return;
    }
    if (sameTeam) {
      setError("Team A and Team B must be different.");
      return;
    }

    setLoadingSquads(true);
    try {
      const [a, b] = await Promise.all([
        teamApi.roster(Number(teamAId)),
        teamApi.roster(Number(teamBId)),
      ]);
      setSquads({ A: a.players, B: b.players });
      setLineups({
        A: initializeLineup(a.players),
        B: initializeLineup(b.players),
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingSquads(false);
    }
  }

  function togglePlayer(side, player) {
    setError(null);
    setLineups((current) => {
      if (!current) return current;
      const lineup = current[side];
      const isStarter = lineup.starters.some((item) => item.playerId === player.playerId);

      if (isStarter) {
        return {
          ...current,
          [side]: {
            starters: lineup.starters.filter((item) => item.playerId !== player.playerId),
            bench: [...lineup.bench, player],
          },
        };
      }

      if (lineup.starters.length >= MAX_STARTERS) {
        setError(`Team ${side} already has ${MAX_STARTERS} starters. Move one to the bench first.`);
        return current;
      }

      return {
        ...current,
        [side]: {
          starters: [...lineup.starters, player],
          bench: lineup.bench.filter((item) => item.playerId !== player.playerId),
        },
      };
    });
  }

  async function startMatch() {
    if (!lineups) return;
    setError(null);

    if (lineups.A.starters.length < MIN_STARTERS || lineups.B.starters.length < MIN_STARTERS) {
      setError(`Each team needs at least ${MIN_STARTERS} starters (maximum ${MAX_STARTERS}).`);
      return;
    }

    setStarting(true);
    try {
      await liveApi.start({
        teamAId: Number(teamAId),
        teamBId: Number(teamBId),
        startersA: lineups.A.starters.map((player) => player.playerId),
        benchA: lineups.A.bench.map((player) => player.playerId).slice(0, 7),
        startersB: lineups.B.starters.map((player) => player.playerId),
        benchB: lineups.B.bench.map((player) => player.playerId).slice(0, 7),
      });
      navigate("/live");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  function reset() {
    setTeamAId("");
    setTeamBId("");
    setSquads(null);
    setLineups(null);
    setError(null);
    setStats({ A: null, B: null });
  }

  if (teamsLoading) return <PageLoader label="Loading franchises" />;
  if (teamsError) return <ErrorState message={teamsError} onRetry={refresh} />;

  const renderTeamCard = (side) => {
    const selectedId = side === "A" ? teamAId : teamBId;
    const otherId = side === "A" ? teamBId : teamAId;
    const team = side === "A" ? teamA : teamB;
    const accent = side === "A" ? CHART_COLORS.teamA : CHART_COLORS.teamB;

    return (
      <Card title={`Team ${side}`} subtitle={side === "A" ? "Cyan side of the mat" : "Rose side of the mat"}>
        <div className="field">
          <label className="label" htmlFor={`team-${side}`}>
            Select franchise
          </label>
          <select
            id={`team-${side}`}
            className="select"
            value={selectedId}
            onChange={(event) =>
              side === "A" ? setTeamAId(event.target.value) : setTeamBId(event.target.value)
            }
          >
            <option value="">Choose a team…</option>
            {teams.map((option) => (
              <option
                key={option.teamId}
                value={option.teamId}
                disabled={String(option.teamId) === otherId}
              >
                {option.name}
              </option>
            ))}
          </select>
        </div>

        {team ? (
          <div className="team-preview">
            <div className="team-preview-head">
              <div className="team-cell">
                <span className="team-mono" style={{ color: accent, background: `${accent}18` }}>
                  {teamBadge(team.name)}
                </span>
                <div>
                  <div className="team-preview-name">{team.name}</div>
                  <div className="list-row-sub">
                    {team.wins}W · {team.losses}L · {team.ties}T
                  </div>
                </div>
              </div>
              <Badge tone={side === "A" ? "info" : "danger"}>
                {percent(team.winRate, 1)} win rate
              </Badge>
            </div>

            <div className="preview-stats">
              <div className="preview-stat">
                <span>Raid success</span>
                <strong style={{ color: accent }}>{percent(team.avgRaidSuccess, 1)}</strong>
              </div>
              <div className="preview-stat">
                <span>Tackle success</span>
                <strong>{percent(team.avgTackleSuccess, 1)}</strong>
              </div>
              <div className="preview-stat">
                <span>Matches</span>
                <strong>{team.matchesPlayed}</strong>
              </div>
            </div>

            {loadingStats ? (
              <div className="loading-inline">
                <Spinner size={13} /> Loading recent form…
              </div>
            ) : (
              <TeamTrend stats={stats[side]} color={accent} />
            )}
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 4 }}>
            Team statistics and recent raid/tackle form appear here.
          </p>
        )}
      </Card>
    );
  };

  const renderLineup = (side) => {
    if (!lineups) return null;
    const lineup = lineups[side];
    const roster = squads[side];
    const team = side === "A" ? teamA : teamB;
    const accent = side === "A" ? CHART_COLORS.teamA : CHART_COLORS.teamB;
    const starterIds = new Set(lineup.starters.map((player) => player.playerId));

    return (
      <Card
        title={`${team?.name || `Team ${side}`} lineup`}
        subtitle="Click a player to move them between starter and bench"
      >
        <div className="lineup-head">
          <div className="lineup-counts">
            <Badge tone="success">{lineup.starters.length} starters</Badge>
            <Badge tone="warn">{lineup.bench.length} bench</Badge>
          </div>
          <span className="hint" style={{ color: accent }}>
            Max {MAX_STARTERS} starters
          </span>
        </div>

        <div className="roster-grid">
          {roster.map((player) => {
            const starter = starterIds.has(player.playerId);
            return (
              <button
                type="button"
                key={player.playerId}
                className={`player-card ${starter ? "is-starter" : "is-bench"}`}
                onClick={() => togglePlayer(side, player)}
                aria-pressed={starter}
              >
                <span className="player-name" title={player.name}>
                  {player.name}
                </span>
                <span className="player-meta">
                  {Number(player.avgPoints).toFixed(2)} avg pts · {player.matches}m
                </span>
                <span className="player-role">{starter ? "Starter" : "Bench"}</span>
              </button>
            );
          })}
        </div>

        <p className="lineup-note">
          At least {MIN_STARTERS} starters are required to confirm. Your first seven default to the
          franchise's most recent starting lineup.
        </p>
      </Card>
    );
  };

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Step 1 · Match build"
        title="Set the matchup"
        subtitle="Choose two franchises, inspect their form and confirm the starting sevens before the live dashboard."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              Reset
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={startMatch}
              disabled={!lineups || starting}
            >
              {starting ? <Spinner size={15} /> : <BoltIcon width={16} height={16} />}
              {starting ? "Building match…" : "Confirm & open live match"}
            </button>
          </>
        }
      />

      <div className="step-bar">
        <span className="step-chip done">
          <strong>1</strong> Select teams
        </span>
        <span className={`step-chip ${lineups ? "done" : ""}`}>
          <strong>2</strong> Build lineups
        </span>
        <span className="step-chip">
          <strong>3</strong> Live match
        </span>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {sameTeam && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          Team A and Team B must be different franchises.
        </div>
      )}

      <div className="team-select-grid" style={{ marginBottom: 16 }}>
        {renderTeamCard("A")}
        {renderTeamCard("B")}
      </div>

      <div className="row" style={{ marginBottom: 18 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={buildSquads}
          disabled={!teamA || !teamB || sameTeam || loadingSquads}
        >
          {loadingSquads ? <Spinner size={15} /> : <ShieldIcon width={16} height={16} />}
          {loadingSquads ? "Loading squads…" : lineups ? "Reload squads" : "Load squads & build lineups"}
        </button>
        <span className="hint">
          Rosters come from each team's most recent match in the dataset.
        </span>
      </div>

      {lineups && (
        <>
          <div className="grid-2">{renderLineup("A")}{renderLineup("B")}</div>
          <div
            className="card"
            style={{ marginTop: 16, padding: "14px 18px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}
          >
            <span className="hint" style={{ flex: 1 }}>
              Lineup strength changes the four model features: selected players adjust each team's
              rolling raid and tackle success before the model runs.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={startMatch}
              disabled={starting}
            >
              {starting ? <Spinner size={15} /> : null}
              {starting ? "Building match…" : "Confirm lineup"}
            </button>
          </div>
        </>
      )}

      {!lineups && (
        <Card title="How the prediction is built">
          <div className="grid-3">
            <div>
              <div className="stat-label">Layer 1</div>
              <p className="hint" style={{ marginTop: 4 }}>
                Five scikit-learn models score the four raid/tackle form features. The best
                cross-validated ROC-AUC is selected and loaded with Joblib.
              </p>
            </div>
            <div>
              <div className="stat-label">Layer 2</div>
              <p className="hint" style={{ marginTop: 4 }}>
                Live score difference is applied as a sigmoid shift after the model, so every point
                moves the win probability.
              </p>
            </div>
            <div>
              <div className="stat-label">In-match</div>
              <p className="hint" style={{ marginTop: 4 }}>
                Bayesian player updates and lineup substitutions recalculate the same model
                without retraining.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
