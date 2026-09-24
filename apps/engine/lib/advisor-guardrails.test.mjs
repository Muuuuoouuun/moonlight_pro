import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as guardrails from './advisor-guardrails.ts';
import * as council from './council-contract.ts';

describe('advisor guardrails constraint evaluation', () => {
  it('triggers rest-first when energy <= 2', () => {
    const eval1 = guardrails.evaluateConstraints({ energy: 1, availableTimeMinutes: 30 });
    assert.equal(eval1.constraintMode, 'rest-first');
    assert.equal(eval1.energy, 1);
    assert.equal(eval1.availableTimeMinutes, 30);
    assert.ok(eval1.reason?.toLowerCase().includes('energy level is critically low'));

    const eval2 = guardrails.evaluateConstraints({ energy: 2 });
    assert.equal(eval2.constraintMode, 'rest-first');
    assert.equal(eval2.energy, 2);

    const evalNested = guardrails.evaluateConstraints({
      operator: { energy: '1/5', availableTimeMinutes: 15 },
    });
    assert.equal(evalNested.constraintMode, 'rest-first');
    assert.equal(evalNested.energy, 1);

    const evalText = guardrails.evaluateConstraints({
      text: '가상 업무 기록: 에너지는 1/5다. 고객 연락 한 건은 끝냈다.',
    });
    assert.equal(evalText.constraintMode, 'rest-first');
    assert.equal(evalText.energy, 1);
  });

  it('triggers rest-first when available time === 0', () => {
    const evalZero = guardrails.evaluateConstraints({ availableTimeMinutes: 0 });
    assert.equal(evalZero.constraintMode, 'rest-first');
    assert.equal(evalZero.availableTimeMinutes, 0);
    assert.ok(evalZero.reason?.toLowerCase().includes('available time is 0'));

    const evalEnergyHighTimeZero = guardrails.evaluateConstraints({
      energy: 4,
      availableTime: 0,
    });
    assert.equal(evalEnergyHighTimeZero.constraintMode, 'rest-first');
    assert.equal(evalEnergyHighTimeZero.availableTimeMinutes, 0);

    const evalNestedZero = guardrails.evaluateConstraints({
      operator: { availableTimeMinutes: 0 },
    });
    assert.equal(evalNestedZero.constraintMode, 'rest-first');
    assert.equal(evalNestedZero.availableTimeMinutes, 0);

    const evalTextZero = guardrails.evaluateConstraints({
      input_summary: '남은 시간 0분, 체력 고갈로 휴식 우선',
    });
    assert.equal(evalTextZero.constraintMode, 'rest-first');
    assert.equal(evalTextZero.availableTimeMinutes, 0);

    const evalExplicitRest = guardrails.evaluateConstraints({
      initial: '오늘은 휴식을 우선하겠다고 결정했다. 작업은 보류다.',
    });
    assert.equal(evalExplicitRest.constraintMode, 'rest-first');
  });

  it('evaluates normal mode when energy > 2 and time > 0', () => {
    const evalNormal = guardrails.evaluateConstraints({ energy: 3, availableTimeMinutes: 30 });
    assert.equal(evalNormal.constraintMode, 'normal');
    assert.equal(evalNormal.energy, 3);
    assert.equal(evalNormal.availableTimeMinutes, 30);

    const evalHigh = guardrails.evaluateConstraints({
      operator: { energy: 5, availableTime: 90 },
    });
    assert.equal(evalHigh.constraintMode, 'normal');
    assert.equal(evalHigh.energy, 5);
    assert.equal(evalHigh.availableTimeMinutes, 90);

    const evalEmpty = guardrails.evaluateConstraints({});
    assert.equal(evalEmpty.constraintMode, 'normal');

    const evalNull = guardrails.evaluateConstraints(null);
    assert.equal(evalNull.constraintMode, 'normal');
  });
});

describe('buildAdvisorySystemInstruction prompt generation', () => {
  it('contains strict Fact Invariant and Dissent instructions for council', () => {
    const prompt = guardrails.buildAdvisorySystemInstruction({
      type: 'council',
      mode: 'sparring',
      context: { topic: '신규 오퍼 검토' },
    });

    // Fact Invariant Contract
    assert.ok(prompt.includes('Fact Invariant Contract'));
    assert.ok(prompt.includes('현재 데이터에 없음 (확인 필요)'));
    assert.ok(prompt.includes('미측정 상태를 \'측정 중\'으로 둔갑'));
    assert.ok(prompt.includes('Hard Fail'));

    // Preservation of Dissent
    assert.ok(prompt.includes('Preservation of Dissent'));
    assert.ok(prompt.includes('억지 만장일치'));
    assert.ok(prompt.includes('남은 이견 (Dissent & Divergence)'));

    // Council 4-Part Output Contract & 700 char limit
    assert.ok(prompt.includes('카운슬 4단계 출력 표준 계약'));
    assert.ok(prompt.includes('700자 이내'));
    assert.ok(prompt.includes('1. 관점별 진단'));
    assert.ok(prompt.includes('2. 남은 이견'));
    assert.ok(prompt.includes('3. 조건부 결론'));
    assert.ok(prompt.includes('4. 1단계 검증 행동'));

    // Forbidden buzzwords
    assert.ok(prompt.includes('혁신적'));
    assert.ok(prompt.includes('시너지'));
  });

  it('embeds rest-first directive with 0 new tasks when energy <= 2 or time === 0', () => {
    const prompt = guardrails.buildAdvisorySystemInstruction({
      type: 'sales-mentor',
      mode: 'deal-review',
      context: { energy: 1, availableTimeMinutes: 0 },
    });

    assert.ok(prompt.includes('REST-FIRST 제약 모드 발동 중'));
    assert.ok(prompt.includes('신규 과제 배정 0건'));
    assert.ok(prompt.includes('기존 약속의 안전한 보류/연기 안내'));
    assert.ok(prompt.includes('재검토 조건 1개'));
    assert.ok(prompt.includes('600자 이내'));
  });

  it('embeds domain isolation rules for sales-mentor and brand-mentor', () => {
    const salesPrompt = guardrails.buildAdvisorySystemInstruction({
      type: 'sales-mentor',
      mode: 'pipeline-triage',
      context: {},
    });
    assert.ok(salesPrompt.includes('ClassIn B2B 영업 레인'));
    assert.ok(salesPrompt.includes('CRM Direct Push 금지'));

    const brandPrompt = guardrails.buildAdvisorySystemInstruction({
      type: 'brand-mentor',
      mode: 'brand-strategy',
      context: {},
    });
    assert.ok(brandPrompt.includes('개인 브랜드 / 창업 레인'));
    assert.ok(brandPrompt.includes('ClassIn 회사 데이터를 절대 끌어오지 마십시오'));
    assert.ok(brandPrompt.includes('외부 직접 발행 금지'));
  });

  it('keeps mentor advice optional and out of the approval queue by default', () => {
    for (const type of ['sales-mentor', 'brand-mentor']) {
      const prompt = guardrails.buildAdvisorySystemInstruction({ type, mode: 'deal-review', context: {} });
      assert.match(prompt, /운영자가.*요청/);
      assert.match(prompt, /질문 또는 선택/);
      assert.doesNotMatch(prompt, /work_orders 승인 큐|승인 큐 인큐|항상 즉시 실행 가능한|반드시.*다음 한 수/);
    }
  });

  it('keeps an open personal brand question to observation, source frame and operator choice', () => {
    const prompt = guardrails.buildAdvisorySystemInstruction({
      type: 'brand-mentor', mode: 'open-question', context: { scope: 'personal' },
    });
    assert.match(prompt, /관찰/);
    assert.match(prompt, /프레임/);
    assert.match(prompt, /질문 또는 선택/);
    assert.doesNotMatch(prompt, /즉시 실행 가능한 가역적 행동을 제안|후속 행동은 운영자가 명시적으로 요청한 경우에만 1개 제시|승인 큐 후보/);
  });

  it('embeds values and knowledge directives into system instruction', () => {
    const prompt = guardrails.buildAdvisorySystemInstruction({
      type: 'sales-mentor',
      mode: 'pipeline-triage',
      context: {},
      directives: {
        values: {
          coreValues: ['정직성 최우선'],
          acceptableCosts: ['단기 계약 지연 감수'],
          legendIds: ['socrates'],
        },
        knowledge: {
          facts: ['특별 할인 프로모션 없음'],
          playbooks: ['Keenan GAP 4층 진단'],
        },
      },
    });

    assert.ok(prompt.includes('=== [적용할 가치관 및 도메인 지식 지침 (Directives)] ==='));
    assert.ok(prompt.includes('[가치관 지침 (Values Directives)]'));
    assert.ok(prompt.includes('정직성 최우선'));
    assert.ok(prompt.includes('소크라테스'));
    assert.ok(prompt.includes('[도메인 지식 지침 (Knowledge Directives)]'));
    assert.ok(prompt.includes('특별 할인 프로모션 없음'));
    assert.ok(prompt.includes('Keenan GAP 4층 진단'));
  });
});

describe('parseCouncilResponse contract parsing', () => {
  const cleanMarkdown = `
### 1. 관점별 진단 (각 1~2문장)
- **[잡스]**: 핵심 독서 경험 하나에 집중하라 / 부가 기능 3개 포기
- **[베이조스]**: 사전 랜딩 1장으로 수요 먼저 검증하라 / 완성도 불안감 감수
- **[이본 쉬나드]**: 지속 가능한 운영 구조를 유지하라 / 단기 성장 기회 포기

### 2. 남은 이견 (Dissent & Divergence)
완성도 우선(잡스) vs 검증 속도 우선(베이조스)의 상충

### 3. 조건부 결론 (Conditional Verdict)
만약 사전 랜딩 신청이 20명 이상이면 베이조스 안으로 가고, 독서 경험 불만족 시 잡스 안을 따른다.

### 4. 1단계 검증 행동 (Unified Next Step)
핵심 혜택 1줄이 적힌 사전 랜딩페이지 초안 작성 및 금요일 18시 재검토.
`.trim();

  it('parses clean markdown accurately into 4-part structure', () => {
    const result = council.parseCouncilResponse(cleanMarkdown);

    assert.equal(result.lenses.length, 3);
    assert.equal(result.lenses[0].lens, '잡스');
    assert.equal(result.lenses[0].verdict, '핵심 독서 경험 하나에 집중하라');
    assert.equal(result.lenses[0].cost, '부가 기능 3개 포기');

    assert.equal(result.lenses[1].lens, '베이조스');
    assert.equal(result.lenses[1].verdict, '사전 랜딩 1장으로 수요 먼저 검증하라');
    assert.equal(result.lenses[1].cost, '완성도 불안감 감수');

    assert.equal(result.lenses[2].lens, '이본 쉬나드');
    assert.equal(result.lenses[2].verdict, '지속 가능한 운영 구조를 유지하라');
    assert.equal(result.lenses[2].cost, '단기 성장 기회 포기');

    assert.equal(result.dissent, '완성도 우선(잡스) vs 검증 속도 우선(베이조스)의 상충');
    assert.ok(result.conditionalVerdict.includes('만약 사전 랜딩 신청이 20명 이상이면'));
    assert.ok(result.nextAction.includes('핵심 혜택 1줄이 적힌 사전 랜딩페이지 초안 작성'));
  });

  it('parses fenced markdown (```markdown ... ```) accurately', () => {
    const fencedMarkdown = '```markdown\n' + cleanMarkdown + '\n```';
    const result = council.parseCouncilResponse(fencedMarkdown);

    assert.equal(result.lenses.length, 3);
    assert.equal(result.lenses[0].lens, '잡스');
    assert.equal(result.lenses[1].lens, '베이조스');
    assert.equal(result.dissent, '완성도 우선(잡스) vs 검증 속도 우선(베이조스)의 상충');
    assert.ok(result.conditionalVerdict.includes('만약 사전 랜딩 신청이 20명 이상이면'));
    assert.ok(result.nextAction.includes('핵심 혜택 1줄이 적힌 사전 랜딩페이지 초안 작성'));
  });

  it('parses JSON format accurately', () => {
    const jsonText = JSON.stringify({
      lenses: [
        { lens: 'Closer', verdict: '즉시 제안', cost: '준비 미흡 감수' },
        { lens: 'Devil Advocate', verdict: '위험 차단', cost: '기회 지연 감수' },
      ],
      dissent: '속도 vs 안전 상충',
      conditionalVerdict: '조건 A 확인 시 제안, 불확실 시 보류',
      nextAction: '체크리스트 확인',
    });

    const result = council.parseCouncilResponse(jsonText);
    assert.equal(result.lenses.length, 2);
    assert.equal(result.lenses[0].lens, 'Closer');
    assert.equal(result.lenses[0].verdict, '즉시 제안');
    assert.equal(result.lenses[0].cost, '준비 미흡 감수');
    assert.equal(result.dissent, '속도 vs 안전 상충');
    assert.equal(result.conditionalVerdict, '조건 A 확인 시 제안, 불확실 시 보류');
    assert.equal(result.nextAction, '체크리스트 확인');
  });

  it('extracts tacticalTip when present in markdown section 4', () => {
    const mdWithTip = `
### 1. 관점별 진단
- **[카네기]**: 상대의 체면을 세워주라 / 즉각적 반박 포기
- **[나폴레온 힐]**: 흔들림 없는 목적의 명확성을 확립하라 / 미온적 타협 배제

### 2. 남은 이견
관계적 공감 우선(카네기) vs 원칙적 결단 우선(힐)의 긴장

### 3. 조건부 결론
상대방이 신뢰를 원할 때는 카네기 접근, 합의된 원칙을 요구할 때는 힐 접근으로 결단한다.

### 4. 1단계 검증 행동
- 내일 오전 10시까지 상대방의 핵심 우려 1가지를 경청하는 1:1 대화 요청.
- 💡 [실전 팁]: 논쟁에서 이기는 유일한 방법은 논쟁을 피하는 것임을 명심하십시오. (카네기 『인간관계론』 3부 1장)
`.trim();

    const result = council.parseCouncilResponse(mdWithTip);
    assert.equal(result.lenses.length, 2);
    assert.ok(result.nextAction.includes('1:1 대화 요청'));
    assert.ok(!result.nextAction.includes('💡'));
    assert.equal(result.tacticalTip, '논쟁에서 이기는 유일한 방법은 논쟁을 피하는 것임을 명심하십시오. (카네기 『인간관계론』 3부 1장)');
  });

  it('extracts tacticalTip from JSON format', () => {
    const jsonWithTip = JSON.stringify({
      lenses: [{ lens: '카네기', verdict: '경청', cost: '반박 포기' }],
      dissent: '없음',
      conditionalVerdict: '경청 후 제안',
      nextAction: '내일 아침 전화',
      tacticalTip: '통화 시작 10초 동안 상대방 이름을 세 번 기억하고 불러라.',
    });

    const result = council.parseCouncilResponse(jsonWithTip);
    assert.equal(result.nextAction, '내일 아침 전화');
    assert.equal(result.tacticalTip, '통화 시작 10초 동안 상대방 이름을 세 번 기억하고 불러라.');
  });
});

describe('validateAdvisoryFidelity anti-hallucination verification', () => {
  it('catches fabricated claims of progress like unverified "측정 중"', () => {
    const textWithFabrication = '수치화된 성과는 현재 측정 중이며, 곧 개선될 것입니다.';
    const contextUnmeasured = { status: '성과 미측정', trials: 3 };

    const result = council.validateAdvisoryFidelity(textWithFabrication, contextUnmeasured);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.type === 'fabricated_claim' && v.match?.includes('측정 중')));
  });

  it('catches forbidden default SaaS buzzwords', () => {
    const buzzwordText = '저희의 혁신적인 올인원 교육 솔루션은 강력한 시너지를 창출합니다.';
    const result = council.validateAdvisoryFidelity(buzzwordText, {});

    assert.equal(result.valid, false);
    const words = result.violations.filter((v) => v.type === 'forbidden_buzzword').map((v) => v.match);
    assert.ok(words.includes('혁신적') || words.includes('혁신적인'));
    assert.ok(words.includes('시너지') || words.includes('시너지를'));
    assert.ok(words.includes('올인원'));
  });

  it('catches made-up metrics not in context', () => {
    const textWithMadeUpMetric = '이번 조치를 통해 성과 30% 향상이 예상됩니다.';
    const context = { leads: 5 };

    const result = council.validateAdvisoryFidelity(textWithMadeUpMetric, context);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.type === 'unverified_metric' && v.match === '30%'));
  });

  it('passes truthful text grounded in context with no buzzwords', () => {
    const validText = '현재 데이터에 없음 (확인 필요). 전환율 20% 기준으로 금요일 18시에 재검토합니다.';
    const context = { conversionTarget: '20%', status: '진행 대기' };

    const result = council.validateAdvisoryFidelity(validText, context);
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });
});
