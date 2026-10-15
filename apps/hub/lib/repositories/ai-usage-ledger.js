// AI 사용량 읽기 — ai_usage_log(0052)에서 이번 달·지난달(KST 달력 기준)의 모델별 호출 수·토큰 합계와
// 추정 비용을 만든다. 숫자 열만 읽는다(기록에는 애초에 프롬프트·응답이 없다).
// Hub read 봉투: Supabase 없음 → preview, 읽기 실패 → status:'error', 행 상한 도달 → partial.
import { eqFilter, fetchSupabaseRowsDetailed } from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { AI_PRICING_SOURCE, USD_KRW, estimateCallCostUsd, usdToKrw } from "@/lib/ai-pricing";

export const AI_USAGE_PAGE_SIZE = 1000;
export const AI_USAGE_MAX_PAGES = 10;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const COLUMNS = "id,occurred_at,model,prompt_tokens,output_tokens,thinking_tokens,total_tokens";

// KST month boundaries as UTC instants. Korea has no daylight saving, so +09:00 is fixed.
export function kstMonthWindows(now = new Date()) {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const start = (y, m) => new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
  const key = (date) => {
    const local = new Date(date.getTime() + KST_OFFSET_MS);
    return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const previousStart = start(year, month - 1);
  const currentStart = start(year, month);
  const nextStart = start(year, month + 1);
  return {
    previous: { key: key(previousStart), from: previousStart.toISOString(), to: currentStart.toISOString() },
    current: { key: key(currentStart), from: currentStart.toISOString(), to: nextStart.toISOString() },
  };
}

function count(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function emptyTotals() {
  return { calls: 0, promptTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, estimatedUsd: 0, unpricedCalls: 0 };
}

function addRow(totals, row, costUsd) {
  totals.calls += 1;
  totals.promptTokens += count(row.prompt_tokens);
  totals.outputTokens += count(row.output_tokens);
  totals.thinkingTokens += count(row.thinking_tokens);
  totals.totalTokens += count(row.total_tokens);
  if (costUsd === null) totals.unpricedCalls += 1;
  else totals.estimatedUsd += costUsd;
}

function finishTotals(totals) {
  const priced = totals.calls > totals.unpricedCalls;
  const estimatedUsd = priced ? Math.round(totals.estimatedUsd * 1e6) / 1e6 : null;
  return { ...totals, estimatedUsd, estimatedKrw: estimatedUsd === null ? null : usdToKrw(estimatedUsd) };
}

/** Pure aggregation: rows → { current, previous } month summaries with per-model breakdowns. */
export function summarizeAiUsage(rows, windows) {
  const months = { current: { totals: emptyTotals(), models: new Map() }, previous: { totals: emptyTotals(), models: new Map() } };
  for (const row of Array.isArray(rows) ? rows : []) {
    const at = typeof row?.occurred_at === "string" ? row.occurred_at : "";
    const time = Date.parse(at);
    if (!Number.isFinite(time)) continue;
    const slot = ["current", "previous"].find((name) => time >= Date.parse(windows[name].from) && time < Date.parse(windows[name].to));
    if (!slot) continue;
    const model = typeof row.model === "string" && row.model ? row.model : "unknown";
    const costUsd = estimateCallCostUsd({ model, promptTokens: count(row.prompt_tokens), outputTokens: count(row.output_tokens), thinkingTokens: count(row.thinking_tokens) });
    const month = months[slot];
    addRow(month.totals, row, costUsd);
    if (!month.models.has(model)) month.models.set(model, emptyTotals());
    addRow(month.models.get(model), row, costUsd);
  }
  const shape = (name) => ({
    key: windows[name].key,
    from: windows[name].from,
    to: windows[name].to,
    ...finishTotals(months[name].totals),
    models: [...months[name].models.entries()]
      .map(([model, totals]) => ({ model, priced: totals.unpricedCalls === 0, ...finishTotals(totals) }))
      .sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model)),
  });
  return { current: shape("current"), previous: shape("previous") };
}

export async function readAiUsage({
  now = new Date(),
  fetchRows = fetchSupabaseRowsDetailed,
  workspaceId = resolveDefaultWorkspaceId(),
} = {}) {
  const windows = kstMonthWindows(now);
  const meta = {
    scope: "moonlight-calls",
    pricing: { ...AI_PRICING_SOURCE, usdKrw: USD_KRW.rate, usdKrwCheckedAt: USD_KRW.checkedAt },
  };
  if (!workspaceId) return { status: "preview", source: "preview", ...meta };
  const rows = [];
  let truncated = true;
  for (let page = 0; page < AI_USAGE_MAX_PAGES; page += 1) {
    const answer = await fetchRows("ai_usage_log", {
      select: COLUMNS,
      filters: [
        ["workspace_id", eqFilter(workspaceId)],
        ["occurred_at", `gte.${windows.previous.from}`],
        ["occurred_at", `lt.${windows.current.to}`],
      ],
      order: "occurred_at.asc,id.asc",
      limit: AI_USAGE_PAGE_SIZE,
      offset: page * AI_USAGE_PAGE_SIZE,
      strictRows: true,
    });
    if (answer?.configured === false) return { status: "preview", source: "preview", ...meta };
    if (!Array.isArray(answer?.rows)) return { status: "error", source: "error", error: "ai-usage-read-failed", ...meta };
    rows.push(...answer.rows);
    if (answer.rows.length < AI_USAGE_PAGE_SIZE) { truncated = false; break; }
  }
  return {
    status: truncated ? "partial" : "live",
    source: "supabase",
    ...(truncated ? { partialReason: "row-limit" } : {}),
    ...meta,
    ...summarizeAiUsage(rows, windows),
  };
}
