import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

export default async function RevenueLeadsPage() {
  const [leads, newCount, qualifiedCount, nurturingCount] = await Promise.all([
    fetchRows("leads", { limit: 8, order: "created_at.desc" }),
    countRows("leads", [["status", "eq.new"]]),
    countRows("leads", [["status", "eq.qualified"]]),
    countRows("leads", [["status", "eq.nurturing"]]),
  ]);

  const leadRows =
    leads?.map((lead) => ({
      title: lead.source ? `${lead.source} lead` : "Inbound lead",
      status: lead.status || "new",
      score: lead.score ?? 0,
      detail: lead.next_action || "Define the next touch before the lead cools down.",
      time: formatTimestamp(lead.created_at),
    })) || [];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Revenue</p>
        <h1>Lead queue and qualification</h1>
        <p>
          Lead work should stay small, current, and easy to act on. This lane exists to make the next
          touch obvious while the signal is still warm.
        </p>
      </section>

      <section className="summary-grid" aria-label="Lead lane summary metrics">
        <SummaryCard
          title="New"
          value={String(newCount ?? leadRows.filter((item) => item.status === "new").length)}
          detail="Fresh inbound that still needs qualification and the first response."
          badge="Pipeline"
          tone="warning"
        />
        <SummaryCard
          title="Qualified"
          value={String(qualifiedCount ?? leadRows.filter((item) => item.status === "qualified").length)}
          detail="Leads with enough signal to deserve immediate follow-up."
          badge="Focus"
          tone="blue"
        />
        <SummaryCard
          title="Nurturing"
          value={String(nurturingCount ?? leadRows.filter((item) => item.status === "nurturing").length)}
          detail="Opportunities that still need a sequence rather than a one-off touch."
          badge="Rhythm"
          tone="muted"
        />
        <SummaryCard
          title="Owner Clarity"
          value="Required"
          detail="Every lead should know who is responsible for the next touch."
          badge="System"
          tone="green"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Leads"
          title="Lead queue"
          description="Lead work should stay small, current, and easy to act on."
        >
          <div className="timeline">
            {(leadRows.length
              ? leadRows
              : [
                  {
                    title: "Lead lane waiting for data",
                    status: "ready",
                    score: 0,
                    detail: "Once lead records land, this board will show source, state, and next action.",
                    time: "Pending",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.status === "qualified" ? "green" : item.status === "nurturing" ? "blue" : "warning"
                    }
                  >
                    {item.status}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    score {item.score}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <span className="muted tiny">{item.time}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Rules"
          title="What to protect"
          description="The lane works when warm leads move first and every row has a believable next step."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>Review warm leads first</strong>
                <p>Handle active conversations before the rest of the queue gets attention.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Capture the next move</strong>
                <p>Every lead needs a concrete follow-up or qualification action.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Keep the funnel honest</strong>
                <p>Do not let stalled leads stay in motion without a decision path.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
