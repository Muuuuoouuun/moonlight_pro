function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tagValue(tags, prefix) {
  const hit = tags.find((tag) => String(tag).startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : "";
}

const TAG_LABELS = {
  "subject:math": "수학",
  "subject:english": "영어",
  "subject:korean": "국어",
  "subject:science": "과학",
  "subject:coding": "코딩",
  "subject:essay": "논술",
  "subject:performing-arts": "공연예술",
  "subject:engineering": "공학",
  "subject:ict": "ICT",
  "activity:meeting": "미팅",
  "activity:call": "콜",
  "activity:info-session": "설명회",
  "activity:calendar": "캘린더",
  "activity:info-session-public": "공개 설명회",
  "program:exam-prep": "시험 대비",
  "program:audition": "오디션",
  "program:musical": "뮤지컬",
  "program:industry-partnership": "산학협력",
  "program:professional-degree": "전문학위",
  "channel:youtube": "YouTube",
  "channel:naver-blog": "네이버 블로그",
  "channel:official-site": "공식 사이트",
  "channel:instagram": "Instagram",
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function labelsFor(tags, prefix) {
  return unique(tags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => TAG_LABELS[tag] || tag.slice(prefix.length)));
}

export function buildLeadTagSummary(rawTags = []) {
  const tags = Array.isArray(rawTags) ? rawTags.map(String) : [];
  const directActivityTags = tags.filter((tag) => (
    tag.startsWith("activity:") &&
    tag !== "activity:calendar" &&
    !tag.endsWith("-public")
  ));

  return {
    subjects: labelsFor(tags, "subject:"),
    regions: labelsFor(tags, "region:"),
    directActivities: unique(directActivityTags.map((tag) => TAG_LABELS[tag] || tag.slice("activity:".length))),
    activitySources: tags.includes("activity:calendar") ? [TAG_LABELS["activity:calendar"]] : [],
    publicSignals: tags.includes("activity:info-session-public")
      ? [TAG_LABELS["activity:info-session-public"]]
      : [],
    programs: labelsFor(tags, "program:"),
    channels: labelsFor(tags, "channel:"),
  };
}

export function resolveLeadEnrichmentView(row = {}) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const enrichment = meta.enrichment && typeof meta.enrichment === "object" ? meta.enrichment : {};
  const tags = Array.isArray(enrichment.tags) ? enrichment.tags.map(String) : [];
  const ownedByJunhyuk = meta.owner_scope === "junhyuk" || tags.includes("owner:junhyuk");
  const isExternalCrmLead = String(row.source || "").toLowerCase() === "eeocrm";
  const ownedByOperator = ownedByJunhyuk || (!isExternalCrmLead && Boolean(row.owner_id));

  return {
    score: finiteNumber(row.score),
    valueAmount: finiteNumber(meta.value),
    owner: ownedByOperator ? "Me" : "Unassigned",
    priorityLane: enrichment.pipeline?.lane || null,
    nextAction: row.next_action || "",
    enrichmentTags: tags,
    region: meta.region || tagValue(tags, "region:"),
    engagementState: enrichment.evidenceState?.engagement || "unknown",
    publicEvidenceCount: Array.isArray(enrichment.evidence?.public)
      ? enrichment.evidence.public.length
      : 0,
    activityEvidence: enrichment.evidence?.activity || null,
  };
}
