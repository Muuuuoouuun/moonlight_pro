import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyQuoteInRecord,
  buildPatternSystemInstruction,
  buildPatternPrompt,
  processAndVerifyPatternOutput,
  executePatternAnalysis,
} from "./pattern-analysis.ts";

test("verifyQuoteInRecord accurately verifies verbatim quotes in body, title, enhancement", () => {
  const record = {
    id: "e43b1713-33cb-4f9e-a035-71fa28469e38",
    title: "상담에서 첫 주 세팅 질문",
    body: "학원 원장님이 초기 세팅 인력 부족을 강하게 우려하셨다. 특히 강사 교육 지원 여부를 물어보심.",
    enhancement: "도입 후 지원팀이 현장 방문을 해주는지 궁금해함",
  };

  // Body match
  const resBody = verifyQuoteInRecord("초기 세팅 인력 부족을 강하게 우려", record);
  assert.equal(resBody.verified, true);
  assert.equal(resBody.field, "body");

  // Title match
  const resTitle = verifyQuoteInRecord("첫 주 세팅 질문", record);
  assert.equal(resTitle.verified, true);
  assert.equal(resTitle.field, "title");

  // Enhancement match
  const resEnhancement = verifyQuoteInRecord("현장 방문을 해주는지 궁금해함", record);
  assert.equal(resEnhancement.verified, true);
  assert.equal(resEnhancement.field, "enhancement");

  // Non-existent (hallucinated) match
  const resFake = verifyQuoteInRecord("원장님이 계약을 바로 체결하겠다고 약속함", record);
  assert.equal(resFake.verified, false);

  // Too short
  assert.equal(verifyQuoteInRecord("초기", record).verified, false);
});

test("processAndVerifyPatternOutput filters out hallucinated quotes and preserves true quotes", () => {
  const records = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "가격 협상 상담",
      body: "월 비용 50만원은 부담스럽다고 하며 분납 가능 여부를 질문했다.",
      occurredAt: "2026-09-10T10:00:00Z",
    },
  ];

  const rawJson = JSON.stringify({
    candidates: [
      {
        title: "비용 분납 요구 패턴",
        observation: "고객이 일시납에 부담을 느끼고 분납을 문의함",
        interpretation: "예산 집행 시기 분산을 통한 도입 문턱 낮추기 필요",
        actionableGuidance: "3개월 분납 플랜 제안서 템플릿 전달",
        suggestedTarget: "deal",
        evidenceQuotes: [
          {
            journalId: "11111111-1111-4111-8111-111111111111",
            quote: "월 비용 50만원은 부담스럽다고 하며 분납 가능 여부를 질문",
          },
          {
            journalId: "11111111-1111-4111-8111-111111111111",
            quote: "완전히 날조된 가짜 인용문입니다",
          },
        ],
      },
    ],
  });

  const { patterns, unverifiedQuotesFiltered } = processAndVerifyPatternOutput(
    rawJson,
    records,
    "sales_insight"
  );

  assert.equal(patterns.length, 1);
  assert.equal(unverifiedQuotesFiltered, 1); // 1 fake quote filtered out!
  assert.equal(patterns[0].evidenceQuotes.length, 1);
  assert.equal(
    patterns[0].evidenceQuotes[0].quote,
    "월 비용 50만원은 부담스럽다고 하며 분납 가능 여부를 질문"
  );
  assert.equal(patterns[0].evidenceQuotes[0].journalId, "11111111-1111-4111-8111-111111111111");
});

test("executePatternAnalysis validates bounds and produces structured results", async () => {
  const records = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Threads 훅 테스트 메모",
      body: "실제 실패 사례를 첫 줄에 적었을 때 북마크 수가 3배 증가했다.",
      occurredAt: "2026-09-12T09:00:00Z",
    },
  ];

  const fakeGenerator = async () => ({
    ok: true,
    text: JSON.stringify({
      candidates: [
        {
          title: "실패 고백형 훅 고성과 패턴",
          observation: "실패 사례를 앞세운 포스팅의 저장률이 높음",
          interpretation: "독자는 정형화된 성공담보다 취약성을 드러낸 시행착오에 공감함",
          actionableGuidance: "지난주 장애 회고를 소재로 Threads 1번 슬롯 초안 작성",
          suggestedTarget: "content",
          evidenceQuotes: [
            {
              journalId: "22222222-2222-4222-8222-222222222222",
              quote: "실제 실패 사례를 첫 줄에 적었을 때",
            },
          ],
        },
      ],
    }),
  });

  const result = await executePatternAnalysis(
    {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      requestId: "33333333-3333-4333-8333-333333333333",
      goal: "content_hook",
      records,
    },
    { generate: fakeGenerator }
  );

  assert.equal(result.status, "succeeded");
  assert.equal(result.patterns.length, 1);
  assert.equal(result.patterns[0].suggestedTarget, "content");
  assert.equal(result.patterns[0].evidenceQuotes.length, 1);
  assert.equal(result.unverifiedQuotesFiltered, 0);
});

test("executePatternAnalysis rejects invalid UUID or empty records", async () => {
  const result = await executePatternAnalysis(
    {
      workspaceId: "not-a-uuid",
      requestId: "33333333-3333-4333-8333-333333333333",
      goal: "general",
      records: [],
    },
    { generate: async () => ({ ok: true, text: "" }) }
  );

  assert.equal(result.status, "invalid-input");
});
