import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

export default async function RevenueDealsPage() {
  const [deals, prospectCount, proposalCount, negotiationCount] = await Promise.all([
    fetchRows("deals", { limit: 8, order: "created_at.desc" }),
    countRows("deals", [["stage", "eq.prospect"]]),
    countRows("deals", [["stage", "eq.proposal"]]),
    countRows("deals", [["stage", "eq.negotiation"]]),
  ]);

  const dealRows =
    deals?.map((deal) => ({
      title: deal.title || "Opportunity",
      stage: deal.stage || "prospect",
      amount: deal.amount ?? 0,
      detail: deal.expected_close_at
        ? `Expected close ${formatTimestamp(deal.expected_close_at)}`
        : "Expected close date still needs a clear commitment.",
      time: formatTimestamp(deal.created_at),
    })) || [];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Revenue</p>
        <h1>Deals and stage movement</h1>
        <p>
          A deal should be easy to review, easy to own, and hard to ignore. The page keeps close
          signals compact so stalled opportunities surface early.
        </p>
      </section>

      <section className="summary-grid" aria-label="Deal lane summary metrics">
        <SummaryCard
          title="Prospect"
          value={String(prospectCount ?? dealRows.filter((item) => item.stage === "prospect").length)}
          detail="Opportunities still being shaped into a concrete proposal."
          badge="Entry"
          tone="warning"
        />
        <SummaryCard
          title="Proposal"
          value={String(proposalCount ?? dealRows.filter((item) => item.stage === "proposal").length)}
          detail="Deals where the offer is on the table and momentum matters."
          badge="Offer"
          tone="blue"
        />
        <SummaryCard
          title="Negotiation"
          value={String(negotiationCount ?? dealRows.filter((item) => item.stage === "negotiation").length)}
          detail="Opportunities that are close enough to justify daily visibility."
          badge="Close"
          tone="warning"
        />
        <SummaryCard
          title="Stage Rule"
          value="Explicit"
          detail="Each opportunity should know what unlocks the next stage."
          badge="Process"
          tone="green"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Deals"
          title="Active opportunity board"
          description="A deal should be easy to review, easy to own, and hard to ignore."
        >
          <div className="timeline">
            {(dealRows.length
              ? dealRows
              : [
                  {
                    title: "Deal lane waiting for data",
                    stage: "ready",
                    amount: 0,
                    detail: "Once deals land, this board will show stage, amount, and expected close.",
                    time: "Pending",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.stage === "negotiation" ? "green" : item.stage === "proposal" ? "blue" : "warning"
                    }
                  >
                    {item.stage}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    ₩{Number(item.amount).toLocaleString("ko-KR")}
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
          title="What to watch"
          description="The lane is only useful if the next move is equally clear."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>Next step is non-negotiable</strong>
                <p>Deals need a follow-up date and owner before the meeting ends.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Stalled opportunities surface early</strong>
                <p>Anything that stops moving should immediately become visible.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Close signals stay short</strong>
                <p>Use the smallest possible amount of text to explain what unlocks the win.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
