// Council Legends & Triads Catalog
// Framework: docs/superpowers/specs/2026-09-21-council-mentor-guru-legend-operating-framework.md
// Card text and ids come from packages/guru-guidance/legend-library.ts, the single source shared with the Engine prompt.
// This module re-exports the 16 Legend micro-cards and defines 6 curated Triads for Council advisory sessions.
import { LEGEND_IDS, LEGEND_MICRO_CARDS, isLegendId } from "@com-moon/guru-guidance";

export { LEGEND_IDS };

export const LEGEND_CARDS = LEGEND_MICRO_CARDS;

export const RECOMMENDED_TRIADS = [
  {
    id: "growth",
    label: "성장·혁신",
    legendIds: ["jobs", "bezos", "chouinard"],
    desc: "단순한 본질(잡스) + 장기 고객 가치·가역적 결정(베이조스) + 지속가능한 철학(쉬나드)",
  },
  {
    id: "truth",
    label: "지적 정직·검증",
    legendIds: ["socrates", "einstein", "feynman"],
    desc: "무지의 자각(소크라테스) + 가정 뒤집기(아인슈타인) + 자기기만 없는 검증(파인만)",
  },
  {
    id: "execution",
    label: "실행·품질",
    legendIds: ["theodore-roosevelt", "deming", "drucker"],
    desc: "경기장 투사(루스벨트) + 시스템 변동성 통제(데밍) + 강점 공헌(드러커)",
  },
  {
    id: "governance",
    label: "원칙·안전망",
    legendIds: ["lincoln", "franklin-roosevelt", "ostrom"],
    desc: "도덕적 원칙(링컨) + 대담한 안전망 실험(FDR) + 자치 규범(오스트롬)",
  },
  {
    id: "resilience",
    label: "인내·통제",
    legendIds: ["epictetus", "buffett", "chouinard"],
    desc: "통제력 구분(에픽테토스) + 복리와 능력범위(버핏) + 목적 지향(쉬나드)",
  },
  {
    id: "persuasion",
    label: "설득·자기확신",
    legendIds: ["carnegie", "hill", "theodore-roosevelt"],
    desc: "상대방 중심 경청(카네기) + 불타는 열망과 대가(힐) + 경기장 투사의 실천(루스벨트)",
  },
];

export function getLegendCard(id) {
  return isLegendId(id) ? LEGEND_CARDS[id] : null;
}

export function getTriad(id) {
  return RECOMMENDED_TRIADS.find((t) => t.id === id) || null;
}

export function getAllTriads() {
  return RECOMMENDED_TRIADS;
}
