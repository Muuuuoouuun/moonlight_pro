// AI 추정 비용 — 모델별 단가 표 하나. 화면은 이 값을 "추정"으로만 보여 준다(청구서가 아니다).
//
// 단가 출처: Google Gemini API 가격표, Paid tier · Standard, USD / 1M 토큰
//   https://ai.google.dev/gemini-api/docs/pricing  (2026-09-26 확인)
// - 출력 단가는 생각(thinking) 토큰을 포함한다 → 답변 토큰 + 생각 토큰을 출력 단가로 계산한다.
// - Pro 계열은 호출 한 번의 프롬프트가 20만 토큰을 넘으면 더 비싼 구간이다 → 호출(행) 단위로 계산한다.
// - 오디오 입력은 일부 모델에서 더 비싸지만 기록에 입력 형식이 없어 텍스트·이미지 단가로 계산한다(과소 추정 가능).
// - 컨텍스트 캐시 할인·무료 한도는 반영하지 않는다.
// 표에 없는 모델은 비용을 계산하지 않는다(화면: "단가 미확인"). 단가를 바꾸면 확인 날짜도 함께 바꾼다.
export const AI_PRICING_SOURCE = {
  url: "https://ai.google.dev/gemini-api/docs/pricing",
  checkedAt: "2026-09-26",
};

const LONG_PROMPT_TOKENS = 200_000;

// inputUsd / outputUsd: USD per 1M tokens. long*: prompts over LONG_PROMPT_TOKENS.
export const AI_MODEL_PRICING = Object.freeze({
  "gemini-3.5-flash": { inputUsd: 1.5, outputUsd: 9 },
  "gemini-3-flash-preview": { inputUsd: 0.5, outputUsd: 3 },
  "gemini-3.1-pro-preview": { inputUsd: 2, outputUsd: 12, longInputUsd: 4, longOutputUsd: 18 },
  "gemini-2.5-flash": { inputUsd: 0.3, outputUsd: 2.5 },
  "gemini-2.5-pro": { inputUsd: 1.25, outputUsd: 10, longInputUsd: 2.5, longOutputUsd: 15 },
});

// 원화 환산은 참고용 근사치다. 출처: tradingeconomics.com/south-korea/currency 의 2026-09-24~25 USD/KRW
// 1,354~1,370 구간을 반올림(2026-09-26 확인). 환율이 크게 움직이면 이 상수와 날짜를 함께 바꾼다.
export const USD_KRW = Object.freeze({ rate: 1360, checkedAt: "2026-09-26" });

function normalizeModel(model) {
  return typeof model === "string" ? model.trim().replace(/^models\//, "").toLowerCase() : "";
}

export function modelPricing(model) {
  return AI_MODEL_PRICING[normalizeModel(model)] || null;
}

function tokens(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/**
 * Estimated USD for one call, or null when the model's price is unknown.
 * @param {{model: string, promptTokens?: number, outputTokens?: number, thinkingTokens?: number}} call
 */
export function estimateCallCostUsd({ model, promptTokens, outputTokens, thinkingTokens } = {}) {
  const price = modelPricing(model);
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
