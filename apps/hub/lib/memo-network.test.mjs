import assert from "node:assert/strict";
import { test } from "node:test";
import { findRelatedMemos } from "./memo-network.js";

test("findRelatedMemos returns empty array on empty inputs", () => {
  assert.deepEqual(findRelatedMemos(null, []), []);
  assert.deepEqual(findRelatedMemos({ id: "1" }, []), []);
  assert.deepEqual(findRelatedMemos({ id: "1" }, null), []);
});

test("findRelatedMemos finds top related notes by tags, entities, and keywords", () => {
  const current = {
    id: "memo-current",
    title: "2026 하반기 마케팅 전략 수립",
    body: "인스타그램 릴스와 스레드 중심 채널 확장. 예산 책정 필요.",
    note_meta: {
      tags: ["마케팅", "릴리즈"],
      detectedEntities: {
        projects: ["Moonlight"],
        peopleOrCompanies: [],
      },
    },
  };

  const pool = [
    {
      id: "memo-1",
      title: "인스타그램 릴스 제작 가이드",
      body: "릴스 콘텐츠 포맷 및 숏폼 템플릿 정리",
      note_meta: {
        tags: ["마케팅"],
        detectedEntities: { projects: ["Moonlight"] },
      },
      occurred_at: "2026-09-10T10:00:00Z",
    },
    {
      id: "memo-2",
      title: "서버 DB 마이그레이션 점검",
      body: "PostgreSQL 인덱스 성능 최적화",
      note_meta: { tags: ["인프라", "DB"] },
      occurred_at: "2026-09-12T10:00:00Z",
    },
    {
      id: "memo-3",
      title: "상반기 마케팅 회고 및 성과",
      body: "스레드 유입 채널 결과 분석 및 예산 비교",
      note_meta: { tags: ["마케팅", "회고"] },
      occurred_at: "2026-08-30T10:00:00Z",
    },
    {
      id: "memo-current", // should be excluded
      title: "2026 하반기 마케팅 전략 수립",
      body: "인스타그램 릴스와 스레드 중심 채널 확장",
    },
  ];

  const results = findRelatedMemos(current, pool, { limit: 2 });
  assert.equal(results.length, 2);
  // memo-1 shares tag "마케팅" (+3) and project "Moonlight" (+2.5) and keywords
  assert.equal(results[0].id, "memo-1");
  assert.ok(results[0].score > 5.0);
  assert.ok(results[0].reasons.some((r) => r.includes("마케팅")));

  // memo-3 shares tag "마케팅" and keyword "스레드", "예산"
  assert.equal(results[1].id, "memo-3");

  // memo-2 (DB) should not be included
  assert.ok(!results.some((r) => r.id === "memo-2"));
  // current memo should not be in results
  assert.ok(!results.some((r) => r.id === "memo-current"));
});
