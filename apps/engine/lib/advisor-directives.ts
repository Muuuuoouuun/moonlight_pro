/**
 * Advisor Directives System (Values & Knowledge Configuration)
 * Reference: docs/superpowers/specs/2026-09-21-council-mentor-guru-legend-operating-framework.md
 * 
 * Provides unified, structured injection for:
 * 1. Values (가치관): Operator core values, acceptable costs, pivot conditions, trade-off priorities, and Legend lenses.
 * 2. Knowledge (지식): Business facts, domain playbooks, operating rules, forbidden items, and RAG knowledge snippets.
 */

import { formatLegendTriad } from './legend-cards.ts';

export interface ValueDirective {
  coreValues?: string[];        // 핵심 가치 (예: "지적 정직성", "가역적 학습 속도")
  acceptableCosts?: string[];   // 감수할 비용 (예: "빠른 확신의 안정감 포기", "과장 마케팅 거절")
  pivotConditions?: string[];   // 결론을 바꿀 조건 (예: "새로운 반례 관찰 시", "고객 고통 미확인 시")
  tradeOffRules?: string[];     // 충돌 시 우선순위 (예: "사실 확인 > 고객 신뢰 > 속도 > 기능 확장")
  legendIds?: string[];         // 주입할 레전드 카드 ID 목록
}

export interface DirectiveKnowledgeSnippet {
  id?: string;
  title: string;
  snippet: string;
  source?: string;
}

export interface KnowledgeDirective {
  domain?: 'classin-sales' | 'personal-brand' | 'general';
  facts?: string[];             // 확정된 비즈니스 팩트
  playbooks?: string[];         // 실무 방법론/플레이북 프레임
  rules?: string[];             // 도메인/브랜드 운영 룰
  forbidden?: string[];         // 금지 사항 및 금지 표현
  retrievedSnippets?: DirectiveKnowledgeSnippet[]; // RAG로 검색된 일지/메모/아웃컴 스니펫
}

export interface AdvisorDirectivesConfig {
  values?: ValueDirective;
  knowledge?: KnowledgeDirective;
}

/**
 * Default Operator Core Values baseline
 */
export const DEFAULT_OPERATOR_VALUES: ValueDirective = {
  coreValues: [
    '지적 정직성: 확인되지 않은 사실을 안다고 단정하지 않는다.',
    '가역적 학습 속도: 되돌릴 수 있는 결정은 70% 정보로 작게 시도해 배운다.',
    '본질 집중: 외형적 기능 수보다 사용자가 경험할 단 하나의 본질에 집중한다.',
  ],
  acceptableCosts: [
    '단기 설득력이나 매출을 위한 수치 과장 포기',
    '100% 확신이 없을 때 겪는 심리적 불안감 감수',
    '핵심 경험을 지키기 위한 부가 기능 요청 거절의 불편함 감수',
  ],
  pivotConditions: [
    '가설을 반증하는 관찰 데이터나 반례가 확인되었을 때',
    '사용자의 시간(0분)이나 에너지 고갈(Level 1~2)이 확인되었을 때',
  ],
  tradeOffRules: [
    '원장 사실성 > 고객 신뢰 > 가역적 학습 속도 > 기능/일정 확장',
  ],
};

/**
 * Default ClassIn B2B Sales Knowledge baseline
 */
export const DEFAULT_SALES_KNOWLEDGE: KnowledgeDirective = {
  domain: 'classin-sales',
  facts: [
    'ClassIn은 B2B 교육기관/학원/대학 대상 솔루션 영업 레인이다.',
    '주요 리드 공급원: Meta 광고, 마케팅팀 구글 시트, 기존 고객 연락.',
    '회사 CRM은 수동 체크리스트로만 다루며 Moonlight 승인 큐를 거쳐 사람이 실행한다.',
  ],
  playbooks: [
    'Keenan GAP 4층 진단 (표면 문제 → 프로세스 결함 → 매출 영향 → 개인적 고통)',
    'Dick Dunkel / Aaron Ross MEDDIC 자격 요건 (Economic Buyer & Decision Process 확인)',
    'Chris Voss 보정 질문 및 라벨링 (상대방의 저항 완화 및 본질 확인)',
    'Jordan Belfort 3대 확신도 (제품 10점, 나 10점, 회사 10점)',
  ],
  rules: [
    '문자·전화·카카오톡·Threads DM 중심 접촉 (이메일 기본 채널 지양)',
    'CRM Direct Push 금지 및 고객 직접 발송 금지 (승인 큐 인큐 필수)',
  ],
  forbidden: [
    '혁신적, 시너지, 차세대, 독보적, 올인원 같은 공허한 SaaS 자화자찬 어휘',
    '원장에 없는 성과 보장, 마감 기한 조작, 가짜 숫자',
  ],
};

/**
 * Default Personal Brand / Venture Knowledge baseline
 */
export const DEFAULT_BRAND_KNOWLEDGE: KnowledgeDirective = {
  domain: 'personal-brand',
  facts: [
    '운영자 본인의 1인 지식 창업 / 개인 브랜드(시나브로, 22nomad 등) 레인이다.',
    'ClassIn 회사 데이터와 절대 섞지 않는다 (개인 프로젝트 0건이어도 회사 폴백 금지).',
    '외부 콘텐츠 직접 발행은 금지되며 Moonlight work_orders 승인 큐를 거친다.',
  ],
  playbooks: [
    'David Ogilvy 사실 중심 카피라이팅 (구체적 팩트와 헤드라인의 힘)',
    'Donald Miller StoryBrand SB7 (고객이 영웅, 브랜드는 가이드)',
    'Seth Godin 가장 작은 실행 가능한 시장 (SVM: 누구를 위한 글인가)',
    'Eliyahu Goldratt 제약 이론 (TOC: 제작 공정의 병목 1곳 해소)',
  ],
  rules: [
    '짧은 문장과 구체적 예시 중심의 한국어 에세이 호흡 유지',
    '아이디어 큐 → 초안 → 검토 → 승인 후 수동 발행 흐름 준수',
  ],
  forbidden: [
    '과장·보장·단정 표현, 허황된 성공 공식 나열',
    'ClassIn 회사 B2B 영업 메시지와 개인 브랜드 톤의 혼용',
  ],
};

/**
 * Formats a ValueDirective into a concise prompt block.
 */
export function formatValuesDirective(values?: ValueDirective | null): string {
  if (!values) return '';
  const lines: string[] = ['[가치관 지침 (Values Directives)]'];

  if (values.coreValues && values.coreValues.length > 0) {
    lines.push('1. 핵심 가치:');
    values.coreValues.forEach((v) => lines.push(`   - ${v}`));
  }

  if (values.acceptableCosts && values.acceptableCosts.length > 0) {
    lines.push('2. 감수할 비용:');
    values.acceptableCosts.forEach((c) => lines.push(`   - ${c}`));
  }

  if (values.tradeOffRules && values.tradeOffRules.length > 0) {
    lines.push('3. 가치 충돌 우선순위:');
    values.tradeOffRules.forEach((r) => lines.push(`   - ${r}`));
  }

  if (values.pivotConditions && values.pivotConditions.length > 0) {
    lines.push('4. 판단 변경 조건:');
    values.pivotConditions.forEach((p) => lines.push(`   - ${p}`));
  }

  if (values.legendIds && values.legendIds.length > 0) {
    const legendBlock = formatLegendTriad(values.legendIds);
    if (legendBlock) {
      lines.push('5. 적용할 레전드 가치관 렌즈:');
      lines.push(legendBlock);
    }
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Formats a KnowledgeDirective into a concise prompt block.
 */
export function formatKnowledgeDirective(knowledge?: KnowledgeDirective | null): string {
  if (!knowledge) return '';
  const lines: string[] = ['[도메인 지식 지침 (Knowledge Directives)]'];

  if (knowledge.domain) {
    lines.push(`- 도메인 영역: ${knowledge.domain}`);
  }

  if (knowledge.facts && knowledge.facts.length > 0) {
    lines.push('1. 확정된 비즈니스 팩트:');
    knowledge.facts.forEach((f) => lines.push(`   - ${f}`));
  }

  if (knowledge.playbooks && knowledge.playbooks.length > 0) {
    lines.push('2. 실전 플레이북 및 방법론:');
    knowledge.playbooks.forEach((p) => lines.push(`   - ${p}`));
  }

  if (knowledge.rules && knowledge.rules.length > 0) {
    lines.push('3. 도메인 운영 룰:');
    knowledge.rules.forEach((r) => lines.push(`   - ${r}`));
  }

  if (knowledge.forbidden && knowledge.forbidden.length > 0) {
    lines.push('4. 금지 사항 및 표현:');
    knowledge.forbidden.forEach((fb) => lines.push(`   - ${fb}`));
  }

  if (knowledge.retrievedSnippets && knowledge.retrievedSnippets.length > 0) {
    lines.push('5. 검색된 업무 지식 스니펫 (RAG):');
    knowledge.retrievedSnippets.slice(0, 5).forEach((item, idx) => {
      lines.push(`   [${idx + 1}] ${item.title}: ${item.snippet.slice(0, 150)}${item.source ? ` (${item.source})` : ''}`);
    });
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Combines both Values and Knowledge into a single unified directives block.
 */
export function assembleDirectives(directives?: AdvisorDirectivesConfig | null): string {
  if (!directives) return '';
  const sections: string[] = [];

  const valBlock = formatValuesDirective(directives.values);
  if (valBlock) sections.push(valBlock);

  const knBlock = formatKnowledgeDirective(directives.knowledge);
  if (knBlock) sections.push(knBlock);

  return sections.join('\n\n');
}

/**
 * Extracts and merges directives from context options or returns defaults based on type.
 */
export function resolveDirectives(
  type: 'sales-mentor' | 'brand-mentor' | 'council',
  explicitDirectives?: AdvisorDirectivesConfig | null,
  context?: any
): AdvisorDirectivesConfig {
  // Start with domain default knowledge
  const baseKnowledge = type === 'sales-mentor' ? DEFAULT_SALES_KNOWLEDGE : DEFAULT_BRAND_KNOWLEDGE;
  const baseValues = DEFAULT_OPERATOR_VALUES;

  // Extract from context if present
  const contextDirectives = context?.directives || {};
  const contextValues = context?.values || context?.operator?.values || {};
  const contextKnowledge = context?.knowledge || context?.domainKnowledge || {};

  const mergedValues: ValueDirective = {
    coreValues: explicitDirectives?.values?.coreValues || contextDirectives.values?.coreValues || contextValues.coreValues || baseValues.coreValues,
    acceptableCosts: explicitDirectives?.values?.acceptableCosts || contextDirectives.values?.acceptableCosts || contextValues.acceptableCosts || baseValues.acceptableCosts,
    pivotConditions: explicitDirectives?.values?.pivotConditions || contextDirectives.values?.pivotConditions || contextValues.pivotConditions || baseValues.pivotConditions,
    tradeOffRules: explicitDirectives?.values?.tradeOffRules || contextDirectives.values?.tradeOffRules || contextValues.tradeOffRules || baseValues.tradeOffRules,
    legendIds: explicitDirectives?.values?.legendIds || contextDirectives.values?.legendIds || contextValues.legendIds || context?.legendIds || [],
  };

  const mergedKnowledge: KnowledgeDirective = {
    domain: explicitDirectives?.knowledge?.domain || contextDirectives.knowledge?.domain || contextKnowledge.domain || baseKnowledge.domain,
    facts: explicitDirectives?.knowledge?.facts || contextDirectives.knowledge?.facts || contextKnowledge.facts || baseKnowledge.facts,
    playbooks: explicitDirectives?.knowledge?.playbooks || contextDirectives.knowledge?.playbooks || contextKnowledge.playbooks || baseKnowledge.playbooks,
    rules: explicitDirectives?.knowledge?.rules || contextDirectives.knowledge?.rules || contextKnowledge.rules || baseKnowledge.rules,
    forbidden: explicitDirectives?.knowledge?.forbidden || contextDirectives.knowledge?.forbidden || contextKnowledge.forbidden || baseKnowledge.forbidden,
    retrievedSnippets: explicitDirectives?.knowledge?.retrievedSnippets || contextDirectives.knowledge?.retrievedSnippets || contextKnowledge.retrievedSnippets || context?.ragSnippets || [],
  };

  return {
    values: mergedValues,
    knowledge: mergedKnowledge,
  };
}
