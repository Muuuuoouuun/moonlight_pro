import { SummaryCard } from "@/components/dashboard/summary-card";

function buildSummaryCards(pulse) {
  return [
    {
      title: "Machine",
      value: pulse.machine.statusLabel,
      detail: pulse.machine.summary,
      badge: "System",
      tone: pulse.machine.statusTone,
    },
    {
      title: "Running now",
      value: `${pulse.metrics.runningCount} live`,
      detail: pulse.metrics.queuedCount
        ? `${pulse.metrics.queuedCount} queued behind the active lane.`
        : "No queue pressure is visible right now.",
      badge: "Dispatch",
      tone: pulse.metrics.runningCount > 0 ? "blue" : pulse.metrics.queuedCount > 0 ? "warning" : "green",
    },
    {
      title: "Runs today",
      value: String(pulse.metrics.totalToday),
      detail: `${pulse.metrics.successRateLabel} success rate across completed runs today.`,
      badge: "Today",
      tone: pulse.metrics.failureCount > 0 ? "warning" : "green",
    },
    {
      title: "Active time",
      value: pulse.metrics.activeMinutesLabel,
      detail: `${pulse.metrics.webhookEventsToday} webhook events and ${pulse.metrics.liveRoutes} visible routes.`,
      badge: "Motion",
      tone: pulse.metrics.activeMinutes > 0 ? "blue" : "muted",
    },
  ];
}

export function OperatingPulseSummaryCards({ pulse, ariaLabel = "Operating pulse summary" }) {
  const cards = buildSummaryCards(pulse);

  return (
    <section className="summary-grid" aria-label={ariaLabel}>
      {cards.map((item) => (
        <SummaryCard
          key={item.title}
          title={item.title}
          value={item.value}
          detail={item.detail}
          badge={item.badge}
          tone={item.tone}
        />
      ))}
    </section>
  );
}

function OperatingPulseHeatmap({ buckets }) {
  return (
    <article className="project-card operating-pulse__heat-card">
      <div className="project-head">
        <div>
          <h3>Today heat strip</h3>
          <p>24 local hours. Failure is red, active is blue, clean motion is green.</p>
        </div>
        <span className="legend-chip" data-tone="muted">
          00-23
        </span>
      </div>
      <div className="operating-pulse__heat-grid" role="img" aria-label="Operating activity heat strip">
        {buckets.map((bucket) => (
          <div
            className="operating-pulse__heat-cell"
            data-tone={bucket.tone}
            key={bucket.hour}
            title={`${bucket.hourLabel} · ${bucket.totalLabel} · ${bucket.failureCount} failures`}
          >
            <span>{String(bucket.hour).padStart(2, "0")}</span>
            <strong>{bucket.count}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function OperatingPulseStatusCard({ pulse }) {
  return (
    <article className="project-card operating-pulse__status-card">
      <div className="project-head">
        <div>
          <h3>{pulse.machine.summary}</h3>
          <p>{pulse.machine.detail}</p>
        </div>
        <span className="legend-chip" data-tone={pulse.machine.statusTone}>
          {pulse.machine.statusLabel}
        </span>
      </div>
      <dl className="detail-stack">
        <div>
          <dt>Running</dt>
          <dd>{pulse.metrics.runningCount} live runs currently executing.</dd>
        </div>
        <div>
          <dt>Queued</dt>
          <dd>{pulse.metrics.queuedCount} runs are waiting for dispatch.</dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd>{pulse.metrics.totalToday} runs completed or moved today.</dd>
        </div>
        <div>
          <dt>Attention</dt>
          <dd>{pulse.metrics.attentionCount} signals still need a human check.</dd>
        </div>
      </dl>
    </article>
  );
}

function OperatingPulseSources({ rows }) {
  return (
    <div className="operating-pulse__source-grid">
      {rows.map((item) => (
        <article className="project-card operating-pulse__source-card" key={item.id}>
          <div className="project-head">
            <div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </div>
            <span className="legend-chip" data-tone={item.tone}>
              {item.value}
            </span>
          </div>
          <p className="check-detail">{item.meta}</p>
        </article>
      ))}
    </div>
  );
}

function OperatingPulseLiveRuns({ rows }) {
  return (
    <div className="timeline">
      {rows.length ? (
        rows.map((item) => (
          <div className="timeline-item" key={item.id}>
            <div className="inline-legend">
              <span className="legend-chip" data-tone={item.statusTone}>
                {item.status}
              </span>
              <span className="legend-chip" data-tone="muted">
                {item.lane} · {item.source}
              </span>
            </div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            <span className="muted tiny">
              {item.time} · {item.durationLabel}
            </span>
          </div>
        ))
      ) : (
        <div className="timeline-item">
          <strong>No live machine runs</strong>
          <p>The system is resting right now. New automation or sync work will appear here first.</p>
          <span className="muted tiny">Quiet</span>
        </div>
      )}
    </div>
  );
}

function OperatingPulseAttention({ items }) {
  return (
    <div className="template-grid">
      {items.length ? (
        items.map((item) => (
          <div className="template-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <p className="check-detail">{item.meta}</p>
            </div>
            <span className="legend-chip" data-tone={item.tone}>
              {item.tone}
            </span>
          </div>
        ))
      ) : (
        <div className="template-row">
          <div>
            <strong>No urgent machine issue</strong>
            <p>The current run surface is readable and no immediate machine handoff is open.</p>
            <p className="check-detail">Keep the queue small and failures explicit.</p>
          </div>
          <span className="legend-chip" data-tone="green">
            clean
          </span>
        </div>
      )}
    </div>
  );
}

export function OperatingPulsePanel({ pulse, compact = false }) {
  return (
    <div className={`operating-pulse${compact ? " operating-pulse--compact" : ""}`}>
      <div className={compact ? "stack" : "split-grid"}>
        <OperatingPulseStatusCard pulse={pulse} />
        <OperatingPulseHeatmap buckets={pulse.heatmap} />
      </div>

      {!compact ? <OperatingPulseSources rows={pulse.sourceRows} /> : null}

      <div className={compact ? "stack" : "split-grid"}>
        <div>
          <div className="operating-pulse__subhead">
            <strong>Live queue</strong>
            <span className="legend-chip" data-tone="blue">
              {pulse.metrics.runningCount + pulse.metrics.queuedCount}
            </span>
          </div>
          <OperatingPulseLiveRuns rows={pulse.liveRuns} />
        </div>

        <div>
          <div className="operating-pulse__subhead">
            <strong>Attention lane</strong>
            <span className="legend-chip" data-tone={pulse.metrics.attentionCount > 0 ? "warning" : "green"}>
              {pulse.metrics.attentionCount}
            </span>
          </div>
          <OperatingPulseAttention items={pulse.attentionItems} />
        </div>
      </div>
    </div>
  );
}

export function OperatingPulseMiniBoard({ pulse }) {
  return (
    <div className="operating-pulse operating-pulse--mini">
      <div className="operating-pulse__mini-head">
        <div>
          <strong>{pulse.machine.statusLabel}</strong>
          <p>{pulse.machine.summary}</p>
        </div>
        <span className="legend-chip" data-tone={pulse.machine.statusTone}>
          {pulse.metrics.activeMinutesLabel}
        </span>
      </div>

      <div className="operating-pulse__mini-metrics">
        {pulse.osPulse.map((item) => (
          <div className="operating-pulse__mini-row" key={item.label}>
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
            <span className="legend-chip" data-tone={item.tone}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="operating-pulse__mini-heat">
        {pulse.heatmap.map((bucket) => (
          <span
            className="operating-pulse__mini-cell"
            data-tone={bucket.tone}
            key={bucket.hour}
            title={`${bucket.hourLabel} · ${bucket.totalLabel}`}
          />
        ))}
      </div>
    </div>
  );
}
