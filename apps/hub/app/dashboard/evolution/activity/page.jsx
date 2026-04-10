import { SectionCard } from "@/components/dashboard/section-card";
import { fetchRows, formatTimestamp } from "@/lib/server-data";

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Activity payload captured.";
  }

  const entries = Object.entries(payload).slice(0, 2);
  return entries.length ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ") : "Activity payload captured.";
}

export default async function EvolutionActivityPage() {
  const [activityLogs, memos] = await Promise.all([
    fetchRows("activity_logs", { limit: 8, order: "created_at.desc" }),
    fetchRows("memos", { limit: 6, order: "created_at.desc" }),
  ]);

  const activityFeed =
    activityLogs?.map((item) => ({
      title: `${item.entity_type || "entity"} · ${item.action || "updated"}`,
      detail: summarizePayload(item.payload),
      time: formatTimestamp(item.created_at),
    })) || [];
  const memoItems =
    memos?.map((item) => ({
      title: item.title || "Memo",
      detail: item.body || "Short memory captured.",
      time: formatTimestamp(item.created_at),
    })) || [];

  return (
    <div className="split-grid">
      <SectionCard
        kicker="Activity"
        title="Recent system movement"
        description="The activity lane should make recent changes easy to scan before context fades."
      >
        <div className="timeline">
          {(activityFeed.length
            ? activityFeed
            : [
                {
                  title: "No activity captured yet",
                  detail: "Once activity logging is wired, this feed will show cross-system motion.",
                  time: "Pending",
                },
              ]
          ).map((item) => (
            <div className="timeline-item" key={`${item.title}-${item.time}-activity`}>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <span className="muted tiny">{item.time}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        kicker="Memory"
        title="Recent memos"
        description="System learning should stay close to the short notes that explain why the change mattered."
      >
        <div className="timeline">
          {(memoItems.length
            ? memoItems
            : [
                {
                  title: "No memos yet",
                  detail: "This lane will hold short operating notes and reminders.",
                  time: "Pending",
                },
              ]
          ).map((item) => (
            <div className="timeline-item" key={`${item.title}-${item.time}-memo`}>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <span className="muted tiny">{item.time}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
