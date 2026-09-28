// Office 안건 문구 → 원문 기법 연결 — 순수 함수.
//
// 운영자 결정(2026-09-25, agent-layer-direction §2.1 ⑦): Office 결과 카드 아래에 안건과 맞는
// 원문 기법 1~2개를 연결한다. 근거는 운영자가 직접 쓴 안건의 낱말뿐이다 — 모델로 뜻을 추정하지
// 않고, 어떤 낱말 때문에 연결했는지를 그대로 보인다. 모델 호출·업무 생성은 없다.
//
// 낱말 목록은 좁게 둔다. "문제"·"어려움"처럼 거의 모든 안건에 나오는 말은 연결 근거가 되지
// 못해 넣지 않았다(오탐이 추천 전체의 신뢰를 깎는다). 거래 기록이 연결된 안건은 이 문구 매칭보다
// 기록 기반 추천(guru-recommendations.js)을 먼저 쓴다.

export const AGENDA_GUIDANCE_RULES = Object.freeze([
  Object.freeze({ id: "decision-process", cardId: "sales-meddic", lane: "classin", patterns: [/견적/, /결재/, /품의/, /내부\s?(검토|승인)/, /의사\s?결정/, /결정권자?/] }),
  Object.freeze({ id: "execution-conditions", cardId: "sales-voss-feasibility", lane: "classin", patterns: [/도입\s?의사/, /긍정적(인)?\s?(반응|답변)/, /진행하자고/, /해\s?보자고/] }),
  Object.freeze({ id: "concern", cardId: "sales-carnegie-listen", lane: "classin", patterns: [/우려/, /걱정/, /망설/, /불만/] }),
  Object.freeze({ id: "after-sale", cardId: "sales-girard-after-sale", lane: "classin", patterns: [/계약\s?후/, /도입\s?후/, /온보딩/, /사용\s?현황/, /재계약/, /갱신/] }),
  Object.freeze({ id: "fit", cardId: "sales-ross-fit", lane: "classin", patterns: [/신규\s?(문의|리드|고객)/, /잠재\s?고객/, /첫\s?(미팅|통화|연락|접촉)/] }),
  Object.freeze({ id: "meeting-prep", cardId: "sales-hill-purpose", lane: "classin", patterns: [/(미팅|통화|방문)\s?준비/] }),
  Object.freeze({ id: "smallest-audience", cardId: "marketing-smallest-market", lane: "personal", patterns: [/타[깃겟]/, /고객군/, /페르소나/] }),
  Object.freeze({ id: "customer-language", cardId: "marketing-research", lane: "personal", patterns: [/고객\s?인터뷰/, /설문/, /리서치/, /고객이?\s?(쓰는|한)\s?말/] }),
  Object.freeze({ id: "first-line", cardId: "content-three-tests", lane: "personal", patterns: [/카피/, /헤드라인/, /첫\s?문장/] }),
  Object.freeze({ id: "hook", cardId: "content-hook", lane: "personal", patterns: [/훅/, /도입부/, /첫\s?장/] }),
  Object.freeze({ id: "repurpose", cardId: "content-multiplication", lane: "personal", patterns: [/재활용/, /재사용/, /다른\s?채널/, /소재\s?(고갈|부족)/] }),
]);

// 매칭된 낱말과 그 앞뒤 몇 글자 — 근거를 운영자의 원문 그대로 보인다.
function excerptAround(text, index, length, pad = 6) {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

// scope: 'classin' | 'personal' | 'all'. 레인을 모르면(all) 두 레인을 다 본다.
export function matchAgendaGuidance(text, { scope = "all", limit = 2 } = {}) {
  const agenda = String(text || "");
  if (!agenda.trim()) return [];
  const out = [];
  const seenCards = new Set();
  for (const rule of AGENDA_GUIDANCE_RULES) {
    if (scope !== "all" && rule.lane !== scope) continue;
    if (seenCards.has(rule.cardId)) continue;
    for (const pattern of rule.patterns) {
      const match = pattern.exec(agenda);
      if (!match) continue;
      seenCards.add(rule.cardId);
      out.push({
        id: `agenda:${rule.id}`,
        ruleId: rule.id,
        cardId: rule.cardId,
        basis: "agenda",
        lane: rule.lane,
        matched: match[0],
        facts: [`안건 문구 “${excerptAround(agenda, match.index, match[0].length)}”`],
        reason: `안건에 ‘${match[0]}’이(가) 있어 연결`,
      });
      break;
    }
    if (out.length >= limit) break;
  }
  return out;
}
