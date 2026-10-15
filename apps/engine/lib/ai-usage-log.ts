// AI 사용량 기록 — Gemini 호출 한 번의 토큰 수를 ai_usage_log에 남긴다(0052).
// 숫자·출처 키·모델명만 저장하고 프롬프트·응답·고객 정보는 받지도 않는다.
// 기록은 AI 응답을 절대 막지 않는다: 기다리지 않고(fire-and-forget), 짧은 타임아웃, 모든 오류를 삼킨다.
// Hub 쪽 짝은 apps/hub/lib/ai-usage-log.js — 같은 행 모양을 유지한다.
import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@com-moon/supabase-rest";

export const AI_USAGE_TABLE = "ai_usage_log";
export const AI_USAGE_WRITE_TIMEOUT_MS = 3_000;
const SURFACE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MODEL = /^[a-zA-Z0-9._:/@-]{1,120}$/;
const MAX_COUNT = 2_147_483_647;

export interface AiUsageInput {
  surface?: string | null;
  model?: string | null;
  usageMetadata?: unknown;
}

type Insert = (table: string, row: Record<string, unknown>, options: { timeoutMs: number }) => Promise<unknown>;

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT ? value : 0;
}

// Returns the row to insert, or null when there is nothing billable to record.
export function buildAiUsageRow(input: AiUsageInput, workspaceId: string) {
  const usage = input?.usageMetadata;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const prompt = count(record.promptTokenCount);
  const output = count(record.candidatesTokenCount);
  const thinking = count(record.thoughtsTokenCount);
  const total = count(record.totalTokenCount) || Math.min(prompt + output + thinking, MAX_COUNT);
  if (!prompt && !output && !thinking && !total) return null;
  const surface = typeof input.surface === "string" && SURFACE.test(input.surface) ? input.surface : "unknown";
  const model = typeof input.model === "string" && MODEL.test(input.model.trim()) ? input.model.trim() : "unknown";
  return {
    workspace_id: workspaceId,
    surface,
    model,
    prompt_tokens: prompt,
    output_tokens: output,
    thinking_tokens: thinking,
    total_tokens: total,
  };
}

// Never throws and never needs to be awaited. The returned promise exists for tests.
export function recordAiUsage(
  input: AiUsageInput,
  deps: { insert?: Insert; workspaceId?: string | null; configured?: boolean } = {},
): Promise<unknown> | null {
  try {
    const configured = deps.configured ?? Boolean(resolveSupabaseConfig());
    const workspaceId = deps.workspaceId === undefined ? resolveDefaultWorkspaceId() : deps.workspaceId;
    if (!configured || !workspaceId) return null;
    const row = buildAiUsageRow(input, workspaceId);
    if (!row) return null;
    const insert: Insert = deps.insert ?? ((table, value, options) => insertSupabaseRecord(table, value, options));
    return Promise.resolve()
      .then(() => insert(AI_USAGE_TABLE, row, { timeoutMs: AI_USAGE_WRITE_TIMEOUT_MS }))
      .catch(() => null);
  } catch {
    return null;
  }
}
