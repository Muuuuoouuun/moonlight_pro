import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Next compiles CSS modules; under node --test give the component a class-name proxy.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.module.css')) {
    return { url: 'data:text/javascript,' + encodeURIComponent('export default new Proxy({}, { get: (_, key) => typeof key === "string" ? key : undefined });'), shortCircuit: true };
  }
  return next(specifier, context);
}`));
const { OfficeSkillRequestDrawer, OfficeSkillRequestHistory } = await import('./office-skill-request-drawer.jsx');

const taskId = 'c8814141-551c-413f-8dfa-adfe5142960f';
const render = element => renderToStaticMarkup(element);
const history = state => render(React.createElement(OfficeSkillRequestHistory, { state, onRefresh: () => {} }));
const item = (state, overrides = {}) => ({
  requestId: '11111111-1111-4111-8111-111111111111', taskId, scope: 'personal', state,
  instruction: '영수증 폴더를 월별로 정리', expectedEvidence: '정리된 폴더 경로', createdAt: '2026-09-25T05:03:00Z',
  receiptAt: state === 'requested' ? null : '2026-09-25T06:10:00Z', receiptActorId: state === 'requested' ? null : 'codex',
  receipt: state === 'requested' ? null : { summary: `${state} 요약`, evidence: [{ kind: 'path', value: '/receipts/2026-09' }, { kind: 'note', value: '누락 2건' }], commandReceiptVerified: state === 'completed' },
  ...overrides,
});

test('meeting history labels its scope explicitly', () => {
  const html = render(React.createElement(OfficeSkillRequestHistory, {
    state: { status: 'live', items: [] }, onRefresh: () => {}, title: '이 회의의 요청 기록',
  }));
  assert.match(html, /이 회의의 요청 기록/);
  assert.doesNotMatch(html, /이 할 일의 요청 기록/);
});

test('request history shows each receipt state with its label, evidence and recorder', () => {
  const html = history({ status: 'live', windowFull: false, items: [
    item('requested', { requestId: '11111111-1111-4111-8111-111111111111' }),
    item('completed', { requestId: '22222222-2222-4222-8222-222222222222' }),
    item('failed', { requestId: '33333333-3333-4333-8333-333333333333' }),
    item('unconfirmed', { requestId: '44444444-4444-4444-8444-444444444444' }),
  ] });
  assert.match(html, /이 할 일의 요청 기록/);
  assert.match(html, /data-lifecycle="queued"[^>]*>.*?요청됨/);
  assert.match(html, /data-lifecycle="done"[^>]*>.*?완료/);
  assert.match(html, /data-lifecycle="blocked"[^>]*>.*?실패/);
  assert.match(html, /data-certainty="unknown"[^>]*>.*?미확인/);
  assert.match(html, /아직 실행 결과가 기록되지 않았습니다/);
  assert.match(html, /completed 요약/);
  assert.match(html, /경로<\/span> <span class="mono">\/receipts\/2026-09<\/span>/);
  assert.match(html, /메모<\/span> <span class="mono">누락 2건<\/span>/);
  assert.match(html, /할 일 완료 명령 확인됨/);
  assert.equal(html.includes('할 일 완료 명령 연결 없음'), false, 'only a completed receipt speaks about the completion command');
  const unlinked = history({ status: 'live', windowFull: false, items: [item('completed', { receipt: { summary: '정리함', evidence: [{ kind: 'url', value: 'https://example.test/r' }], commandReceiptVerified: false } })] });
  assert.match(unlinked, /할 일 완료 명령 연결 없음/);
  assert.match(unlinked, /링크<\/span> <span class="mono">https:\/\/example\.test\/r<\/span>/);
  assert.doesNotMatch(unlinked, /<a /, 'recorded evidence is shown as text, not followed as a link');
  assert.match(html, /<span class="mono">codex<\/span>/);
  assert.match(html, /요청 원문과 완료 기준/);
  assert.match(html, /정리된 폴더 경로/);
  assert.match(html, /<span class="mono">44444444-4444-4444-8444-444444444444<\/span>/);
  assert.match(html, /다시 확인/);
  assert.doesNotMatch(html, /최근 요청 50건/);
});

test('request history keeps loading, empty, preview, error and windowed reads distinct', () => {
  const loading = history({ status: 'loading', items: [] });
  assert.match(loading, /요청 기록 확인 중/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /<button[^>]*disabled/);
  const empty = history({ status: 'live', items: [], windowFull: false });
  assert.match(empty, /data-empty="true"/);
  assert.match(empty, /저장한 요청서가 없습니다/);
  const preview = history({ status: 'preview', items: [] });
  assert.match(preview, /data-truth="preview"/);
  assert.match(preview, /요청 기록은 저장 연결 후 표시됩니다/);
  assert.doesNotMatch(preview, /저장한 요청서가 없습니다/);
  const error = history({ status: 'error', items: [], error: '요청 기록을 읽지 못했습니다.' });
  assert.match(error, /role="alert"/);
  assert.match(error, /data-truth="error"/);
  assert.doesNotMatch(error, /저장한 요청서가 없습니다/);
  assert.match(history({ status: 'live', items: [item('requested')], windowFull: true }), /최근 요청 50건 안에서만 찾았습니다/);
});

test('a task without a project is requested as personal with a one-line reason and reads history only once opened', () => {
  const previous = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () => { reads += 1; throw new Error('unexpected request'); };
  try {
    const html = render(React.createElement(OfficeSkillRequestDrawer, {
      agenda: { taskId, title: '영수증 정리' }, officeScope: 'all', result: { nextAction: '영수증 폴더 정리' }, onClose: () => {},
    }));
    assert.match(html, /연결된 할 일 <span class="mono">c8814141-551c-413f-8dfa-adfe5142960f<\/span> · 개인/);
    assert.match(html, /프로젝트가 없는 할 일은 개인 범위로만 저장됩니다/);
    assert.doesNotMatch(html, /요청 범위/);
    assert.doesNotMatch(html, /aria-pressed/);
    assert.match(html, /요청 기록 확인 중/);
    assert.equal(reads, 0);

    const scoped = render(React.createElement(OfficeSkillRequestDrawer, {
      agenda: { taskId, taskWorkspace: 'classin' }, officeScope: 'all', result: { nextAction: '견적 폴더 정리' }, onClose: () => {},
    }));
    assert.match(scoped, /· 회사/);
    assert.doesNotMatch(scoped, /프로젝트가 없는 할 일/);

    const none = render(React.createElement(OfficeSkillRequestDrawer, { agenda: null, officeScope: 'personal', result: {}, onClose: () => {} }));
    assert.match(none, /연결된 할 일이 필요합니다/);
    assert.doesNotMatch(none, /이 할 일의 요청 기록/);
  } finally {
    globalThis.fetch = previous;
  }
});

test('history reads happen on open, on the explicit button and after a save, never on a timer', () => {
  const source = fs.readFileSync(new URL('./office-skill-request-drawer.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setInterval|setTimeout/);
  assert.match(source, /React\.useEffect\(\(\) => \{\s*load\(\);/);
  assert.match(source, /onClick=\{onRefresh\}>다시 확인<\/Button>/);
  assert.match(source, /setSaved\(result\.request\); reloadHistory\(\);/);
  const css = fs.readFileSync(new URL('./office-skill-request-drawer.module.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
  assert.doesNotMatch(css, /border:\s*(?!1px)\d/);
  for (const size of css.match(/font-size:\s*[\d.]+px/g) || []) assert.ok(Number(size.match(/[\d.]+/)[0]) >= 12, size);
});
