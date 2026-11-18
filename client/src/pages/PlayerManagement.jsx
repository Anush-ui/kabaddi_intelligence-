import { useEffect, useState } from "react";
import { playerApi, teamApi } from "../services/kabaddi.js";
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
import { CloseIcon, PlayersIcon, SearchIcon } from "../components/Icons.jsx";
import { percent } from "../utils/format.js";

function PlayerDrawer({ playerId, onClose }) {
  const { data, loading, error } = useApi(() => playerApi.get(playerId), [playerId]);
  const player = data?.player;

  return (
    <>
      <button type="button" className="drawer-overlay" aria-label="Close player details" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Player details">
        <div className="drawer-head">
          <div>
            <span className="page-eyebrow">Player profile</span>
            <h2 className="drawer-title">{player?.name || "Loading…"}</h2>
            <p className="hint">{player?.teamName}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <CloseIcon />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {loading && (
          <div className="loading-inline">
            <Spinner size={14} /> Loading player…
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        {player && (
          <div className="stack">
            <div className="grid-2">
              <div className="preview-stat">
                <span>Matches</span>
                <strong>{player.matches}</strong>
              </div>
              <div className="preview-stat">
                <span>Avg points</span>
                <strong>{Number(player.avgPoints).toFixed(2)}</strong>
              </div>
              <div className="preview-stat">
                <span>Raid points</span>
                <strong>{player.raidPoints}</strong>
              </div>
              <div className="preview-stat">
                <span>Tackle points</span>
                <strong>{player.tacklePoints}</strong>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <div className="summary-list">
                  <div className="summary-row">
                    <span>Total points</span>
                    <strong>{player.totalPoints}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Raid success</span>
                    <strong>{percent(player.raidSuccessRate, 1)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Tackle success</span>
                    <strong>{percent(player.tackleSuccessRate, 1)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Latest role</span>
                    <strong>{player.latestStarter ? "Starter" : "Bench"}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Points deviation</span>
                    <strong>σ {Number(player.stdPoints).toFixed(2)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="section-title">
                <h2>Recent appearances</h2>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Opponent</th>
                      <th className="num">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((appearance) => (
                      <tr key={appearance.matchId}>
                        <td className="muted">#{appearance.matchId}</td>
                        <td>{appearance.opponent || "—"}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {appearance.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

export default function PlayerManagement() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [sort, setSort] = useState("avgPoints");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const teams = useApi(() => teamApi.list(), []);
  const { data, loading, error, refresh } = useApi(
    () =>
      playerApi.list({
        page,
        limit: 25,
        search,
        team: team || undefined,
        sort,
        order,
        minMatches: 1,
      }),
    [page, search, team, sort, order]
  );

  const players = data?.players || [];
  const pagination = data?.pagination;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Squad database"
        title="Player management"
        subtitle="Search 500+ Pro Kabaddi players, filter by franchise and inspect career scoring form."
        actions={
          <Badge tone="info">
            {pagination?.total ?? 0} player{pagination?.total === 1 ? "" : "s"}
          </Badge>
        }
      />

      <Card className="card" bodyClass="filter-bar">
        <div className="search-field">
          <SearchIcon />
          <input
            className="input"
            placeholder="Search player name…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search players"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="team-filter">
            Team
          </label>
          <select
            id="team-filter"
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

        <div className="field">
          <label className="label" htmlFor="sort-filter">
            Sort by
          </label>
          <select
            id="sort-filter"
            className="select"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="avgPoints">Average points</option>
            <option value="totalPoints">Total points</option>
            <option value="raidPoints">Raid points</option>
            <option value="tacklePoints">Tackle points</option>
            <option value="matches">Matches</option>
            <option value="name">Name</option>
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="order-filter">
            Order
          </label>
          <select
            id="order-filter"
            className="select"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          >
            <option value="desc">High to low</option>
            <option value="asc">Low to high</option>
          </select>
        </div>

        <button type="button" className="btn btn-secondary" onClick={refresh}>
          Refresh
        </button>
      </Card>

      <div style={{ marginTop: 16 }}>
        {loading && <PageLoader label="Loading players" />}
        {error && <ErrorState message={error} onRetry={refresh} />}
        {!loading && !error && players.length === 0 && (
          <Card>
            <EmptyState
              icon={<PlayersIcon width={26} height={26} />}
              title="No players match those filters"
              message="Try a different name, franchise or remove the search term."
            />
          </Card>
        )}

        {!loading && !error && players.length > 0 && (
          <Card
            title="Player database"
            subtitle="Click a row for the full career profile and recent appearances"
          >
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Current team</th>
                    <th className="num">Matches</th>
                    <th className="num">Avg pts</th>
                    <th className="num">Total</th>
                    <th className="num">Raid pts</th>
                    <th className="num">Tackle pts</th>
                    <th>Latest role</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr
                      key={player.playerId}
                      onClick={() => setSelectedPlayer(player.playerId)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <strong>{player.name}</strong>
                        <div className="list-row-sub">#{player.playerId}</div>
                      </td>
                      <td className="muted">{player.teamName}</td>
                      <td className="num">{player.matches}</td>
                      <td className="num" style={{ color: "var(--accent)", fontWeight: 600 }}>
                        {Number(player.avgPoints).toFixed(2)}
                      </td>
                      <td className="num">{player.totalPoints}</td>
                      <td className="num">{player.raidPoints}</td>
                      <td className="num">{player.tacklePoints}</td>
                      <td>
                        <Badge tone={player.latestStarter ? "success" : "neutral"}>
                          {player.latestStarter ? "Starter" : "Bench"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span>
                Page {pagination.page} of {pagination.pages} · {pagination.total} players
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

      {selectedPlayer && (
        <PlayerDrawer playerId={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
    </div>
  );
}
