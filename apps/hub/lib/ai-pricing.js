// AI 추정 비용 — 모델별 단가 표 하나. 화면은 이 값을 "추정"으로만 보여 준다(청구서가 아니다).
//
// 단가 출처: Google Gemini API 가격표, Paid tier · Standard, USD / 1M 토큰
//   https://ai.google.dev/gemini-api/docs/pricing  (기존 표 2026-09-26, 3.6 Flash만 2026-10-23 확인)
// - 출력 단가는 생각(thinking) 토큰을 포함한다 → 답변 토큰 + 생각 토큰을 출력 단가로 계산한다.
// - Pro 계열은 호출 한 번의 프롬프트가 20만 토큰을 넘으면 더 비싼 구간이다 → 호출(행) 단위로 계산한다.
// - 오디오 입력은 일부 모델에서 더 비싸지만 기록에 입력 형식이 없어 텍스트·이미지 단가로 계산한다(과소 추정 가능).
// - 컨텍스트 캐시 할인·무료 한도는 반영하지 않는다.
// 표에 없는 모델은 비용을 계산하지 않는다(화면: "단가 미확인"). 재확인한 모델의 날짜만 갱신한다.
export const AI_PRICING_SOURCE = {
  url: "https://ai.google.dev/gemini-api/docs/pricing",
  checkedAt: "2026-09-26",
  modelCheckedAt: { "gemini-3.6-flash": "2026-10-23" },
};

const LONG_PROMPT_TOKENS = 200_000;
// Google lists calendar dates without a timezone. Estimates use UTC, not the operator's KST month.
const FLASH_36_PROMOTION_END = Date.parse("2027-01-01T00:00:00Z");
const FLASH_36_PROMOTIONAL_PRICE = Object.freeze({ inputUsd: 0.75, outputUsd: 3.75 });

// inputUsd / outputUsd: USD per 1M tokens. long*: prompts over LONG_PROMPT_TOKENS.
export const AI_MODEL_PRICING = Object.freeze({
  "gemini-3.6-flash": { inputUsd: 1.5, outputUsd: 7.5 },
  // Preserve historical 3.5 estimates; an explicit legacy alias is not repriced as 3.6.
  "gemini-3.5-flash": { inputUsd: 1.5, outputUsd: 9 },
  "gemini-3-flash-preview": { inputUsd: 0.5, outputUsd: 3 },
  "gemini-3.1-pro-preview": { inputUsd: 2, outputUsd: 12, longInputUsd: 4, longOutputUsd: 18 },
  "gemini-2.5-flash": { inputUsd: 0.3, outputUsd: 2.5 },
  "gemini-2.5-pro": { inputUsd: 1.25, outputUsd: 10, longInputUsd: 2.5, longOutputUsd: 15 },
});

// 원화 환산은 참고용이다. 연준 H.10의 최신 공표 관측값이며 실시간 환율·과거 실제 결제액이 아니다.
export const USD_KRW = Object.freeze({
  rate: 1334.03,
  observedAt: "2026-10-16",
  releasedAt: "2026-10-19",
  checkedAt: "2026-10-23",
  source: "https://www.federalreserve.gov/releases/h10/current/",
});

function normalizeModel(model) {
  return typeof model === "string" ? model.trim().replace(/^models\//, "").toLowerCase() : "";
}

export function modelPricing(model, at = new Date()) {
  const name = normalizeModel(model);
  const price = AI_MODEL_PRICING[name] || null;
  if (name !== "gemini-3.6-flash") return price;
  const time = at instanceof Date ? at.getTime() : typeof at === "string" ? Date.parse(at) : NaN;
  // A stored record without a valid instant must not silently inherit today's promotional rate.
  if (!Number.isFinite(time)) return null;
  return time < FLASH_36_PROMOTION_END ? FLASH_36_PROMOTIONAL_PRICE : price;
}

function tokens(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/**
 * Estimated USD for one call, or null when the model's price is unknown.
 * Omit at only for a current call; stored records pass their original instant (null if unknown).
 * @param {{model: string, promptTokens?: number, outputTokens?: number, thinkingTokens?: number, at?: string | Date | null}} call
 */
export function estimateCallCostUsd({ model, promptTokens, outputTokens, thinkingTokens, at } = {}) {
  const price = modelPricing(model, at);
  if (!price) return null;
  const prompt = tokens(promptTokens);
  const output = tokens(outputTokens) + tokens(thinkingTokens);
  const long = prompt > LONG_PROMPT_TOKENS && Number.isFinite(price.longInputUsd);
  const inputUsd = long ? price.longInputUsd : price.inputUsd;
  const outputUsd = long ? price.longOutputUsd : price.outputUsd;
  return (prompt * inputUsd + output * outputUsd) / 1_000_000;
}

export function usdToKrw(usd) {
  return Number.isFinite(usd) ? Math.round(usd * USD_KRW.rate) : null;
}
