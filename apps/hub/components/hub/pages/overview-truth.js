const KPI_DEFINITIONS = [
  {
    key: "updatesThisWeek",
    label: "최근 7일 작업 업데이트",
    hint: "프로젝트 진행 기록",
    failureHint: "프로젝트 업데이트 읽기 실패",
    tone: "moon",
    nav: "dashboard/work/projects",
    sparkKey: "work",
  },
  {
    key: "decisionsThisWeek",
    label: "최근 7일 결정 기록",
    hint: "기획·판단 로그",
    failureHint: "결정 기록 읽기 실패",
    tone: "info",
    nav: "dashboard/work/decisions",
    sparkKey: "decisions",
  },
  {
    key: "publishedThisWeek",
    label: "최근 7일 발행",
    hint: "콘텐츠 발행 완료",
    failureHint: "발행 기록 읽기 실패",
    tone: "success",
    nav: "dashboard/content/queue",
    sparkKey: "content",
  },
];

function isAvailableValue(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function sparkValues(series, key) {
  const values = (Array.isArray(series) ? series : []).slice(-7).map((item) => item?.[key]);
  return values.every(isAvailableValue) ? values.map(Number) : [];
}

export function overviewSyncState(data) {
  if (["live", "partial", "preview", "error"].includes(data?.status)) return data.status;
  if (data?.source === "supabase") return "live";
  if (data?.source === "error") return "error";
  return "preview";
}

export function buildOverviewKpiCards({ kpis = {}, activitySeries = [] } = {}) {
  const cards = KPI_DEFINITIONS.map((definition) => {
    const available = isAvailableValue(kpis[definition.key]);
    return {
      label: definition.label,
      value: available ? kpis[definition.key] : "—",
      hint: available ? definition.hint : definition.failureHint,
      tone: definition.tone,
      nav: definition.nav,
      spark: sparkValues(activitySeries, definition.sparkKey),
    };
  });

  const activeAvailable = isAvailableValue(kpis.activeProjects);
  const blockedAvailable = isAvailableValue(kpis.blockedProjects);
  const blocked = blockedAvailable ? Number(kpis.blockedProjects) : null;
  cards.push({
    label: "진행 중 프로젝트",
    value: activeAvailable ? kpis.activeProjects : "—",
    hint: !activeAvailable
      ? "프로젝트 원장 읽기 실패"
      : !blockedAvailable
        ? "막힘 수 읽기 실패"
        : blocked > 0
          ? `${blocked}건 막힘`
          : "막힌 프로젝트 없음",
    tone: !activeAvailable || !blockedAvailable || blocked > 0 ? "warning" : "moon",
    nav: "dashboard/work/projects",
    spark: [],
  });

  return cards;
}

export function activitySeriesAvailability(series = []) {
  const segments = ["work", "decisions", "content"];
  const failedSegments = segments.filter((segment) =>
    series.some((item) => !isAvailableValue(item?.[segment])),
  );
  return { available: failedSegments.length === 0, failedSegments };
}

export function projectActivityAvailability(sources = []) {
  const projectSource = sources.find((source) => source?.key === "projects");
  const failed = new Set(Array.isArray(projectSource?.failedSources) ? projectSource.failedSources : []);
  const coreAvailable = projectSource?.state !== "error";
  const updates = coreAvailable && !failed.has("project_updates");
  const decisions = coreAvailable && !failed.has("decisions");
  return {
    updates,
    decisions,
    brandActivity: updates && decisions,
    recentProjectActivity: updates && decisions,
  };
}
