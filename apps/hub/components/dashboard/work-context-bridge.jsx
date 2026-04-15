import Link from "next/link";

function resolveRimTone(statusTone) {
  if (statusTone === "danger") {
    return "danger";
  }

  if (statusTone === "warning") {
    return "alert";
  }

  if (statusTone === "muted") {
    return "muted";
  }

  return "default";
}

export function WorkContextBridge({ rows }) {
  if (!rows?.length) {
    return (
      <div className="work-bridge__empty">
        <strong>No connected work lanes yet</strong>
        <p>Project, repository, and roadmap signals will show up here as soon as one lane starts emitting data.</p>
      </div>
    );
  }

  return (
    <div className="work-bridge__grid">
      {rows.map((row) => (
        <article
          className="work-bridge__card hub-rim"
          data-rim={resolveRimTone(row.statusTone)}
          key={row.key}
        >
          <div className="work-bridge__card-head">
            <div>
              <p className="work-bridge__kicker">{row.label}</p>
              <h3 className="work-bridge__title">{row.headline}</h3>
              <p className="work-bridge__description">{row.description}</p>
            </div>
            <span className="legend-chip" data-tone={row.statusTone || "muted"}>
              {row.statusLabel}
            </span>
          </div>

          <p className="work-bridge__detail">{row.detail}</p>

          <dl className="work-bridge__metrics">
            {row.metrics.map((metric) => (
              <div className="work-bridge__metric" key={`${row.key}-${metric.label}`}>
                <dt>{metric.label}</dt>
                <dd data-tone={metric.tone || "default"}>{metric.value}</dd>
              </div>
            ))}
          </dl>

          <div className="work-bridge__links">
            {row.links.map((item) => (
              <Link href={item.href} key={`${row.key}-${item.label}`}>
                {item.label}
              </Link>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
