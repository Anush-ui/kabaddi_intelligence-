function clampPercent(value) {
  return Math.min(98, Math.max(2, value));
}

export default function ProbabilityBar({ probabilityA, teamA, teamB, compact = false }) {
  const pctA = clampPercent((Number(probabilityA) || 0) * 100);
  const pctB = 100 - pctA;

  return (
    <div className={`prob ${compact ? "prob-compact" : ""}`}>
      <div className="prob-labels">
        <span className="prob-team prob-team-a">
          <span className="prob-swatch" />
          {teamA}
        </span>
        <span className="prob-team prob-team-b">
          {teamB}
          <span className="prob-swatch" />
        </span>
      </div>
      <div
        className="prob-bar"
        role="img"
        aria-label={`${teamA} win probability ${pctA.toFixed(0)} percent, ${teamB} ${pctB.toFixed(0)} percent`}
      >
        <div className="prob-segment prob-segment-a" style={{ width: `${pctA}%` }}>
          <span>{pctA.toFixed(0)}%</span>
        </div>
        <div className="prob-segment prob-segment-b" style={{ width: `${pctB}%` }}>
          <span>{pctB.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
