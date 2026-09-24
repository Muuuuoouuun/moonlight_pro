/**
 * Advisor Guardrails & System Instruction Generator
 * Reference: docs/superpowers/specs/2026-09-21-council-mentor-guru-legend-operating-framework.md
 * 
 * Implements the 5 Iron Rules runtime guardrails:
 * 1. Fact Invariant Contract
 * 2. Constraint-First Gate (rest-first mode when energy <= 2 or available time === 0)
 * 3. Micro-Card Injection & Length Hard Cap (600 chars for Mentor, 700 chars for Council)
 * 4. Event-Driven Triggers (no made-up fixed %)
 * 5. Preservation of Dissent (no fake consensus / echo chambers)
 */

import {
  assembleDirectives,
  resolveDirectives,
  type AdvisorDirectivesConfig,
  type ValueDirective,
  type KnowledgeDirective,
} from './advisor-directives.ts';

export type AdvisoryType = 'sales-mentor' | 'brand-mentor' | 'council';
export type ConstraintMode = 'normal' | 'rest-first';

export interface ConstraintEvaluation {
  constraintMode: ConstraintMode;
  energy: number | null;
  availableTimeMinutes: number | null;
  reason?: string;
}

export interface AdvisoryInstructionOptions {
  type: AdvisoryType;
  mode: string;
  context: any;
  constraintMode?: ConstraintMode;
  directives?: AdvisorDirectivesConfig;
}

/**
 * Evaluates user energy level (1-5) and available time (minutes).
 * If energy <= 2 or available time === 0, flags constraintMode: 'rest-first'.
 */
export function evaluateConstraints(context: any): ConstraintEvaluation {
  if (!context) {
    return { constraintMode: 'normal', energy: null, availableTimeMinutes: null };
  }

  let energy: number | null = null;
  let availableTimeMinutes: number | null = null;

  // 1. Structured property extraction
  const candidateEnergy =
    context.operator?.energy ??
    context.operator?.energyLevel ??
    context.energy ??
    context.energyLevel ??
    context.constraints?.energy ??
    context.constraints?.energyLevel;

  if (candidateEnergy !== undefined && candidateEnergy !== null) {
    if (typeof candidateEnergy === 'number') {
      energy = candidateEnergy;
    } else if (typeof candidateEnergy === 'string') {
      const match = candidateEnergy.match(/(\d+)/);
      if (match) energy = parseInt(match[1], 10);
    }
  }

  const candidateTime =
    context.operator?.availableTime ??
    context.operator?.availableTimeMinutes ??
    context.operator?.available_time_minutes ??
    context.operator?.time_available ??
    context.availableTime ??
    context.availableTimeMinutes ??
    context.available_time_minutes ??
    context.timeAvailable ??
    context.timeAvailableMinutes ??
    context.time_available ??
    context.constraints?.availableTime ??
    context.constraints?.availableTimeMinutes;

  if (candidateTime !== undefined && candidateTime !== null) {
    if (typeof candidateTime === 'number') {
      availableTimeMinutes = candidateTime;
    } else if (typeof candidateTime === 'string') {
      const numMatch = candidateTime.match(/(\d+)/);
      if (numMatch) {
        const val = parseInt(numMatch[1], 10);
        if (candidateTime.includes('시간') || candidateTime.toLowerCase().includes('hour')) {
          availableTimeMinutes = val * 60;
        } else {
          availableTimeMinutes = val;
        }
      }
    }
  }

  // 2. Text inspection if energy or availableTimeMinutes are still null
  const textBlob = [
    typeof context === 'string' ? context : '',
    context.input_summary,
    context.summary,
    context.initial,
    context.followup,
    context.text,
    context.prompt,
    typeof context.operator === 'string' ? context.operator : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (textBlob) {
    if (energy === null) {
      const energyMatch = textBlob.match(/(?:에너지|energy)(?:\s*레벨|\s*는|\s*:)?\s*([1-5])(?:\s*\/\s*5)?/i);
      if (energyMatch) {
        energy = parseInt(energyMatch[1], 10);
      }
    }

    if (availableTimeMinutes === null) {
      const zeroTimeMatch =
        textBlob.match(/(?:남은|가용|추가|비어\s*있는|비어있는)?\s*시간[^\d]*0\s*(?:분|min)/i) ||
        textBlob.match(/(?:남은\s*시간|가용\s*시간|시간은?)\s*(?:은|는|도|이|가|:)?\s*0\s*(?:분|시간|$|\s)/i) ||
        textBlob.match(/시간\s*0과/);

      if (zeroTimeMatch) {
        availableTimeMinutes = 0;
      } else {
        const timeMatch =
          textBlob.match(/(?:남은|가용|비어\s*있는|작성|추가\s*확인|사용\s*가능한)\s*시간[^\d]*(\d+)\s*(?:분|시간|min|hours?)/i) ||
          textBlob.match(/(\d+)\s*(?:분|min)(?:간)?\s*(?:동안|남음|가능|있음)/i);
        if (timeMatch) {
          const val = parseInt(timeMatch[1], 10);
          if (timeMatch[0].includes('시간') || timeMatch[0].toLowerCase().includes('hour')) {
            availableTimeMinutes = val * 60;
          } else {
            availableTimeMinutes = val;
          }
        }
      }
    }
  }

  // Explicit rest priority trigger phrases
  const explicitRest = textBlob
    ? /(?:체력\s*고갈로?\s*휴식\s*우선|휴식을?\s*우선(?:하겠다고)?|시간\s*0과\s*명시한\s*휴식|에너지\s*고갈)/i.test(textBlob)
    : false;

  const isRestFirst =
    (energy !== null && energy <= 2) ||
    (availableTimeMinutes !== null && availableTimeMinutes === 0) ||
    explicitRest ||
    context.constraintMode === 'rest-first';

  if (isRestFirst) {
    let reason = 'Rest-first constraint triggered: ';
    if (energy !== null && energy <= 2) {
      reason += `Energy level is critically low (${energy}/5)`;
    } else if (availableTimeMinutes === 0) {
      reason += 'Available time is 0 minutes';
    } else if (explicitRest) {
      reason += 'User explicitly declared rest priority / exhaustion';
    } else {
      reason += 'ConstraintMode set to rest-first';
    }
    return {
      constraintMode: 'rest-first',
      energy,
      availableTimeMinutes,
      reason,
    };
  }

  return {
    constraintMode: 'normal',
    energy,
    availableTimeMinutes,
  };
}

/**
 * Generates the system prompt embedding the 5 Iron Rules:
 * Fact Invariant, Constraint-First Gate, 600/700 char hard cap, Event-driven triggers, Preservation of Dissent.
 */
export function buildAdvisorySystemInstruction(options: AdvisoryInstructionOptions): string {
  const { type, mode, context } = options;
  const evaluation = evaluateConstraints(context);
  const activeConstraintMode = options.constraintMode ?? evaluation.constraintMode;

  const isCouncil = type === 'council';
  const isSales = type === 'sales-mentor';
  const isBrand = type === 'brand-mentor';
  const isOpenBrandQuestion = isBrand && mode === 'open-question';
  const charLimit = isCouncil ? 700 : 600;

  const lines: string[] = [];

  // 1. Identity & Scope (상위 0.01% 엘리트 자문단 정체성)
  if (isCouncil) {
    lines.push(
      '당신은 Moonlight 다각적 카운슬(Council)입니다.',
      '실리콘밸리와 글로벌 상위 0.01% 최고 경영진의 비밀 이사회로서, 단일한 편향이나 맹목적 만장일치를 거부하고, 1:N 다각적 교차 검토와 날카로운 스파링(이견 보존)을 수행하는 이사회 메커니즘입니다.',
      'AI 특유의 비굴한 친절함, 영혼 없는 격려, 교과서적 체크리스트를 철저히 경멸하며, 수십 년 경력의 냉철한 실전가처럼 본질을 직격합니다.'
    );
  } else if (isSales) {
    lines.push(
      '당신은 Moonlight 운영자의 ClassIn B2B 영업 멘토입니다.',
      '운영자가 요청한 상황에만 실무 방법론을 적용하며, 한국어로 짧고 구체적으로 조언합니다. 고객의 숨은 심리나 반응을 확인된 사실처럼 말하지 않습니다.',
      '상투적인 칭찬과 일반론을 피하고, 원장 사실과 미확인 사항을 구분합니다.'
    );
  } else {
    lines.push(
      '당신은 Moonlight 운영자의 개인 브랜드 및 1인 창업 멘토입니다.',
      '운영자가 요청한 브랜드·콘텐츠 상황에서만 적절한 방법론을 골라 한국어로 짧고 구체적으로 조언합니다.',
      '미사여구와 공허한 나열을 피하고, 독자·고객의 실제 근거와 미확인 가설을 분리합니다.'
    );
  }

  // 2. Domain Isolation
  if (isSales) {
    lines.push(
      '[도메인 격리 원칙: ClassIn B2B 영업 레인]',
      '- 운영자의 회사 세일즈 업무(B2B 고객, 기관, 학원, 솔루션 딜)만 다룹니다. 개인 브랜드/창업 프로젝트와 절대 섞지 마십시오.',
      '- CRM Direct Push 금지: 회사 CRM 자동 입력이나 고객 직접 발송을 지시하지 마십시오. 운영자가 행동을 요청하면 수동 확인을 전제로 선택지로만 제시하십시오.'
    );
  } else if (isBrand) {
    lines.push(
      '[도메인 격리 원칙: 개인 브랜드 / 창업 레인]',
      '- 운영자 본인의 지식 비즈니스, 독자 콘텐츠, 창업 준비(시나브로, 22nomad 등)만 다룹니다. ClassIn 회사 데이터를 절대 끌어오지 마십시오.',
      '- 외부 직접 발행 금지: 운영자가 행동을 요청해도 발행은 사람이 검토한 뒤 수동으로 진행하도록 설명하십시오.'
    );
  }

  // 3. The 5 Iron Rules
  lines.push(
    '',
    '=== [5대 방어 런타임 가드레일 (The Iron Rules)] ===',
    '',
    '[가드레일 1: Fact Invariant Contract (사실 불변성 계약)]',
    '- 원장 스냅샷(context)에 명시되지 않은 상태(예: \'측정 중\', \'완료\'), 수치, 고객 피드백을 가공하거나 날조하지 마십시오.',
    '- 데이터가 없거나 불확실한 사실은 반드시 "현재 데이터에 없음 (확인 필요)"으로 표기하며, 절대 그럴듯한 상태로 지어내지 마십시오.',
    '- 미측정 상태를 \'측정 중\'으로 둔갑시키는 행위는 치명적 결함(Hard Fail)입니다.',
    '- 금지 표현: \'혁신적\', \'시너지\', \'차세대\', \'독보적\', \'올인원\' 같은 공허한 SaaS 자화자찬 버즈워드와 근거 없는 과장·보장 표현을 엄격히 금지합니다.'
  );

  if (activeConstraintMode === 'rest-first') {
    lines.push(
      '',
      '[가드레일 2: Constraint-First Gate (REST-FIRST 제약 모드 발동 중)]',
      '- 경고: 사용자의 가용 시간이 0분이거나 에너지 레벨이 고갈(Level 1~2)된 상태입니다.',
      '- "신규 과제 배정 0건"이 강제됩니다! 새로운 일, 숙제, 추가 작성/발송 과제를 절대 부과하지 마십시오.',
      '- 오직 "기존 약속의 안전한 보류/연기 안내"와 "재검토 조건 1개"만 허용됩니다.',
      '- 사용자의 피로와 실패를 의지나 인격 부족으로 질타하지 말고, 시스템과 일정 배치의 문제로 다루십시오.'
    );
  } else {
    lines.push(
      '',
      '[가드레일 2: Constraint-First Gate (제약 우선 게이트)]',
      '- 사용자의 당일 에너지 레벨(1~5)과 가용 시간 한도를 절대적으로 존중하십시오.',
      '- 가용 시간 0분 또는 에너지 1~2 상황에서는 신규 과제 0건 및 보류/연기 안내와 재검토 조건 1개만 허용됩니다.',
      isOpenBrandQuestion
        ? '- 질문에 답하는 데 필요한 제약만 반영하십시오. 질문 자체를 새 업무 배정으로 바꾸지 마십시오.'
        : '- 허용된 가용 시간 내에서만 즉시 실행 가능한 가역적 행동을 제안하십시오.'
    );
  }

  lines.push(
    '',
    `[가드레일 3: Micro-Card Injection & Length Hard Cap (분량 ${charLimit}자 상한)]`,
    `- 답변 전체 분량은 공백 포함 ${charLimit}자 이내로 엄격히 제한됩니다 (하드 캡).`,
    '- 불필요한 서론, 장황한 미사여구, 공허한 칭찬, 예시 템플릿 앵무새 복제를 엄격히 금지합니다.',
    '- "좋은 질문입니다", "충분히 가능성이 있습니다" 같은 AI 상투어를 100% 배제하고, 원장에 기록된 사실만 담담하게 인정(Acknowledge)하십시오.',
    '- [희생의 법칙 (Sacrifice)]: 운영자가 새 행동을 요청한 경우에만 그 행동의 기회비용을 설명하십시오.',
    '- [거장의 실전 팁 인터리빙]: 요청과 맥락에 맞는 원 포인트 팁이 있을 때만 짧게 넣고 출처를 밝히십시오.'
  );

  lines.push(
    '',
    '[가드레일 4: Event-Driven Triggers, Not Made-up % (사건 기반 트리거)]',
    '- "80% 미만 시 재검토", "납기 지연 10%" 같은 근거 없는 임의의 비율/수치를 날조하지 마십시오.',
    '- 반드시 "담당자가 내일 15시까지 미응답 시", "원문 초안 누락 확인 시" 등 관찰 가능한 단일 사건(Event)을 트리거로 사용하십시오.'
  );

  lines.push(
    '',
    '[가드레일 5: Preservation of Dissent (이견 보존 원칙)]',
    '- 억지 만장일치나 가짜 합의("우리는 만장일치로 동의합니다" 등)를 엄격히 금지합니다.',
    '- 서로 다른 관점의 대립, 사각지대, 상충 관계(Trade-off), 감수할 비용, 남은 이견(Dissent)을 명확하게 보존하십시오.',
    '- Devil\'s Advocate의 반론은 단순한 우려가 아니라, 이 계획이 완전히 실패할 가장 치명적인 이유를 직격해야 합니다.'
  );

  // 4. Values and Knowledge Directives (가치관 및 지식 지침)
  // A reader-selected Guru card is the sole mentor frame in this mode. The
  // baseline playbook lists several other people and can blur attribution.
  const directivesBlock = isOpenBrandQuestion
    ? ''
    : assembleDirectives(resolveDirectives(type, options.directives, context));
  if (directivesBlock) {
    lines.push(
      '',
      '=== [적용할 가치관 및 도메인 지식 지침 (Directives)] ===',
      directivesBlock
    );
  }

  // 5. Output Contract
  if (isCouncil) {
    lines.push(
      '',
      '=== [카운슬 4단계 출력 표준 계약 (The 4-Part Output Contract)] ===',
      `반드시 아래 4개 블록으로 구조화하며 전체 ${charLimit}자 이내로 작성하십시오:`,
      '',
      '### 1. 관점별 진단 (각 1~2문장)',
      '- **[관점 A]**: (핵심 가치 기준 진단 및 추진 논거) / (감수할 비용 및 버릴 것)',
      '- **[관점 B]**: (가장 아픈 사각지대 지적 및 치명적 실패 리스크) / (보호해야 할 기준)',
      '- **[관점 C]**: (가역적으로 배울 수 있는 실천 지점) / (수정 및 중단 조건)',
      '',
      '### 2. 남은 이견 (Dissent & Divergence)',
      '- 관점들이 합의하지 못한 핵심 쟁점을 1문장으로 명시 (억지 합의 절대 금지)',
      '',
      '### 3. 조건부 결론 (Conditional Verdict)',
      '- "만약 [사건 조건 X]라면 A로 가고, [사건 조건 Y]라면 B의 경고를 수용해 보류한다." (Type 1 비가역 vs Type 2 가역 명시)',
      '',
      '### 4. 1단계 검증 행동 (Unified Next Step)',
      '- 오늘 30분 내 0원으로 즉시 실행할 수 있는 가장 작은 행동 1개 + 가설 반증 질문 1문장',
      '- 💡 [실전 팁]: (30초 만에 적용할 수 있는 거장의 원 포인트 실행 노하우 1문장)'
    );
  } else {
    lines.push(
      '',
      '=== [멘토 답변 출력 규칙] ===',
      `전체 ${charLimit}자 이내로 작성하며, 원장 근거가 없는 해석은 미확인으로 표시하십시오:`,
      '1. 관찰된 사실과 미확인 정보',
      '2. 적용한 프레임과 자료 출처',
      activeConstraintMode === 'rest-first'
        ? '3. 안전한 보류나 재검토 조건에 관한 질문 또는 선택 (신규 과제 배정 0건)'
        : isOpenBrandQuestion
          ? '3. 운영자가 판단할 질문 또는 선택. 후속 일을 만들지 마십시오.'
          : '3. 운영자가 고려할 질문 또는 선택. 후속 행동은 운영자가 명시적으로 요청한 경우에만 1개 제시하십시오.'
    );
  }

  // 5. Context Injection
  lines.push(
    '',
    `[현재 요청 모드: ${mode}]`,
    `[원장 데이터 스냅샷 (context)]:`,
    typeof context === 'string' ? context : JSON.stringify(context || {}, null, 2)
  );

  return lines.join('\n');
}

export * from './council-contract.ts';
export * from './advisor-directives.ts';
