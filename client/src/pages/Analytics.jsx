import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyticsApi, teamApi } from "../services/kabaddi.js";
import { useApi } from "../hooks/useApi.js";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  Spinner,
} from "../components/UI.jsx";
import { AnalyticsIcon, ArrowRightIcon, TrophyIcon } from "../components/Icons.jsx";
import { axisProps, CHART_COLORS, tooltipProps } from "../utils/chartTheme.js";
import { percent } from "../utils/format.js";

export default function Analytics() {
  const [tab, setTab] = useState("players");
  const teams = useApi(() => teamApi.list(), []);

  const [teamFilter, setTeamFilter] = useState("");
  const performance = useApi(
    () => analyticsApi.playerPerformance({ team: teamFilter || undefined, limit: 10 }),
    [teamFilter]
  );

  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const validPair = Boolean(teamA && teamB && teamA !== teamB);
  const comparison = useApi(
    () => teamApi.compare(Number(teamA), Number(teamB)),
    [teamA, teamB],
    { enabled: validPair }
  );

  useEffect(() => {
    if (!validPair) comparison.setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validPair]);

  const teamList = teams.data?.teams || [];
  const teamAName = teamList.find((team) => team.teamId === Number(teamA))?.name || "Team A";
  const teamBName = teamList.find((team) => team.teamId === Number(teamB))?.name || "Team B";

  const comparisonData = comparison.data
    ? [
        {
          metric: "Raid success",
          A: Number((comparison.data.comparison.raidSuccessA * 100).toFixed(1)),
          B: Number((comparison.data.comparison.raidSuccessB * 100).toFixed(1)),
        },
        {
          metric: "Tackle success",
          A: Number((comparison.data.comparison.tackleSuccessA * 100).toFixed(1)),
          B: Number((comparison.data.comparison.tackleSuccessB * 100).toFixed(1)),
        },
      ]
    : [];

  const trendLength = Math.max(
    comparison.data?.trendA?.length || 0,
    comparison.data?.trendB?.length || 0
  );
  const trendData = comparison.data
    ? Array.from({ length: trendLength }, (_, index) => ({
        name: `M${index + 1}`,
        A: comparison.data.trendA[index]?.raidSuccess ?? null,
        B: comparison.data.trendB[index]?.raidSuccess ?? null,
      }))
    : [];

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Analysis lab"
        title="Performance analytics"
        subtitle="Career scoring leaders and franchise-level raid and tackle comparison."
        actions={
          <div className="tab-bar">
            <button
              type="button"
              className={`tab ${tab === "players" ? "active" : ""}`}
              onClick={() => setTab("players")}
            >
              Player performance
            </button>
            <button
              type="button"
              className={`tab ${tab === "teams" ? "active" : ""}`}
              onClick={() => setTab("teams")}
            >
              Team comparison
            </button>
          </div>
        }
      />

      {tab === "players" && (
        <div className="stack">
          <Card
            title="Scoring leaders"
            subtitle="Average points per appearance across all imported matches"
            actions={
              <div className="row" style={{ gap: 8 }}>
                <select
                  className="select"
                  style={{ width: 190 }}
                  value={teamFilter}
                  onChange={(event) => setTeamFilter(event.target.value)}
                  aria-label="Filter by team"
                >
                  <option value="">All franchises</option>
                  {teamList.map((team) => (
                    <option key={team.teamId} value={team.teamId}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <Link to="/players" className="btn btn-secondary btn-sm">
                  Full database
                  <ArrowRightIcon width={14} height={14} />
                </Link>
              </div>
            }
          >
            {performance.loading && (
              <div className="loading-inline">
                <Spinner size={15} /> Loading player analytics…
              </div>
            )}
            {performance.error && (
              <ErrorState message={performance.error} onRetry={performance.refresh} />
            )}
            {!performance.loading && !performance.error && (
              <>
                <div className="chart-box chart-lg">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={performance.data?.topScorers || []}
                      layout="vertical"
                      margin={{ top: 4, right: 22, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
                      <XAxis type="number" {...axisProps} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={132}
                        {...axisProps}
                        tickFormatter={(value) =>
                          value.length > 18 ? `${value.slice(0, 17)}…` : value
                        }
                      />
                      <Tooltip
                        {...tooltipProps}
                        formatter={(value) => [`${Number(value).toFixed(2)} pts`, "Average"]}
                      />
                      <Bar
                        dataKey="avgPoints"
                        fill={CHART_COLORS.accent}
                        radius={[0, 4, 4, 0]}
                        barSize={13}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-legend">
                  <span>
                    <span className="legend-dot" style={{ background: CHART_COLORS.accent }} />
                    Average points per match
                  </span>
                </div>
              </>
            )}
          </Card>

          <div className="grid-2">
            <Card title="Top raiders" subtitle="Total raid points">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Team</th>
                      <th className="num">Avg</th>
                      <th className="num">Raid pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(performance.data?.topRaiders || []).map((player) => (
                      <tr key={player.playerId}>
                        <td>
                          <strong>{player.name}</strong>
                        </td>
                        <td className="muted">{player.teamName}</td>
                        <td className="num">{Number(player.avgPoints).toFixed(2)}</td>
                        <td className="num" style={{ color: CHART_COLORS.teamB, fontWeight: 600 }}>
                          {player.raidPoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Top tacklers" subtitle="Total tackle points">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Team</th>
                      <th className="num">Avg</th>
                      <th className="num">Tackle pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(performance.data?.topTacklers || []).map((player) => (
                      <tr key={player.playerId}>
                        <td>
                          <strong>{player.name}</strong>
                        </td>
                        <td className="muted">{player.teamName}</td>
                        <td className="num">{Number(player.avgPoints).toFixed(2)}</td>
                        <td className="num" style={{ color: CHART_COLORS.teamA, fontWeight: 600 }}>
                          {player.tacklePoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "teams" && (
        <div className="stack">
          <Card
            title="Compare franchises"
            subtitle="Select two teams to compare form, raid and tackle efficiency and their head-to-head record"
          >
            <div className="team-select-grid">
              <div className="field">
                <label className="label" htmlFor="compare-a">
                  Team A
                </label>
                <select
                  id="compare-a"
                  className="select"
                  value={teamA}
                  onChange={(event) => setTeamA(event.target.value)}
                >
                  <option value="">Select team…</option>
                  {teamList.map((team) => (
                    <option
                      key={team.teamId}
                      value={team.teamId}
                      disabled={String(team.teamId) === teamB}
                    >
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="compare-b">
                  Team B
                </label>
                <select
                  id="compare-b"
                  className="select"
                  value={teamB}
                  onChange={(event) => setTeamB(event.target.value)}
                >
                  <option value="">Select team…</option>
                  {teamList.map((team) => (
                    <option
                      key={team.teamId}
                      value={team.teamId}
                      disabled={String(team.teamId) === teamA}
                    >
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {teamA && teamB && teamA === teamB && (
              <div className="alert alert-warn" style={{ marginTop: 10 }}>
                Choose two different franchises.
              </div>
            )}
          </Card>

          {!validPair && (
            <Card>
              <EmptyState
                icon={<AnalyticsIcon width={26} height={26} />}
                title="Pick two franchises"
                message="A side-by-side raid, tackle and win-rate comparison appears here."
              />
            </Card>
          )}

          {validPair && comparison.loading && <PageLoader label="Comparing teams" />}
          {validPair && comparison.error && (
            <ErrorState message={comparison.error} onRetry={comparison.refresh} />
          )}

          {validPair && comparison.data && (
            <>
              <div className="grid-2">
                {[
                  {
                    team: comparison.data.teamA,
                    stats: comparison.data.comparison.overall.teamA,
                    color: CHART_COLORS.teamA,
                  },
                  {
                    team: comparison.data.teamB,
                    stats: comparison.data.comparison.overall.teamB,
                    color: CHART_COLORS.teamB,
                  },
                ].map(({ team, stats, color }) => (
                  <Card key={team.teamId}>
                    <div className="row between wrap" style={{ marginBottom: 12 }}>
                      <div>
                        <div className="stat-label">Franchise</div>
                        <div style={{ fontSize: 17, fontWeight: 600 }}>{team.name}</div>
                      </div>
                      <Badge tone={color === CHART_COLORS.teamA ? "info" : "danger"}>
                        {percent(stats.winRate, 1)} win rate
                      </Badge>
                    </div>
                    <div className="preview-stats">
                      <div className="preview-stat">
                        <span>Raid success</span>
                        <strong style={{ color }}>{percent(stats.avgRaidSuccess, 1)}</strong>
                      </div>
                      <div className="preview-stat">
                        <span>Tackle success</span>
                        <strong>{percent(stats.avgTackleSuccess, 1)}</strong>
                      </div>
                      <div className="preview-stat">
                        <span>H2H wins</span>
                        <strong>
                          {team.teamId === comparison.data.teamA.teamId
                            ? comparison.data.winsA
                            : comparison.data.winsB}
                        </strong>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="grid-2">
                <Card
                  title="Efficiency comparison"
                  subtitle={`${comparison.data.played} head-to-head meetings · ${comparison.data.ties} tied`}
                >
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparisonData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                        <XAxis dataKey="metric" {...axisProps} />
                        <YAxis domain={[0, 100]} {...axisProps} />
                        <Tooltip {...tooltipProps} formatter={(value) => [`${value}%`]} />
                        <Legend wrapperStyle={{ fontSize: 11, color: CHART_COLORS.muted }} />
                        <Bar dataKey="A" name={teamAName} fill={CHART_COLORS.teamA} radius={[4, 4, 0, 0]} barSize={26} isAnimationActive={false} />
                        <Bar dataKey="B" name={teamBName} fill={CHART_COLORS.teamB} radius={[4, 4, 0, 0]} barSize={26} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Recent raid form" subtitle="Last ten matches per team, raid success %">
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                        <XAxis dataKey="name" {...axisProps} />
                        <YAxis domain={[0, 100]} {...axisProps} />
                        <Tooltip {...tooltipProps} formatter={(value) => [`${value}%`]} />
                        <Legend wrapperStyle={{ fontSize: 11, color: CHART_COLORS.muted }} />
                        <Line
                          type="monotone"
                          dataKey="A"
                          name={teamAName}
                          stroke={CHART_COLORS.teamA}
                          strokeWidth={2.2}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="B"
                          name={teamBName}
                          stroke={CHART_COLORS.teamB}
                          strokeWidth={2.2}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="row between wrap">
                  <div className="row" style={{ gap: 22 }}>
                    <div className="stat-pair">
                      <div>
                        <span>{comparison.data.teamA.name} H2H wins</span>
                        <strong style={{ color: CHART_COLORS.teamA }}>{comparison.data.winsA}</strong>
                      </div>
                      <div>
                        <span>Ties</span>
                        <strong style={{ color: CHART_COLORS.amber }}>{comparison.data.ties}</strong>
                      </div>
                      <div>
                        <span>{comparison.data.teamB.name} H2H wins</span>
                        <strong style={{ color: CHART_COLORS.teamB }}>{comparison.data.winsB}</strong>
                      </div>
                    </div>
                  </div>
                  <Link to="/head-to-head" className="btn btn-secondary btn-sm">
                    <TrophyIcon width={14} height={14} />
                    Full head-to-head
                  </Link>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
