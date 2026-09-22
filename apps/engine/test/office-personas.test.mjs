import test from 'node:test';
import assert from 'node:assert/strict';

import { OFFICE_AGENT_IDS } from '@com-moon/agent-contracts/office';
import { OFFICE_PERSONAS } from '../lib/office/personas.ts';
import { buildOfficePrompt } from '../lib/office/prompt.ts';

test('OFFICE_PERSONAS defines all 9 personas with complete results & directionality metadata', () => {
  assert.equal(Object.keys(OFFICE_PERSONAS).length, 9);

  for (const id of OFFICE_AGENT_IDS) {
    const p = OFFICE_PERSONAS[id];
    assert.ok(p, `Persona ${id} must exist`);
    assert.equal(p.id, id);
    assert.ok(p.nameKo, `${id} must have nameKo`);
    assert.ok(p.nameEn, `${id} must have nameEn`);
    assert.ok(p.title, `${id} must have title`);
    assert.ok(p.role, `${id} must have role`);
    assert.ok(p.tagline, `${id} must have tagline`);
    assert.ok(p.focus, `${id} must have focus`);
    assert.ok(p.boundary, `${id} must have boundary`);
    assert.ok(p.resultFocus, `${id} must have resultFocus`);
    assert.ok(p.directionFocus, `${id} must have directionFocus`);
    assert.ok(p.decisionRubric, `${id} must have decisionRubric`);
    assert.ok(Array.isArray(p.tensionWith) && p.tensionWith.length > 0, `${id} must declare tensionWith`);

    // Verify systemPrompt situational & results/directionality instructions
    assert.ok(p.systemPrompt.includes('상황별 말투 및 어조'), `${id} must contain situational tone rules`);
    assert.ok(
      p.systemPrompt.includes('피로') || p.systemPrompt.includes('과부하') || p.systemPrompt.includes('지쳤'),
      `${id} must contain operator fatigue guidelines`
    );
    assert.ok(p.systemPrompt.includes('결과-방향성 규율'), `${id} must contain result & directionality rules`);
    assert.ok(p.systemPrompt.includes('협업 및 토론 태도'), `${id} must contain collaboration & debate stance`);
    assert.ok(p.systemPrompt.includes('상위 1%'), `${id} must contain top-1% mastery and effortless calm guidance`);
  }
});

test('buildOfficePrompt enforces results & directionality across all 4 modes', () => {
  // 1. Chat mode
  const chatPrompt = buildOfficePrompt({
    agentId: 'eevee',
    mode: 'chat',
    message: '오늘 우선순위 정리해줘',
  });
  assert.ok(chatPrompt.prompt.includes('【대화 (Chat) 답변 형식】'));
  assert.ok(chatPrompt.prompt.includes('[내 판단]'));
  assert.ok(chatPrompt.prompt.includes('[지금 바로 할 행동]'));
  assert.ok(chatPrompt.systemInstruction.includes('결과와 방향성을 최우선한다'));
  assert.ok(chatPrompt.systemInstruction.includes('상위 1%의 여유와 내공'));

  // 2. Task mode
  const taskPrompt = buildOfficePrompt({
    agentId: 'glaceon',
    mode: 'task',
    message: 'MVP 스펙 문서 작성',
  });
  assert.ok(taskPrompt.prompt.includes('【실행 초안 (Task) 답변 형식】'));
  assert.ok(taskPrompt.prompt.includes('완전한 실행 산출물/초안'));
  assert.ok(taskPrompt.prompt.includes('완료 조건 (Definition of Done, DoD)'));
  assert.ok(taskPrompt.prompt.includes('실행 담당(DRI)'));

  // 3. Critique mode
  const critiquePrompt = buildOfficePrompt({
    agentId: 'umbreon',
    mode: 'critique',
    message: '제안서 검토',
    draft: '우리는 최고의 솔루션을 제공하여 100% 매출 성장을 보장합니다.',
  });
  assert.ok(critiquePrompt.prompt.includes('【비판적 감사 (Critique) 답변 형식】'));
  assert.ok(critiquePrompt.prompt.includes('치명적 맹점 및 위치'));
  assert.ok(critiquePrompt.prompt.includes('구체적 수정 대안 및 안전 통과 조건 (Pass Criteria)'));

  // 4. Council mode
  const councilPrompt = buildOfficePrompt({
    agentId: 'espeon',
    mode: 'council',
    message: '새로운 서비스 투자 타당성',
    participants: ['leafeon', 'glaceon'],
  });
  assert.ok(councilPrompt.prompt.includes('【Council 종합 회의 답변 형식】'));
  assert.ok(councilPrompt.prompt.includes('주관 임원 에브이의 1차 판단 및 방향'));
  assert.ok(councilPrompt.prompt.includes('참여 임원 교차 토론 및 쟁점 검증'));
  assert.ok(councilPrompt.prompt.includes('추천 결정'));
  assert.ok(councilPrompt.prompt.includes('방향성 & 포기할 대안'));
  assert.ok(councilPrompt.prompt.includes('재검토/중단 조건 (Kill Criteria)'));
  assert.ok(councilPrompt.prompt.includes('실행 산출물 & 단일 담당(DRI)'));
  assert.ok(councilPrompt.systemInstruction.includes('영혼 없는 동의나 형식적 나열을 하지 않고'));
});

test('buildOfficePrompt injects context and lenses accurately', () => {
  const prompt = buildOfficePrompt({
    agentId: 'flareon',
    mode: 'task',
    message: '고객 후속 이메일 작성',
    lens: '스티브 잡스',
    context: {
      scope: 'sales',
      recentDeals: [{ name: 'A사 계약', stage: 'proposal' }],
      recentTasks: [{ title: '제안서 발송', status: 'todo' }],
      note: '가격 협상 대기 중',
    },
  });

  assert.ok(prompt.prompt.includes('【운영 문맥 스냅샷】'));
  assert.ok(prompt.prompt.includes('작업 스코프: sales'));
  assert.ok(prompt.prompt.includes('A사 계약'));
  assert.ok(prompt.prompt.includes('제안서 발송'));
  assert.ok(prompt.prompt.includes('가격 협상 대기 중'));
  assert.ok(prompt.prompt.includes('【참고 렌즈 관점】: 스티브 잡스'));
});
