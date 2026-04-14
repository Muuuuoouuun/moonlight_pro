import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp, getLogsPageData } from "@/lib/server-data";

const evolutionRules = [
  {
    title: "Record the symptom and the cause",
    detail: "A log entry should say what happened and what likely triggered it.",
  },
  {
    title: "Attach one follow-up owner",
    detail: "Improvement only works when somebody can actually act on the note next.",
  },
  {
    title: "Separate repeat issues from one-offs",
    detail: "A recurring pattern deserves a different treatment than a single bad run.",
  },
  {
    title: "Close with a decision",
    detail: "The best learning loop ends with a concrete choice, not just a recap of pain.",
  },
];

export default async function EvolutionPage() {
  const [logData, issues, memos, activityLogs, openLogs, openIssues] = await Promise.all([
    getLogsPageData(),
    fetchRows("issues", { limit: 4, order: "created_at.desc" }),
    fetchRows("memos", { limit: 4, order: "created_at.desc" }),
    fetchRows("activity_logs", { limit: 4, order: "created_at.desc" }),
    countRows("error_logs", [["resolved", "eq.false"]]),
    countRows("issues", [["status", "eq.open"]]),
  ]);

  const evolutionMetrics = [
    {
      title: "Captured signals",
      value: String((logData.logItems?.length ?? 0) + (activityLogs?.length ?? 0)),
      detail: "Logs and recent activity sit inside the same learning loop.",
      badge: "Learning",
      tone: "green",
    },
    {
      title: "Open fixes",
      value: String((openLogs ?? 0) + (openIssues ?? 0)),
      detail: "Visible issues and unresolved logs still need an owner.",
      badge: "Attention",
      tone: "warning",
    },
    {
      title: "Memos",
      value: String(memos?.length ?? 0),
      detail: "Short memory notes captured for the next pass.",
      badge: "Memory",
      tone: "blue",
    },
    {
      title: "Recent activity",
      value: String(activityLogs?.length ?? 0),
      detail: "Cross-system movement visible before context drifts.",
      badge: "Trace",
      tone: "muted",
    },
  ];

  const evolutionSignals = [
    {
      title: "Error logs",
      status: "warning",
      detail: `${openLogs ?? 0} unresolved logs still need a follow-up owner.`,
    },
    {
      title: "Issue board",
      status: "blue",
      detail: `${issues?.length ?? 0} recent issues are visible in the mitigation lane.`,
    },
    {
      title: "Memory lane",
      status: "green",
      detail: `${memos?.length ?? 0} memos captured so decisions stay reusable.`,
    },
    {
      title: "Pattern watch",
      status: "warning",
      detail: `${activityLogs?.length ?? 0} recent activity events can be inspected for repeat friction.`,
    },
  ];

  const evolutionEntries = [
    ...(logData.logItems || []).slice(0, 2).map((item) => ({
      title: item.title,
      detail: item.detail,
      time: item.severity === "warning" ? "Attention" : "Stable",
      tone: item.severity === "warning" ? "warning" : "green",
    })),
    ...(issues || []).slice(0, 1).map((item) => ({
      title: item.title || "Issue",
      detail: `Severity ${item.severity || "medium"} · status ${item.status || "open"}`,
      time: formatTimestamp(item.created_at),
      tone: item.severity === "critical" || item.severity === "high" ? "danger" : "blue",
    })),
  ].slice(0, 3);
  const visibleEntries = evolutionEntries.length
    ? evolutionEntries
    : [
        {
          title: "Learning loop waiting for more signals",
          detail: "As logs, issues, and memos accumulate, the newest events will surface here first.",
          time: "Pending",
          tone: "muted",
        },
      ];

  return (
    <>
      <section className="summary-grid" aria-label="Evolution summary metrics">
        {evolutionMetrics.map((metric) => (
          <SummaryCard key={metric.title} {...metric} />
        ))}
      </section>

      <div className="stack">
        <SectionCard
          kicker="Loop"
          title="What the system is learning"
          description="Keep the loop short, explicit, and easy to act on before the next work block starts."
          action={
            <Link className="button button-secondary" href="/dashboard/evolution/logs">
              Review Logs
            </Link>
          }
        >
          <div className="project-grid">
            {evolutionSignals.map((item) => (
              <article className="project-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>Improvement lane</p>
                  </div>
                  <span className="legend-chip" data-tone={item.status}>
                    {item.status}
                  </span>
                </div>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="split-grid">
          <SectionCard
            kicker="Signals"
            title="Recent learning events"
            description="The evolution tab should show what changed, what was decided, and what still needs closure."
          >
            <div className="timeline">
              {visibleEntries.map((item) => (
                <div className="timeline-item" key={item.title}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.tone}>
                      {item.time}
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Rules"
            title="Improvement guardrails"
            description="These are the habits that keep the self-evolution loop useful instead of noisy."
          >
            <ul className="note-list">
              {evolutionRules.map((item) => (
                <li className="note-row" key={item.title}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <SectionCard
          kicker="Follow-up"
          title="What should happen next"
          description="The loop is healthy when the next action is obvious and the fix has a home."
        >
          <div className="template-grid">
            {visibleEntries.map((item) => (
              <div className="template-row" key={`${item.title}-followup`}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
