import { useState } from "react";
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
import { HeadToHeadIcon, SearchIcon } from "../components/Icons.jsx";
import { axisProps, CHART_COLORS, tooltipProps } from "../utils/chartTheme.js";
import { formatDate, percent } from "../utils/format.js";

export default function HeadToHead() {
  const teams = useApi(() => teamApi.list(), []);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [applied, setApplied] = useState(null);
  const [formError, setFormError] = useState(null);

  const report = useApi(
    () => analyticsApi.headToHead(applied.teamA, applied.teamB),
    [applied],
    { enabled: Boolean(applied) }
  );

  const teamList = teams.data?.teams || [];

  function generate() {
    setFormError(null);
    if (!teamA || !teamB) {
      setFormError("Select both teams.");
      return;
    }
    if (teamA === teamB) {
      setFormError("Choose two different teams.");
      return;
    }
    setApplied({ teamA: Number(teamA), teamB: Number(teamB) });
  }

  const data = report.data;

  const efficiencyData = data
    ? [
        {
          metric: "Raid success",
          A: Number((data.comparison.raidSuccessA * 100).toFixed(1)),
          B: Number((data.comparison.raidSuccessB * 100).toFixed(1)),
        },
        {
          metric: "Tackle success",
          A: Number((data.comparison.tackleSuccessA * 100).toFixed(1)),
          B: Number((data.comparison.tackleSuccessB * 100).toFixed(1)),
        },
      ]
    : [];

  const trendLength = Math.max(data?.trendA?.length || 0, data?.trendB?.length || 0);
  const trendData = data
    ? Array.from({ length: trendLength }, (_, index) => ({
        name: `M${index + 1}`,
        A: data.trendA[index]?.tackleSuccess ?? null,
        B: data.trendB[index]?.tackleSuccess ?? null,
      }))
    : [];

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Rivalry intelligence"
        title="Head-to-head"
        subtitle="Every imported meeting between two franchises, with wins, ties, raid and tackle efficiency."
        actions={
          data ? (
            <Badge tone="info">
              {data.played} meeting{data.played === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
      />

      <Card
        title="Build a rivalry report"
        subtitle="Wins, losses, ties and efficiency across all recorded matches"
        style={{ marginBottom: 16 }}
      >
        <div className="team-select-grid" style={{ marginBottom: 12 }}>
          <div className="field">
            <label className="label" htmlFor="h2h-a">
              Team A
            </label>
            <select
              id="h2h-a"
              className="select"
              value={teamA}
              onChange={(event) => setTeamA(event.target.value)}
            >
              <option value="">Select team…</option>
              {teamList.map((team) => (
                <option key={team.teamId} value={team.teamId} disabled={String(team.teamId) === teamB}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="h2h-b">
              Team B
            </label>
            <select
              id="h2h-b"
              className="select"
              value={teamB}
              onChange={(event) => setTeamB(event.target.value)}
            >
              <option value="">Select team…</option>
              {teamList.map((team) => (
                <option key={team.teamId} value={team.teamId} disabled={String(team.teamId) === teamA}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {formError && <div className="alert alert-error" style={{ marginBottom: 10 }}>{formError}</div>}

        <button
          type="button"
          className="btn btn-primary"
          onClick={generate}
          disabled={!teamA || !teamB || teamA === teamB || report.loading}
        >
          {report.loading ? <Spinner size={15} /> : <SearchIcon width={15} height={15} />}
          {report.loading ? "Loading report…" : "Generate report"}
        </button>
      </Card>

      {report.error && <ErrorState message={report.error} onRetry={report.refresh} />}
      {report.loading && <PageLoader label="Building head-to-head" />}

      {!report.loading && !report.error && !data && (
        <Card>
          <EmptyState
            icon={<HeadToHeadIcon width={26} height={26} />}
            title="No report yet"
            message="Pick two franchises and generate a report to see wins, ties and efficiency."
          />
        </Card>
      )}

      {data && !report.loading && (
        <div className="stack">
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{data.teamA.name} wins</div>
              <div className="stat-value" style={{ color: CHART_COLORS.teamA }}>
                {data.winsA}
              </div>
              <div className="stat-hint">{percent(data.winsA / Math.max(data.played, 1), 1)} of meetings</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Ties</div>
              <div className="stat-value" style={{ color: CHART_COLORS.amber }}>
                {data.ties}
              </div>
              <div className="stat-hint">{percent(data.ties / Math.max(data.played, 1), 1)} of meetings</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{data.teamB.name} wins</div>
              <div className="stat-value" style={{ color: CHART_COLORS.teamB }}>
                {data.winsB}
              </div>
              <div className="stat-hint">{percent(data.winsB / Math.max(data.played, 1), 1)} of meetings</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Meetings</div>
              <div className="stat-value">{data.played}</div>
              <div className="stat-hint">All seasons in the dataset</div>
            </div>
          </div>

          {data.played === 0 && (
            <div className="alert alert-info">
              These franchises have no recorded meetings in the imported dataset.
            </div>
          )}

          <div className="grid-2">
            <Card title="Raid & tackle efficiency" subtitle="Average across head-to-head matches">
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={efficiencyData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis dataKey="metric" {...axisProps} />
                    <YAxis domain={[0, 100]} {...axisProps} />
                    <Tooltip {...tooltipProps} formatter={(value) => [`${value}%`]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: CHART_COLORS.muted }} />
                    <Bar dataKey="A" name={data.teamA.name} fill={CHART_COLORS.teamA} radius={[4, 4, 0, 0]} barSize={30} isAnimationActive={false} />
                    <Bar dataKey="B" name={data.teamB.name} fill={CHART_COLORS.teamB} radius={[4, 4, 0, 0]} barSize={30} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="summary-list">
                <div className="summary-row">
                  <span>Overall win rate</span>
                  <strong>
                    {percent(data.comparison.overall.teamA.winRate, 1)} vs{" "}
                    {percent(data.comparison.overall.teamB.winRate, 1)}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Overall raid success</span>
                  <strong>
                    {percent(data.comparison.overall.teamA.avgRaidSuccess, 1)} vs{" "}
                    {percent(data.comparison.overall.teamB.avgRaidSuccess, 1)}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Overall tackle success</span>
                  <strong>
                    {percent(data.comparison.overall.teamA.avgTackleSuccess, 1)} vs{" "}
                    {percent(data.comparison.overall.teamB.avgTackleSuccess, 1)}
                  </strong>
                </div>
              </div>
            </Card>

            <Card title="Tackling trend" subtitle="Last ten matches per franchise">
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
                      name={data.teamA.name}
                      stroke={CHART_COLORS.teamA}
                      strokeWidth={2.2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="B"
                      name={data.teamB.name}
                      stroke={CHART_COLORS.teamB}
                      strokeWidth={2.2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                Trend points are each team's tackle success percentage per match, oldest to newest.
              </p>
            </Card>
          </div>

          <Card title="Recent meetings" subtitle="Most recent eight results between these teams">
            {data.recent.length === 0 ? (
              <EmptyState title="No matches found" message="No head-to-head fixtures in the dataset." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Result</th>
                      <th className="num">Score</th>
                      <th>Series</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((match) => (
                      <tr key={match.matchId}>
                        <td className="muted nowrap">{match.dateLabel || formatDate(match.date)}</td>
                        <td>{match.result}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {match.scoreA}–{match.scoreB}
                        </td>
                        <td className="muted">{match.seriesName || "PKL"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
