import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

function formatAccountRow(row) {
  return {
    title: row.name || "Customer account",
    status: row.status || "active",
    detail: `Last updated ${formatTimestamp(row.created_at)}`,
  };
}

const fallbackAccounts = [
  {
    title: "Core customer lane",
    status: "active",
    detail: "Keep the highest-trust account visible enough to protect delivery quality.",
  },
  {
    title: "Paused account watch",
    status: "paused",
    detail: "Paused accounts need a clear reactivation or closure decision.",
  },
  {
    title: "Closed account archive",
    status: "closed",
    detail: "Past accounts should still preserve context for future case and proof reuse.",
  },
];

export default async function RevenueAccountsPage() {
  const [accounts, activeCount, pausedCount, closedCount] = await Promise.all([
    fetchRows("customer_accounts", { limit: 8, order: "created_at.desc" }),
    countRows("customer_accounts", [["status", "eq.active"]]),
    countRows("customer_accounts", [["status", "eq.paused"]]),
    countRows("customer_accounts", [["status", "eq.closed"]]),
  ]);

  const accountRows = accounts?.length ? accounts.map(formatAccountRow) : fallbackAccounts;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Revenue</p>
        <h1>Accounts and customer state</h1>
        <p>
          Accounts keep the post-close relationship visible. This lane exists so ongoing customer work
          never drifts away from ownership, state, and future opportunity.
        </p>
      </section>

      <section className="summary-grid" aria-label="Account lane summary metrics">
        <SummaryCard
          title="Active"
          value={String(activeCount ?? accountRows.filter((item) => item.status === "active").length)}
          detail="Accounts currently in service or active follow-through."
          badge="Health"
        />
        <SummaryCard
          title="Paused"
          value={String(pausedCount ?? accountRows.filter((item) => item.status === "paused").length)}
          detail="Accounts that need a reactivation or closure decision."
          badge="Watch"
          tone="warning"
        />
        <SummaryCard
          title="Closed"
          value={String(closedCount ?? accountRows.filter((item) => item.status === "closed").length)}
          detail="Finished relationships that still hold useful context."
          badge="Archive"
          tone="muted"
        />
        <SummaryCard
          title="Ownership"
          value="Visible"
          detail="Each account should clearly indicate who carries the next move."
          badge="Clarity"
          tone="blue"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Accounts"
          title="Customer state board"
          description="Keep the account lane compact enough to scan before the day gets noisy."
        >
          <div className="timeline">
            {accountRows.map((item) => (
              <div className="timeline-item" key={item.title}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={item.status === "active" ? "green" : item.status === "paused" ? "warning" : "muted"}
                  >
                    {item.status}
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
          title="How to keep accounts readable"
          description="A customer lane is healthiest when service state and next action stay obvious."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>Protect active relationships first</strong>
                <p>Active accounts should surface before paused or archival work takes attention.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Pause with intent</strong>
                <p>A paused account should include the reason and the re-entry condition.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Archive context cleanly</strong>
                <p>Closed accounts should still preserve proof, issues, and relationship memory.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
