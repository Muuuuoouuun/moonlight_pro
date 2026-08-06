const KPI_DEFINITIONS = [
  {
    key: "updatesThisWeek",
    label: "작업 업데이트",
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
    label: "결정 기록",
    hint: "기획·판단 로그",
    failureHint: "결정 기록 읽기 실패",
    disconnectedHint: "결정 기록 원장 미연결",
    tone: "neutral",
    nav: "dashboard/work/decisions",
    sparkKey: "decisions",
    sourceKey: "projects",
    dependency: "decisions",
  },
  {
    key: "publishedThisWeek",
    label: "발행",
    hint: "콘텐츠 발행 완료",
    failureHint: "발행 기록 읽기 실패",
    disconnectedHint: "발행 기록 원장 미연결",
    tone: "neutral",
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

// 선택한 기간(7/14/30일)만큼의 일별 버킷을 더한다. 이전에는 KPI가 서버에서
// withinDays(...,7)로 고정 집계돼 있어, 헤더에서 30일을 골라도 KPI는 7일 그대로였다
// (기간 컨트롤이 활동 차트만 제어 = 화면이 거짓말). activitySeries는 이미 30일치 일별
// 버킷을 담고 있고 서버의 7일 집계와 같은 원본(updates/decisions/publish_logs)에서 나오므로,
// 여기서 창을 다시 합하면 추가 왕복 없이 KPI가 기간을 따라간다.
// 창 안에 하나라도 읽지 못한 버킷이 있으면 합계를 만들지 않는다 — 부분 데이터를 합쳐
// 확정된 숫자처럼 보여주지 않기 위해서다(sparkValues와 같은 규칙).
function windowSum(series, key, days) {
  const window = (Array.isArray(series) ? series : []).slice(-days);
  if (window.length === 0) return null;
  const values = window.map((item) => item?.[key]);
  if (!values.every(isAvailableValue)) return null;
  return values.reduce((sum, value) => sum + Number(value), 0);
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
    partial: new Set(Array.isArray(source?.partialSources) ? source.partialSources : []),
  };
}

function scopedSourceState(context, dependencies = []) {
  if (context.state !== "partial") return context.state;

  const scopedDependencies = Array.isArray(dependencies)
    ? dependencies.filter(Boolean)
    : [];
  if (scopedDependencies.length === 0) return "partial";
  if (scopedDependencies.some((dependency) => context.failed.has(dependency))) {
    return "error";
  }
  if (scopedDependencies.some((dependency) => context.partial.has(dependency))) {
    return "partial";
  }

  // A partial source without slice details cannot prove that this panel's
  // dependencies are complete. Named failures outside the dependency scope,
  // however, do not make an otherwise complete panel partial.
  if (context.failed.size === 0 && context.partial.size === 0) return "partial";
  return "live";
}

function normalizePanelState(state) {
  if (state === "live-empty") return "live";
  return KNOWN_STATES.has(state) ? state : "error";
}

function metricContext({ sources, status, sourceKey, dependency }) {
  const context = sourceContext(sources, sourceKey, status);
  const state = dependency
    ? scopedSourceState(context, [dependency])
    : context.state;
  if (state === "preview") return { available: false, reason: "preview" };
  if (state === "error") return { available: false, reason: "error" };
  if (state === "partial" && dependency) return { available: false, reason: "partial" };
  return { available: true, reason: null };
}

function unavailableCard({ label, nav, reason, failureHint, disconnectedHint }) {
  return {
    label,
    value: "—",
    hint: reason === "preview" ? disconnectedHint : failureHint,
    tone: "neutral",
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
  days = 7,
} = {}) {
  const windowDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 7;
  const cards = KPI_DEFINITIONS.map((definition) => {
    const context = metricContext({
      sources,
      status,
      sourceKey: definition.sourceKey,
      dependency: definition.dependency,
    });
    const windowed = windowSum(activitySeries, definition.sparkKey, windowDays);
    // 창 합계를 못 만들면 서버의 고정 7일 집계로 후퇴한다 — 단, 그때는 라벨도 7일로
    // 되돌려서 숫자와 기간 표기가 어긋나지 않게 한다.
    const usesWindow = windowed !== null;
    const value = usesWindow ? windowed : kpis[definition.key];
    const label = `최근 ${usesWindow ? windowDays : 7}일 ${definition.label}`;
    const available = context.available && isAvailableValue(value);
    if (!available) {
      return unavailableCard({
        ...definition,
        label,
        reason: context.reason || "error",
      });
    }
    return {
      label,
      value,
      hint: definition.hint,
      tone: definition.tone,
      nav: definition.nav,
      spark: sparkValues(activitySeries, definition.sparkKey),
    };
  });

  const projectContext = metricContext({
    sources,
    status,
    sourceKey: "projects",
    dependency: "projects",
  });
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
    tone: "neutral",
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
  const context = sourceContext(sources, "projects", status);
  const state = context.state;
  const coreAvailable = (state === "live" || state === "partial")
    && !context.failed.has("projects")
    && !context.partial.has("projects");
  const updates = coreAvailable
    && !context.failed.has("project_updates")
    && !context.partial.has("project_updates");
  const decisions = coreAvailable
    && !context.failed.has("decisions")
    && !context.partial.has("decisions");
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
  dependencies = [],
  hasData = false,
} = {}) {
  const resolvedState = state === undefined
    ? scopedSourceState(sourceContext(sources, sourceKey, status), dependencies)
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

export function recentActivityAvailability(sources = [], status) {
  const sourceDependencies = [
    { key: "projects", dependencies: ["project_updates", "decisions"] },
    { key: "content", dependencies: ["publish_logs"] },
    { key: "automations", dependencies: ["automation_runs", "runs"] },
  ];
  const availability = sourceDependencies.map(({ key, dependencies }) => ({
    key,
    state: scopedSourceState(sourceContext(sources, key, status), dependencies),
  }));
  const unavailable = availability.filter(({ state }) => state !== "live");
  if (unavailable.length === 0) {
    return { complete: true, reason: null, unavailableSources: [] };
  }

  const unavailableStates = new Set(unavailable.map(({ state }) => state));
  const reason = unavailableStates.has("error")
    ? "error"
    : unavailableStates.has("partial")
      ? "partial"
      : "preview";
  return {
    complete: false,
    reason,
    unavailableSources: unavailable.map(({ key }) => key),
  };
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
          : "neutral",
    },
    { key: "active", label: "활성 자동화", value: metric("activeAutomations"), tone: "fg" },
    { key: "integrations", label: "연동됨", value: metric("integrationsConnected"), tone: "neutral" },
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
