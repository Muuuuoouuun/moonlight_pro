export function SectionCard({ kicker, title, description, action, children, className = "" }) {
  return (
    <section className={`section-card ${className}`.trim()}>
      <div className="section-head">
        {kicker ? <p className="section-kicker">{kicker}</p> : null}
        <h2 className="section-title">{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
      <div className="section-body">{children}</div>
    </section>
  );
}
