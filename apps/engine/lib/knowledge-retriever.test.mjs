import test from "node:test";
import assert from "node:assert/strict";
import {
  extractKeywords,
  extractAttributedSnippet,
  scoreRelevance,
  retrieveKnowledge,
} from "./knowledge-retriever.ts";

test("extractKeywords extracts non-stop words in Korean and English", () => {
  const kws = extractKeywords("학원 도입 초기 세팅 인력 부족과 pricing 이슈");
  assert.ok(kws.includes("학원"));
  assert.ok(kws.includes("도입"));
  assert.ok(kws.includes("초기"));
  assert.ok(kws.includes("세팅"));
  assert.ok(kws.includes("인력"));
  assert.ok(kws.includes("부족"));
  assert.ok(kws.includes("pricing"));
  assert.ok(kws.includes("이슈"));
  // Stop word '과' should be excluded
  assert.ok(!kws.includes("과"));
});

test("extractAttributedSnippet creates context window centered around match", () => {
  const longText =
    "과거 여러 미팅을 진행하면서 많은 원장님들을 만났다. 그 중에서 특히 초기 세팅 인력 부족을 가장 심각하게 호소하셨다. 그래서 지원 프로세스를 개편했다.";
  const snippet = extractAttributedSnippet(longText, ["인력", "부족"]);
  assert.ok(snippet.includes("초기 세팅 인력"));
  assert.ok(snippet.includes("…"));
});

test("scoreRelevance awards exact phrase match and recency boost", () => {
  const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
  const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days ago

  const rec1 = {
    title: "세팅 지원 관련 상담",
    body: "학원 도입 시 첫 주 세팅 인력 부족이 핵심 장벽임",
    occurredAt: recentDate,
  };

  const rec2 = {
    title: "기타 일반 미팅",
    body: "인력 관련 논의 조금 있었음",
    occurredAt: oldDate,
  };

  const score1 = scoreRelevance(rec1, "세팅 인력 부족", ["세팅", "인력", "부족"]);
  const score2 = scoreRelevance(rec2, "세팅 인력 부족", ["세팅", "인력", "부족"]);

  assert.ok(score1.score > score2.score);
  assert.ok(score1.matchedKeywords.length >= 3);
});

test("retrieveKnowledge queries journal and outcomes, returns ranked results", async () => {
  const fakeJournalRows = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      title: "도입 세팅 장벽 상담",
      body: "학원 원장님이 초기 세팅 인력 부족을 가장 심각하게 호소하셨다.",
      occurred_at: new Date().toISOString(),
      entry_kind: "note",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      title: "다른 주제 메모",
      body: "개인 세무 및 회계 처리 관련 확인 사항.",
      occurred_at: new Date().toISOString(),
      entry_kind: "note",
    },
  ];

  const fakeOutcomeRows = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      kind: "meeting",
      summary: "원장님 방문 미팅. 세팅 인력 관련으로 1주 무료 지원 제안함.",
      reaction: "positive",
      next_action: "체크리스트 발송",
      created_at: new Date().toISOString(),
    },
  ];

  const fakeReadTable = async (table) => {
    if (table === "journal_entries") return { ok: true, rows: fakeJournalRows, data: fakeJournalRows };
    if (table === "contact_outcomes") return { ok: true, rows: fakeOutcomeRows, data: fakeOutcomeRows };
    return { ok: true, rows: [], data: [] };
  };

  const result = await retrieveKnowledge(
    {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      query: "세팅 인력 부족",
      filters: { limit: 5 },
    },
    { readTable: fakeReadTable }
  );

  assert.equal(result.status, "live");
  assert.ok(result.items.length >= 2);
  // The first item should be the top match
  assert.equal(result.items[0].id, "11111111-1111-4111-8111-111111111111");
  assert.ok(result.items[0].snippet.includes("인력 부족"));
});
