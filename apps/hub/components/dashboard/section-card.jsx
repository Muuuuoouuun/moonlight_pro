/**
 * SectionCard — minimal section container for hub surfaces.
 *
 * tone:
 *  - "default" → whisper hairline border, transparent body (used everywhere)
 *  - "panel"   → hairline border + very soft fill (use when you need to
 *                visually group a dense block of rows)
 *  - "plain"   → no border, no padding, just the header + body
 *                (use when the section is already inside a larger frame)
 */
export function SectionCard({ kicker, title, description, action, tone = "default", children }) {
  return (
    <section className="section-card" data-tone={tone}>
      <div className="section-head">
        {kicker ? <p className="section-kicker">{kicker}</p> : null}
        {title ? <h2 className="section-title">{title}</h2> : null}
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
      <div className="section-body">{children}</div>
    </section>
  );
}
