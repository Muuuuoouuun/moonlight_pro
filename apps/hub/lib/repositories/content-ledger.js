import {
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

const ITEM_STATUSES = ["idea", "draft", "review", "scheduled", "published", "archived"];
const VARIANT_STATUSES = ["draft", "ready", "published", "archived"];
const LOG_STATUSES = ["queued", "published", "failed"];

const ITEM_STATUS_LABEL = {
  idea: "Idea",
  draft: "Draft",
  review: "Review",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Idea",
};

const VARIANT_KIND_LABEL = {
  card_news: "Carousel",
  blog: "Blog",
  newsletter: "Newsletter",
  social_post: "Thread",
  landing_copy: "Blog",
};

const VARIANT_CHANNEL_LABEL = {
  card_news: "Instagram",
  blog: "Web",
  newsletter: "Email",
  social_post: "X",
  landing_copy: "Web",
};

function clampProgress(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function formatShortDate(value) {
  if (!value) return "미정";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";

  const datePart = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${datePart} ${timePart}`;
}

function isPast(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

function titleFromItem(item) {
  return (item?.title || "").trim() || "제목 없음";
}

function resolveItemChannel(item, variants) {
  const variant = variants.find((v) => v.content_id === item.id);
  if (variant?.variant_type && VARIANT_CHANNEL_LABEL[variant.variant_type]) {
    return VARIANT_CHANNEL_LABEL[variant.variant_type];
  }
  return "Web";
}

function resolveItemKind(item, variants) {
  const variant = variants.find((v) => v.content_id === item.id);
  if (variant?.variant_type && VARIANT_KIND_LABEL[variant.variant_type]) {
    return VARIANT_KIND_LABEL[variant.variant_type];
  }
  return "Blog";
}

function mapItems(rows, variants) {
  return rows.map((row) => {
    const status = ITEM_STATUSES.includes(row.status) ? row.status : "draft";
    const whenSource = row.scheduled_at || row.published_at || row.updated_at || row.created_at;

    return {
      id: row.id,
      title: titleFromItem(row),
      summary: row.summary || row.source_idea || "",
      slug: row.slug || null,
      status,
      statusLabel: ITEM_STATUS_LABEL[status] || "Draft",
      kind: resolveItemKind(row, variants),
      channel: resolveItemChannel(row, variants),
      when: formatShortDate(whenSource),
      author: row.owner_id ? "Me" : "Team",
      nextAction: row.next_action || "",
      scheduledAt: row.scheduled_at || null,
      publishedAt: row.published_at || null,
      visibility: row.visibility || "private",
      brandId: row.brand_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  });
}

function mapVariants(rows) {
  return rows.map((row) => {
    const status = VARIANT_STATUSES.includes(row.status) ? row.status : "draft";
    return {
      id: row.id,
      contentId: row.content_id,
      type: row.variant_type,
      kind: VARIANT_KIND_LABEL[row.variant_type] || "Blog",
      channel: VARIANT_CHANNEL_LABEL[row.variant_type] || "Web",
      title: row.title || "",
      body: row.body || "",
      excerpt: row.excerpt || "",
      status,
      slug: row.slug || null,
      visibility: row.visibility || "private",
      scheduledAt: row.scheduled_at || null,
      publishedAt: row.published_at || null,
      updatedAt: row.updated_at || row.created_at,
    };
  });
}

function mapPublishLogs(rows, variantById) {
  return rows.map((row) => {
    const status = LOG_STATUSES.includes(row.status) ? row.status : "queued";
    const variant = row.variant_id ? variantById.get(row.variant_id) : null;
    return {
      id: row.id,
      variantId: row.variant_id,
      contentId: variant?.contentId || null,
      channel: row.channel || variant?.channel || "Web",
      status,
      provider: row.provider || null,
      targetUrl: row.target_url || null,
      externalId: row.external_id || null,
      attemptCount: Number.isFinite(row.attempt_count) ? row.attempt_count : 1,
      publishedAt: row.published_at || null,
      when: formatShortDate(row.published_at || row.created_at),
      createdAt: row.created_at,
    };
  });
}

function buildPipeline(items) {
  const stages = [
    { key: "idea",      label: "Idea" },
    { key: "draft",     label: "Draft" },
    { key: "review",    label: "Review" },
    { key: "scheduled", label: "Scheduled" },
    { key: "published", label: "Published" },
  ];

  return stages.map((stage) => ({
    ...stage,
    count: items.filter((item) => item.status === stage.key).length,
    items: items.filter((item) => item.status === stage.key).slice(0, 8),
  }));
}

function buildAttention(items, publishLogs) {
  const attention = [];

  items.forEach((item) => {
    if (item.status === "scheduled" && isPast(item.scheduledAt)) {
      attention.push({
        id: `overdue-${item.id}`,
        kind: "overdue",
        tone: "danger",
        title: item.title,
        hint: `예약 발행 지연 · ${item.when}`,
        itemId: item.id,
      });
    }
  });

  publishLogs
    .filter((log) => log.status === "failed")
    .slice(0, 6)
    .forEach((log) => {
      attention.push({
        id: `failed-${log.id}`,
        kind: "failed",
        tone: "danger",
        title: `${log.channel} 발행 실패`,
        hint: `${log.provider || log.channel} · ${log.when}`,
        itemId: log.contentId,
      });
    });

  return attention.slice(0, 8);
}

function buildSummary(items, publishLogs) {
  const counts = items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.status === "idea") acc.ideas += 1;
      if (item.status === "draft") acc.drafts += 1;
      if (item.status === "review") acc.review += 1;
      if (item.status === "scheduled") acc.scheduled += 1;
      if (item.status === "published") acc.published += 1;
      return acc;
    },
    { total: 0, ideas: 0, drafts: 0, review: 0, scheduled: 0, published: 0, failed: 0 },
  );

  counts.failed = publishLogs.filter((log) => log.status === "failed").length;
  return counts;
}

function buildQueue(items) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    kind: item.kind,
    channel: item.channel,
    status: item.statusLabel,
    when: item.when,
    author: item.author,
  }));
}

export async function getContentLedger() {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return {
      source: "preview",
      configured: false,
      workspaceId: null,
      items: [],
      variants: [],
      publishLogs: [],
      queue: [],
      pipeline: buildPipeline([]),
      attention: [],
      summary: buildSummary([], []),
    };
  }

  const [itemRows, variantRows, logRows] = await Promise.all([
    fetchSupabaseRows("content_items", {
      limit: 80,
      order: "updated_at.desc",
      filters: withWorkspaceFilter([
        ["status", inFilter(ITEM_STATUSES)],
      ]),
    }),
    fetchSupabaseRows("content_variants", {
      limit: 160,
      order: "updated_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("publish_logs", {
      limit: 80,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
  ]);

  if (!itemRows || !variantRows || !logRows) {
    return {
      source: "preview",
      configured: true,
      workspaceId,
      items: [],
      variants: [],
      publishLogs: [],
      queue: [],
      pipeline: buildPipeline([]),
      attention: [],
      summary: buildSummary([], []),
    };
  }

  const variants = mapVariants(variantRows);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const items = mapItems(itemRows, variantRows);
  const publishLogs = mapPublishLogs(logRows, variantById);

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    items,
    variants,
    publishLogs,
    queue: buildQueue(items),
    pipeline: buildPipeline(items),
    attention: buildAttention(items, publishLogs),
    summary: buildSummary(items, publishLogs),
  };
}
