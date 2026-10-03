import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfficeConnectionBrandPicker, OfficeConnectionSourceAction, OfficeConnectionSourceDrawer } from './office-connection-source.jsx';
import { officeCouncilConnectionSource } from './office-connection-inbox.js';

const brandId = '11111111-1111-4111-8111-111111111111';
const turn = { id: 'render-turn', message: '보존할 원문 <script>입력</script>', request: { scope: 'personal', mode: 'council', message: '전체 원문' },
  result: { status: 'generated', scope: 'personal', mode: 'council', answer: '<script>출력</script>' }, officeBoundary: { scope: 'personal', brandId } };
const brandState = { status: 'live', brands: [{ id: brandId, name: '기존 브랜드 이름', orgScope: 'personal' }] };
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('closed source action renders one explicit control and never calls the inbox or reader', () => {
  let shares = 0;
  const html = render(OfficeConnectionSourceAction, { turn, inbox: { publish() { shares += 1; } } });
  assert.equal(shares, 0);
  assert.match(html, /이브이에게 입력 공유/);
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.doesNotMatch(html, /role="dialog"|세션 입력 공유됨/);
});

test('source drawer names the captured brand, escapes the whole original and makes sharing limits explicit', () => {
  let reads = 0, shares = 0;
  const html = render(OfficeConnectionSourceDrawer, { outcome: officeCouncilConnectionSource(turn), brandState,
    reader: async () => { reads += 1; return brandState; }, onShare() { shares += 1; } });
  assert.equal(reads, 0); assert.equal(shares, 0);
  assert.match(html, /role="dialog"/); assert.match(html, /기존 브랜드 이름/);
  assert.match(html, /&lt;script&gt;출력&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  for (const text of ['현재 브라우저 세션', '독립적으로 사실 검증되지 않았습니다', '승인이나 실행 권한으로 이어지지 않습니다', '브랜드의 사실 자료를 읽었다는 증거가 아닙니다', '모델 호출·자동 업무 생성·실행·외부 발송', '최대 10개']) assert.ok(html.includes(text));
  assert.match(html, /<button(?![^>]*disabled)[^>]*>원문을 세션 입력으로 공유/);
});

test('needs-user and shared drawer states disable capture and report exactly the session outcome', () => {
  const html = render(OfficeConnectionSourceDrawer, { outcome: { status: 'needs_user', note: '원래 브랜드가 필요합니다.' }, brandState });
  assert.match(html, /원래 브랜드가 필요합니다/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>원문을 세션 입력으로 공유/);
  const shared = render(OfficeConnectionSourceDrawer, { outcome: officeCouncilConnectionSource(turn), brandState, shared: { status: 'shared' } });
  assert.match(shared, /이 세션의 이브이 입력 목록에 공유했습니다/);
  assert.match(shared, /<button[^>]*disabled=""[^>]*>세션 입력 공유됨/);
  assert.doesNotMatch(shared, /업무 완료|승인됨|발송 완료/);
});

test('restored customer receipt drawer says the original generation prompt was not recovered', () => {
  const outcome = officeCouncilConnectionSource(turn);
  outcome.source = { ...outcome.source, kind: 'customer_reply', label: '고객 대응 · 현재 보관 결과', source: { state: { request: null,
    receipt: { result: { artifact: { body: '보관된 답장 원문' } } }, context: { facts: { customer: { brandId } } } } } };
  const html = render(OfficeConnectionSourceDrawer, { outcome, brandState });
  assert.match(html, /보관된 현재 고객 결과·자료·승인 기록/);
  assert.match(html, /원래 생성 요청 본문은 복구되지 않았습니다/);
  assert.match(html, /보관된 답장 원문/);
  assert.match(html, /모델이 해당 브랜드의 사실 자료를 읽었다는 증거가 아닙니다/);
  assert.match(html, /승인이나 실행 권한으로 이어지지 않습니다/);
});

test('brand picker uses familiar existing names, company unbranded choice, and scope-dependent capture guidance', () => {
  const personal = render(OfficeConnectionBrandPicker, { scope: 'personal', value: brandId, brandState });
  assert.match(personal, /<select/); assert.match(personal, /기존 브랜드 이름/); assert.match(personal, /브랜드 선택 필요/);
  assert.doesNotMatch(personal, /<input|UUID/);
  assert.match(personal, /브랜드 사실 자료를 모델에 제공/);
  const company = render(OfficeConnectionBrandPicker, { scope: 'classin', value: null, brandState: { status: 'live', brands: [] } });
  assert.match(company, /회사 공통 · 브랜드 없음/); assert.match(company, /확인한 브랜드가 없습니다/);
  const all = render(OfficeConnectionBrandPicker, { scope: 'all', brandState });
  assert.match(all, /회사 또는 개인 범위에서 새 요청/); assert.doesNotMatch(all, /<select/);
});

test('brand picker and drawer expose errors and preview without disguising them as loading or empty choices', () => {
  for (const status of ['error', 'preview']) {
    const html = render(OfficeConnectionBrandPicker, { scope: 'personal', brandState: { status, brands: [], note: '자료 상태 확인 필요' } });
    assert.match(html, /자료 상태 확인 필요/); assert.match(html, /브랜드 다시 확인/);
    assert.doesNotMatch(html, /브랜드 목록 확인 중|<select/);
    if (status === 'error') assert.match(html, /role="alert"/);
  }
  assert.match(render(OfficeConnectionBrandPicker, { scope: 'personal', brandState: { status: 'loading', brands: [] } }), /브랜드 목록 확인 중/);
});
