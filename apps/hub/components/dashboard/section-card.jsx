export function SectionCard({
  kicker,
  title,
  description,
  action = null,
  className = "",
  children,
}) {
  return (
    <section className={`section-card ${className}`.trim()}>
      {(kicker || title || description || action) && (
        <div className="section-card__head">
          <div>
            {kicker ? <p className="section-kicker">{kicker}</p> : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div className="section-card__action">{action}</div> : null}
        </div>
      )}
      <div className="section-card__body">{children}</div>
    </section>
  );
}
