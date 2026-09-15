import { randomUUID } from "crypto";

import {
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { canonicalOrgScopeForKey } from "@/lib/brand-org-scope";
import { normalizeCampaignBusinessTruth } from "@/lib/campaign-business-truth";

const ITEM_STATUSES = ["idea", "draft", "review", "scheduled", "published", "archived"];
const VARIANT_STATUSES = ["draft", "ready", "published", "archived"];
const LOG_STATUSES = ["queued", "published", "failed"];
const CAMPAIGN_STATUSES = ["draft", "planning", "active", "paused", "completed"];
const CAMPAIGN_STATUS_LABEL = {
  draft: "Draft",
  planning: "Planning",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};
const ASSET_TYPES = ["image", "html", "zip", "thumbnail", "source"];
const VARIANT_TYPES = [
  "newsletter",
  "blog",
  "blog_insight",
  "card_news",
  "social_post",
  "x_thread",
  "reels_script",
  "landing_copy",
  "threads_post",
];

const ITEM_STATUS_LABEL = {
  idea: "Inbox",
  draft: "Drafting",
  review: "Ready",
  scheduled: "Handed off",
  published: "Watch",
  archived: "Archived",
};

const VARIANT_KIND_LABEL = {
  card_news: "Carousel",
  blog: "Blog",
  blog_insight: "Insight",
  newsletter: "Newsletter",
  social_post: "Thread",
  x_thread: "Thread",
  threads_post: "Threads",
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
  threads_post: "Threads",
  reels_script: "Reels",
  landing_copy: "Web",
};
const CHANNEL_LABEL = {
  threads: "Threads", x: "X", instagram: "Instagram", youtube_shorts: "YouTube Shorts",
  reels: "Reels", blog: "Web", email: "Email",
};

function variantChannel(row) {
  return row?.channel ? CHANNEL_LABEL[row.channel] || row.channel : VARIANT_CHANNEL_LABEL[row?.variant_type] || "Web";
}
const CANONICAL_BRAND_ORDER = {
  sinabro: 10,
  gore: 20,
  holyfuncollector: 30,
  bridgemaker: 40,
  moonpm: 50,
  classmoon: 60,
  studyseagull: 70,
  politicofficer: 80,
  "22nomad": 90,
};
// §5: 색은 제품 도메인을 분류하지 않는다 — 브랜드 정체성은 글리프+라벨 몫.
// (이전: 브랜드별 info/warning/danger 레인보우 — studyseagull은 큐 행마다 상시 red 칩)
const CANONICAL_BRAND_TONES = {};
const CANONICAL_BRAND_GLYPHS = {
  sinabro: "✦",
  gore: "◌",
  holyfuncollector: "✧",
  bridgemaker: "◇",
  moonpm: "◐",
  classmoon: "□",
  studyseagull: "△",
  politicofficer: "◎",
  "22nomad": "◻",
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

function normalizeLogStatus(value, fallback = "queued") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return LOG_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeCampaignStatus(value, fallback = "draft") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return CAMPAIGN_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeAssetType(value, fallback = "source") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return ASSET_TYPES.includes(normalized) ? normalized : fallback;
}

function normalizeVariantType(value, fallback = "blog_insight") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  const aliases = {
    insight: "blog_insight",
    blog: "blog_insight",
    carousel: "card_news",
    thread: "x_thread",
    social_post: "x_thread",
    reels: "reels_script",
    reel: "reels_script",
    video_script: "reels_script",
    landing_copy: "blog_insight",
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
    ...(payload.localMirror !== undefined ? { local_mirror: Boolean(payload.localMirror) } : {}),
    ...(payload.templateId !== undefined ? { template_id: normalizeNullableString(payload.templateId) } : {}),
    ...(payload.brandKey !== undefined ? { brand_key: normalizeNullableString(payload.brandKey) } : {}),
    ...(payload.automationRecipeId !== undefined ? { automation_recipe_id: normalizeNullableString(payload.automationRecipeId) } : {}),
    ...(payload.sourceUrl !== undefined ? { source_url: normalizeNullableString(payload.sourceUrl) } : {}),
    ...(payload.sourceNoteId !== undefined ? { source_note_id: normalizeNullableString(payload.sourceNoteId) } : {}),
    ...(payload.orgScope !== undefined ? { org_scope: payload.orgScope === "company" ? "company" : "personal" } : {}),
  };
}

function buildLogPayload(payload, event, channel) {
  const rawPayload = payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
    ? payload.payload
    : {};

  return {
    ...rawPayload,
    origin: "hub-studio",
    event,
    action: normalizeString(payload.handoffAction) || normalizeString(payload.action, "handoff"),
    content_id: normalizeNullableString(payload.contentId),
    brand_id: normalizeNullableString(payload.brandId),
    brand_key: normalizeNullableString(payload.brandKey),
    target_channel: normalizeNullableString(payload.targetChannel) || channel,
    export_profile: normalizeNullableString(payload.exportProfile),
    title: normalizeNullableString(payload.title),
    scheduled_for: normalizeNullableString(payload.scheduledFor),
    note: normalizeNullableString(payload.note),
  };
}

function buildAssetMeta(payload, event) {
  const rawMeta = payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
    ? payload.meta
    : {};

  return {
    ...rawMeta,
    origin: "hub-studio",
    event,
    content_id: normalizeNullableString(payload.contentId),
    brand_id: normalizeNullableString(payload.brandId),
    brand_key: normalizeNullableString(payload.brandKey),
    export_profile: normalizeNullableString(payload.exportProfile),
    title: normalizeNullableString(payload.title),
    channel: normalizeNullableString(payload.channel),
  };
}

function normalizeArray(value, fallback = []) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : fallback;
}

function resolveBrandTone(slug, kind, meta) {
  if (typeof meta?.tone === "string" && meta.tone.trim()) return meta.tone.trim();
  if (CANONICAL_BRAND_TONES[slug]) return CANONICAL_BRAND_TONES[slug];
  // kind(도메인)로 semantic 톤을 배정하던 분기 제거 — 전부 중립(§5.2 카테고리 동결).
  return "neutral";
}

function resolveBrandGlyph(slug, meta) {
  if (typeof meta?.glyph === "string" && meta.glyph.trim()) return meta.glyph.trim();
  if (CANONICAL_BRAND_GLYPHS[slug]) return CANONICAL_BRAND_GLYPHS[slug];
  return "•";
}

function resolveBrandOrder(slug, meta, index) {
  const parsed = Number.parseInt(String(meta?.order ?? ""), 10);
  if (Number.isFinite(parsed)) return parsed;
  return CANONICAL_BRAND_ORDER[slug] ?? 1000 + index;
}

export function mapBrands(rows) {
  return rows.map((row, index) => {
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
    const slug = normalizeString(row.slug, row.id);
    const kind = normalizeString(row.kind, "brand");

    return {
      id: row.id,
      key: slug,
      name: normalizeString(row.name, slug),
      kind,
      glyph: resolveBrandGlyph(slug, meta),
      tone: resolveBrandTone(slug, kind, meta),
      colorHex: row.color_hex || "#5274a8",
      description: row.description || "",
      // meta.org_scope가 비면 정본 테이블 폴백 — PMS(operating-ledger)와 같은 판정이어야
      // 브랜드 탭 스코프 필터와 PMS 그룹이 어긋나지 않는다 (2609 감사 #12).
      orgScope: normalizeString(meta.org_scope, canonicalOrgScopeForKey(slug)),
      philosophy: normalizeString(meta.philosophy),
      direction: normalizeString(meta.direction),
      cadence: normalizeString(meta.cadence),
      voice: normalizeString(meta.voice),
      audience: normalizeString(meta.audience),
      promise: normalizeString(meta.promise),
      offer: normalizeString(meta.offer),
      currentFocus: normalizeString(meta.current_focus),
      operatingState: normalizeString(meta.operating_state),
      isFocused: meta.is_focused === true,
      identityConfirmedAt: normalizeNullableString(meta.identity_confirmed_at),
      voiceExamples: normalizeString(meta.voice_examples),
      keywords: normalizeArray(meta.keywords),
      channels: normalizeArray(meta.channels),
      rules: normalizeArray(meta.content_rules),
      forbidden: normalizeArray(meta.forbidden_terms),
      sourceLinks: normalizeArray(meta.source_links),
      // 주당 발행 목표는 운영자가 명시적으로 넣기 전까지 없다 — 브랜드 탭이
      // cadence에서 *권장값*을 유도하되 확정처럼 보이지 않게 표시한다
      // (2026-08-29 브랜드 탭 설계 §7.1).
      weeklyGoal: Number.isFinite(Number(meta.weekly_goal)) && Number(meta.weekly_goal) > 0
        ? Number(meta.weekly_goal)
        : null,
      sortOrder: resolveBrandOrder(slug, meta, index),
    };
  }).sort((a, b) => (
    a.sortOrder - b.sortOrder ||
    a.name.localeCompare(b.name, "ko")
  )).map(({ sortOrder, ...brand }) => brand);
}

// 서버(UTC) 실행 — 운영자 시간대 고정 없이는 배포 환경에서 라벨이 -9시간 밀린다.
const TIME_ZONE = "Asia/Seoul";

function formatShortDate(value) {
  if (!value) return "미정";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";

  const datePart = new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    month: "numeric",
    day: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
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

function mapItems(rows, variants, brandById) {
  // First variant per content item, matching the previous `.find()` semantics —
  // but built once instead of re-scanning the variants array 1-3× per item.
  const firstVariantByContentId = new Map();
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  for (const variant of variants) {
    if (!firstVariantByContentId.has(variant.content_id)) {
      firstVariantByContentId.set(variant.content_id, variant);
    }
  }

  return rows.map((row) => {
    const status = ITEM_STATUSES.includes(row.status) ? row.status : "draft";
    const whenSource = row.scheduled_at || row.published_at || row.updated_at || row.created_at;
    const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : {};
    const primary = variantById.get(meta.primary_variant_id);
    const variant = primary?.content_id === row.id ? primary : firstVariantByContentId.get(row.id) || null;
    const brand = row.brand_id ? brandById.get(row.brand_id) : null;

    return {
      id: row.id,
      variantId: variant?.id || null,
      primaryVariantId: variant?.id || null,
      title: titleFromItem(row),
      summary: row.summary || row.source_idea || "",
      sourceIdea: row.source_idea ?? "",
      brief: meta.brief && typeof meta.brief === "object" && !Array.isArray(meta.brief) ? meta.brief : {},
      blocker: typeof meta.blocker === "string" ? meta.blocker : "",
      sourceRefs: Array.isArray(meta.source_refs) ? meta.source_refs : [],
      sourceUrl: row.meta?.source_url || null,
      sourceNoteId: row.meta?.source_note_id || null,
      orgScope: row.meta?.org_scope || brand?.orgScope || null,
      slug: row.slug || null,
      status,
      statusLabel: ITEM_STATUS_LABEL[status] || "Draft",
      kind: (variant?.variant_type && VARIANT_KIND_LABEL[variant.variant_type]) || "Blog",
      channel: variantChannel(variant),
      when: formatShortDate(whenSource),
      author: row.owner_id ? "Me" : "Team",
      nextAction: row.next_action || "",
      scheduledAt: row.scheduled_at || null,
      publishedAt: row.published_at || null,
      visibility: row.visibility || "private",
      brandId: row.brand_id || null,
      brandKey: brand?.key || null,
      brandName: brand?.name || "No brand",
      brandTone: brand?.tone || "neutral",
      brandGlyph: brand?.glyph || "•",
      rankScore: Number.isFinite(row.rank_score) ? Number(row.rank_score) : 0,
      cadenceWeek: row.cadence_week || null,
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
      channel: variantChannel(row),
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
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload
      : {};
    const event = normalizeString(payload.event, status === "published" ? "manual_exported" : "handoff_requested");

    return {
      id: row.id,
      variantId: row.variant_id,
      contentId: variant?.contentId || null,
      channel: row.channel || variant?.channel || "Web",
      status,
      event,
      provenance: normalizeNullableString(payload.provenance),
      action: normalizeString(payload.action),
      title: normalizeString(payload.title, variant?.title || ""),
      brandId: normalizeNullableString(payload.brand_id),
      brandKey: normalizeNullableString(payload.brand_key),
      targetChannel: normalizeNullableString(payload.target_channel) || row.channel || variant?.channel || "Web",
      exportProfile: normalizeNullableString(payload.export_profile),
      provider: row.provider || null,
      targetUrl: row.target_url || null,
      externalId: row.external_id || null,
      attemptCount: Number.isFinite(row.attempt_count) ? row.attempt_count : 1,
      publishedAt: row.published_at || null,
      when: formatShortDate(row.published_at || row.created_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  });
}

function mapAssets(rows, variantById) {
  return rows.map((row) => {
    const variant = row.variant_id ? variantById.get(row.variant_id) : null;
    const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? row.meta
      : {};
    const storagePath = row.storage_path || "";
    const fallbackFileName = storagePath.split("/").filter(Boolean).pop() || storagePath || "asset";

    return {
      id: row.id,
      variantId: row.variant_id,
      contentId: variant?.contentId || null,
      type: normalizeAssetType(row.asset_type),
      storagePath,
      fileName: row.file_name || fallbackFileName,
      mimeType: row.mime_type || null,
      sizeBytes: Number.isFinite(row.size_bytes) ? row.size_bytes : null,
      checksum: row.checksum || null,
      event: normalizeString(meta.event),
      provider: normalizeString(meta.provider),
      exportProfile: normalizeString(meta.export_profile),
      targetUrl: normalizeNullableString(meta.target_url),
      when: formatShortDate(row.updated_at || row.created_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  });
}

function mapCampaigns(rows, brandById) {
  return rows.map((row) => {
    const status = CAMPAIGN_STATUSES.includes(row.status) ? row.status : "draft";
    const brand = row.brand_id ? brandById.get(row.brand_id) : null;
    const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : {};
    const channels = normalizeArray(row.channels).length
      ? normalizeArray(row.channels)
      : normalizeArray(meta.channels, row.channel ? [row.channel] : []);
    const progress = Number.isFinite(row.progress) ? row.progress : meta.progress;
    const current = Number.isFinite(row.goal_current) ? row.goal_current : meta.current;

    return {
      id: row.id,
      name: row.name || "제목 없음",
      status: CAMPAIGN_STATUS_LABEL[status] || "Draft",
      statusKey: status,
      channels,
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0,
      end: row.ends_label || row.end_date || "미정",
      goal: row.goal_label || meta.goal || "",
      current: Number.isFinite(current) ? current : 0,
      goalTarget: Number.isFinite(row.goal_target) ? row.goal_target : null,
      brandId: row.brand_id || null,
      brandKey: brand?.key || null,
      brandName: brand?.name || null,
      businessTruth: normalizeCampaignBusinessTruth(meta),
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  });
}

function buildPipeline(items) {
  const stages = [
    { key: "idea",      label: "Inbox" },
    { key: "draft",     label: "Drafting" },
    { key: "review",    label: "Ready" },
    { key: "scheduled", label: "Handed off" },
    { key: "published", label: "Watch" },
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
    statusKey: item.status,
    status: item.statusLabel,
    when: item.when,
    author: item.author,
    orgScope: item.orgScope,
    brandId: item.brandId,
    brandKey: item.brandKey,
    brandName: item.brandName,
    brandTone: item.brandTone,
    brandGlyph: item.brandGlyph,
    rank: item.status === "idea" ? effectiveIdeaRank(item) : null,
  }));
}

const ISO_DAY_MS = 86400000;

// ISO-8601 week string, e.g. "2026-W25". Buckets publishing cadence by week.
function isoWeek(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * ISO_DAY_MS));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Fallback idea-queue ranker (Sales OS v1.1). Uses the stored rank_score when an
// explicit ranker has set it; otherwise scores on repo-internal signals so the
// queue is useful from day one (ClassIn sales brand first, more-developed ideas
// higher). See docs/sales-os-direction.md §5 — refined with real engagement data.
function effectiveIdeaRank(item) {
  if (Number.isFinite(item.rankScore) && item.rankScore > 0) return item.rankScore;
  let score = 50;
  if (item.brandKey === "classmoon") score += 30; // ClassIn sales brand priority
  if (item.summary && item.summary.length > 24) score += 12; // developed angle
  if (item.nextAction) score += 6;
  return score;
}

function buildIdeaQueue(items, limit = 12) {
  return items
    .filter((item) => item.status === "idea")
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      kind: item.kind,
      channel: item.channel,
      brandKey: item.brandKey,
      brandName: item.brandName,
      brandTone: item.brandTone,
      brandGlyph: item.brandGlyph,
      rank: effectiveIdeaRank(item),
      ranked: Number.isFinite(item.rankScore) && item.rankScore > 0,
      when: item.when,
    }))
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title, "ko"))
    .slice(0, limit);
}

const CADENCE_WEEKS = 4;

// Publishing cadence (Sales OS v1.1): published items per ISO week vs a weekly
// goal, so the operator sees "n/goal, behind/ahead". Counts come from
// published_at (cadence_week backfills it when set explicitly).
function buildCadence(items, goal = 5) {
  const now = new Date();
  const currentWeek = isoWeek(now);
  const weekOf = (item) => item.cadenceWeek || (item.publishedAt ? isoWeek(item.publishedAt) : null);

  const counts = new Map();
  items
    .filter((item) => item.status === "published")
    .forEach((item) => {
      const week = weekOf(item);
      if (week) counts.set(week, (counts.get(week) || 0) + 1);
    });

  const recentWeeks = [];
  for (let i = CADENCE_WEEKS - 1; i >= 0; i -= 1) {
    const week = isoWeek(new Date(now.getTime() - i * 7 * ISO_DAY_MS));
    recentWeeks.push({ week, count: counts.get(week) || 0, current: week === currentWeek });
  }

  const thisWeek = counts.get(currentWeek) || 0;
  return {
    week: currentWeek,
    goal,
    published: thisWeek,
    remaining: Math.max(0, goal - thisWeek),
    behind: thisWeek < goal,
    queueDepth: items.filter((item) => item.status === "idea").length,
    recentWeeks,
  };
}

export function buildContentDraftRecords(payload = {}) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
  const timestamp = new Date().toISOString();
  const contentId = normalizeString(payload.contentId) || randomUUID();
  const variantId = normalizeString(payload.variantId) || randomUUID();
  const variantType = normalizeVariantType(payload.variantType);
  const title = normalizeString(payload.title, "Untitled content draft");
  const summary = normalizeNullableString(payload.summary);
  const sourceIdea = typeof payload.sourceIdea === "string" && payload.sourceIdea.trim() ? payload.sourceIdea : title;
  const visibility = normalizeVisibility(payload.visibility);

  const itemRecord = {
    id: contentId,
    workspace_id: workspaceId || null,
    brand_id: normalizeNullableString(payload.brandId),
    title,
    source_idea: sourceIdea,
    idea_source: normalizeString(payload.ideaSource, "studio"),
    source_type: normalizeString(payload.sourceType, "idea"),
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
    ...(variantType === "threads_post" ? { channel: "threads" } : {}),
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
    ...(payload.sourceIdea !== undefined ? { source_idea: normalizeBody(payload.sourceIdea) } : {}),
    ...(payload.brandId !== undefined ? { brand_id: normalizeNullableString(payload.brandId) } : {}),
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
    ...(variantType === "threads_post" ? { channel: "threads" } : {}),
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

export function buildContentIdeaRecords(payload = {}) {
  const body = normalizeBody(payload.body);
  const sourceUrl = normalizeNullableString(payload.sourceUrl);
  if (!body.trim() && !sourceUrl) throw new TypeError("소재 본문이나 참고 링크를 입력해 주세요.");
  if (sourceUrl && !isPublicHttpUrl(sourceUrl)) throw new TypeError("참고 링크는 http 또는 https URL이어야 합니다.");
  if (!["personal", "company"].includes(payload.orgScope)) throw new TypeError("소재의 개인/회사 범위를 선택해 주세요.");
  return buildContentDraftRecords({
    ...payload,
    title: normalizeString(payload.title) || (body.trim() || sourceUrl).split(/\r?\n/)[0].slice(0, 100),
    sourceIdea: body.trim() ? body : sourceUrl,
    body: body.trim() ? body : sourceUrl,
    sourceUrl,
    status: "idea",
    variantStatus: "draft",
    variantType: "threads_post",
    ideaSource: payload.sourceNoteId ? "quick-memo" : "content-inbox",
    visibility: "private",
  });
}

function isPublicHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function buildContentPublicationRecord(payload = {}) {
  if (!isPublicHttpUrl(payload.targetUrl)) throw new TypeError("발행한 게시물의 http 또는 https URL을 입력해 주세요.");
  const publishedAt = new Date(payload.publishedAt);
  if (!payload.publishedAt || Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() > Date.now() + 60000) {
    throw new TypeError("유효한 과거 발행 일시를 입력해 주세요.");
  }
  const handoff = buildContentHandoffRecord({
    ...payload, event: "operator_published", status: "published", provider: "manual",
    publishedAt: publishedAt.toISOString(),
    payload: { provenance: "operator_confirmed", external_verified: false },
  });
  return { ...handoff, action: "record_publication" };
}

export function buildContentHandoffRecord(payload = {}) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
  const timestamp = new Date().toISOString();
  const contentId = normalizeString(payload.contentId);
  const variantId = normalizeString(payload.variantId);
  const event = normalizeString(
    payload.event,
    payload.action === "export" ? "manual_exported" : "handoff_requested",
  ).toLowerCase();
  const status = normalizeLogStatus(
    payload.status,
    event === "manual_exported" || payload.action === "export" ? "published" : "queued",
  );
  const channel = normalizeString(
    payload.channel || payload.targetChannel,
    VARIANT_CHANNEL_LABEL[normalizeVariantType(payload.variantType)] || "Web",
  );

  const logRecord = {
    id: normalizeString(payload.logId) || randomUUID(),
    workspace_id: workspaceId || null,
    variant_id: variantId,
    channel,
    status,
    provider: normalizeNullableString(payload.provider) || (status === "published" ? "manual" : "n8n"),
    target_url: normalizeNullableString(payload.targetUrl),
    external_id: normalizeNullableString(payload.externalId),
    attempt_count: 1,
    payload: buildLogPayload(payload, event, channel),
    published_at: status === "published" ? (normalizeNullableString(payload.publishedAt) || timestamp) : normalizeNullableString(payload.publishedAt),
    created_at: timestamp,
    updated_at: timestamp,
  };

  return {
    workspaceId,
    contentId,
    variantId,
    logId: logRecord.id,
    event,
    status,
    logRecord,
  };
}

export function buildContentAssetRecord(payload = {}) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
  const timestamp = new Date().toISOString();
  const contentId = normalizeString(payload.contentId);
  const variantId = normalizeString(payload.variantId);
  const event = normalizeString(payload.event, "manual_exported").toLowerCase();
  const assetType = normalizeAssetType(payload.assetType, payload.action === "export" ? "source" : "html");
  const extension = assetType === "html" ? "html" : assetType === "zip" ? "zip" : "json";
  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  const storagePath = normalizeString(payload.storagePath) || `hub://content/${variantId}/${safeTimestamp}.${extension}`;

  const assetRecord = {
    id: normalizeString(payload.assetId) || randomUUID(),
    workspace_id: workspaceId || null,
    variant_id: variantId,
    asset_type: assetType,
    storage_path: storagePath,
    file_name: normalizeNullableString(payload.fileName) || storagePath.split("/").filter(Boolean).pop() || `content-asset.${extension}`,
    mime_type: normalizeNullableString(payload.mimeType) || (assetType === "html" ? "text/html" : "application/json"),
    size_bytes: Number.isFinite(payload.sizeBytes) ? payload.sizeBytes : null,
    checksum: normalizeNullableString(payload.checksum),
    meta: buildAssetMeta(payload, event),
    created_at: timestamp,
    updated_at: timestamp,
  };

  return {
    workspaceId,
    contentId,
    variantId,
    assetId: assetRecord.id,
    event,
    assetRecord,
  };
}

export function buildCampaignRecord(payload = {}) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
  const timestamp = new Date().toISOString();
  const campaignId = normalizeString(payload.campaignId) || randomUUID();

  const record = {
    id: campaignId,
    workspace_id: workspaceId || null,
    brand_id: normalizeNullableString(payload.brandId),
    name: normalizeString(payload.name, "새 캠페인"),
    status: normalizeCampaignStatus(payload.status),
    channels: normalizeArray(payload.channels, ["Email"]),
    progress: Number.isFinite(payload.progress) ? payload.progress : 0,
    ends_label: normalizeNullableString(payload.endsLabel),
    goal_label: normalizeNullableString(payload.goalLabel),
    goal_current: Number.isFinite(payload.goalCurrent) ? payload.goalCurrent : 0,
    goal_target: Number.isFinite(payload.goalTarget) ? payload.goalTarget : null,
    meta: { origin: "hub-campaigns" },
    created_at: timestamp,
    updated_at: timestamp,
  };

  return { workspaceId, campaignId, record };
}

export async function getContentLedger() {
  const workspaceId = resolveDefaultWorkspaceId();
  const supabaseConfig = resolveSupabaseConfig();

  if (!workspaceId || !supabaseConfig) {
    return {
      source: "preview",
      configured: false,
      workspaceId: workspaceId || null,
      brands: [],
      items: [],
      variants: [],
      assets: [],
      publishLogs: [],
      campaigns: [],
      queue: [],
      pipeline: buildPipeline([]),
      attention: [],
      summary: buildSummary([], []),
      ideaQueue: [],
      cadence: buildCadence([]),
    };
  }

  const [itemRows, variantRows, logRows, assetRows, brandRows, campaignRows] = await Promise.all([
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
    fetchSupabaseRows("content_assets", {
      limit: 100,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("brands", {
      // operating-ledger(80)와 정합 — PMS가 아는 브랜드가 여기 목록 밖이면
      // /dashboard/brands?b= 딥링크가 selectBrand null로 미끄러진다 (2609 병합 리뷰 #7).
      limit: 80,
      order: "name.asc",
      filters: withWorkspaceFilter([
        ["status", "eq.active"],
      ]),
    }),
    fetchSupabaseRows("campaigns", {
      limit: 40,
      order: "updated_at.desc",
      filters: withWorkspaceFilter(),
    }),
  ]);

  if (!itemRows || !variantRows || !logRows) {
    // 코어 read 실패 = error — preview로 라벨하면 큐/파이프라인이 "0건이 사실"처럼 렌더된다.
    return {
      source: "error",
      error: "content-ledger-core-read-failed",
      failedSources: [
        ["items", itemRows],
        ["variants", variantRows],
        ["publish_logs", logRows],
      ].filter(([, rows]) => !Array.isArray(rows)).map(([key]) => key),
      retryable: true,
      configured: true,
      workspaceId,
      brands: [],
      items: [],
      variants: [],
      assets: [],
      publishLogs: [],
      campaigns: [],
      queue: [],
      pipeline: buildPipeline([]),
      attention: [],
      summary: buildSummary([], []),
      ideaQueue: [],
      cadence: buildCadence([]),
    };
  }

  const brands = Array.isArray(brandRows) ? mapBrands(brandRows) : [];
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const variants = mapVariants(variantRows);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const items = mapItems(itemRows, variantRows, brandById);
  const publishLogs = mapPublishLogs(logRows, variantById);
  const assets = Array.isArray(assetRows) ? mapAssets(assetRows, variantById) : [];
  const campaigns = Array.isArray(campaignRows) ? mapCampaigns(campaignRows, brandById) : [];
  // 옵션 소스(brands/assets/campaigns) 실패는 live 배지 아래 무언 강등이 아니라 partial로 명명.
  const optionalFailedSources = [
    ["brands", brandRows],
    ["assets", assetRows],
    ["campaigns", campaignRows],
  ].filter(([, rows]) => !Array.isArray(rows)).map(([key]) => key);

  return {
    source: "supabase",
    partial: optionalFailedSources.length > 0,
    failedSources: optionalFailedSources,
    configured: true,
    workspaceId,
    brands,
    items,
    variants,
    assets,
    publishLogs,
    campaigns,
    queue: buildQueue(items),
    pipeline: buildPipeline(items),
    attention: buildAttention(items, publishLogs),
    summary: buildSummary(items, publishLogs),
    ideaQueue: buildIdeaQueue(items),
    cadence: buildCadence(items),
  };
}
