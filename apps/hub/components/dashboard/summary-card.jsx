export function SummaryCard({ title, value, detail, badge, tone = "green" }) {
  return (
    <article className="summary-card">
      <div className="summary-label">
        <h3 className="summary-title">{title}</h3>
        {badge ? (
          <span className="summary-badge" data-tone={tone}>
            {badge}
          </span>
        ) : null}
      </div>
      <p className="summary-value">{value}</p>
      {detail ? <p className="summary-detail">{detail}</p> : null}
    </article>
  );
}
