const KPI_DEFINITIONS = [
  {
    key: "updatesThisWeek",
    label: "최근 7일 작업 업데이트",
    hint: "프로젝트 진행 기록",
    failureHint: "프로젝트 업데이트 읽기 실패",
    disconnectedHint: "프로젝트 업데이트 원장 미연결",
    tone: "moon",
    nav: "dashboard/work/projects",
    sparkKey: "work",
    sourceKey: "projects",
    dependency: "project_updates",
  },
  {
    key: "decisionsThisWeek",
    label: "최근 7일 결정 기록",
    hint: "기획·판단 로그",
    failureHint: "결정 기록 읽기 실패",
    disconnectedHint: "결정 기록 원장 미연결",
    tone: "info",
    nav: "dashboard/work/decisions",
    sparkKey: "decisions",
    sourceKey: "projects",
    dependency: "decisions",
  },
  {
    key: "publishedThisWeek",
    label: "최근 7일 발행",
    hint: "콘텐츠 발행 완료",
    failureHint: "발행 기록 읽기 실패",
    disconnectedHint: "발행 기록 원장 미연결",
    tone: "success",
    nav: "dashboard/content/queue",
    sparkKey: "content",
    sourceKey: "content",
    dependency: "publish_logs",
  },
];

const KNOWN_STATES = new Set(["live", "partial", "preview", "error"]);

function isAvailableValue(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function sparkValues(series, key) {
  const values = (Array.isArray(series) ? series : []).slice(-7).map((item) => item?.[key]);
  return values.every(isAvailableValue) ? values.map(Number) : [];
}

function fallbackState(status) {
  if (status === "preview") return "preview";
  return "error";
}

function sourceContext(sources, key, status) {
  const source = Array.isArray(sources) ? sources.find((item) => item?.key === key) : null;
  const state = source && KNOWN_STATES.has(source.state)
    ? source.state
    : fallbackState(status);
  return {
    state,
    failed: new Set(Array.isArray(source?.failedSources) ? source.failedSources : []),
  };
}

function normalizePanelState(state) {
  if (state === "live-empty") return "live";
  return KNOWN_STATES.has(state) ? state : "error";
}

function metricContext({ sources, status, sourceKey, dependency }) {
  const context = sourceContext(sources, sourceKey, status);
  if (context.state === "preview") return { available: false, reason: "preview" };
  if (context.state === "error") return { available: false, reason: "error" };
  if (dependency && context.failed.has(dependency)) {
    return { available: false, reason: "error" };
  }
  return { available: true, reason: null };
}

function unavailableCard({ label, nav, reason, failureHint, disconnectedHint }) {
  return {
    label,
    value: "—",
    hint: reason === "preview" ? disconnectedHint : failureHint,
    tone: reason === "preview" ? "neutral" : "warning",
    nav,
    spark: [],
  };
}

export function overviewSyncState(data) {
  if (KNOWN_STATES.has(data?.status)) return data.status;
  if (data?.source === "supabase") return "live";
  if (data?.source === "partial") return "partial";
  if (data?.source === "preview") return "preview";
  if (data?.source === "error") return "error";
  return "error";
}

export function buildOverviewKpiCards({
  kpis = {},
  activitySeries = [],
  sources = [],
  status,
} = {}) {
  const cards = KPI_DEFINITIONS.map((definition) => {
    const context = metricContext({
      sources,
      status,
      sourceKey: definition.sourceKey,
      dependency: definition.dependency,
    });
    const available = context.available && isAvailableValue(kpis[definition.key]);
    if (!available) {
      return unavailableCard({
        ...definition,
        reason: context.reason || "error",
      });
    }
    return {
      label: definition.label,
      value: kpis[definition.key],
      hint: definition.hint,
      tone: definition.tone,
      nav: definition.nav,
      spark: sparkValues(activitySeries, definition.sparkKey),
    };
  });

  const projectContext = metricContext({ sources, status, sourceKey: "projects" });
  const activeAvailable = projectContext.available && isAvailableValue(kpis.activeProjects);
  if (!activeAvailable) {
    cards.push(unavailableCard({
      label: "진행 중 프로젝트",
      nav: "dashboard/work/projects",
      reason: projectContext.reason || "error",
      failureHint: "프로젝트 원장 읽기 실패",
      disconnectedHint: "프로젝트 원장 미연결",
    }));
    return cards;
  }

  const blockedAvailable = isAvailableValue(kpis.blockedProjects);
  const blocked = blockedAvailable ? Number(kpis.blockedProjects) : null;
  cards.push({
    label: "진행 중 프로젝트",
    value: kpis.activeProjects,
    hint: !blockedAvailable
      ? "막힘 수 읽기 실패"
      : blocked > 0
        ? `${blocked}건 막힘`
        : "막힌 프로젝트 없음",
    tone: !blockedAvailable || blocked > 0 ? "warning" : "moon",
    nav: "dashboard/work/projects",
    spark: [],
  });

  return cards;
}

export function activitySeriesAvailability(series = [], { sources = [], status } = {}) {
  const segments = ["work", "decisions", "content"];
  const failedSegments = segments.filter((segment) =>
    series.some((item) => !isAvailableValue(item?.[segment])),
  );
  if (failedSegments.length === 0) {
    return { available: true, failedSegments: [], state: "live" };
  }

  const dependencies = {
    work: { sourceKey: "projects", dependency: "project_updates" },
    decisions: { sourceKey: "projects", dependency: "decisions" },
    content: { sourceKey: "content" },
  };
  const reasons = failedSegments.map((segment) => metricContext({
    sources,
    status,
    ...dependencies[segment],
  }).reason || "error");
  return {
    available: false,
    failedSegments,
    state: reasons.every((reason) => reason === "preview") ? "preview" : "error",
  };
}

export function projectActivityAvailability(sources = [], status) {
  const projectSource = Array.isArray(sources)
    ? sources.find((source) => source?.key === "projects")
    : null;
  const state = projectSource && KNOWN_STATES.has(projectSource.state)
    ? projectSource.state
    : fallbackState(status);
  const failed = new Set(
    Array.isArray(projectSource?.failedSources) ? projectSource.failedSources : [],
  );
  const coreAvailable = state === "live" || state === "partial";
  const updates = coreAvailable && !failed.has("project_updates");
  const decisions = coreAvailable && !failed.has("decisions");
  const optionalFailure = coreAvailable && (!updates || !decisions);

  return {
    state,
    reason: state === "preview" ? "preview" : state === "error" ? "error" : optionalFailure ? "partial" : null,
    coreAvailable,
    updates,
    decisions,
    brandActivity: updates && decisions,
    recentProjectActivity: updates && decisions,
  };
}

export function overviewPanelAvailability({
  sources = [],
  status,
  sourceKey,
  state,
  hasData = false,
} = {}) {
  const resolvedState = state === undefined
    ? sourceContext(sources, sourceKey, status).state
    : normalizePanelState(state);
  const showData = ["live", "partial"].includes(resolvedState) && Boolean(hasData);
  const empty = resolvedState === "live" && !hasData;
  const reason = resolvedState === "preview"
    ? "preview"
    : resolvedState === "error"
      ? "error"
      : resolvedState === "partial"
        ? "partial"
        : empty
          ? "empty"
          : null;

  return { state: resolvedState, showData, empty, reason };
}

export function buildAutomationMetricRows(summary = {}, state = "error") {
  const metric = (key) => isAvailableValue(summary?.[key]) ? Number(summary[key]) : "—";
  const failures = metric("failuresToday");
  const resolvedState = normalizePanelState(state);
  return [
    { key: "runs", label: "오늘 실행", value: metric("runsToday"), tone: "fg" },
    {
      key: "failures",
      label: "실패",
      value: failures,
      tone: failures === "—"
        ? "neutral"
        : failures > 0
          ? "danger"
          : resolvedState === "live"
            ? "success"
            : "neutral",
    },
    { key: "active", label: "활성 자동화", value: metric("activeAutomations"), tone: "fg" },
    { key: "integrations", label: "연동됨", value: metric("integrationsConnected"), tone: "info" },
  ].map((item) => item.value === "—" ? { ...item, tone: "neutral" } : item);
}

export function overviewDisclosureMessages({ failedSources = [], partialSources = [] } = {}) {
  const unique = (values) => Array.from(new Set(
    (Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value),
  ));
  const failed = unique(failedSources);
  const partial = unique(partialSources);
  return [
    ...(failed.length > 0
      ? [{ kind: "failure", text: `일부 원장 읽기 실패 · ${failed.join(", ")}` }]
      : []),
    ...(partial.length > 0
      ? [{ kind: "partial", text: `일부 원장 부분 집계 · ${partial.join(", ")}` }]
      : []),
  ];
}
