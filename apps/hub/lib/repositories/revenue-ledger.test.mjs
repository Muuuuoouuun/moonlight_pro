import assert from "node:assert/strict";
import { test } from "node:test";

import { mapDeal, mapLead } from "./revenue-ledger.js";

test("mapDeal reads back the next-meeting breadcrumb and rejects a non-object", () => {
  const breadcrumb = {
    eventId: "evt-1",
    summary: "갈무리학원 미팅",
    startAt: "2026-08-15T05:00:00.000Z",
    htmlLink: "https://calendar.google.com/event?eid=evt-1",
  };

  assert.deepEqual(
    mapDeal({ id: "deal-1", title: "갈무리 SW", meta: { next_meeting: breadcrumb } }, new Map()).nextMeeting,
    breadcrumb,
  );
  assert.equal(mapDeal({ id: "deal-2", title: "미예약", meta: {} }, new Map()).nextMeeting, null);
  // 과거 문자열 값이 남아 있어도 UI가 .startAt을 읽다 깨지지 않게 막는다.
  assert.equal(
    mapDeal({ id: "deal-3", title: "구형", meta: { next_meeting: "2026-08-15" } }, new Map()).nextMeeting,
    null,
  );
});

test("mapLead: meta.subjects 우선, enrichment 태그 흡수 폴백, 출처 구분", () => {
  // 운영자 정본(meta.subjects) — 미등재 키는 걸러진다
  const withMeta = mapLead(
    { id: "l1", name: "A학원", meta: { subjects: ["math", "bogus"], label_source: { subjects: "operator" } } },
    new Map(), new Map(),
  );
  assert.deepEqual(withMeta.subjects, ["math"]);
  assert.equal(withMeta.labelSource.subjects, "operator");

  // meta.subjects 부재 → 태그 흡수 폴백, 출처 derived
  const fromTags = mapLead(
    { id: "l2", name: "B학원", meta: { enrichment: { tags: ["subject:ai", "subject:math"] } } },
    new Map(), new Map(),
  );
  assert.deepEqual(fromTags.subjects, ["math", "coding"]);
  assert.equal(fromTags.labelSource.subjects, "derived");

  // 아무것도 없음 → 빈 배열 + null 출처 (마커 없이 — 렌더)
  const none = mapLead({ id: "l3", name: "C", meta: {} }, new Map(), new Map());
  assert.deepEqual(none.subjects, []);
  assert.equal(none.labelSource.subjects, null);
  assert.equal(none.labelSource.region, null);

  // region 출처는 명시된 label_source만 신뢰 (기존 51건 무출처 값은 plain 렌더)
  const searchedRegion = mapLead(
    { id: "l4", name: "D", meta: { region: "경기-안양", label_source: { region: "searched" } } },
    new Map(), new Map(),
  );
  assert.equal(searchedRegion.labelSource.region, "searched");
});
