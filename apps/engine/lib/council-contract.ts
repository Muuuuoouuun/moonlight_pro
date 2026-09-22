/**
 * Council Contract & Advisory Fidelity Validation
 * Reference: docs/superpowers/specs/2026-09-21-council-mentor-guru-legend-operating-framework.md
 * 
 * Implements:
 * 1. parseCouncilResponse: 4-part output structure (lenses, dissent, conditionalVerdict, nextAction)
 * 2. validateAdvisoryFidelity: anti-hallucination auditor (catches fabricated progress like '측정 중',
 *    made-up metrics, unverified guarantees, and forbidden SaaS buzzwords).
 */

export interface CouncilLens {
  lens: string;
  verdict: string;
  cost: string;
}

export interface ParsedCouncilResponse {
  lenses: CouncilLens[];
  dissent: string;
  conditionalVerdict: string;
  nextAction: string;
}

export interface FidelityViolation {
  type: 'forbidden_buzzword' | 'fabricated_claim' | 'unverified_metric';
  reason: string;
  match?: string;
}

export interface FidelityValidationResult {
  valid: boolean;
  violations: FidelityViolation[];
}

export const FORBIDDEN_SAAS_BUZZWORDS = [
  '혁신적',
  '혁신적인',
  '시너지',
  '시너지를',
  '차세대',
  '독보적',
  '올인원',
] as const;

/**
 * Parses the 4-part council response contract:
 * - lenses: Array of { lens, verdict, cost }
 * - dissent: string (explicit disagreement)
 * - conditionalVerdict: string
 * - nextAction: string
 * 
 * Robust to clean markdown, fenced markdown (```markdown ... ```), and JSON formats.
 */
export function parseCouncilResponse(text: string): ParsedCouncilResponse {
  if (!text || typeof text !== 'string') {
    return { lenses: [], dissent: '', conditionalVerdict: '', nextAction: '' };
  }

  // Strip code fences if present
  const cleaned = text
    .trim()
    .replace(/^```(?:markdown|json)?\s*\r?\n?/i, '')
    .replace(/\r?\n?```\s*$/i, '')
    .trim();

  // 1. JSON parsing support
  if (cleaned.startsWith('{')) {
    try {
      const data = JSON.parse(cleaned);
      if (data && typeof data === 'object') {
        const lenses: CouncilLens[] = Array.isArray(data.lenses)
          ? data.lenses.map((l: any) => ({
              lens: String(l.lens ?? l.name ?? '').trim(),
              verdict: String(l.verdict ?? '').trim(),
              cost: String(l.cost ?? l.acceptableCost ?? '').trim(),
            }))
          : [];
        return {
          lenses,
          dissent: String(data.dissent ?? '').trim(),
          conditionalVerdict: String(data.conditionalVerdict ?? data.conditional_verdict ?? data.verdict ?? '').trim(),
          nextAction: String(data.nextAction ?? data.next_action ?? data.action ?? '').trim(),
        };
      }
    } catch {
      // Not valid JSON, fall through to markdown parsing
    }
  }

  // 2. Markdown sections parsing
  const patterns = [
    { key: 'sec1', regex: /(?:^|\n)(?:#{1,4}\s*)?(?:1[.)]\s*)?(?:관점별\s*진단|관점별|Lenses?|Perspective)[^\n]*/i },
    { key: 'sec2', regex: /(?:^|\n)(?:#{1,4}\s*)?(?:2[.)]\s*)?(?:남은\s*이견|이견|Dissent(?:\s*&\s*Divergence)?)[^\n]*/i },
    { key: 'sec3', regex: /(?:^|\n)(?:#{1,4}\s*)?(?:3[.)]\s*)?(?:조건부\s*결론|결론|Conditional\s*Verdict)[^\n]*/i },
    { key: 'sec4', regex: /(?:^|\n)(?:#{1,4}\s*)?(?:4[.)]\s*)?(?:1단계\s*검증\s*행동|1단계\s*검증|Unified\s*Next\s*Step|다음\s*행동|Next\s*Action)[^\n]*/i },
  ];

  const matches = patterns.map((p) => {
    const m = p.regex.exec(cleaned);
    return {
      key: p.key,
      index: m ? m.index : -1,
      headerLength: m ? m[0].length : 0,
    };
  });

  const found = matches.filter((m) => m.index !== -1).sort((a, b) => a.index - b.index);

  const sections: Record<string, string> = {};
  for (let i = 0; i < found.length; i++) {
    const current = found[i];
    const next = found[i + 1];
    const startIndex = current.index + current.headerLength;
    const endIndex = next ? next.index : cleaned.length;
    sections[current.key] = cleaned.slice(startIndex, endIndex).trim();
  }

  // Parse lenses from Section 1
  const lenses: CouncilLens[] = [];
  const sec1Text = sections.sec1 || '';
  if (sec1Text) {
    const lines = sec1Text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)?\s*(?:\*\*)?\[?([^\]*:]+)\]?(?:\*\*)?\s*:\s*(.+)$/);
      if (bulletMatch) {
        const rawLens = bulletMatch[1].trim();
        const rawContent = bulletMatch[2].trim();

        let verdict = rawContent;
        let cost = '';

        if (rawContent.includes('/')) {
          const slashIdx = rawContent.indexOf('/');
          verdict = rawContent.slice(0, slashIdx).trim();
          cost = rawContent.slice(slashIdx + 1).trim();
        } else {
          const costMatch = rawContent.match(/(.+?)(?:\s*\(?(?:감수할\s*)?비용\s*:\s*([^)]+)\)?)$/);
          if (costMatch) {
            verdict = costMatch[1].trim();
            cost = costMatch[2].trim();
          }
        }

        lenses.push({
          lens: rawLens,
          verdict,
          cost,
        });
      }
    }
  }

  const cleanSectionText = (text: string | undefined): string => {
    if (!text) return '';
    return text
      .split('\n')
      .map((line) => line.trim().replace(/^[-*•]\s+/, ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  };

  return {
    lenses,
    dissent: cleanSectionText(sections.sec2),
    conditionalVerdict: cleanSectionText(sections.sec3),
    nextAction: cleanSectionText(sections.sec4),
  };
}

/**
 * Validates the advisory fidelity and catches unverified fabricated claims:
 * 1. Forbidden SaaS buzzwords ('혁신적', '시너지', '차세대', '독보적', '올인원')
 * 2. Fabricated claims of progress (e.g. unverified claims of '측정 중')
 * 3. Made-up metrics (% numbers not grounded in context)
 * 4. Unverified guarantees ('성과 보장', '30% 향상 보장' etc.)
 */
export function validateAdvisoryFidelity(text: string, context: any): FidelityValidationResult {
  const violations: FidelityViolation[] = [];
  if (!text || typeof text !== 'string') {
    return { valid: true, violations: [] };
  }

  const contextStr = typeof context === 'string' ? context : JSON.stringify(context || {});

  // 1. Forbidden default SaaS buzzwords
  for (const word of FORBIDDEN_SAAS_BUZZWORDS) {
    if (text.includes(word)) {
      violations.push({
        type: 'forbidden_buzzword',
        reason: `Forbidden default SaaS buzzword detected: '${word}'`,
        match: word,
      });
    }
  }

  // 2. Fabricated claims of progress: '측정 중'
  const measuringMatch = text.match(/(?:현재\s*)?측정\s*중(?:이며|입니다|에)?/);
  if (measuringMatch) {
    const isExplicitlyUnmeasured = /(?:미측정|측정하지\s*않|측정\s*안\s*됨|측정된\s*바\s*없)/i.test(contextStr);
    const hasActiveMeasurement = context && (context.actively_measuring === true || context.measuring === true || contextStr.includes('측정 중'));

    if (isExplicitlyUnmeasured || !hasActiveMeasurement) {
      violations.push({
        type: 'fabricated_claim',
        reason: "Unverified claim of '측정 중' without ledger confirmation (ledger indicates unmeasured or lacks measurement proof)",
        match: measuringMatch[0],
      });
    }
  }

  // 3. Made-up metrics (% numbers)
  const pctMatches = text.matchAll(/\b(\d+(?:\.\d+)?%)/g);
  for (const m of pctMatches) {
    const pct = m[1];
    if (!contextStr.includes(pct)) {
      violations.push({
        type: 'unverified_metric',
        reason: `Made-up metric detected: '${pct}' is not present in the ledger context`,
        match: pct,
      });
    }
  }

  // 4. Fabricated guarantees (e.g. '30% 향상 보장', '성과 보장')
  const guaranteeMatch = text.match(/(?:성과|매출|효과|수익|성장)\s*(?:\d+%\s*)?(?:향상|개선|증가)?\s*보장/);
  if (guaranteeMatch) {
    if (!contextStr.includes('보장')) {
      violations.push({
        type: 'fabricated_claim',
        reason: `Unverified guarantee claim: '${guaranteeMatch[0]}' is not verified in ledger`,
        match: guaranteeMatch[0],
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
