import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getAutomationsPageData } from "@/lib/server-data";

export default async function AutomationsPage() {
  const { automationCards, automationRuns, webhookEndpoints } = await getAutomationsPageData();

  return (
    <>
      <section className="summary-grid" aria-label="Automation summary metrics">
        <SummaryCard
          title="Live routes"
          value={String(webhookEndpoints.length)}
          detail="Webhook endpoints are exposed in the current engine surface."
          badge="Intake"
          tone="blue"
        />
        <SummaryCard
          title="Recent runs"
          value={String(automationRuns.length)}
          detail="The latest automation activity stays visible enough to review quickly."
          badge="Output"
        />
        <SummaryCard
          title="Ready commands"
          value="Open"
          detail="The command center remains the fastest place to send the next instruction."
          badge="Dispatch"
          tone="warning"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="Surface"
          title="What the engine exposes"
          description="Keep the surface small enough that the operator can scan it without reconstructing the system."
          action={
            <Link className="button button-secondary" href="/dashboard/automations/runs">
              Review Runs
            </Link>
          }
        >
          <div className="project-grid">
            {automationCards.map((item) => (
              <article className="project-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.route}</p>
                  </div>
                  <span
                    className="legend-chip"
                    data-tone={item.status === "active" ? "green" : item.status === "ready" ? "blue" : "warning"}
                  >
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
            kicker="Runs"
            title="Execution pulse"
            description="The run lane should tell the story directly instead of hiding behind raw output."
          >
            <div className="timeline">
              {automationRuns.map((item) => (
                <div className="timeline-item" key={item.title}>
                  <div className="inline-legend">
                    <span
                      className="legend-chip"
                      data-tone={item.status === "success" ? "green" : item.status === "ready" ? "blue" : "warning"}
                    >
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
            kicker="Routes"
            title="Intake catalog"
            description="Explicit endpoints keep integrations easy to audit and easier to grow later."
          >
            <div className="template-grid">
              {webhookEndpoints.map((item) => (
                <div className="template-row" key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.note}</p>
                  </div>
                  <span className="endpoint-pill">
                    <span>{item.method}</span>
                    <code>{item.path}</code>
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          kicker="Rules"
          title="Operator guardrails"
          description="A few simple checks keep the automation surface predictable under pressure."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>Prefer readable run summaries</strong>
                <p>Each run should say what happened without forcing a jump into raw traces.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Keep routes explicit</strong>
                <p>Every integration should stay visible enough that the intake path is easy to audit.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Escalate failures early</strong>
                <p>Broken automation should surface here before it silently affects the rest of the shell.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
