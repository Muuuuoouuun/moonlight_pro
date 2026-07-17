import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const primitivesSource = await readFile(new URL("../hub-primitives.jsx", import.meta.url), "utf8");
const overviewSource = await readFile(new URL("./overview.jsx", import.meta.url), "utf8");
const dailyBriefSource = await readFile(new URL("./daily-brief.jsx", import.meta.url), "utf8");
const overviewTruth = await import("./overview-truth.js").catch(() => null);

test("shared SyncBadge maps partial explicitly instead of falling back to preview", () => {
  assert.match(primitivesSource, /partial:\s*\{\s*tone:\s*["']warning["'],\s*label:\s*["']partial["']/);
  assert.doesNotMatch(primitivesSource, /map\[state\]\s*\|\|\s*map\.preview/);
});

test("overview error presentation keeps partial status and null KPI truth", () => {
  assert.ok(overviewTruth, "overview-truth.js must expose executable presentation rules");
  assert.equal(overviewTruth.overviewSyncState({ status: "partial", source: "supabase" }), "partial");

  const cards = overviewTruth.buildOverviewKpiCards({
    kpis: {
      updatesThisWeek: null,
      decisionsThisWeek: null,
      publishedThisWeek: 0,
      activeProjects: null,
      blockedProjects: null,
    },
    activitySeries: [{ work: null, decisions: null, content: 0 }],
    status: "partial",
    sources: [
      { key: "projects", state: "error", failedSources: ["projects"] },
      { key: "content", state: "live", failedSources: [] },
    ],
  });

  assert.equal(cards[0].value, "—");
  assert.match(cards[0].hint, /읽기 실패/);
  assert.equal(cards[1].value, "—");
  assert.match(cards[1].hint, /읽기 실패/);
  assert.equal(cards[2].value, 0);
  assert.equal(cards[3].value, "—");
  assert.match(cards[3].hint, /읽기 실패/);
  assert.equal(cards.some((card) => card.hint === "막힌 프로젝트 없음"), false);
});

test("overview distinguishes preview nulls, error nulls, and live zeroes", () => {
  const nullKpis = {
    updatesThisWeek: null,
    decisionsThisWeek: null,
    publishedThisWeek: null,
    activeProjects: null,
    blockedProjects: null,
  };
  const previewCards = overviewTruth.buildOverviewKpiCards({
    kpis: nullKpis,
    status: "preview",
    sources: [
      { key: "projects", state: "preview", failedSources: [] },
      { key: "content", state: "preview", failedSources: [] },
    ],
  });
  assert.equal(previewCards.every((card) => card.value === "—"), true);
  assert.equal(previewCards.every((card) => /원장 미연결/.test(card.hint)), true);
  assert.equal(previewCards.every((card) => card.tone === "neutral"), true);
  assert.notEqual(previewCards[2].tone, "success");

  const liveCards = overviewTruth.buildOverviewKpiCards({
    kpis: {
      updatesThisWeek: 0,
      decisionsThisWeek: 0,
      publishedThisWeek: 0,
      activeProjects: 0,
      blockedProjects: 0,
    },
    status: "live",
    sources: [
      { key: "projects", state: "live", failedSources: [] },
      { key: "content", state: "live", failedSources: [] },
    ],
  });
  assert.equal(liveCards.every((card) => card.value === 0), true);
  assert.equal(liveCards.some((card) => /읽기 실패|미연결/.test(card.hint)), false);
  assert.equal(liveCards[2].tone, "success");

  assert.equal(overviewTruth.overviewSyncState({ status: "mystery", source: "mystery" }), "error");
});

test("overview does not publish a fake zero when the publish-log slice failed", () => {
  const cards = overviewTruth.buildOverviewKpiCards({
    kpis: {
      updatesThisWeek: 0,
      decisionsThisWeek: 0,
      publishedThisWeek: 0,
      activeProjects: 0,
      blockedProjects: 0,
    },
    status: "partial",
    sources: [
      { key: "projects", state: "live", failedSources: [] },
      { key: "content", state: "partial", failedSources: ["publish_logs"] },
    ],
  });

  assert.equal(cards[2].value, "—");
  assert.match(cards[2].hint, /읽기 실패/);
  assert.notEqual(cards[2].tone, "success");
});

test("overview activity treats null segments as unavailable instead of zero", () => {
  assert.ok(overviewTruth, "overview-truth.js must expose executable presentation rules");
  assert.deepEqual(
    overviewTruth.activitySeriesAvailability(
      [{ date: "2026-07-17", work: null, decisions: 0, content: 1 }],
      {
        status: "preview",
        sources: [
          { key: "projects", state: "preview", failedSources: [] },
          { key: "content", state: "live", failedSources: [] },
        ],
      },
    ),
    { available: false, failedSegments: ["work"], state: "preview" },
  );
  assert.deepEqual(
    overviewTruth.activitySeriesAvailability(
      [{ date: "2026-07-17", work: null, decisions: 0, content: 1 }],
      {
        status: "partial",
        sources: [
          { key: "projects", state: "partial", failedSources: ["project_updates"] },
          { key: "content", state: "live", failedSources: [] },
        ],
      },
    ),
    { available: false, failedSegments: ["work"], state: "error" },
  );
  assert.deepEqual(
    overviewTruth.activitySeriesAvailability(
      [{ date: "2026-07-17", work: 0, decisions: 0, content: 0 }],
      { status: "live", sources: [] },
    ),
    { available: true, failedSegments: [], state: "live" },
  );
  assert.deepEqual(
    overviewTruth.projectActivityAvailability([{
      key: "projects",
      state: "partial",
      failedSources: ["project_updates"],
    }]),
    {
      state: "partial",
      reason: "partial",
      coreAvailable: true,
      updates: false,
      decisions: true,
      brandActivity: false,
      recentProjectActivity: false,
    },
  );
  assert.deepEqual(
    overviewTruth.projectActivityAvailability([{
      key: "projects",
      state: "preview",
      failedSources: [],
    }], "preview"),
    {
      state: "preview",
      reason: "preview",
      coreAvailable: false,
      updates: false,
      decisions: false,
      brandActivity: false,
      recentProjectActivity: false,
    },
  );
  assert.equal(overviewTruth.projectActivityAvailability([], "mystery").state, "error");
});

test("overview panel availability distinguishes disconnected, failed, partial, and live-empty", () => {
  assert.equal(typeof overviewTruth.overviewPanelAvailability, "function");

  assert.deepEqual(
    overviewTruth.overviewPanelAvailability({
      sourceKey: "projects",
      status: "preview",
      sources: [{ key: "projects", state: "preview" }],
      hasData: false,
    }),
    { state: "preview", showData: false, empty: false, reason: "preview" },
  );
  assert.deepEqual(
    overviewTruth.overviewPanelAvailability({
      sourceKey: "content",
      status: "partial",
      sources: [{ key: "content", state: "error" }],
      hasData: false,
    }),
    { state: "error", showData: false, empty: false, reason: "error" },
  );
  assert.deepEqual(
    overviewTruth.overviewPanelAvailability({
      sourceKey: "revenue",
      status: "partial",
      sources: [{ key: "revenue", state: "partial" }],
      hasData: true,
    }),
    { state: "partial", showData: true, empty: false, reason: "partial" },
  );
  assert.deepEqual(
    overviewTruth.overviewPanelAvailability({
      sourceKey: "revenue",
      status: "partial",
      sources: [{ key: "revenue", state: "partial" }],
      hasData: false,
    }),
    { state: "partial", showData: false, empty: false, reason: "partial" },
  );
  assert.deepEqual(
    overviewTruth.overviewPanelAvailability({
      sourceKey: "revenue",
      status: "live",
      sources: [{ key: "revenue", state: "live" }],
      hasData: false,
    }),
    { state: "live", showData: false, empty: true, reason: "empty" },
  );
  assert.equal(
    overviewTruth.overviewPanelAvailability({ sourceKey: "projects", status: "mystery" }).state,
    "error",
  );
});

test("overview direct-state panels keep rhythm empty exclusive to proven live data", () => {
  assert.equal(typeof overviewTruth.overviewPanelAvailability, "function");
  assert.deepEqual(
    overviewTruth.overviewPanelAvailability({ state: "partial", hasData: true }),
    { state: "partial", showData: true, empty: false, reason: "partial" },
  );
  assert.deepEqual(
    overviewTruth.overviewPanelAvailability({ state: "partial", hasData: false }),
    { state: "partial", showData: false, empty: false, reason: "partial" },
  );
  assert.deepEqual(
    overviewTruth.overviewPanelAvailability({ state: "live-empty", hasData: false }),
    { state: "live", showData: false, empty: true, reason: "empty" },
  );
  assert.equal(overviewTruth.overviewPanelAvailability({ state: "unknown" }).state, "error");
});

test("overview automation metrics never manufacture zero or success from unavailable values", () => {
  assert.equal(typeof overviewTruth.buildAutomationMetricRows, "function");

  const preview = overviewTruth.buildAutomationMetricRows({}, "preview");
  assert.equal(preview.every((metric) => metric.value === "—"), true);
  assert.equal(preview.some((metric) => metric.tone === "success"), false);

  const partial = overviewTruth.buildAutomationMetricRows({ failuresToday: 0 }, "partial");
  assert.deepEqual(partial.map((metric) => metric.value), ["—", 0, "—", "—"]);
  assert.notEqual(partial[1].tone, "success");

  const live = overviewTruth.buildAutomationMetricRows({
    runsToday: 0,
    failuresToday: 0,
    activeAutomations: 0,
    integrationsConnected: 0,
  }, "live");
  assert.deepEqual(live.map((metric) => metric.value), [0, 0, 0, 0]);
  assert.equal(live[1].tone, "success");
});

test("overview header keeps failed and partial source disclosures distinct", () => {
  assert.equal(typeof overviewTruth.overviewDisclosureMessages, "function");
  assert.deepEqual(
    overviewTruth.overviewDisclosureMessages({
      failedSources: ["project_updates"],
      partialSources: ["tasks"],
    }),
    [
      { kind: "failure", text: "일부 원장 읽기 실패 · project_updates" },
      { kind: "partial", text: "일부 원장 부분 집계 · tasks" },
    ],
  );
  assert.deepEqual(
    overviewTruth.overviewDisclosureMessages({ failedSources: [], partialSources: ["tasks", "tasks"] }),
    [{ kind: "partial", text: "일부 원장 부분 집계 · tasks" }],
  );
});

test("overview consumes API status and failed sources for partial disclosures", () => {
  assert.match(overviewSource, /overviewSyncState\(data\)/);
  assert.match(overviewSource, /ledger\.failedSources/);
  assert.match(overviewSource, /activitySeriesAvailability/);
  assert.match(overviewSource, /활동 원장 일부를 읽지 못했습니다/);
  assert.match(overviewSource, /활동 원장 미연결/);
  assert.match(overviewSource, /브랜드 활동 원장을 읽지 못했습니다/);
  assert.match(overviewSource, /브랜드 활동 원장 미연결/);
  assert.match(overviewSource, /최근 활동 원장 일부를 읽지 못했습니다/);
  assert.match(overviewSource, /최근 활동 원장 미연결/);
  assert.match(overviewSource, /overviewPanelAvailability/);
  assert.match(overviewSource, /buildAutomationMetricRows/);
  assert.match(overviewSource, /overviewDisclosureMessages/);
  assert.match(overviewSource, /프로젝트 원장 미연결/);
  assert.match(overviewSource, /프로젝트 원장 읽기 실패/);
  assert.match(overviewSource, /프로젝트 부분 데이터/);
  assert.match(overviewSource, /프로젝트 데이터 없음/);
  assert.match(overviewSource, /콘텐츠 원장 미연결/);
  assert.match(overviewSource, /콘텐츠 원장 읽기 실패/);
  assert.match(overviewSource, /콘텐츠 부분 데이터/);
  assert.match(overviewSource, /콘텐츠 데이터 없음/);
  assert.match(overviewSource, /매출 원장 미연결/);
  assert.match(overviewSource, /매출 원장 읽기 실패/);
  assert.match(overviewSource, /매출 원장 부분 데이터/);
  assert.match(overviewSource, /자동화 원장 미연결/);
  assert.match(overviewSource, /자동화 원장 읽기 실패/);
  assert.match(overviewSource, /자동화 원장 부분 데이터/);
  assert.match(overviewSource, /리듬 원장 미연결/);
  assert.match(overviewSource, /리듬 원장 읽기 실패/);
  assert.match(overviewSource, /리듬 원장 부분 데이터/);
  assert.doesNotMatch(overviewSource, /kpis\.(?:updatesThisWeek|decisionsThisWeek|activeProjects)\s*\?\?\s*0/);
  assert.doesNotMatch(overviewSource, /automationsSummary\.(?:runsToday|failuresToday|activeAutomations|integrationsConnected)\s*\?\?\s*0/);
  assert.doesNotMatch(dailyBriefSource, /`\$\{pms\.taskCompletionRate\}%`/);
});

test("daily brief names partial state and does not collapse it into mixed or preview", () => {
  assert.match(dailyBriefSource, /if \(state === ["']partial["']\) return ["']warning["']/);
  assert.match(dailyBriefSource, /if \(state === ["']partial["']\) return ["']partial["']/);
  assert.match(dailyBriefSource, /data\.status === ["']partial["']/);
  assert.match(dailyBriefSource, /일부 운영 기록을 읽지 못했습니다/);
});
