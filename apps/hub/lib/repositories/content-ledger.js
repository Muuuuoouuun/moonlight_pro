import { randomUUID } from "crypto";

import {
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

const ITEM_STATUSES = ["idea", "draft", "review", "scheduled", "published", "archived"];
const VARIANT_STATUSES = ["draft", "ready", "published", "archived"];
const LOG_STATUSES = ["queued", "published", "failed"];
const VARIANT_TYPES = ["newsletter", "blog_insight", "card_news", "x_thread", "reels_script"];

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
  blog_insight: "Insight",
  newsletter: "Newsletter",
  social_post: "Thread",
  x_thread: "Thread",
  reels_script: "Reels",
  landing_copy: "Blog",
};

const VARIANT_CHANNEL_LABEL = {
  card_news: "Instagram",
  blog: "Web",
  blog_insight: "Web",
  newsletter: "Email",
  social_post: "X",
  x_thread: "X",
  reels_script: "Reels",
  landing_copy: "Web",
};

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeItemStatus(value, fallback = "draft") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return ITEM_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeVariantStatus(value, fallback = "draft") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return VARIANT_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeVariantType(value, fallback = "blog_insight") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  const aliases = {
    blog: "blog_insight",
    insight: "blog_insight",
    carousel: "card_news",
    thread: "x_thread",
    social_post: "x_thread",
    reels: "reels_script",
    reel: "reels_script",
    video_script: "reels_script",
  };
  const candidate = aliases[normalized] || normalized;
  return VARIANT_TYPES.includes(candidate) ? candidate : fallback;
}

function normalizeVisibility(value) {
  const normalized = normalizeString(value, "private").toLowerCase();
  return ["private", "workspace", "public"].includes(normalized) ? normalized : "private";
}

function normalizeBody(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildContentMeta(payload, action) {
  return {
    origin: "hub-studio",
    action,
    local_mirror: Boolean(payload.localMirror),
    template_id: normalizeNullableString(payload.templateId),
    brand_key: normalizeNullableString(payload.brandKey),
    automation_recipe_id: normalizeNullableString(payload.automationRecipeId),
  };
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
    const variant = variants.find((v) => v.content_id === row.id);

    return {
      id: row.id,
      variantId: variant?.id || null,
      title: titleFromItem(row),
      summary: row.summary || row.source_idea || "",
      slug: row.slug || null,
      status,
      statusLabel: ITEM_STATUS_LABEL[status] || "Draft",
      kind: variant?.variant_type ? (VARIANT_KIND_LABEL[variant.variant_type] || "Blog") : resolveItemKind(row, variants),
      channel: variant?.variant_type ? (VARIANT_CHANNEL_LABEL[variant.variant_type] || "Web") : resolveItemChannel(row, variants),
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
    variantId: item.variantId,
    title: item.title,
    kind: item.kind,
    channel: item.channel,
    status: item.statusLabel,
    when: item.when,
    author: item.author,
  }));
}

export function buildContentDraftRecords(payload = {}) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
  const timestamp = new Date().toISOString();
  const contentId = normalizeString(payload.contentId) || randomUUID();
  const variantId = normalizeString(payload.variantId) || randomUUID();
  const variantType = normalizeVariantType(payload.variantType);
  const title = normalizeString(payload.title, "Untitled content draft");
  const summary = normalizeNullableString(payload.summary);
  const sourceIdea = normalizeString(payload.sourceIdea) || title;
  const visibility = normalizeVisibility(payload.visibility);

  const itemRecord = {
    id: contentId,
    workspace_id: workspaceId || null,
    brand_id: normalizeNullableString(payload.brandId),
    title,
    source_idea: sourceIdea,
    idea_source: normalizeString(payload.ideaSource, "studio"),
    source_type: normalizeString(payload.sourceType, "manual"),
    status: normalizeItemStatus(payload.status),
    summary,
    next_action: normalizeNullableString(payload.nextAction),
    slug: normalizeNullableString(payload.slug),
    scheduled_at: normalizeNullableString(payload.scheduledAt),
    visibility,
    meta: buildContentMeta(payload, "create"),
    created_at: timestamp,
    updated_at: timestamp,
  };

  const variantRecord = {
    id: variantId,
    workspace_id: workspaceId || null,
    content_id: contentId,
    variant_type: variantType,
    title,
    body: normalizeBody(payload.body),
    summary,
    excerpt: normalizeNullableString(payload.excerpt) || summary,
    status: normalizeVariantStatus(payload.variantStatus),
    slug: normalizeNullableString(payload.slug),
    scheduled_at: normalizeNullableString(payload.scheduledAt),
    visibility,
    meta: {
      ...buildContentMeta(payload, "create"),
      preview_kind: normalizeNullableString(payload.previewKind),
    },
    created_at: timestamp,
    updated_at: timestamp,
  };

  return {
    workspaceId,
    contentId,
    variantId,
    itemRecord,
    variantRecord,
  };
}

export function buildContentDraftUpdateRecords(payload = {}) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
  const timestamp = new Date().toISOString();
  const contentId = normalizeString(payload.contentId);
  const variantId = normalizeString(payload.variantId);
  const variantType = normalizeVariantType(payload.variantType);
  const title = normalizeString(payload.title, "Untitled content draft");
  const summary = normalizeNullableString(payload.summary);
  const visibility = normalizeVisibility(payload.visibility);

  const itemPatch = {
    title,
    source_idea: normalizeString(payload.sourceIdea) || title,
    status: normalizeItemStatus(payload.status),
    summary,
    next_action: normalizeNullableString(payload.nextAction),
    slug: normalizeNullableString(payload.slug),
    scheduled_at: normalizeNullableString(payload.scheduledAt),
    visibility,
    meta: buildContentMeta(payload, "update"),
    updated_at: timestamp,
  };

  const variantPatch = {
    variant_type: variantType,
    title,
    body: normalizeBody(payload.body),
    summary,
    excerpt: normalizeNullableString(payload.excerpt) || summary,
    status: normalizeVariantStatus(payload.variantStatus),
    slug: normalizeNullableString(payload.slug),
    scheduled_at: normalizeNullableString(payload.scheduledAt),
    visibility,
    meta: {
      ...buildContentMeta(payload, "update"),
      preview_kind: normalizeNullableString(payload.previewKind),
    },
    updated_at: timestamp,
  };

  return {
    workspaceId,
    contentId,
    variantId,
    itemPatch,
    variantPatch,
  };
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
