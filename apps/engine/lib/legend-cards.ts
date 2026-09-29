// Council Legend micro-cards for Engine prompts.
// The card text and ids live in packages/guru-guidance/legend-library.ts, the single source
// shared with the Hub. This module keeps the Engine's existing names, types and prompt helpers.
import { LEGEND_MICRO_CARDS as LIBRARY_MICRO_CARDS, isLegendId } from '@com-moon/guru-guidance';
import type { LegendCategory, LegendMicroCard } from '@com-moon/guru-guidance';

export type { LegendCategory, LegendMicroCard };

export const LEGEND_MICRO_CARDS: Record<string, LegendMicroCard> = LIBRARY_MICRO_CARDS;

/**
 * Returns a Legend micro-card by its unique ID.
 */
export function getLegendCard(id: string): LegendMicroCard | undefined {
  return isLegendId(id) ? LEGEND_MICRO_CARDS[id] : undefined;
}

/**
 * Returns all 16 Legend micro-cards.
 */
export function getAllLegendCards(): LegendMicroCard[] {
  return Object.values(LEGEND_MICRO_CARDS);
}

/**
 * Formats a Legend micro-card into a concise prompt chunk under 6 lines (exactly 5 lines).
 */
export function formatLegendMicroCard(id: string): string {
  const card = getLegendCard(id);
  if (!card) return '';

  return [
    `[${card.nameKo} (${card.name})] 핵심 가치: ${card.coreValue}`,
    `- 감수할 비용: ${card.acceptableCost}`,
    `- 결론 변경 조건: ${card.pivotCondition}`,
    `- 날카로운 질문: ${card.piercingQuestion}`,
    `- 비적용/경계 조건: ${card.boundaryCondition}`,
  ].join('\n');
}

/**
 * Formats multiple Legend micro-cards into a multi-perspective prompt block.
 */
export function formatLegendTriad(ids: string[]): string {
  const cards = ids
    .map((id) => getLegendCard(id))
    .filter((card): card is LegendMicroCard => Boolean(card));

  if (cards.length === 0) return '';

  return cards.map((card) => formatLegendMicroCard(card.id)).join('\n\n');
}
