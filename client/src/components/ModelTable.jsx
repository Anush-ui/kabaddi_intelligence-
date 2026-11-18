import { Badge } from "./UI.jsx";

export default function ModelTable({ models = [], bestKey, compact = false }) {
  if (!models.length) {
    return <p className="muted">No model metadata available. Train the ML service to see results.</p>;
  }

  const max = Math.max(...models.map((model) => model.rocAuc || 0), 0.6);

  return (
    <div className={`model-list ${compact ? "model-list-compact" : ""}`}>
      {models.map((model) => {
        const selected = model.key === bestKey;
        return (
          <div key={model.key} className={`model-row ${selected ? "selected" : ""}`}>
            <div className="model-row-head">
              <div className="model-name">
                {model.name}
                {selected && <Badge tone="success">Selected</Badge>}
                {model.status === "failed" && <Badge tone="danger">Failed</Badge>}
              </div>
              <span className="model-score">
                {model.rocAuc === null ? "—" : model.rocAuc.toFixed(4)}
              </span>
            </div>
            <div className="model-bar">
              <span
                className="model-bar-fill"
                style={{ width: `${Math.max(2, ((model.rocAuc || 0) / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="model-footnote">
        Mean ROC-AUC across stratified cross-validation folds. The highest score is saved with Joblib
        and used for live predictions.
      </p>
    </div>
  );
}
