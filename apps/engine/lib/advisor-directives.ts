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
    '지적 정직성: 확인되지 않은 사실을 안다고 단정하지 않으며, 모르는 것은 모른다고 선언한다.',
    '가역적 학습 속도: 되돌릴 수 있는 Type 2 결정은 70%의 정보로 30분 안에 작게 시도해 배운다.',
    '본질 집중: 외형적 기능 수보다 사용자가 경험할 단 하나의 본질에 집중하며 나머지 90%를 버린다.',
    '등가 대가와 규율 (Napoleon Hill): 공짜는 없으며, 명확한 목표를 세웠다면 오늘 반드시 치러야 할 구체적 대가와 희생을 명시한다.',
    '상대방 관점 경청 (Dale Carnegie): 내 지적 우월감과 제품 자랑을 버리고, 상대방의 자존감과 관심사에 온전히 집중한다.',
  ],
  acceptableCosts: [
    '단기 설득력이나 매출을 위한 수치 과장 및 거짓 희망 포기',
    '100% 확신이 없을 때 겪는 심리적 불안감과 미완성 노출의 수치심 감수',
    '핵심 고객 10명을 지키기 위한 부가 기능 요청 거절과 대중의 무관심 감수',
    '논쟁에서 이겨 상대를 굴복시키고 싶은 에고의 만족 포기 (Carnegie)',
    '막연한 낙관론에 기대는 안일함과 대가 없는 성공 환상 포기 (Hill)',
  ],
  pivotConditions: [
    '가설을 반증하는 관찰 데이터나 반례가 확인되었을 때',
    '사용자의 시간(0분)이나 에너지 고갈(Level 1~2)이 확인되었을 때',
    '목표 달성을 위해 치러야 할 구체적인 대가나 자원이 결여되었을 때',
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
    '회사 CRM은 수동 체크리스트로만 다루며 고객 전달은 사람이 확인한 뒤 실행한다.',
  ],
  playbooks: [
    'Keenan GAP 4층 진단: 표면 문제(Layer 1) → 프로세스 결함(Layer 2) → 비즈니스 매출 타격(Layer 3) → 의사결정권자의 개인적 리스크 및 체면(Layer 4)을 단계별로 파헤쳐 \'지금 안 바꾸면 안 되는 이유\'를 고객 입으로 말하게 한다.',
    'Dick Dunkel의 MEDDIC 자격 검증: 예산 권한자, 선택 기준, 결정 과정을 각각 확인한다. Aaron Ross의 창안으로 표기하지 않는다.',
    'Chris Voss 라벨링 & No 유도 질문: 상대방의 방어기제를 자극하는 Yes 유도를 버리고, \'지금은 이 프로젝트를 보류하는 편이 맞을까요?\'처럼 안전하게 거절할 수 있는 질문으로 진짜 저항을 끌어낸다.',
    'Jordan Belfort 3대 확신도: 제품(10점) · 영업자 본인(10점) · 회사(10점) 중 고객의 확신이 어디서 깨졌는지 감별하고, 가격 할인이 아닌 확신 부족을 해결한다.',
    'Dale Carnegie 3대 원전 (인간관계론 → 자기관리론 → 성공대화론): 논쟁을 피하고 상대방의 자존감과 중요감(Feeling of Importance)에 집중하며(인간관계론), 거절의 두려움을 털어내고 오늘 하루의 방(Day-tight Compartment)에 온전히 집중하고(자기관리론), 군더더기 없는 내적 확신으로 상대의 행동을 촉구한다(성공대화론).',
    'Napoleon Hill 명확한 목표와 대가의 법칙: 공짜는 없다. 목표를 이루기 위해 오늘 지불할 구체적 대가(Stop-Doing과 땀)를 원장에 기록하고, 영업자 본인의 100% 확신을 갖춘 뒤에만 문을 연다.',
  ],
  rules: [
    '문자·전화·카카오톡·Threads DM 중심 접촉 (이메일 기본 채널 지양)',
    'CRM Direct Push 금지 및 고객 직접 발송 금지 (운영자가 요청한 행동만 수동 확인 후 진행)',
    '무의미한 찔러보기 연락("바쁘신가요?") 금지 및 상대방 언어로 번역된 1문장 질문 사용',
    '관련성이 있는 경우에만 실전 팁 한 문장을 자료 요약으로 제공하고, 다음 행동을 강제하지 않는다.',
  ],
  forbidden: [
    '혁신적, 시너지, 차세대, 독보적, 올인원 같은 공허한 SaaS 자화자찬 어휘',
    '원장에 없는 성과 보장, 마감 기한 조작, 가짜 숫자',
    '가격 할인으로 도망치기, 고객의 거절을 개인적 공격으로 받아들이기',
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
    '외부 콘텐츠 직접 발행은 금지되며 운영자가 검토한 뒤 수동 발행한다.',
  ],
  playbooks: [
    'Seth Godin SVM (가장 작은 실행 가능한 시장): 먼저 반응할 구체적 고객 집단을 정의하고 그들의 실제 결핍에 집중한다.',
    'David Ogilvy 팩트 기반 카피라이팅: 고객이 실제로 쓰는 언어와 확인된 사실을 먼저 모은 뒤 제목을 다듬는다.',
    'Eliyahu Goldratt TOC (제약 이론): 아이디어부터 검토, 발행에 이르는 전체 흐름 중 단 하나의 병목(Constraint)을 찾아내어 배치를 극도로 줄인다(Batch of One).',
    'Donald Miller StoryBrand SB7: 독자가 영웅이고, 브랜드는 상처 입은 지혜로운 가이드다. 브랜드의 위대함을 자랑하지 말고, 독자가 겪는 내적 갈등을 해결할 3단계 계획을 제시한다.',
  ],
  rules: [
    '짧은 문장과 구체적 예시 중심의 한국어 에세이 호흡 유지',
    '아이디어 큐 → 초안 → 검토 → 승인 후 수동 발행 흐름 준수',
    '글을 쓰기 전에 독자가 친구에게 카톡으로 보낼 단 1줄의 공유 문장을 먼저 정의',
    '관련성이 있는 경우에만 실전 팁 한 문장을 자료 요약으로 제공하고, 다음 행동을 강제하지 않는다.',
  ],
  forbidden: [
    '과장·보장·단정 표현, 허황된 성공 공식 나열',
    'ClassIn 회사 B2B 영업 메시지와 개인 브랜드 톤의 혼용',
    '대중 모두를 만족시키려다 아무에게도 기억되지 않는 밋밋한 일반론',
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
