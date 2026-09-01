import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// revenue-heatmap.jsx는 JSX라 node --test가 직접 import할 수 없다.
// 대신 페이지 파일이 마커로 감싼 self-contained 순수 블록(월/분기 헬퍼)을
// 소스에서 추출해 data: 모듈로 실행한다 — 블록이 JSX/외부 참조를 갖게 되면 여기서 깨진다.
const source = await readFile(new URL("./revenue-heatmap.jsx", import.meta.url), "utf8");

const START = "// [heatmap-period-pure-start]";
const END = "// [heatmap-period-pure-end]";
const startIdx = source.indexOf(START);
const endIdx = source.indexOf(END);
assert.ok(startIdx >= 0 && endIdx > startIdx, "기간 순수 블록 마커가 revenue-heatmap.jsx에 있어야 한다");

const block = source.slice(source.indexOf("\n", startIdx) + 1, endIdx);
const period = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(block)}`);

test("periodRange: 월/분기 [시작, 끝) 캘린더 경계 (로컬 타임존)", () => {
  const [mStart, mEnd] = period.periodRange("month", "2026-06");
  assert.equal(mStart, new Date(2026, 5, 1).getTime());
  assert.equal(mEnd, new Date(2026, 6, 1).getTime()); // 7/1 00:00은 미포함(반개구간)
  const midJune = new Date(2026, 5, 15).getTime();
  assert.ok(period.inPeriodRange(midJune, [mStart, mEnd]));
  assert.ok(!period.inPeriodRange(new Date(2026, 4, 31).getTime(), [mStart, mEnd]));
  assert.ok(!period.inPeriodRange(mEnd, [mStart, mEnd]));

  const [qStart, qEnd] = period.periodRange("quarter", "2025-Q4");
  assert.equal(qStart, new Date(2025, 9, 1).getTime());
  assert.equal(qEnd, new Date(2026, 0, 1).getTime()); // 연도 넘어가는 끝 경계

  // range=null은 필터 없음(전체 통과)
  assert.ok(period.inPeriodRange(midJune, null));
});

test("dealPeriodCandidates: 실존 월/분기만, lost·무날짜 제외, 최근 우선, 라벨 형식", () => {
  // 시각은 ±12h 어떤 타임존에서도 같은 월에 떨어지도록 월 중순 정오(+09:00)로 고정
  const deals = [
    { stage: "closing", closeAt: "2026-06-10T12:00:00+09:00" },
    { stage: "proposal", closeAt: null, activityAt: "2026-04-15T12:00:00+09:00" }, // activityAt 폴백
    { stage: "closing", closeAt: "2026-06-20T12:00:00+09:00" }, // 같은 달 중복 → 칩 1개
    { stage: "lost", closeAt: "2026-03-10T12:00:00+09:00" }, // lost 제외
    { stage: "contact", closeAt: null, activityAt: null }, // 무날짜 제외
    { stage: "closing", closeAt: "2025-12-15T12:00:00+09:00" },
  ];

  const months = period.dealPeriodCandidates(deals, "month", 2026);
  assert.deepEqual(months.map(m => m.key), ["2026-06", "2026-04", "2025-12"]);
  assert.deepEqual(months.map(m => m.label), ["6월", "4월", "25.12"]);

  const quarters = period.dealPeriodCandidates(deals, "quarter", 2026);
  assert.deepEqual(quarters.map(q => q.key), ["2026-Q2", "2025-Q4"]);
  assert.deepEqual(quarters.map(q => q.label), ["Q2", "25 Q4"]);

  assert.deepEqual(period.dealPeriodCandidates([], "month", 2026), []);
});

test("후보 키와 필터 구간의 일관성: 딜은 자기 월/분기 range에 항상 매칭된다", () => {
  const stamps = [
    new Date(2026, 0, 1, 0, 0, 0).getTime(), // 월 시작 경계
    new Date(2026, 11, 31, 23, 59, 59).getTime(), // 연말 경계
    new Date(2025, 2, 31, 23, 59, 59).getTime(), // 분기 끝 경계
  ];
  for (const ms of stamps) {
    assert.ok(period.inPeriodRange(ms, period.periodRange("month", period.monthKeyOf(ms))));
    assert.ok(period.inPeriodRange(ms, period.periodRange("quarter", period.quarterKeyOf(ms))));
  }
});

test("dealTimestamp: closeAt 우선, 파싱 불가 closeAt은 activityAt으로 폴백", () => {
  const june = new Date("2026-06-10T12:00:00+09:00").getTime();
  assert.equal(period.dealTimestamp({ closeAt: "2026-06-10T12:00:00+09:00", activityAt: "2026-01-01T12:00:00+09:00" }), june);
  // closeAt이 깨진 값이어도 유효한 activityAt이 있으면 null이 아니라 폴백해야 한다
  assert.equal(period.dealTimestamp({ closeAt: "확정 전", activityAt: "2026-06-10T12:00:00+09:00" }), june);
  assert.equal(period.dealTimestamp({ closeAt: null, activityAt: "2026-06-10T12:00:00+09:00" }), june);
  assert.equal(period.dealTimestamp({}), null);
  assert.equal(period.dealTimestamp({ closeAt: "n/a", activityAt: "n/a" }), null);
});

// ── 집계(aggregate) — 순수 블록의 분류·롤업 계약 ─────────────────────────────

// 지도 shape 주입용 소형 fake — 실제 KOREA_PROVINCE_BY_LABEL과 같은 계약(label/path/x/y).
const PROV = new Map([
  ["서울", { label: "서울", path: "M0 0", x: 10, y: 10 }],
  ["경기", { label: "경기", path: "M1 1", x: 20, y: 20 }],
  ["경북", { label: "경북", path: "M2 2", x: 30, y: 30 }],
]);

const emptyLedger = { leads: [], companies: [], accounts: [], deals: [] };

test("dealItemType: 딜 제목의 HW/SW 마커 분류", () => {
  assert.equal(period.dealItemType("[HW] 스마트보드"), "hw");
  assert.equal(period.dealItemType('전자칠판 HW 75"'), "hw");
  assert.equal(period.dealItemType("하드웨어 일괄 납품"), "hw");
  assert.equal(period.dealItemType("소프트웨어 라이선스"), "sw");
  assert.equal(period.dealItemType("SW 구독"), "sw");
  assert.equal(period.dealItemType("컨설팅 계약"), "other");
  assert.equal(period.dealItemType(null), "other");
});

test("canonicalRegion: 세부 표기·별칭을 canonical로 접는다", () => {
  assert.equal(period.canonicalRegion("경기-안양"), "경기");
  assert.equal(period.canonicalRegion("경상북도 구미"), "경북");
  assert.equal(period.canonicalRegion("서울"), "서울");
  assert.equal(period.canonicalRegion("해외"), null);
  assert.equal(period.canonicalRegion(""), null);
  assert.equal(period.canonicalRegion(null), null);
});

test("aggregate: lost 딜 제외, 품목 필터는 dealItemType 기준", () => {
  const ledger = { ...emptyLedger, deals: [
    { id: "d1", name: "[HW] 스마트보드", stage: "closing", value: 100 },
    { id: "d2", name: "SW 구독", stage: "proposal", value: 50 },
    { id: "d3", name: "[HW] 전자칠판", stage: "lost", value: 999 },
  ] };
  assert.equal(period.aggregate(ledger, { item: "all" }, PROV).matchedDeals, 2);
  assert.equal(period.aggregate(ledger, { item: "hw" }, PROV).matchedDeals, 1);
  assert.equal(period.aggregate(ledger, { item: "sw" }, PROV).matchedDeals, 1);
});

test("aggregate: closing→confirmed·wonCount, 그 외 stage→pipeline, expected=합", () => {
  const ledger = {
    leads: [{ id: "l1", name: "안양외고", companyId: "c1", region: "경기-안양" }],
    companies: [{ id: "c1", name: "안양외고" }],
    accounts: [],
    deals: [
      { id: "d1", name: "[HW] 보드", stage: "closing", value: 300, companyId: "c1", leadId: "l1" },
      { id: "d2", name: "SW 구독", stage: "proposal", value: 200, companyId: "c1", leadId: "l1" },
    ],
  };
  const { mapRows, customers } = period.aggregate(ledger, { item: "all" }, PROV);
  assert.equal(mapRows.length, 1);
  assert.equal(mapRows[0].label, "경기"); // "경기-안양" → canonical
  assert.equal(mapRows[0].confirmed, 300);
  assert.equal(mapRows[0].pipeline, 200);
  assert.equal(mapRows[0].expected, 500);
  assert.equal(mapRows[0].wonCount, 1);
  assert.equal(mapRows[0].dealsCount, 2);
  assert.equal(mapRows[0].path, "M1 1"); // 주입된 shape 계약(label/path/x/y)이 행에 병합된다
  assert.equal(customers[0].confirmed, 300);
  assert.equal(customers[0].pipeline, 200);
  assert.equal(customers[0].expected, 500);
});

test("aggregate: 리드 region이 회사 region보다 우선, 별칭은 canonical로 매핑", () => {
  const ledger = {
    leads: [{ id: "l1", name: "리드A", companyId: "c1", region: "서울" }],
    companies: [
      { id: "c1", name: "회사A", region: "경기" }, // 리드 region이 있으면 회사 region은 밀린다
      { id: "c2", name: "회사B", region: "경상북" }, // 별칭 → 경북
    ],
    accounts: [],
    deals: [
      { id: "d1", name: "SW", stage: "proposal", value: 100, companyId: "c1", leadId: "l1" },
      { id: "d2", name: "SW", stage: "proposal", value: 80, companyId: "c2" },
    ],
  };
  const { mapRows } = period.aggregate(ledger, { item: "all" }, PROV);
  assert.deepEqual(mapRows.map(r => r.label), ["서울", "경북"]); // expected 내림차순
});

test("aggregate: 같은 canonical로 접히는 세부 지역 병합 — 금액 합산·고객 정렬 유지", () => {
  const ledger = {
    leads: [
      { id: "l1", name: "안양외고", companyId: "c1", region: "경기-안양" },
      { id: "l2", name: "수원중", companyId: "c2", region: "경기-수원" },
    ],
    companies: [{ id: "c1", name: "안양외고" }, { id: "c2", name: "수원중" }],
    accounts: [],
    deals: [
      { id: "d1", name: "[HW] 보드", stage: "closing", value: 100, companyId: "c1", leadId: "l1" },
      { id: "d2", name: "[HW] 보드", stage: "proposal", value: 300, companyId: "c2", leadId: "l2" },
    ],
  };
  const { mapRows, otherRows } = period.aggregate(ledger, { item: "all" }, PROV);
  assert.equal(mapRows.length, 1); // 경기 하나로 접힘
  assert.equal(otherRows.length, 0);
  assert.equal(mapRows[0].confirmed, 100);
  assert.equal(mapRows[0].pipeline, 300);
  assert.equal(mapRows[0].expected, 400);
  assert.deepEqual(mapRows[0].regions, ["경기"]);
  assert.deepEqual(mapRows[0].customers.map(c => c.name), ["수원중", "안양외고"]); // expected 내림차순
});

test("aggregate: 지도에 없는 지역·지역 없음은 otherRows로 (label/regions 계약)", () => {
  const ledger = {
    leads: [{ id: "l1", name: "부산리드", region: "부산" }], // 부산은 fake 지도에 없다
    companies: [],
    accounts: [],
    deals: [
      { id: "d1", name: "SW", stage: "proposal", value: 100, leadId: "l1" },
      { id: "d2", name: "지역없는 딜", stage: "proposal", value: 60 }, // region 없음 → 지역 미상
    ],
  };
  const { mapRows, otherRows } = period.aggregate(ledger, { item: "all" }, PROV);
  assert.equal(mapRows.length, 0);
  assert.deepEqual(otherRows.map(r => r.label), ["부산", "지역 미상"]); // expected 내림차순
  for (const row of otherRows) assert.deepEqual(row.regions, [row.label]);
});

test("aggregate: jumpKey — account 연결 우선, lead 폴백, 둘 다 없으면 null", () => {
  const ledger = {
    leads: [
      { id: "l1", name: "리드A", companyId: "c1", region: "서울" },
      { id: "l2", name: "리드B", region: "서울" },
    ],
    companies: [{ id: "c1", name: "회사A" }],
    accounts: [{ id: "a1", companyId: "c1" }],
    deals: [
      { id: "d1", name: "SW", stage: "proposal", value: 100, companyId: "c1", leadId: "l1" },
      { id: "d2", name: "SW", stage: "proposal", value: 90, leadId: "l2" },
      { id: "d3", name: "직접 딜", stage: "proposal", value: 80 },
    ],
  };
  const { customers } = period.aggregate(ledger, { item: "all" }, PROV);
  const byName = new Map(customers.map(c => [c.name, c]));
  assert.equal(byName.get("회사A").jumpKey, "account:a1");
  assert.equal(byName.get("리드B").jumpKey, "lead:l2");
  assert.equal(byName.get("직접 딜").jumpKey, null);
});

test("aggregate: cutoff·range 필터는 dealTimestamp 기준으로 동작한다", () => {
  const ledger = { ...emptyLedger, deals: [
    { id: "d1", name: "SW", stage: "proposal", value: 100, closeAt: "2026-06-10T12:00:00+09:00" },
    { id: "d2", name: "SW", stage: "proposal", value: 50, activityAt: "2026-04-15T12:00:00+09:00" }, // closeAt 없음 → activityAt
    { id: "d3", name: "SW", stage: "proposal", value: 30 }, // 무날짜 — 기간 필터가 있으면 제외
  ] };
  assert.equal(period.aggregate(ledger, { item: "all" }, PROV).matchedDeals, 3); // 필터 없음 → 무날짜 포함
  const cutoff = new Date(2026, 4, 1).getTime(); // 5/1 로컬 — 6월 딜만 통과
  assert.equal(period.aggregate(ledger, { item: "all", cutoff }, PROV).matchedDeals, 1);
  const range = period.periodRange("month", "2026-04"); // 4월 — activityAt 폴백 딜만
  const ranged = period.aggregate(ledger, { item: "all", range }, PROV);
  assert.equal(ranged.matchedDeals, 1);
  assert.equal(ranged.otherRows[0]?.expected, 50);
});
