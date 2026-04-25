export function SummaryCard({ title, value, detail, badge, tone = "muted" }) {
  return (
    <article className="summary-card" data-tone={tone}>
      <div className="summary-card__meta">
        <span>{title}</span>
        {badge ? <span className="legend-chip" data-tone={tone}>{badge}</span> : null}
      </div>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}
