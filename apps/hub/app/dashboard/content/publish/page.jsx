import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getContentBrandReference, resolveContentBrand } from "@/lib/dashboard-contexts";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}

function channelCount(items) {
  return new Set(items.map((item) => item.channel)).size;
}

export default async function ContentPublishPage({ searchParams }) {
  const [publishLogs, queuedCount, publishedCount, failedCount] = await Promise.all([
    fetchRows("publish_logs", { limit: 8, order: "created_at.desc" }),
    countRows("publish_logs", [["status", "eq.queued"]]),
    countRows("publish_logs", [["status", "eq.published"]]),
    countRows("publish_logs", [["status", "eq.failed"]]),
  ]);
  const selectedBrand = resolveContentBrand(searchParams?.brand);
  const brandReference = getContentBrandReference(selectedBrand.value);

  const publishQueue =
    publishLogs?.map((item) => ({
      title: item.channel || "Publish event",
      channel: item.channel || "channel",
      status: item.status || "queued",
      detail: item.external_id || "Waiting for external publish confirmation.",
      time: formatTimestamp(item.published_at || item.created_at),
    })) || [];

  return (
    <>
      <section className="summary-grid" aria-label="Publish summary">
        <SummaryCard
          title="Queued"
          value={String(queuedCount ?? countByStatus(publishQueue, "queued"))}
          detail="Work lined up for the next distribution pass."
          badge="Queue"
          tone="warning"
        />
        <SummaryCard
          title="Published"
          value={String(publishedCount ?? countByStatus(publishQueue, "published"))}
          detail="Items already shipped into their primary channel."
          badge="Live"
        />
        <SummaryCard
          title="Channels"
          value={String(channelCount(publishQueue))}
          detail="Distribution surfaces actively used by the current content lane."
          badge="Routes"
          tone="blue"
        />
        <SummaryCard
          title="Failures"
          value={String(failedCount ?? countByStatus(publishQueue, "failed"))}
          detail="Publish steps that need a retry path before the content goes cold."
          badge="Watch"
          tone="danger"
        />
      </section>

      <div className="stack">
        <ContentBrandReference reference={brandReference} compact />

        <div className="split-grid">
          <SectionCard
            kicker="History"
            title="Recent publish events"
            description={
              selectedBrand.value === "all"
                ? "The publish lane should explain where the work went and what still needs follow-up."
                : `${selectedBrand.label} is selected. Publish history stays shared until brand-level publish joins are stored in the ledger.`
            }
          >
            <div className="timeline">
              {publishQueue.map((item) => (
                <div className="timeline-item" key={`${item.title}-${item.time}-publish`}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.status === "published" ? "green" : item.status === "queued" ? "warning" : "danger"}>
                      {item.channel}
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
            kicker="Follow-up"
            title="What the publish lane should check"
            description="Shipping content is not the end of the loop. The next response matters."
          >
            <ul className="note-list">
              <li className="note-row">
                <div>
                  <strong>Match distribution to follow-up</strong>
                  <p>If a topic performs, the lead and operator queues should move the same day.</p>
                </div>
              </li>
              <li className="note-row">
                <div>
                  <strong>Record channel context</strong>
                  <p>Where a piece shipped should stay visible enough to reuse the winning pattern later.</p>
                </div>
              </li>
              <li className="note-row">
                <div>
                  <strong>Close the failure loop fast</strong>
                  <p>If a publish step fails, make the retry path obvious before the content goes cold.</p>
                </div>
              </li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
