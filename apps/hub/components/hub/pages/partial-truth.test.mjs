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

test("overview presentation keeps partial status and null KPI truth", () => {
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

test("overview activity treats null segments as unavailable instead of zero", () => {
  assert.ok(overviewTruth, "overview-truth.js must expose executable presentation rules");
  assert.deepEqual(
    overviewTruth.activitySeriesAvailability([
      { date: "2026-07-17", work: null, decisions: 0, content: 1 },
    ]),
    { available: false, failedSegments: ["work"] },
  );
  assert.deepEqual(
    overviewTruth.activitySeriesAvailability([
      { date: "2026-07-17", work: 0, decisions: 0, content: 0 },
    ]),
    { available: true, failedSegments: [] },
  );
  assert.deepEqual(
    overviewTruth.projectActivityAvailability([{
      key: "projects",
      state: "partial",
      failedSources: ["project_updates"],
    }]),
    { updates: false, decisions: true, brandActivity: false, recentProjectActivity: false },
  );
});

test("overview consumes API status and failed sources for partial disclosures", () => {
  assert.match(overviewSource, /overviewSyncState\(data\)/);
  assert.match(overviewSource, /ledger\.failedSources/);
  assert.match(overviewSource, /activitySeriesAvailability/);
  assert.match(overviewSource, /활동 원장 일부를 읽지 못했습니다/);
  assert.match(overviewSource, /브랜드 활동 원장을 읽지 못했습니다/);
  assert.match(overviewSource, /최근 활동 원장 일부를 읽지 못했습니다/);
  assert.doesNotMatch(overviewSource, /kpis\.(?:updatesThisWeek|decisionsThisWeek|activeProjects)\s*\?\?\s*0/);
});

test("daily brief names partial state and does not collapse it into mixed or preview", () => {
  assert.match(dailyBriefSource, /if \(state === ["']partial["']\) return ["']warning["']/);
  assert.match(dailyBriefSource, /if \(state === ["']partial["']\) return ["']partial["']/);
  assert.match(dailyBriefSource, /data\.status === ["']partial["']/);
  assert.match(dailyBriefSource, /일부 운영 기록을 읽지 못했습니다/);
});
