import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDailyFocus,
  focusOccupiedKeys,
  selectUrgentKa,
  withoutFocusDuplicates,
} from "./daily-focus.js";

// 고정 시각: 2026-08-05 12:00 KST (= 03:00Z). KST day-key 판정이 UTC 서버에서도 정확한지
// 이 시각으로 함께 검증한다.
const NOW = new Date("2026-08-05T03:00:00Z");

function revenueFixture(overrides = {}) {
  return {
    source: "supabase",
    companies: [
      { id: "co-ka", name: "KA학원", ka: true },
      { id: "co-normal", name: "일반학원", ka: false },
    ],
    leads: [],
    deals: [],
    ...overrides,
  };
}

test("긴급 KA는 KA 회사 + 기한 지난 다음 행동에서만 최대 1건을 고른다", () => {
  const revenue = revenueFixture({
    leads: [
      // KA + 3일 지남 → 최우선 후보
      { id: "l1", owner: "Me", companyId: "co-ka", companyName: "KA학원", name: "KA — 원장", nextAction: "재계약 통화", nextActionAt: "2026-08-02", dormant: false },
      // KA지만 기한 미래 → 제외
      { id: "l2", owner: "Me", companyId: "co-ka", name: "KA — 실장", nextAction: "다음주 미팅", nextActionAt: "2026-08-20", dormant: false },
      // 기한 지났지만 KA 아님 → 제외
      { id: "l3", owner: "Me", companyId: "co-normal", name: "일반 — 원장", nextAction: "전화", nextActionAt: "2026-08-01", dormant: false },
      // KA + 더 오래 지남이지만 휴면 → 제외
      { id: "l4", owner: "Me", companyId: "co-ka", name: "KA — 휴면", nextAction: "전화", nextActionAt: "2026-07-01", dormant: true },
      // KA + 지남이지만 소유자 아님 → 제외 (운영자 스코프)
      { id: "l5", owner: "Unassigned", companyId: "co-ka", name: "KA — 미배정", nextAction: "전화", nextActionAt: "2026-08-01", dormant: false },
    ],
  });

  const ka = selectUrgentKa(revenue, NOW);
  assert.equal(ka?.id, "l1");
  assert.equal(ka.company, "KA학원");
  assert.match(ka.reason, /3일 지남/);
  assert.match(ka.href, /customer=lead%3Al1/);
});

test("긴급 KA: 오늘 기한은 '오늘 연락 예정', 대상 없으면 null (자리표시자 금지)", () => {
  const today = revenueFixture({
    leads: [{ id: "l1", owner: "Me", companyId: "co-ka", name: "KA", nextAction: "전화", nextActionAt: "2026-08-05", dormant: false }],
  });
  assert.equal(selectUrgentKa(today, NOW)?.reason, "오늘 연락 예정");

  assert.equal(selectUrgentKa(revenueFixture(), NOW), null);
  // KA 회사가 없으면 후보 계산 자체를 하지 않는다
  assert.equal(selectUrgentKa(revenueFixture({ companies: [] }), NOW), null);
});

test("긴급 KA: 7일 이상 방치된 KA 딜도 후보이고, 더 오래된 쪽이 이긴다", () => {
  const revenue = revenueFixture({
    leads: [{ id: "l1", owner: "Me", companyId: "co-ka", name: "KA 리드", nextAction: "전화", nextActionAt: "2026-08-04", dormant: false }],
    deals: [
      { id: "d1", owner: "Me", companyId: "co-ka", name: "KA 연간계약", age: 12, hidden: false },
      { id: "d2", owner: "Me", companyId: "co-ka", name: "숨김 딜", age: 30, hidden: true },
      { id: "d3", owner: "Me", companyId: "co-ka", name: "정상 딜", age: 3, hidden: false },
    ],
  });

  const ka = selectUrgentKa(revenue, NOW);
  assert.equal(ka?.id, "d1"); // 12일 방치 > 리드 1일 지남
  assert.match(ka.reason, /12일째 활동 없음/);
});

test("buildDailyFocus: 집중 고객은 CS 레인 + next action 있는 리드를 최대 5건", () => {
  const lead = (id, score) => ({
    id, owner: "Me", name: `리드${id}`, companyName: `회사${id}`,
    priorityLane: "customer_success", nextAction: "연락", score, focusOverride: "default",
  });
  const revenue = revenueFixture({
    leads: [lead("a", 90), lead("b", 80), lead("c", 70), lead("d", 60), lead("e", 50), lead("f", 40)],
  });

  const focus = buildDailyFocus({ revenue, calendar: { ok: false }, now: NOW });
  assert.equal(focus.focusCustomers.state, "live");
  assert.equal(focus.focusCustomers.items.length, 5); // §2: 3~5건 — 캡 5
  assert.equal(focus.focusCustomers.items[0].id, "a");
  assert.match(focus.focusCustomers.items[0].href, /customer=lead%3Aa/);
});

test("buildDailyFocus: 오늘 일정은 KST 오늘만, 시간순, 미연결은 preview + reason", () => {
  const calendar = {
    ok: true,
    items: [
      // 22:30Z 8/4 = KST 8/5 07:30 → 오늘 (UTC 날짜와 KST 날짜가 다른 케이스)
      { id: "e1", summary: "아침 미팅", start: { dateTime: "2026-08-04T22:30:00Z" } },
      { id: "e2", summary: "오후 데모", start: { dateTime: "2026-08-05T05:00:00Z" } },
      // KST 8/6 → 오늘 아님
      { id: "e3", summary: "내일 일정", start: { dateTime: "2026-08-05T16:00:00Z" } },
      // 종일 일정 (date-only)
      { id: "e4", summary: "종일 행사", start: { date: "2026-08-05" } },
    ],
  };

  const focus = buildDailyFocus({ revenue: revenueFixture(), calendar, now: NOW });
  assert.equal(focus.todayAgenda.state, "live");
  assert.deepEqual(focus.todayAgenda.items.map((i) => i.id), ["e4", "e1", "e2"]);
  assert.equal(focus.todayAgenda.items.find((i) => i.id === "e4").whenLabel, "종일");
  assert.equal(focus.todayAgenda.items.find((i) => i.id === "e1").whenLabel, "07:30");

  // 실제 producer 어휘(missing-*)만 preview — read 실패는 error로 구분된다(5차 재감사 M).
  const off = buildDailyFocus({ revenue: revenueFixture(), calendar: { ok: false, reason: "missing-connection" }, now: NOW });
  assert.equal(off.todayAgenda.state, "preview");
  assert.equal(off.todayAgenda.reason, "missing-connection");

  const failed = buildDailyFocus({ revenue: revenueFixture(), calendar: { ok: false, reason: "calendar-read-failed" }, now: NOW });
  assert.equal(failed.todayAgenda.state, "error");
  assert.equal(off.todayAgenda.items.length, 0);
});

test("buildDailyFocus: 매출 원장이 preview면 KA·집중 슬롯도 preview (mock 승격 금지)", () => {
  const focus = buildDailyFocus({ revenue: { source: "preview" }, calendar: { ok: false }, now: NOW });
  assert.equal(focus.urgentKa.state, "preview");
  assert.equal(focus.urgentKa.item, null);
  assert.equal(focus.focusCustomers.state, "preview");
  assert.equal(focus.focusCustomers.items.length, 0);
});

// 확정 슬롯과 신호 큐가 같은 원장을 두 번 읽어 같은 고객을 첫 화면에 두 번 렌더하던 구조를
// 잠근다 — 슬롯이 정본, 신호는 나머지(2026-08-07 사용성 재감사 A).
test("withoutFocusDuplicates: 확정 슬롯이 점유한 레코드는 신호 큐에서 빠진다", () => {
  const dailyFocus = {
    urgentKa: { state: "live", item: { kind: "deal", id: "d1", name: "KA 연간계약" } },
    focusCustomers: { state: "live", items: [{ id: "a" }, { id: "b" }] },
  };
  const signals = [
    { id: "risk-convergence", tone: "danger" },                          // subject 없음 → 유지
    { id: "revenue-focus-a", subject: { type: "lead", id: "a" } },       // 집중 고객 중복 → 제거
    { id: "revenue-focus-c", subject: { type: "lead", id: "c" } },       // 슬롯 밖 → 유지
    { id: "revenue-stale-d1", subject: { type: "deal", id: "d1" } },     // 긴급 KA 중복 → 제거
    { id: "revenue-stale-d2", subject: { type: "deal", id: "d2" } },     // 슬롯 밖 → 유지
  ];

  assert.deepEqual(
    withoutFocusDuplicates(signals, dailyFocus).map((s) => s.id),
    ["risk-convergence", "revenue-focus-c", "revenue-stale-d2"],
  );

  // 타입이 다르면 같은 id여도 다른 레코드다 — lead:a가 deal:a를 지우면 안 된다.
  assert.deepEqual(
    withoutFocusDuplicates([{ id: "x", subject: { type: "deal", id: "a" } }], dailyFocus).map((s) => s.id),
    ["x"],
  );

  // 슬롯이 비었으면(원장 preview·error 포함) 원본을 그대로 통과시킨다.
  assert.equal(withoutFocusDuplicates(signals, { urgentKa: { item: null }, focusCustomers: { items: [] } }).length, 5);
  assert.equal(withoutFocusDuplicates(signals, null).length, 5);
  assert.deepEqual(withoutFocusDuplicates(null, dailyFocus), []);
});

test("focusOccupiedKeys: KA 슬롯은 kind로 구분되고 집중 고객은 전부 lead 키다", () => {
  const keys = focusOccupiedKeys({
    urgentKa: { item: { kind: "lead", id: "l9" } },
    focusCustomers: { items: [{ id: "a" }, { id: "b" }, { notAnId: true }] },
  });
  assert.deepEqual([...keys].sort(), ["lead:a", "lead:b", "lead:l9"]);
  assert.equal(focusOccupiedKeys(undefined).size, 0);
});
