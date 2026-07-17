export function ContentBrandReference({ reference, compact = false }) {
  if (!reference) {
    return null;
  }

  return (
    <aside className="content-brand-reference" data-compact={compact ? "true" : "false"}>
      <div>
        <p className="section-kicker">Brand Reference</p>
        <h2>{reference.label}</h2>
        <p>{reference.rule}</p>
      </div>
      <div className="content-brand-reference__grid">
        {(reference.messages || []).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </aside>
  );
}
