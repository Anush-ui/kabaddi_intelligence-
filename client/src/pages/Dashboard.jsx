import { Link } from "react-router-dom";
import { analyticsApi } from "../services/kabaddi.js";
import { useApi } from "../hooks/useApi.js";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  StatCard,
} from "../components/UI.jsx";
import ModelTable from "../components/ModelTable.jsx";
import {
  AnalyticsIcon,
  ArrowRightIcon,
  BoltIcon,
  HistoryIcon,
  PlayersIcon,
  TrophyIcon,
} from "../components/Icons.jsx";
import { decimal, formatDate, percent, teamBadge } from "../utils/format.js";

export default function Dashboard() {
  const { data, loading, error, refresh } = useApi(() => analyticsApi.overview(), []);

  if (loading) return <PageLoader label="Loading command centre" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const { counts, model, topTeams, leaders, recentSaved, recentDataset } = data;
  const modelReady = model?.ready;
  const best = model?.bestModel;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Command centre"
        title="Match intelligence"
        subtitle="Pro Kabaddi League form, five-model win probability and your saved coaching reports."
        actions={
          <>
            <Link to="/head-to-head" className="btn btn-secondary">
              <AnalyticsIcon width={16} height={16} />
              Head-to-head
            </Link>
            <Link to="/setup" className="btn btn-primary">
              <BoltIcon width={16} height={16} />
              Start match setup
            </Link>
          </>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard label="Franchises" value={counts.teams} hint="Canonical PKL teams" tone="cyan" icon={<TrophyIcon />} />
        <StatCard label="Players" value={counts.players} hint="Career aggregated profiles" icon={<PlayersIcon />} />
        <StatCard label="Dataset matches" value={counts.datasetMatches} hint="Imported PKL fixtures" />
        <StatCard label="Saved reports" value={counts.savedMatches} hint="Stored in MongoDB" tone="amber" icon={<HistoryIcon />} />
        <StatCard
          label="Best ROC-AUC"
          value={modelReady ? decimal(best?.rocAuc, 3) : "—"}
          hint={modelReady ? best?.name : "ML model offline"}
          tone="rose"
        />
      </div>

      {!modelReady && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          {model?.message ||
            "The ML model is not available. Start the FastAPI service and train the model to enable predictions."}
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card
          title="Win probability model"
          subtitle="Cross-validated election across five algorithms"
          actions={
            modelReady ? (
              <Badge tone="success" dot>
                Live
              </Badge>
            ) : (
              <Badge tone="warn">Offline</Badge>
            )
          }
        >
          {modelReady ? (
            <>
              <div className="row between wrap" style={{ marginBottom: 14 }}>
                <div>
                  <div className="stat-label">Selected model</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>
                    {best.name}
                  </div>
                  <div className="hint">
                    Trained {formatDate(model.trainedAt)} · {model.dataset?.trainingRows} labelled
                    matches
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="stat-label">ROC-AUC</div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 38,
                      fontWeight: 700,
                      color: "var(--accent)",
                    }}
                  >
                    {decimal(best.rocAuc, 3)}
                  </div>
                </div>
              </div>
              <ModelTable models={model.models} bestKey={best.key} compact />
            </>
          ) : (
            <EmptyState
              title="Model not trained"
              message="Place the PKL CSVs in dataset/, run the import, then train with python -m app.train."
            />
          )}
        </Card>

        <Card
          title="Top franchises"
          subtitle="Win rate across all imported fixtures"
          actions={
            <Link to="/analytics" className="btn-link">
              Compare teams
            </Link>
          }
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="num">Played</th>
                  <th className="num">W / L / T</th>
                  <th className="num">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {topTeams.map((team, index) => (
                  <tr key={team.teamId}>
                    <td>
                      <div className="team-cell">
                        <span className={`team-mono ${index === 0 ? "" : "rose"}`}>
                          {teamBadge(team.name)}
                        </span>
                        <div>
                          <strong>{team.name}</strong>
                          <div className="list-row-sub">
                            Raid {percent(team.avgRaidSuccess, 0)} · Tackle{" "}
                            {percent(team.avgTackleSuccess, 0)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{team.matchesPlayed}</td>
                    <td className="num">
                      {team.wins} / {team.losses} / {team.ties}
                    </td>
                    <td className="num" style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {percent(team.winRate, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card
          title="Your saved reports"
          subtitle="Matches completed in this workspace"
          actions={
            <Link to="/matches" className="btn-link">
              History
            </Link>
          }
        >
          {recentSaved.length === 0 ? (
            <EmptyState
              title="No saved matches yet"
              message="Build a lineup, run the live dashboard and save a completed match to see it here."
              action={
                <Link to="/setup" className="btn btn-secondary btn-sm">
                  Open match setup
                </Link>
              }
            />
          ) : (
            <div>
              {recentSaved.map((match) => (
                <Link key={match._id} to={`/matches/${match._id}`} className="list-row">
                  <div className="list-row-main">
                    <div className="list-row-title">
                      {match.teamA.name} vs {match.teamB.name}
                    </div>
                    <div className="list-row-sub">
                      {match.dateLabel || formatDate(match.matchDate)} · {match.result}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                      {match.teamA.score}–{match.teamB.score}
                    </span>
                    <ArrowRightIcon width={15} height={15} className="muted" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Latest PKL fixtures"
          subtitle="Most recent imported results"
          actions={
            <Link to="/matches?source=dataset" className="btn-link">
              All fixtures
            </Link>
          }
        >
          <div>
            {recentDataset.map((match) => (
              <Link key={match._id} to={`/matches/${match._id}`} className="list-row">
                <div className="list-row-main">
                  <div className="list-row-title">
                    {match.teamA.name} vs {match.teamB.name}
                  </div>
                  <div className="list-row-sub">
                    {match.seriesName || "PKL"} · {formatDate(match.matchDate)}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {match.teamA.score}–{match.teamB.score}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Player leaders" subtitle="Highest career scoring average (minimum five matches)">
        {leaders.length === 0 ? (
          <EmptyState title="No player data" message="Import the dataset to populate player profiles." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th className="num">Matches</th>
                  <th className="num">Avg points</th>
                  <th className="num">Raid pts</th>
                  <th className="num">Tackle pts</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((player) => (
                  <tr key={player.playerId}>
                    <td>
                      <strong>{player.name}</strong>
                    </td>
                    <td className="muted">{player.teamName}</td>
                    <td className="num">{player.matches}</td>
                    <td className="num" style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {Number(player.avgPoints).toFixed(2)}
                    </td>
                    <td className="num">{player.raidPoints}</td>
                    <td className="num">{player.tacklePoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
