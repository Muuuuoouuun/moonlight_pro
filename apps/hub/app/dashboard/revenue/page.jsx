import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getOperationsPageData } from "@/lib/server-data";

function extractCount(detail) {
  const match = detail.match(/\d+/);
  return match ? match[0] : "Live";
}

export default async function RevenueOverviewPage() {
  const { operationsBoard } = await getOperationsPageData();

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Revenue</p>
        <h1>Leads, deals, and cases</h1>
        <p>
          The revenue lane keeps the working funnel compact, explicit, and easy to close without
          burying the operator in a spreadsheet-shaped interface.
        </p>
      </section>

      <section className="summary-grid" aria-label="Revenue summary metrics">
        {operationsBoard.map((item, index) => (
          <SummaryCard
            key={item.title}
            title={item.title}
            value={extractCount(item.detail)}
            detail={item.detail}
            badge={index === 0 ? "Pipeline" : index === 1 ? "Close" : "Cases"}
            tone={index === 0 ? "warning" : index === 1 ? "blue" : "green"}
          />
        ))}
      </section>

      <div className="stack">
        <SectionCard
          kicker="Board"
          title="Working set"
          description="A compact revenue board keeps the funnel readable without adding visual noise."
          action={
            <Link className="button button-secondary" href="/dashboard/revenue/leads">
              Open lead lane
            </Link>
          }
        >
          <div className="metric-grid">
            {operationsBoard.map((item) => (
              <div className="mini-metric" key={item.title}>
                <span>{item.title}</span>
                <strong>{extractCount(item.detail)}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Rules"
          title="Operating rules"
          description="Revenue work should make the next move obvious and the ownership impossible to miss."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>Leads get reviewed first</strong>
                <p>Warm opportunities should be handled before the queue spreads attention thin.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Deals need a next step</strong>
                <p>Every active opportunity should have a clear owner and follow-up date.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Cases close the loop</strong>
                <p>Operational blockers should move toward resolved or escalated states quickly.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
