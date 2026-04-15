import { normalizeAiTarget } from "@/lib/ai-console";
import { emailSegments as fallbackEmailSegments, emailTemplates as fallbackEmailTemplates } from "@/lib/dashboard-data";
import { getContentBrandLabel } from "@/lib/dashboard-contexts";

const CAMPAIGN_STATUSES = new Set(["draft", "active", "paused", "completed"]);
const CAMPAIGN_RUN_STATUSES = new Set(["queued", "running", "success", "failure"]);

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function formatShortDate(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function resolveCampaignAudience(campaign) {
  const haystack = [
    campaign?.channel,
    campaign?.handoff,
    campaign?.goal,
    campaign?.nextAction,
  ]
    .map((item) => normalizeString(item).toLowerCase())
    .join(" ");

  if (haystack.includes("newsletter") || haystack.includes("brief")) {
    return "Newsletter list";
  }

  if (haystack.includes("client") || haystack.includes("publish")) {
    return "Client account";
  }

  if (haystack.includes("referral") || haystack.includes("intro")) {
    return "Hand-picked prospect";
  }

  if (haystack.includes("email") || haystack.includes("follow-up") || haystack.includes("lead")) {
    return "Inbound lead";
  }

  return campaign?.status === "draft" ? "Inbound lead" : "Client account";
}

function resolveTemplateForAudience(templates, audience) {
  return (
    templates.find((item) => item.audience === audience) ??
    templates.find((item) => item.status === "ready") ??
    templates[0] ??
    null
  );
}

function resolveSegmentForAudience(segments, audience) {
  return (
    segments.find((item) => item.audience === audience) ??
    segments.find((item) => item.id === "all") ??
    segments[0] ??
    null
  );
}

function buildCampaignEmailBody(campaign, audience) {
  const brandLabel = campaign.brand ? getContentBrandLabel(campaign.brand) : "Com_Moon";
  const greeting =
    audience === "Client account"
      ? "{{lead_name}}님, 안녕하세요."
      : audience === "Newsletter list"
        ? "{{lead_name}}님, 안녕하세요."
        : "{{lead_name}}님, 안녕하세요.";

  const contextLine =
    audience === "Client account"
      ? `${brandLabel} 캠페인 handoff 공유드립니다.`
      : audience === "Newsletter list"
        ? `${brandLabel} 운영 시그널을 이번 브리프 흐름에 맞춰 정리했습니다.`
        : `${brandLabel} 캠페인에 맞춘 follow-up 초안을 먼저 공유드립니다.`;

  return [
    greeting,
    "",
    contextLine,
    "",
    `- Goal: ${campaign.goal}`,
    `- Next: ${campaign.nextAction}`,
    `- Flow: ${campaign.handoff}`,
    "",
    "[ {{cta_label}} ]",
    "",
    "— {{signature}}",
    "",
  ].join("\n");
}

export function normalizeCampaignStatus(value, fallback = "draft") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return CAMPAIGN_STATUSES.has(normalized) ? normalized : fallback;
}

export function normalizeCampaignRunStatus(value, fallback = "queued") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return CAMPAIGN_RUN_STATUSES.has(normalized) ? normalized : fallback;
}

export function getCampaignStatusTone(status) {
  const normalized = normalizeCampaignStatus(status);

  if (normalized === "active") return "green";
  if (normalized === "completed") return "blue";
  if (normalized === "paused") return "warning";
  return "muted";
}

export function getCampaignRunTone(status) {
  const normalized = normalizeCampaignRunStatus(status);

  if (normalized === "success") return "green";
  if (normalized === "running") return "blue";
  if (normalized === "failure") return "danger";
  return "warning";
}

export function getCampaignWindowLabel(startDate, endDate) {
  const startLabel = formatShortDate(startDate);
  const endLabel = formatShortDate(endDate);

  if (startLabel && endLabel) {
    return `${startLabel} -> ${endLabel}`;
  }

  if (startLabel) {
    return `${startLabel} 시작`;
  }

  if (endLabel) {
    return `${endLabel} 종료 목표`;
  }

  return "Window not set";
}

export function buildCampaignEmailHandoff(
  campaign,
  { templates = fallbackEmailTemplates, segments = fallbackEmailSegments } = {},
) {
  const audience = resolveCampaignAudience(campaign);
  const template = resolveTemplateForAudience(templates, audience);
  const segment = resolveSegmentForAudience(segments, audience);
  const brandLabel = campaign?.brand ? getContentBrandLabel(campaign.brand) : "Com_Moon";

  return {
    audience,
    segmentId: segment?.id || "all",
    segmentLabel: segment?.label || "전체 리드",
    templateId: template?.id || "",
    templateName: template?.name || "Manual follow-up",
    channelId: template?.channel || "resend",
    subject:
      normalizeString(template?.subject).replaceAll("{{brand}}", brandLabel) ||
      `${brandLabel} 캠페인 follow-up`,
    recipientName:
      audience === "Client account"
        ? `${brandLabel} 담당자`
        : audience === "Newsletter list"
          ? "구독자"
          : `${brandLabel} warm lead`,
    body: buildCampaignEmailBody(campaign, audience),
  };
}

export function buildCampaignOrderDraft(campaign) {
  const haystack = [
    campaign?.channel,
    campaign?.handoff,
    campaign?.goal,
    campaign?.nextAction,
  ]
    .map((item) => normalizeString(item).toLowerCase())
    .join(" ");

  let target = "both";

  if (campaign?.status === "draft") {
    target = "claude";
  } else if (haystack.includes("landing") || haystack.includes("dev")) {
    target = "codex";
  } else if (haystack.includes("email") && !haystack.includes("publish")) {
    target = "claude";
  }

  return {
    title: `${campaign.title} handoff`,
    target: normalizeAiTarget(target),
    priority: campaign?.status === "active" ? "P1" : "P2",
    lane: "Content",
    due:
      campaign?.status === "active"
        ? "오늘 17:00"
        : campaign?.status === "paused"
          ? "이번 주"
          : "오늘 오후",
    note: [
      `${campaign.brand ? getContentBrandLabel(campaign.brand) : "Shared"} campaign brief`,
      `Goal: ${campaign.goal}`,
      `Next: ${campaign.nextAction}`,
      `Handoff: ${campaign.handoff}`,
    ].join("\n"),
  };
}

export function buildCampaignPreview(source, { id } = {}) {
  const title = normalizeString(source?.name || source?.title, "새 캠페인");
  const brand = normalizeString(source?.brand_key || source?.brand);
  const status = normalizeCampaignStatus(source?.status);
  const goal = normalizeString(
    source?.goal,
    "Campaign brief is ready for alignment.",
  );
  const nextAction = normalizeString(
    source?.next_action || source?.nextAction,
    "Lock the next content move and the follow-up lane together.",
  );
  const handoff = normalizeString(
    source?.handoff,
    "Content -> Publish -> Follow-up",
  );
  const startDate = normalizeString(source?.start_date || source?.startDate);
  const endDate = normalizeString(source?.end_date || source?.endDate);

  const preview = {
    id: normalizeString(id || source?.id, `preview-campaign-${Date.now()}`),
    title,
    brand,
    brandLabel: brand ? getContentBrandLabel(brand) : "Shared lane",
    channel: normalizeString(source?.channel, "Content"),
    status,
    statusTone: getCampaignStatusTone(status),
    goal,
    nextAction,
    handoff,
    startDate,
    endDate,
    window: getCampaignWindowLabel(startDate, endDate),
    runStatus: normalizeString(source?.runStatus || source?.run_status),
    runSummary: normalizeString(source?.runSummary || source?.run_summary),
    contentCount: Number(source?.contentCount || 0),
    variantCount: Number(source?.variantCount || 0),
    publishCount: Number(source?.publishCount || 0),
    relatedContent: Array.isArray(source?.relatedContent) ? source.relatedContent : [],
    relatedOutputs: Array.isArray(source?.relatedOutputs) ? source.relatedOutputs : [],
  };

  return {
    ...preview,
    emailHandoff: buildCampaignEmailHandoff(preview),
    aiOrderDraft: buildCampaignOrderDraft(preview),
  };
}
