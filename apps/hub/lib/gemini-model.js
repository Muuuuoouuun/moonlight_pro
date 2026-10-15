// 허브가 Gemini를 직접 부르는 곳(명함·회의 분석·멀티모달 입력)의 기본 모델과 세대별 파라미터 규칙.
// 엔진 apps/engine/lib/gemini.ts와 같은 규칙이다.

// GEMINI_MODEL이 없을 때 쓰는 기본값. Gemini 4는 아직 이 모델 하나뿐이다(Flash 계열 없음).
export const DEFAULT_GEMINI_MODEL = "gemini-4-argon";

// Gemini 3 이후는 thinkingLevel만 받는다 — 2.5의 thinkingBudget은 3이 거절하고 4는 폐기했다.
const THINKING_LEVEL_MODEL = /^gemini-(?:[3-9]|[1-9]\d)[.-]/;
// Gemini 4는 temperature·topP·topK를 받지 않는다(무시 + 경고, Vertex는 400).
const NO_SAMPLING_MODEL = /^gemini-(?:[4-9]|[1-9]\d)[.-]/;

export function resolveGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/** generationConfig에서 그 모델이 받지 않는 값을 뺀다. 원본은 바꾸지 않는다. */
export function geminiGenerationConfig(model, config) {
  const next = { ...config };
  if (NO_SAMPLING_MODEL.test(model)) {
    delete next.temperature;
    delete next.topP;
    delete next.topK;
  }
  if (THINKING_LEVEL_MODEL.test(model) && next.thinkingConfig && "thinkingBudget" in next.thinkingConfig) {
    const { thinkingBudget, ...rest } = next.thinkingConfig;
    if (Object.keys(rest).length) next.thinkingConfig = rest;
    else delete next.thinkingConfig;
  }
  return next;
}
