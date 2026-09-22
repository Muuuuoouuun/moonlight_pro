import { createHash } from "node:crypto";
import { buildBusinessOpportunityCatchInstruction } from "./business-opportunity-catch.ts";

export type PatternGoal = "sales_insight" | "content_hook" | "operational_rule" | "decision_rationale" | "general" | "weekly_synthesis";

export interface EvidenceQuote {
  journalId: string;
  quote: string;
  occurredAt?: string;
  field?: "title" | "body" | "enhancement";
}

export interface PatternCandidate {
  id: string;
  kind: PatternGoal;
  title: string;
  observation: string;
  interpretation: string;
  actionableGuidance: string;
  suggestedTarget: "task" | "content" | "deal" | "rule";
  evidenceQuotes: EvidenceQuote[];
}

export interface InputRecord {
  id: string;
  title?: string;
  body: string;
  occurredAt?: string;
  enhancement?: string;
}

export interface PatternAnalysisInput {
  workspaceId: string;
  requestId: string;
  goal: PatternGoal;
  records: InputRecord[];
  question?: string;
}

export interface PatternAnalysisResult {
  status: "succeeded" | "duplicate" | "invalid-input" | "preview" | "unknown" | "failed";
  requestId: string;
  goal: PatternGoal;
  recordCount: number;
  patterns: PatternCandidate[];
  unverifiedQuotesFiltered: number;
  error?: string;
}

const MAX_TOTAL_CHARS = 32000;
const MAX_RECORDS = 25;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val: unknown): val is string {
  return typeof val === "string" && UUID_REGEX.test(val);
}

/**
 * Verifies whether a candidate quote genuinely appears in the source record text.
 * Prevents hallucinated quotes from being attributed to records.
 */
export function verifyQuoteInRecord(
  quote: string,
  record: InputRecord
): { verified: boolean; field?: "title" | "body" | "enhancement"; cleanedQuote?: string } {
  if (!quote || typeof quote !== "string") return { verified: false };
  const trimmed = quote.trim();
  if (trimmed.length < 3) return { verified: false };

  // Normalize whitespace for matching
  const normQuote = trimmed.replace(/\s+/g, " ");

  if (record.body) {
    const normBody = record.body.replace(/\s+/g, " ");
    if (normBody.includes(normQuote)) {
      return { verified: true, field: "body", cleanedQuote: trimmed };
    }
  }

  if (record.title) {
    const normTitle = record.title.replace(/\s+/g, " ");
    if (normTitle.includes(normQuote)) {
      return { verified: true, field: "title", cleanedQuote: trimmed };
    }
  }

  if (record.enhancement) {
    const normEnhancement = record.enhancement.replace(/\s+/g, " ");
    if (normEnhancement.includes(normQuote)) {
      return { verified: true, field: "enhancement", cleanedQuote: trimmed };
    }
  }

  return { verified: false };
}

/**
 * Builds the structured system instruction for the LLM based on the goal.
 */
export function buildPatternSystemInstruction(goal: PatternGoal, question?: string): string {
  const goalDescriptions: Record<PatternGoal, string> = {
    sales_insight: "고객 상담 메모에서 반복되는 망설임/저항 이유, 결제 의사결정 신호, 효과적인 응대 논리를 도출합니다.",
    content_hook: "메모와 일지에서 독자의 관심을 끌 수 있는 구체적인 스토리텔링 에피소드, 인사이트, 훅(Hook)을 도출합니다.",
    operational_rule: "작업 및 운영 메모에서 반복되는 병목, 실수 원인, 이를 방지하기 위한 구체적인 체크리스트 규칙을 도출합니다.",
    decision_rationale: "프로젝트 및 전략 메모에서 특정 결정을 내렸던 배경, 대안 기각 사유, 향후 재검토 조건을 도출합니다.",
    general: "주어진 기록들에서 반복되는 공통 패턴, 미해결 질문, 다음 구체적 행동 후보를 도출합니다.",
    weekly_synthesis: "지난 7일간의 운영 및 메모 전체를 종합하여, 반복되는 핵심 프로젝트/지식망 연결 테마, 후속 조치가 지연된 미결 과제(Open Loops), 다음 주 즉시 착수할 고레버리지 실행 과제를 도출합니다.",
  };

  return `당신은 Moonlight 1인 운영체제의 지식 및 패턴 분석 엔진(Pattern Analyzer)입니다.
목적: ${goalDescriptions[goal] || goalDescriptions.general}
${question ? `운영자의 구체적 분석 질문: "${question}"` : ""}

[불변식 규칙 - 반드시 준수]:
1. [관찰(Observation)]과 [해석(Interpretation)]을 엄격히 구분하십시오. 실제로 기록된 사실은 관찰에, AI의 추론은 해석에 배치합니다.
2. [정직한 근거 인용 (Honest Quotes)]: 근거가 되는 원문 문장은 반드시 제공된 기록의 본문에서 '글자 그대로(Verbatim)' 인용해야 합니다. 절대로 없는 문장을 지어내거나 미화하지 마십시오.
3. [단 1가지 실행 가능한 가이드(Actionable Guidance)]: 막연한 조언 대신, 바로 할 일(Task)로 등록하거나 콘텐츠 초안으로 쓸 수 있는 명확한 다음 행동을 1개 제시하십시오.
4. 출력 형식은 반드시 지정된 JSON 포맷을 유지하십시오.
${buildBusinessOpportunityCatchInstruction({ surface: "pattern", mode: goal })}`;
}

/**
 * Builds prompt with bounded record snapshots.
 */
export function buildPatternPrompt(records: InputRecord[]): string {
  const formattedRecords = records.map((r, i) => {
    return `[기록 ${i + 1}] ID: ${r.id} | 날짜: ${r.occurredAt || "날짜 미상"}
제목: ${r.title || "(제목 없음)"}
${r.enhancement ? `한 줄 보강: ${r.enhancement}\n` : ""}본문:
${r.body}
----------------------------------------`;
  }).join("\n\n");

  return `아래 제공된 ${records.length}건의 기록을 분석하여 최대 3개의 패턴 후보(candidates)를 JSON으로 반환하십시오.

기록 목록:
${formattedRecords}

[반드시 아래 JSON 형식으로만 응답하십시오]:
{
  "candidates": [
    {
      "title": "패턴 제목 (50자 이내)",
      "observation": "입력 기록들에서 관찰된 객관적 사실",
      "interpretation": "관찰을 바탕으로 한 분석적 해석 및 가설",
      "actionableGuidance": "기록에 즉시 등록할 수 있는 구체적 실행 행동 (태스크/콘텐츠 기획)",
      "suggestedTarget": "task", // "task" | "content" | "deal" | "rule"
      "evidenceQuotes": [
        {
          "journalId": "해당 문장이 위치한 원본 기록 ID",
          "quote": "원문에서 글자 그대로 발췌한 문장"
        }
      ]
    }
  ]
}`;
}

/**
 * Parses and verifies LLM output against the ground truth input records.
 */
export function processAndVerifyPatternOutput(
  rawJsonText: string,
  records: InputRecord[],
  goal: PatternGoal
): { patterns: PatternCandidate[]; unverifiedQuotesFiltered: number } {
  let parsed: any;
  try {
    const cleaned = rawJsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { patterns: [], unverifiedQuotesFiltered: 0 };
  }

  const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const recordsMap = new Map(records.map(r => [r.id, r]));
  let unverifiedQuotesFiltered = 0;

  const patterns: PatternCandidate[] = [];

  for (let idx = 0; idx < rawCandidates.length && idx < 5; idx++) {
    const c = rawCandidates[idx];
    if (!c || typeof c !== "object") continue;

    const title = typeof c.title === "string" ? c.title.trim().slice(0, 100) : `패턴 후보 ${idx + 1}`;
    const observation = typeof c.observation === "string" ? c.observation.trim() : "";
    const interpretation = typeof c.interpretation === "string" ? c.interpretation.trim() : "";
    const actionableGuidance = typeof c.actionableGuidance === "string" ? c.actionableGuidance.trim() : "";
    const suggestedTarget = ["task", "content", "deal", "rule"].includes(c.suggestedTarget)
      ? c.suggestedTarget
      : "task";

    const verifiedQuotes: EvidenceQuote[] = [];
    if (Array.isArray(c.evidenceQuotes)) {
      for (const eq of c.evidenceQuotes) {
        if (!eq || typeof eq !== "object" || !eq.quote || typeof eq.quote !== "string") continue;
        const targetRecord = recordsMap.get(eq.journalId);
        if (!targetRecord) { unverifiedQuotesFiltered++; continue; }

        const check = verifyQuoteInRecord(eq.quote, targetRecord);
        if (check.verified && check.cleanedQuote) {
          verifiedQuotes.push({
            journalId: targetRecord.id,
            quote: check.cleanedQuote,
            occurredAt: targetRecord.occurredAt,
            field: check.field,
          });
        } else {
          unverifiedQuotesFiltered++;
        }
      }
    }

    // An unrelated first-record excerpt cannot substantiate a generated claim.
    // Exact quote matching establishes provenance, not semantic correctness.
    if (verifiedQuotes.length === 0) continue;

    patterns.push({
      id: `pattern-${idx + 1}-${Date.now().toString(36)}`,
      kind: goal,
      title,
      observation,
      interpretation,
      actionableGuidance,
      suggestedTarget,
      evidenceQuotes: verifiedQuotes,
    });
  }

  return { patterns, unverifiedQuotesFiltered };
}

/**
 * Main execution handler for pattern analysis.
 */
export async function executePatternAnalysis(
  input: PatternAnalysisInput,
  deps: {
    generate: (input: { prompt: string; systemInstruction: string; maxOutputTokens: number }) => Promise<{
      ok: boolean;
      text?: string;
      reason?: string;
    }>;
  }
): Promise<PatternAnalysisResult> {
  if (!isUuid(input.workspaceId) || !isUuid(input.requestId)) {
    return {
      status: "invalid-input",
      requestId: input.requestId || "",
      goal: input.goal || "general",
      recordCount: 0,
      patterns: [],
      unverifiedQuotesFiltered: 0,
      error: "invalid-uuid-params",
    };
  }

  if (!Array.isArray(input.records) || input.records.length === 0 || input.records.length > MAX_RECORDS) {
    return {
      status: "invalid-input",
      requestId: input.requestId,
      goal: input.goal || "general",
      recordCount: input.records?.length || 0,
      patterns: [],
      unverifiedQuotesFiltered: 0,
      error: "record-count-out-of-bounds",
    };
  }

  let totalChars = 0;
  for (const r of input.records) {
    totalChars += (r.title?.length || 0) + (r.body?.length || 0) + (r.enhancement?.length || 0);
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return {
      status: "invalid-input",
      requestId: input.requestId,
      goal: input.goal,
      recordCount: input.records.length,
      patterns: [],
      unverifiedQuotesFiltered: 0,
      error: "payload-too-large",
    };
  }

  const systemInstruction = buildPatternSystemInstruction(input.goal, input.question);
  const prompt = buildPatternPrompt(input.records);

  try {
    const genResult = await deps.generate({
      prompt,
      systemInstruction,
      maxOutputTokens: 2048,
    });

    if (!genResult.ok || !genResult.text) {
      return {
        status: "failed",
        requestId: input.requestId,
        goal: input.goal,
        recordCount: input.records.length,
        patterns: [],
        unverifiedQuotesFiltered: 0,
        error: genResult.reason || "generation-failed",
      };
    }

    const { patterns, unverifiedQuotesFiltered } = processAndVerifyPatternOutput(
      genResult.text,
      input.records,
      input.goal
    );

    return {
      status: "succeeded",
      requestId: input.requestId,
      goal: input.goal,
      recordCount: input.records.length,
      patterns,
      unverifiedQuotesFiltered,
    };
  } catch (err: any) {
    return {
      status: "failed",
      requestId: input.requestId,
      goal: input.goal,
      recordCount: input.records.length,
      patterns: [],
      unverifiedQuotesFiltered: 0,
      error: err.message || "unexpected-error",
    };
  }
}
