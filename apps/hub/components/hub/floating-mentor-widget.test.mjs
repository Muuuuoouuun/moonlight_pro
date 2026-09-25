import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { GURU_LENS_CHIPS, GURU_LENS_MAP } from './persona-client.js';

// 2026-09-25: Guru의 ref는 레코드 id여야 한다. 이름이 ref가 되면 Hub 컨텍스트 조립이 그 이름으로
// 다른 고객의 거래를 찾았고(부분 일치), 기억(agent_runs)도 같은 이름의 고객끼리 섞였다.
// 실제 위젯 본문을 격리된 훅과 가짜 요청 함수로 그린다.
const source = readFileSync(new URL('./floating-mentor-widget.jsx', import.meta.url), 'utf8');
const widgetJs = ts.transpileModule(
  source.replace(/^import[\s\S]*?;\s*$/gm, '').replace('export function FloatingMentorWidget', 'function FloatingMentorWidget'),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;

function mount(props) {
  const slots = [];
  let index = 0;
  let tree;
  const calls = { guru: [], council: [], persona: [] };
  const hook = (init) => {
    const key = index++;
    if (!(key in slots)) slots[key] = init();
    return key;
  };
  const deps = {
    React: {
      createElement: (type, elementProps, ...children) => ({
        type,
        props: { ...elementProps, children: children.flat(Infinity).filter((child) => child != null && child !== false && child !== '') },
      }),
    },
    useState: (initial) => {
      const key = hook(() => (typeof initial === 'function' ? initial() : initial));
      return [slots[key], (value) => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
    },
    useRef: (initial) => slots[hook(() => ({ current: initial }))],
    useEffect: () => {},
    Badge: 'Badge', Button: 'Button', IconButton: 'IconButton', Dot: 'Dot', Iconed: 'Iconed', TruthBadge: 'TruthBadge',
    isTopEscLayer: () => true, popEscLayer() {}, pushEscLayer: () => ({}),
    requestGuruCoaching: async (input) => { calls.guru.push(input); return { state: 'done', text: 'Guru 응답' }; },
    requestCouncilAdvice: async (input) => { calls.council.push(input); return { state: 'done', text: 'Council 응답' }; },
    requestPersonaChat: async (input) => { calls.persona.push(input); return { state: 'done', text: '초안' }; },
    GURU_LENS_MAP,
    GURU_LENS_CHIPS,
    createAdviceTaskWriter: () => ({ save: async () => ({ state: 'saved' }) }),
  };
  const FloatingMentorWidget = new Function(...Object.keys(deps), `${widgetJs}; return FloatingMentorWidget;`)(...Object.values(deps));
  const render = () => { index = 0; tree = FloatingMentorWidget({ isOpen: true, onClose() {}, ...props }); return tree; };
  const findAll = (predicate, node = tree) => {
    if (Array.isArray(node)) return node.flatMap((child) => findAll(predicate, child));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...findAll(predicate, node.props?.children || [])];
  };
  const text = (node = tree) => {
    if (Array.isArray(node)) return node.map(text).join('');
    if (node == null || typeof node !== 'object') return node == null ? '' : String(node);
    return text(node.props?.children || []);
  };
  render();
  return { render, findAll, text, calls };
}

const quick = (app, label) => app.findAll((node) => node.type === 'Button' && app.text(node) === label)[0];

async function askDealReview(app) {
  await quick(app, '딜 진단 (Keenan 4층)').props.onClick();
  return app.calls.guru.at(-1);
}

async function sendChat(app, message) {
  app.findAll((node) => node.type === 'button' && app.text(node) === '💬 대화')[0].props.onClick();
  app.render();
  app.findAll((node) => node.type === 'input')[0].props.onChange({ target: { value: message } });
  app.render();
  await app.findAll((node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  return app.calls.guru.at(-1);
}

const sharedName = { name: '공통 이름 학원', company: '공통 이름 학원', stage: '집중 고객', nextAction: '견적 확인' };

test('Guru never uses a display name as the record reference', async () => {
  const quickApp = mount({ agent: 'guru', contextType: 'customer', contextTitle: '공통 이름 학원', contextData: sharedName });
  assert.equal((await askDealReview(quickApp)).ref, null);

  const chatApp = mount({ agent: 'guru', contextType: 'customer', contextTitle: '공통 이름 학원', contextData: sharedName });
  const chat = await sendChat(chatApp, '이 고객에게 무엇을 먼저 물어볼까?');
  assert.equal(chat.mode, 'deal-review');
  assert.equal(chat.ref, null);
});

test('Guru passes the exact record id, preferring an exact deal id when one is linked', async () => {
  const lead = mount({ agent: 'guru', contextType: 'customer', contextTitle: '공통 이름 학원', contextData: { ...sharedName, id: 'lead-7', dealId: null } });
  assert.equal((await askDealReview(lead)).ref, 'lead-7');
  assert.equal((await sendChat(lead, '다음 연락은?')).ref, 'lead-7');

  const linked = mount({ agent: 'guru', contextType: 'customer', contextTitle: 'KA학원', contextData: { ...sharedName, id: 'lead-7', dealId: 'deal-3' } });
  assert.equal((await askDealReview(linked)).ref, 'deal-3');

  const deal = mount({ agent: 'guru', contextType: 'deal', contextTitle: '연간계약', contextData: { id: 'deal-9', name: '연간계약' } });
  assert.equal((await askDealReview(deal)).ref, 'deal-9');
});

const unlinkedBadges = (app, node) => app.findAll((child) => child.type === 'TruthBadge' && child.props.state === 'partial' && child.props.label === '거래 기록 연결 안 됨', node);

test('a Guru customer context without an exact deal says so instead of guessing one', () => {
  const unlinked = mount({ agent: 'guru', contextType: 'customer', contextTitle: '공통 이름 학원', contextData: { ...sharedName, id: 'lead-7', dealId: null } });
  const notice = unlinked.findAll((node) => node.props?.role === 'status').find((node) => unlinkedBadges(unlinked, node).length);
  assert.ok(notice, 'the missing deal link is visible before any request');
  assert.equal(unlinked.calls.guru.length, 0);

  for (const props of [
    { agent: 'guru', contextType: 'customer', contextData: { ...sharedName, id: 'lead-7', dealId: 'deal-3' } },
    { agent: 'guru', contextType: 'deal', contextData: { id: 'deal-9', name: '연간계약' } },
    { agent: 'council', contextType: 'project', contextData: { title: '결정 A' } },
  ]) {
    const app = mount(props);
    assert.equal(unlinkedBadges(app).length, 0, JSON.stringify(props));
  }
});

test('lens chips are Guru methods only, and a lens chat keeps this record as its context', async () => {
  const context = { ...sharedName, id: 'lead-7', dealId: 'deal-3' };
  const app = mount({ agent: 'guru', contextType: 'customer', contextTitle: '공통 이름 학원', contextData: context });
  const chip = (label) => app.findAll((node) => node.type === 'button' && app.text(node) === label)[0];
  // Legend 인물은 주간 카드로만 산다(§2.1 ⑧) — 칩에 없다.
  for (const legend of ['스티브 잡스', '제프 베이조스', '이본 쉬나드', '데일 카네기', '나폴레온 힐']) assert.equal(chip(legend), undefined, legend);
  chip('크리스 보스').props.onClick();
  app.render();
  app.findAll((node) => node.type === 'button' && app.text(node) === '💬 대화')[0].props.onClick();
  app.render();
  app.findAll((node) => node.type === 'input')[0].props.onChange({ target: { value: '다음 연락에서 무엇을 물어볼까?' } });
  app.render();
  await app.findAll((node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  const request = app.calls.persona.at(-1);
  assert.equal(request.lens, 'voss');
  // 비워 두면 Hub가 범위 없는 최근 거래 15건을 붙였다.
  assert.deepEqual(request.context, context);
});

test('Council keeps its existing reference fallback (only Guru changed)', async () => {
  const app = mount({ agent: 'council', contextType: 'project', contextTitle: '결정 A', contextData: { title: '결정 A', status: 'Draft' } });
  await quick(app, '병목 타파 진단 (Goldratt)').props.onClick();
  assert.equal(app.calls.council.at(-1).ref, '결정 A');
});
