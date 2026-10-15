// AI 사용량 기록(Hub 쪽) — Hub가 Gemini를 직접 부르는 세 경로(멀티모달 인테이크·회의 분석·명함 인식)가
// 호출 한 번의 토큰 수를 ai_usage_log에 남긴다(0052). Engine 쪽 짝은 apps/engine/lib/ai-usage-log.ts이고
// 같은 행 모양을 유지한다. 숫자·출처 키·모델명만 저장하며 프롬프트·응답·고객 정보는 받지도 않는다.
// 기록은 AI 응답을 절대 막지 않는다: 기다리지 않고(fire-and-forget), 짧은 타임아웃, 모든 오류를 삼킨다.
import { insertSupabaseRecord, resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@com-moon/supabase-rest";

export const AI_USAGE_TABLE = "ai_usage_log";
export const AI_USAGE_WRITE_TIMEOUT_MS = 3_000;
const SURFACE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MODEL = /^[a-zA-Z0-9._:/@-]{1,120}$/;
const MAX_COUNT = 2_147_483_647;

function count(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT ? value : 0;
}

/** Row to insert, or null when there is nothing billable to record. */
export function buildAiUsageRow(input, workspaceId) {
  const usage = input?.usageMetadata;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const prompt = count(usage.promptTokenCount);
  const output = count(usage.candidatesTokenCount);
  const thinking = count(usage.thoughtsTokenCount);
  const total = count(usage.totalTokenCount) || Math.min(prompt + output + thinking, MAX_COUNT);
  if (!prompt && !output && !thinking && !total) return null;
  const model = typeof input.model === "string" ? input.model.trim() : "";
  return {
    workspace_id: workspaceId,
    surface: typeof input.surface === "string" && SURFACE.test(input.surface) ? input.surface : "unknown",
    model: MODEL.test(model) ? model : "unknown",
    prompt_tokens: prompt,
    output_tokens: output,
    thinking_tokens: thinking,
    total_tokens: total,
  };
}

/** Never throws and never needs to be awaited. The returned promise exists for tests. */
export function recordAiUsage(input, deps = {}) {
  try {
    const configured = deps.configured ?? Boolean(resolveSupabaseConfig());
    const workspaceId = deps.workspaceId === undefined ? resolveDefaultWorkspaceId() : deps.workspaceId;
    if (!configured || !workspaceId) return null;
    const row = buildAiUsageRow(input, workspaceId);
    if (!row) return null;
    const insert = deps.insert || insertSupabaseRecord;
    return Promise.resolve()
      .then(() => insert(AI_USAGE_TABLE, row, { timeoutMs: AI_USAGE_WRITE_TIMEOUT_MS }))
      .catch(() => null);
  } catch {
    return null;
  }
}
