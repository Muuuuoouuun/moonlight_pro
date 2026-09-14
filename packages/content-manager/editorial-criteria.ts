export const EDITORIAL_CRITERIA_VERSION = "2026-09-14-v1";
type Criterion = { id: string; label: string; criterion: string; useWhen: string; avoidWhen: string; source: string };
const cards: Record<string, Criterion> = {
  audience: { id: "audience", label: "구체적인 독자", criterion: "기획에 적힌 독자가 겪는 문제에 초점을 맞춘다. 독자가 없으면 추정해 확정하지 않는다.",
    useWhen: "초안과 도입부", avoidWhen: "독자 범위를 임의로 확장할 때", source: "제공 마케팅 정리 · Seth Godin / Philip Kotler" },
  positioning: { id: "positioning", label: "메시지 일관성", criterion: "원문의 핵심 메시지와 브랜드 관점을 유지한다. 새로운 차별점이나 우월성을 만들어내지 않는다.",
    useWhen: "기존 문장 다듬기", avoidWhen: "근거 없는 경쟁 우위를 덧붙일 때", source: "제공 마케팅 정리 · Ries·Trout / Bernadette Jiwa" },
  hook: { id: "hook", label: "약속이 맞는 도입부", criterion: "질문·구체적인 장면·주장으로 도입부를 구별하되 본문이 답할 수 있는 약속만 한다.",
    useWhen: "도입부 대안 비교", avoidWhen: "클릭을 위해 사실이나 숫자를 과장할 때", source: "제공 콘텐츠 심층 분해 · Harry Dry / MrBeast; 마케팅 정리 · David Ogilvy" },
  evidence: { id: "evidence", label: "근거 보존", criterion: "원문에 있는 사례·수치·출처와 불확실성을 보존한다. 없는 근거는 missing에 남긴다.",
    useWhen: "주장·사례가 있는 글", avoidWhen: "자료의 예시 수치를 실제 성과로 사용할 때", source: "제공 마케팅 정리 · David Ogilvy; 콘텐츠 플레이북 · 현장 기록" },
  narrative: { id: "narrative", label: "이해에서 다음 행동으로", criterion: "독자의 문제, 전달할 변화, 근거, 마무리가 이어지게 한다. 원문에 없는 행동이나 구매를 강요하지 않는다.",
    useWhen: "초안 구조와 채널 변형", avoidWhen: "모든 글에 판매 구조를 강제할 때", source: "제공 마케팅 정리 · Donald Miller; 콘텐츠 심층 분해 · Nathan Baugh" },
  focus: { id: "focus", label: "핵심을 남기는 축약", criterion: "중복과 곁가지를 줄이고 핵심 메시지·조건·유보 표현은 남긴다.",
    useWhen: "분량 축약", avoidWhen: "조건을 삭제해 의미를 바꿀 때", source: "제공 콘텐츠 플레이북 · 구조와 제약" },
  repurpose: { id: "repurpose", label: "원문 하나, 채널에 맞게", criterion: "핵심 주장과 근거는 유지하고 채널의 길이·호흡·장면 구성만 바꾼다.",
    useWhen: "다른 채널 결과물 생성", avoidWhen: "재가공을 새로운 경험이나 사실로 포장할 때", source: "제공 마케팅 정리 · Gary Vaynerchuk; 콘텐츠 심층 분해 · Justin Welsh / Dan Koe" },
};
const byOperation: Record<string, string[]> = {
  draft: ["audience", "evidence", "narrative"],
  polish: ["positioning", "evidence"],
  shorten: ["focus", "evidence"],
  hooks: ["audience", "hook", "evidence"],
  repurpose: ["repurpose", "narrative", "evidence"],
};
export function getEditorialGuidance(operation: string) {
  return { version: EDITORIAL_CRITERIA_VERSION, criteria: (byOperation[operation] || []).map(id => ({ ...cards[id] })) };
}
