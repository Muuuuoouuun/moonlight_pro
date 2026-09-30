// 형식별 기본 요청문(3층 중 ① 층). 서버가 대상 형식으로 고르며 구성·길이·호흡만 다룬다.
// 사실 규칙·출력 계약·작업 종류는 엔진 시스템 지시가 소유하고, 이 문안은 그것을 바꿀 수 없다.
// 스펙: docs/design-studies/2026-09-28-content-publishing-flow/ (Prompts.dc.html) · 상태: 운영자 확정 2026-09-29.
export const FORMAT_PROMPTS_VERSION = "2026-09-29-v1";

export type FormatPrompt = { id: string; label: string; guidance: string[] };

const thread: FormatPrompt = {
  id: "thread", label: "스레드",
  guidance: [
    "Threads 글은 3~5개 블록이고 블록 사이는 빈 줄 하나로 나눈다.",
    "첫 블록의 첫 줄은 장면이나 질문이며 40자 이내로 쓴다.",
    "한 블록에는 한 생각만 담고 블록당 500자를 넘기지 않는다.",
    "마지막 블록은 독자가 오늘 할 수 있는 행동 하나로 끝낸다. 원문에 없는 행동을 만들지 않는다.",
    "해시태그와 이모지는 넣지 않는다.",
  ],
};
const cardNews: FormatPrompt = {
  id: "card_news", label: "인스타 카드뉴스",
  guidance: [
    "표지는 독자가 얻을 결과를 약속하고 제목은 18자 이내로 쓴다.",
    "2장은 독자가 겪는 장면 하나, 마지막 장은 저장하거나 공유할 이유 한 줄이다.",
    "장당 한 메시지, 본문은 60자 이내로 쓴다.",
    "근거가 없는 장은 비워 두고 missing에 해당 장을 적는다.",
  ],
};
const shorts: FormatPrompt = {
  id: "reels_script", label: "유튜브 쇼츠 · 릴스 대본",
  guidance: [
    "장면마다 화면(보여 줄 것), 대사(말할 것), 자막(대사의 핵심 한 줄), 길이(초)를 나눈다.",
    "훅 3초는 결론이나 반전을 먼저 말한다. 문제 → 본론 → 행동 순서로 이어진다.",
    "대사는 입말로, 한 문장 15자 안팎으로 쓴다.",
    "마지막 장면은 행동 하나와 댓글로 물어볼 질문 하나로 끝낸다. 합계 60초를 넘기지 않는다.",
  ],
};

const byType: Record<string, FormatPrompt> = {
  threads_post: thread, x_thread: thread, social_post: thread,
  card_news: cardNews,
  reels_script: shorts,
};

/** 대상 variantType의 기본 요청문. 없는 형식(블로그·뉴스레터 등)은 null — 기존 동작 그대로. */
export function getFormatPrompt(variantType: string): (FormatPrompt & { version: string }) | null {
  const prompt = byType[variantType];
  return prompt ? { ...prompt, guidance: [...prompt.guidance], version: FORMAT_PROMPTS_VERSION } : null;
}
