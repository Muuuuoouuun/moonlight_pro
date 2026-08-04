const DAY_MS = 24 * 60 * 60 * 1000;

function asCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableFingerprint(value) {
  const input = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function daysSince(value, now) {
  if (!value) return null;
  const at = new Date(value).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(at) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.floor((current - at) / DAY_MS));
}

export function normalizeEntityName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function inferLeadTags({ companyName, publicEvidence = [] } = {}) {
  const name = String(companyName ?? "").normalize("NFKC");
  const lower = name.toLowerCase();
  const tags = [];

  if (/대학교|대학/.test(name)) tags.push("org:university");
  else if (/학원|아카데미|어학원|prep|수학|국어|영어|영수/.test(lower)) tags.push("org:academy");
  else if (/studysync|스터디싱크/.test(lower)) tags.push("org:education-business");

  if (/수학|영수/.test(name)) tags.push("subject:math");
  if (/영어|영수/.test(name) || (/어학원/.test(name) && !/국어학원/.test(name))) {
    tags.push("subject:english");
  }
  if (/국어|논술/.test(name)) tags.push("subject:korean");
  if (/연기/.test(name)) tags.push("subject:performing-arts");

  if (/평촌/.test(name)) tags.push("region:경기-안양");
  if (/물금/.test(name)) tags.push("region:경남-양산");

  for (const evidence of publicEvidence) {
    if (evidence?.confidence !== "high") continue;
    for (const tag of evidence.tags || []) tags.push(String(tag).trim());
  }

  return uniqueSorted(tags);
}

function resolvePipelineLane(status) {
  if (status === "won") return "customer_success";
  if (status === "lost") return "closed_lost";
  if (status === "qualified" || status === "nurturing") return "active_pipeline";
  return "new_pipeline";
}

function resolveNextAction({ status, commercialCount, calendarTotal, latestCalendarDays }) {
  if (status === "won") {
    if (calendarTotal > 0 && latestCalendarDays != null && latestCalendarDays <= 120) {
      return "최근 접점 후속 확인 → 활용 상태와 갱신·업셀 기회 정리";
    }
    if (commercialCount > 0) {
      return "구매·수금 이력 확인 → 활성 사용 상태와 갱신·업셀 기회 정리";
    }
    return "고객 활성 상태 확인 → 갱신·휴면 여부 정리";
  }

  if (calendarTotal > 0) {
    return "최근 접점 결과 정리 → 다음 미팅·제안 일정 확정";
  }
  return "공식 계정 확인 → 첫 접촉 목적과 채널 결정";
}

export function buildJunhyukLeadEnrichment({
  owner,
  lead,
  company,
  officialAccount,
  activity = null,
  publicEvidence = [],
  now = new Date().toISOString(),
} = {}) {
  if (!owner?.externalId || !officialAccount?.ownerId) {
    throw new Error("owner proof is required");
  }
  if (String(owner.externalId) !== String(officialAccount.ownerId)) {
    throw new Error("owner mismatch: official account is not assigned to Junhyuk");
  }
  if (officialAccount.matchType !== "exact_name") {
    throw new Error("only exact_name owner-account matches may be enriched automatically");
  }
  if (normalizeEntityName(company?.name) !== normalizeEntityName(officialAccount.name)) {
    throw new Error("company mismatch: Moonlight and official account names differ");
  }

  const opportunities = asCount(activity?.opportunities);
  const collections = asCount(activity?.collections);
  const salesPerformance = asCount(activity?.salesPerformance);
  const contacts = asCount(activity?.contacts);
  const calendar = activity?.calendar || {};
  const calendarCounts = {
    meeting: asCount(calendar.meeting),
    call: asCount(calendar.call),
    infoSession: asCount(calendar.infoSession),
    other: asCount(calendar.other),
  };
  const calendarTotal = Object.values(calendarCounts).reduce((sum, count) => sum + count, 0);
  const commercialCount = opportunities + collections + salesPerformance;
  const latestCalendarDays = daysSince(calendar.latestAt, now);
  const highConfidencePublic = publicEvidence.filter((item) => item?.confidence === "high");

  const tags = inferLeadTags({ companyName: company?.name || lead?.name, publicEvidence });
  tags.push(`lifecycle:${lead?.status || "unknown"}`);
  tags.push("owner:junhyuk");
  tags.push("evidence:official-exact");
  if (calendarCounts.meeting) tags.push("activity:meeting");
  if (calendarCounts.call) tags.push("activity:call");
  if (calendarCounts.infoSession) tags.push("activity:info-session");
  if (calendarTotal) tags.push("activity:calendar");
  if (calendarTotal === 0) tags.push("engagement:unknown");
  if (highConfidencePublic.length) tags.push("evidence:public-high");
  if (commercialCount) tags.push("commercial:history-present");

  const components = {
    officialOwnership: 25,
    lifecycle: lead?.status === "won" ? 20 : lead?.status === "qualified" ? 15 : lead?.status === "nurturing" ? 10 : 5,
    commercial: commercialCount
      ? Math.min(25, opportunities * 6 + collections * 5 + salesPerformance * 3)
      : null,
    engagement: calendarTotal
      ? latestCalendarDays != null && latestCalendarDays <= 120
        ? 15
        : 8
      : null,
    contactCoverage: contacts > 0 || lead?.email || company?.phone ? 5 : null,
    publicEvidence: highConfidencePublic.length ? Math.min(10, highConfidencePublic.length * 5) : null,
  };
  const total = Math.min(
    100,
    Object.values(components).reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0),
  );
  const lane = resolvePipelineLane(lead?.status);
  const nextAction = resolveNextAction({
    status: lead?.status,
    commercialCount,
    calendarTotal,
    latestCalendarDays,
  });

  const enrichment = {
    version: "junhyuk-owner-v1",
    generatedAt: now,
    scope: {
      ownerExternalId: String(owner.externalId),
      ownerName: owner.name || "문준혁",
      eeoCode: owner.eeoCode || null,
    },
    officialAccount: {
      externalId: String(officialAccount.externalId),
      name: officialAccount.name,
      matchType: officialAccount.matchType,
    },
    pipeline: {
      officialStatus: lead?.status || null,
      lane,
      statusPreserved: true,
    },
    tags: uniqueSorted(tags),
    score: { total, components },
    evidenceState: {
      ownership: "confirmed",
      commercial: commercialCount ? "present" : "unknown",
      engagement: calendarTotal ? "present" : "unknown",
      public: highConfidencePublic.length ? "present" : "unknown",
    },
    evidence: {
      activity: activity
        ? {
            opportunities,
            collections,
            salesPerformance,
            contacts,
            calendar: { ...calendarCounts, latestAt: calendar.latestAt || null },
          }
        : null,
      public: publicEvidence.map((item) => ({
        url: item.url || null,
        confidence: item.confidence || "unknown",
        tags: uniqueSorted(item.tags || []),
        facts: (item.facts || []).map((fact) => String(fact)),
      })),
    },
  };
  enrichment.evidenceFingerprint = stableFingerprint({
    scope: enrichment.scope,
    officialAccount: enrichment.officialAccount,
    pipeline: enrichment.pipeline,
    tags: enrichment.tags,
    score: enrichment.score,
    evidenceState: enrichment.evidenceState,
    evidence: enrichment.evidence,
  });

  return {
    score: total,
    nextAction,
    enrichment,
    patch: {
      score: total,
      next_action: nextAction,
      meta: {
        ...(lead?.meta || {}),
        owner_scope: "junhyuk",
        enrichment,
      },
    },
  };
}
