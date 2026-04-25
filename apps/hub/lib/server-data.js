import { countSupabaseRows, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { CONTENT_QUEUE } from "@/components/hub/hub-data";

export async function fetchRows(table, options = {}) {
  return (await fetchSupabaseRows(table, {
    ...options,
    filters: withWorkspaceFilter(options.filters || []),
  })) || [];
}

export async function countRows(table, filters = []) {
  return countSupabaseRows(table, withWorkspaceFilter(filters));
}

export function formatTimestamp(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function normalizeStage(status) {
  const key = String(status || "").toLowerCase();

  if (["idea", "draft", "review"].includes(key)) {
    return key;
  }

  return "review";
}

function fallbackQueueRoster() {
  return CONTENT_QUEUE.map((item) => ({
    id: item.id,
    title: item.title,
    owner: item.author || "Me",
    due: item.when || "미정",
    stage: normalizeStage(item.status),
    brand: "all",
    nextAction: item.status === "Draft" ? "Complete the draft" : "Review and route to publish",
  }));
}

export async function getContentQueuePageData() {
  const rows = await fetchRows("content_items", {
    limit: 40,
    order: "updated_at.desc",
  });
  const queueRoster = rows.length
    ? rows.map((item) => ({
        id: item.id,
        title: item.title || "Untitled content",
        owner: item.owner_id ? "Me" : "Team",
        due: formatTimestamp(item.scheduled_at || item.updated_at || item.created_at),
        stage: normalizeStage(item.status),
        brand: item.brand_id || "all",
        nextAction: item.next_action || item.summary || "Define the next content action.",
      }))
    : fallbackQueueRoster();
  const stages = [
    { key: "idea", title: "Idea", note: "Inputs worth shaping" },
    { key: "draft", title: "Draft", note: "Copy in progress" },
    { key: "review", title: "Review", note: "Needs quality pass" },
  ];
  const contentPipeline = stages.map((stage) => ({
    ...stage,
    items: queueRoster
      .filter((item) => item.stage === stage.key)
      .slice(0, 6)
      .map((item) => ({
        title: item.title,
        meta: `${item.owner} · ${item.due}`,
        nextAction: item.nextAction,
      })),
  }));
  const contentAttention = queueRoster
    .filter((item) => item.stage === "review" || item.stage === "draft")
    .slice(0, 4)
    .map((item) => ({
      title: item.title,
      detail: item.nextAction,
      tone: item.stage === "review" ? "warning" : "muted",
    }));

  return {
    contentAttention,
    contentPipeline,
    contentQueueRoster: queueRoster,
  };
}
