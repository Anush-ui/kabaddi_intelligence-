import { mlApi } from "../services/kabaddi.js";
import { useApi } from "../hooks/useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Badge,
  Card,
  ErrorState,
  PageHeader,
  PageLoader,
  StatCard,
} from "../components/UI.jsx";
import ModelTable from "../components/ModelTable.jsx";
import { LogoutIcon, SeedIcon, ShieldIcon, TrophyIcon } from "../components/Icons.jsx";
import { decimal, formatDate, formatDateTime, percent } from "../utils/format.js";

export default function Settings() {
  const { user, logout } = useAuth();
  const { data, loading, error, refresh } = useApi(() => mlApi.status(), []);

  if (loading) return <PageLoader label="Loading workspace settings" />;

  const model = data?.model;
  const health = data?.health;
  const ready = model?.ready;
  const dataset = model?.dataset;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        subtitle="Account, machine-learning pipeline and data coverage."
      />

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard
          label="API service"
          value={health?.status === "ok" ? "Online" : "Offline"}
          hint="Express · MongoDB"
          tone={health?.status === "ok" ? "cyan" : "rose"}
          icon={<ShieldIcon />}
        />
        <StatCard
          label="ML model"
          value={ready ? "Ready" : "Not ready"}
          hint={ready ? model.bestModel?.name : "Train the FastAPI model"}
          tone={ready ? "default" : "amber"}
          icon={<TrophyIcon />}
        />
        <StatCard
          label="Dataset"
          value={dataset?.matchCount ?? "—"}
          hint="Imported PKL fixtures"
          icon={<SeedIcon />}
        />
        <StatCard
          label="Training labels"
          value={dataset?.trainingRows ?? "—"}
          hint="Decisive + tied results"
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card title="Account" subtitle="JWT session details">
          <div className="row" style={{ gap: 12, marginBottom: 16 }}>
            <span className="avatar" style={{ width: 42, height: 42 }}>
              {(user?.name || "C")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("")}
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>{user?.name}</div>
              <div className="hint">{user?.email}</div>
            </div>
          </div>
          <div className="summary-list">
            <div className="summary-row">
              <span>Member since</span>
              <strong>{formatDate(user?.createdAt)}</strong>
            </div>
            <div className="summary-row">
              <span>Authentication</span>
              <strong>JWT Bearer · 7 day expiry</strong>
            </div>
            <div className="summary-row">
              <span>Password storage</span>
              <strong>bcrypt hash</strong>
            </div>
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 14 }} onClick={logout}>
            <LogoutIcon width={15} height={15} />
            Sign out
          </button>
        </Card>

        <Card
          title="ML service"
          subtitle="FastAPI · scikit-learn · Joblib"
          actions={
            ready ? <Badge tone="success" dot>Ready</Badge> : <Badge tone="warn">Not ready</Badge>
          }
        >
          {ready ? (
            <>
              <div className="summary-list">
                <div className="summary-row">
                  <span>Selected model</span>
                  <strong>{model.bestModel?.name}</strong>
                </div>
                <div className="summary-row">
                  <span>Cross-validated ROC-AUC</span>
                  <strong>{decimal(model.bestModel?.rocAuc, 4)}</strong>
                </div>
                <div className="summary-row">
                  <span>Trained</span>
                  <strong>{formatDateTime(model.trainedAt)}</strong>
                </div>
                <div className="summary-row">
                  <span>Features</span>
                  <strong style={{ maxWidth: 220 }}>{model.features?.join(", ")}</strong>
                </div>
                <div className="summary-row">
                  <span>Training rows</span>
                  <strong>{dataset?.trainingRows}</strong>
                </div>
                <div className="summary-row">
                  <span>Win rate in labels</span>
                  <strong>{percent(dataset?.winRate, 1)}</strong>
                </div>
              </div>
            </>
          ) : (
            <p className="hint">
              {model?.message ||
                "The Python service is offline. Start it with uvicorn app.main:app --port 8000."}
            </p>
          )}
        </Card>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card title="Model election" subtitle="Five candidates, best ROC-AUC selected">
          {ready ? (
            <ModelTable models={model.models} bestKey={model.bestModel?.key} />
          ) : (
            <p className="hint">Train the model to populate cross-validation scores.</p>
          )}
        </Card>

        <Card title="Dataset coverage" subtitle="Imported from the four PKL CSVs">
          {dataset ? (
            <>
              <div className="summary-list">
                <div className="summary-row">
                  <span>Player rows</span>
                  <strong>{dataset.playerRows?.toLocaleString()}</strong>
                </div>
                <div className="summary-row">
                  <span>Players</span>
                  <strong>{dataset.playerCount}</strong>
                </div>
                <div className="summary-row">
                  <span>Team match rows</span>
                  <strong>{dataset.teamRows?.toLocaleString()}</strong>
                </div>
                <div className="summary-row">
                  <span>Franchises</span>
                  <strong>{dataset.teamCount}</strong>
                </div>
                <div className="summary-row">
                  <span>Matches</span>
                  <strong>{dataset.matchCount}</strong>
                </div>
                <div className="summary-row">
                  <span>Winner labels</span>
                  <strong>
                    {dataset.labelCounts?.decisive ?? 0} wins · {dataset.labelCounts?.ties ?? 0} ties
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Unlabelled results</span>
                  <strong>
                    {(dataset.labelCounts?.unknown ?? 0) + (dataset.labelCounts?.missing ?? 0)} matches
                  </strong>
                </div>
              </div>
              <div className="alert alert-info" style={{ marginTop: 12 }}>
                Unlabelled fixtures remain in history but never contribute a win/loss label. No
                random labels are generated.
              </div>
            </>
          ) : (
            <p className="hint">Dataset metadata appears when the ML service is available.</p>
          )}
        </Card>
      </div>

      <Card title="Local operations" subtitle="Commands for retraining and refreshing data">
        <div className="stack-sm">
          <div>
            <div className="label">Retrain the five models</div>
            <pre className="code-block">{`cd ml-service
python -m app.train`}</pre>
          </div>
          <div>
            <div className="label">Re-import the CSV dataset</div>
            <pre className="code-block">{`cd server
npm run import`}</pre>
          </div>
          <p className="hint">
            Imported fixtures are read-only. Only matches saved from your live sessions can be
            edited, and only by the coach who saved them.
          </p>
        </div>
      </Card>
    </div>
  );
}
