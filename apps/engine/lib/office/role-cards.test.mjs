import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_IDS, parseOfficeRequest } from '@com-moon/agent-contracts/office';
import { OFFICE_PERSONAS, OFFICE_PERSONA_VERSION } from './personas.ts';
import { OFFICE_PLAYBOOKS } from './playbooks.ts';
import { OFFICE_ROLE_CARDS, OFFICE_ROLE_CARD_VERSION, getOfficeRoleCard, renderOfficeRolePersona, renderOfficeRolePlaybook } from './role-cards.ts';
import { buildOfficePrompt } from './prompt.ts';
import { buildOfficeReview } from './review.ts';

test('nine versioned role artifacts serialize without losing their runtime methods', () => {
  assert.deepEqual(Object.keys(OFFICE_ROLE_CARDS), OFFICE_IDS);
  assert.equal(OFFICE_PERSONA_VERSION, OFFICE_ROLE_CARD_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(OFFICE_ROLE_CARDS)), OFFICE_ROLE_CARDS);
  for (const id of OFFICE_IDS) {
    const card = getOfficeRoleCard(id);
    assert.equal(card.id, id);
    assert.ok(Object.isFrozen(card) && Object.isFrozen(card.expertise) && Object.isFrozen(card.voice));
    assert.equal(OFFICE_PERSONAS[id], renderOfficeRolePersona(id));
    assert.equal(OFFICE_PLAYBOOKS[id], renderOfficeRolePlaybook(id));
    for (const field of ['expertise', 'decisionProcess', 'evidence', 'boundaries']) {
      assert.ok(card[field].length > 0, `${id}.${field}`);
      for (const rule of card[field]) assert.ok(OFFICE_PLAYBOOKS[id].includes(rule), `${id}.${field} omitted from runtime`);
    }
    for (const field of ['contribution', 'challengeWhen', 'updateWhen']) assert.ok(OFFICE_PLAYBOOKS[id].includes(card.deliberation[field]));
    for (const handoff of card.handoffs) {
      assert.ok(OFFICE_IDS.includes(handoff.to) && handoff.to !== id);
      assert.ok(handoff.when && handoff.packet);
    }
    for (const example of card.voice.examples) {
      assert.ok(example.when && example.response);
      assert.ok(OFFICE_PERSONAS[id].includes(example.response));
    }
    assert.ok(OFFICE_PERSONAS[id].includes(card.correction.failure));
    assert.ok(OFFICE_PLAYBOOKS[id].includes(card.correction.bias));
  }
  assert.throws(() => getOfficeRoleCard('unknown'), /unknown-office-role/);
});

test('a role keeps its distinct judgment and change-of-mind criteria through prompt and review assembly', () => {
  const context = { source: 'provided', scope: 'personal', projects: [], note: '이번 요청 자료만 사용' };
  for (const id of OFFICE_IDS) {
    const request = parseOfficeRequest({ ownerId: id, scope: 'personal', message: '지금 주어진 자료로 판단해 주세요.' });
    const prompt = buildOfficePrompt(request, context);
    const review = buildOfficeReview(request, context, { answer: '검토할 응답', nextAction: '추가 행동 없음.' });
    const card = getOfficeRoleCard(id);
    assert.ok(prompt.systemInstruction.includes(card.mission));
    assert.ok(review.systemInstruction.includes(card.deliberation.updateWhen));
    for (const other of OFFICE_IDS.filter(other => other !== id)) {
      assert.equal(prompt.systemInstruction.includes(OFFICE_PERSONAS[other]), false);
      assert.equal(prompt.systemInstruction.includes(OFFICE_PLAYBOOKS[other]), false);
    }
    assert.ok(prompt.systemInstruction.length < 24000);
    assert.ok(review.systemInstruction.length < 24000);
  }
  assert.equal(new Set(OFFICE_IDS.map(id => OFFICE_ROLE_CARDS[id].deliberation.contribution)).size, 9);
});

test('rendered expertise preserves status, arithmetic and authorship distinctions without imposing an output template', () => {
  assert.match(OFFICE_PLAYBOOKS.vaporeon, /활동 건수와 고유 고객 수/);
  assert.match(OFFICE_PLAYBOOKS.jolteon, /타임아웃은 미실행 증거가 아니다/);
  assert.match(OFFICE_PLAYBOOKS.flareon, /무응답은 거절도 동의도 아니/);
  assert.match(OFFICE_PLAYBOOKS.leafeon, /첫 달이 반드시 손실이라고 가정하지 않는다/);
  assert.match(OFFICE_PLAYBOOKS.glaceon, /같은 ID와 원문 연결/);
  assert.match(OFFICE_PLAYBOOKS.sylveon, /참고 글의 경험을 저자의 경험으로 옮기지 않는다/);
  for (const id of OFFICE_IDS) {
    assert.match(OFFICE_PERSONAS[id], /실제 사람의 경력.*가진 척하지 않는다/);
    assert.match(OFFICE_PLAYBOOKS[id], /매 답변을 동일한 항목.*만들지 말고/);
  }
});

test('role cards never model pretend execution, invented business numbers or pressure selling', () => {
  // 이 생성 경로에는 조회·발송·예약·업무 등록 도구가 없다 — 예시가 실행을 가장하면 모델이 따라 한다.
  const pretend = [/걸어뒀/, /닫아두/, /배포 완료/, /격리했/, /우회 걸어/, /챙겨둘/, /환경변수로 뺐/, /다이어트해 두/, /재배치해 두/, /순연시켜 둘/, /비우겠습니다/, /끝내두겠습니다/];
  // 운영자 확정(2026-09-23): 카드 속 영업·재무 수치는 운영자의 실제 규칙이 아니다.
  const invented = [/\d+(?:\.\d+)?\s*%/, /\d[\d,]*\s*(?:만\s*)?원/, /\d+\s*개사/, /런웨이/, /\d+\s*배/, /\d+일\s*차/, /사용자\s*\d+명/];
  const pressure = [/서명하시면/, /대박/, /보장해\s*드/, /100%\s*클로징/];
  for (const id of OFFICE_IDS) {
    const text = JSON.stringify(OFFICE_ROLE_CARDS[id]);
    for (const pattern of [...pretend, ...invented, ...pressure]) assert.doesNotMatch(text, pattern, `${id}: ${pattern}`);
  }
});

test('evidence rules removed in v24 stay in the runtime playbooks', () => {
  assert.match(OFFICE_PLAYBOOKS.umbreon, /숫자·인용·후기·지원 약속·완료 표현을 근거에 대조한다/);
  assert.match(OFFICE_PLAYBOOKS.umbreon, /문제 수를 채우지 않는다/);
  assert.match(OFFICE_PLAYBOOKS.umbreon, /리스크가 없거나 검증과 관계없이 안전하다고 보장하지 않는다/);
  assert.match(OFFICE_PLAYBOOKS.espeon, /근거가 없는 장기 수익·소요시간을 숫자로 채우지 않는다/);
  assert.match(OFFICE_PLAYBOOKS.espeon, /인지 에너지 1\/3은 목표이지 현재 달성률/);
  assert.match(OFFICE_PLAYBOOKS.eevee, /결과물 주관 하나를 보존한다/);
});
