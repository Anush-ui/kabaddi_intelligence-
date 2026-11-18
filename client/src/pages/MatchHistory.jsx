import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { matchApi, teamApi } from "../services/kabaddi.js";
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
import { HistoryIcon, LiveIcon, SearchIcon } from "../components/Icons.jsx";
import { formatDate, percent } from "../utils/format.js";

export default function MatchHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [source, setSource] = useState(searchParams.get("source") || "");
  const [team, setTeam] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const teams = useApi(() => teamApi.list(), []);
  const { data, loading, error, refresh } = useApi(
    () =>
      matchApi.list({
        page,
        limit: 12,
        source: source || undefined,
        team: team || undefined,
        q,
      }),
    [page, source, team, q]
  );

  const matches = data?.matches || [];
  const pagination = data?.pagination;

  function changeSource(nextSource) {
    setSource(nextSource);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (nextSource) params.set("source", nextSource);
    else params.delete("source");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Archive"
        title="Match history"
        subtitle="Your saved coaching reports alongside every imported Pro Kabaddi fixture."
        actions={
          <>
            <Link to="/live" className="btn btn-secondary">
              <LiveIcon width={16} height={16} />
              Live match
            </Link>
            <Badge tone="info">{pagination?.total ?? 0} matches</Badge>
          </>
        }
      />

      <Card bodyClass="filter-bar" style={{ marginBottom: 16 }}>
        <div className="field">
          <span className="label">Source</span>
          <div className="tab-bar">
            {[
              { value: "", label: "All" },
              { value: "manual", label: "Saved" },
              { value: "dataset", label: "Dataset" },
            ].map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                className={`tab ${source === option.value ? "active" : ""}`}
                onClick={() => changeSource(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="search-field">
          <SearchIcon />
          <input
            className="input"
            placeholder="Search team, series or result…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search matches"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="history-team">
            Team
          </label>
          <select
            id="history-team"
            className="select"
            value={team}
            onChange={(event) => {
              setTeam(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All teams</option>
            {(teams.data?.teams || []).map((item) => (
              <option key={item.teamId} value={item.teamId}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="btn btn-secondary" onClick={refresh}>
          Refresh
        </button>
      </Card>

      {loading && <PageLoader label="Loading match history" />}
      {error && <ErrorState message={error} onRetry={refresh} />}

      {!loading && !error && matches.length === 0 && (
        <Card>
          <EmptyState
            icon={<HistoryIcon width={26} height={26} />}
            title="No matches found"
            message="Adjust the filters, or complete a live match and save the report."
          />
        </Card>
      )}

      {!loading && !error && matches.length > 0 && (
        <Card
          title="Match archive"
          subtitle="Saved reports include player performances and the probability timeline"
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Matchup</th>
                  <th className="num">Score</th>
                  <th>Winner</th>
                  <th>Source</th>
                  <th className="num">Team A win prob.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const winner = match.tie
                    ? "Tie"
                    : match.winnerTeamId === match.teamA.teamId
                      ? match.teamA.name
                      : match.winnerTeamId === match.teamB.teamId
                        ? match.teamB.name
                        : "—";
                  return (
                    <tr key={match.id}>
                      <td className="muted nowrap">
                        {match.dateLabel || formatDate(match.date)}
                      </td>
                      <td>
                        <strong>{match.teamA.name}</strong>
                        <span className="muted"> vs </span>
                        <strong>{match.teamB.name}</strong>
                        <div className="list-row-sub">{match.seriesName || "Pro Kabaddi League"}</div>
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {match.teamA.score}–{match.teamB.score}
                      </td>
                      <td>
                        <Badge
                          tone={
                            match.tie
                              ? "warn"
                              : match.winnerTeamId === match.teamA.teamId
                                ? "info"
                                : "danger"
                          }
                        >
                          {winner}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={match.source === "manual" ? "success" : "neutral"}>
                          {match.source === "manual" ? "Saved" : "Dataset"}
                        </Badge>
                      </td>
                      <td className="num">
                        {match.probabilityA === null ? "—" : percent(match.probabilityA, 1)}
                      </td>
                      <td className="num">
                        <Link to={`/matches/${match.id}`} className="btn btn-ghost btn-sm">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span>
              Page {pagination.page} of {pagination.pages} · {pagination.total} matches
            </span>
            <div className="pagination-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
