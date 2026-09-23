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

test("unsupported business candidates cannot acquire evidence from fallback text or an unknown record ID", () => {
  const records = [{ id: "source-record", body: "반복 작업을 줄이고 싶다고 말했다." }];
  for (const evidenceQuotes of [
    [],
    [{ journalId: "missing-record", quote: records[0].body }],
    [{ journalId: "source-record", quote: "유료 컨설팅을 구매하겠다고 확약했다." }],
  ]) {
    const result = processAndVerifyPatternOutput(JSON.stringify({ candidates: [{
      title: "유료 해결 후보", observation: "구매 확약", evidenceQuotes,
    }] }), records, "general");
    assert.deepEqual(result.patterns, []);
  }
});

test("executePatternAnalysis supports weekly_synthesis goal and up to 25 records", async () => {
  const records = Array.from({ length: 15 }, (_, i) => ({
    id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
    title: `주간 업무 메모 ${i + 1}`,
    body: `프로젝트 알파 관련 진행 중. ${i % 2 === 0 ? "후속 조치로 파트너사 미팅 필요" : "정체 이슈 발생"}`,
    occurredAt: "2026-09-20T10:00:00Z",
  }));

  const fakeGenerator = async ({ prompt, systemInstruction }) => {
    assert.match(systemInstruction, /지난 7일간의 운영 및 메모 전체를 종합하여/);
    assert.match(prompt, /기록 15/);
    return {
      ok: true,
      text: JSON.stringify({
        candidates: [
          {
            title: "프로젝트 알파 파트너십 지연 패턴",
            observation: "후속 조치로 파트너사 미팅 필요 언급이 반복됨",
            interpretation: "의사결정권자 일정 조율 난항으로 진행 정체",
            actionableGuidance: "파트너사에 일정 재조율 제안 메일 발송",
            suggestedTarget: "task",
            evidenceQuotes: [
              {
                journalId: records[0].id,
                quote: "후속 조치로 파트너사 미팅 필요",
              },
            ],
          },
        ],
      }),
    };
  };

  const result = await executePatternAnalysis(
    {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      requestId: "44444444-4444-4444-8444-444444444444",
      goal: "weekly_synthesis",
      records,
    },
    { generate: fakeGenerator }
  );

  assert.equal(result.status, "succeeded");
  assert.equal(result.patterns.length, 1);
  assert.equal(result.patterns[0].kind, "weekly_synthesis");
  assert.equal(result.recordCount, 15);
});
