import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { GURU_LENS_CHIPS, GURU_LENS_MAP } from './persona-client.js';
import { collectGuruConversationHistory } from '../../lib/guru-chat-history.js';
import { projectCouncilIssue } from '../../lib/project-council-context.js';

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
    collectGuruConversationHistory,
    projectCouncilIssue,
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
  // 09.bigmac1.5: Guru 대화 탭은 자유 질문(open-question)으로 간다. 이름은 여전히 ref가 되지 않는다.
  assert.equal(chat.mode, 'open-question');
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

test('lens chips are Guru methods only, and a Guru lens chat never pulls unrelated ledger rows', async () => {
  const context = { ...sharedName, id: 'lead-7', dealId: 'deal-3' };
  const app = mount({ agent: 'guru', contextType: 'customer', contextTitle: '공통 이름 학원', contextData: context });
  const chip = (label) => app.findAll((node) => node.type === 'button' && app.text(node) === label)[0];
  // Guru의 빠른 조언 탭에는 렌즈 바가 없다(09.bigmac1.5) — 대화 탭에서 고른다.
  app.findAll((node) => node.type === 'button' && app.text(node) === '💬 대화')[0].props.onClick();
  app.render();
  assert.ok(chip('크리스 보스'), 'the chat tab shows the Guru lens chips');
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
  // 컨텍스트를 비워 보내면 Hub가 범위 없는 최근 거래 15건을 붙였다. Guru 렌즈 대화는 대화 전용으로
  // 보내고, 이 레코드가 선택됐다는 표시만 싣는다(09.bigmac1.5와 병합한 동작).
  assert.equal(request.conversationOnly, true);
  assert.deepEqual(request.context, { source: 'operator-provided', scope: 'selected-record' });
});

test('non-project Council keeps its existing reference fallback', async () => {
  const app = mount({ agent: 'council', contextType: 'general', contextTitle: '결정 A', contextData: { title: '결정 A', status: 'Draft', desc: '선택지와 결정 이유 원문' } });
  await quick(app, '병목 타파 진단 (Goldratt)').props.onClick();
  const advice = app.calls.council.at(-1);
  assert.equal(advice.ref, '결정 A');
  assert.equal(advice.contextType, undefined);
  assert.match(advice.draft, /검토 제목: 결정 A/);
  assert.match(advice.draft, /상태: Draft/);
  assert.match(advice.draft, /선택지와 결정 이유 원문/);
  await sendChat(app, '이 판단을 다시 검토해 줘');
  assert.match(app.calls.council.at(-1).draft, /선택지와 결정 이유 원문/);
});

test('project Council quick and chat requests pin the exact personal project and canonical task details', async () => {
  const props = { agent: 'council', contextType: 'project', contextTitle: '동일 이름', contextData: {
    id: 'personal-project', orgScope: 'personal', title: '동일 이름', status: 'Active',
    todos: [{ title: '초안 검토', status: 'blocked', done: false, nextAction: '의견 확인', checklist: [{ title: '자료 대조', done: true }] }],
  } };
  const app = mount(props);
  await quick(app, '병목 타파 진단 (Goldratt)').props.onClick();
  const advice = app.calls.council.at(-1);
  assert.equal(advice.ref, 'personal-project');
  assert.equal(advice.contextType, 'project');
  assert.equal(advice.scope, 'personal');
  assert.match(advice.draft, /초안 검토 · 상태: blocked/);
  assert.match(advice.draft, /다음 행동: 의견 확인/);
  assert.match(advice.draft, /\[x\] 자료 대조/);
  await sendChat(app, '무엇이 막혔나?');
  assert.equal(app.calls.council.at(-1).contextType, 'project');
  assert.equal(app.calls.council.at(-1).ref, 'personal-project');
  assert.equal(app.calls.council.at(-1).scope, 'personal');
});

test('missing project ID, unknown scope and company scope block every Council widget path', async () => {
  for (const contextData of [
    { title: '이름은 ID가 아님', orgScope: 'personal' },
    { id: 'project-a', title: '범위 없음' },
    { id: 'project-a', title: '알 수 없음', orgScope: 'all' },
    { id: 'project-a', title: '회사 업무', orgScope: 'classin' },
  ]) {
    const app = mount({ agent: 'council', contextType: 'project', contextData });
    assert.ok(app.findAll(node => node.props?.role === 'status').length);
    await quick(app, '병목 타파 진단 (Goldratt)').props.onClick();
    await quick(app, '액션 아이템 추출').props.onClick();
    await sendChat(app, '다음 행동은?');
    app.findAll(node => node.type === 'button' && app.text(node) === '크리스 보스')[0].props.onClick();
    app.render();
    await sendChat(app, '다른 렌즈로?');
    assert.deepEqual(app.calls, { guru: [], council: [], persona: [] });
  }
});

test('project persona extraction and lens chat supply only selected-project context, never an automatic portfolio', async () => {
  const contextData = { id: 'personal-project', orgScope: 'personal', title: '선택한 일', todos: [{ title: '연결된 할 일', status: 'todo' }] };
  const app = mount({ agent: 'council', contextType: 'project', contextData });
  await quick(app, '액션 아이템 추출').props.onClick();
  assert.equal(app.calls.persona[0].conversationOnly, true);
  assert.equal(app.calls.persona[0].context.id, 'personal-project');
  assert.equal(app.calls.persona[0].context.scope, 'personal');
  await sendChat(app, '첫 질문');
  app.findAll(node => node.type === 'button' && app.text(node) === '크리스 보스')[0].props.onClick();
  app.render();
  await sendChat(app, '연락 전에 확인할 것은?');
  assert.equal(app.calls.persona.at(-1).conversationOnly, true);
  assert.deepEqual(app.calls.persona.at(-1).context, { ...contextData, source: 'operator-provided', scope: 'personal' });
});

test('Decision caller declares unknown scope and every widget advice path stays closed', async () => {
  const workSource = readFileSync(new URL('./pages/work.jsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('work.jsx', workSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const decisions = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Decisions');
  let widget;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'FloatingMentorWidget') widget = node;
    ts.forEachChild(node, visit);
  };
  visit(decisions);
  assert.ok(widget);
  const js = ts.transpileModule(`const props = (${widget.getText(ast)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const councilDecision = { title: '회사와 개인 중 소속 미확인', rationale: '검토 이유 원문', decidedAt: null };
  const props = new Function('React', 'FloatingMentorWidget', 'councilDecision', `${js}; return props;`)(
    { createElement: (_type, props) => props }, 'FloatingMentorWidget', councilDecision,
  );
  assert.equal(props.contextType, 'general');
  assert.match(props.unavailableReason, /회사·개인 범위를 확인할 수 없어/);
  assert.equal(props.contextData.desc, councilDecision.rationale);
  const app = mount(props);
  assert.match(app.text(), /회사·개인 범위를 확인할 수 없어/);
  assert.doesNotMatch(app.text(), /프로젝트 ID/);
  await quick(app, '병목 타파 진단 (Goldratt)').props.onClick();
  await quick(app, '액션 아이템 추출').props.onClick();
  await sendChat(app, '일반 자문으로 우회할 수 있나?');
  app.findAll(node => node.type === 'button' && app.text(node) === '크리스 보스')[0].props.onClick();
  app.render();
  await sendChat(app, '다른 렌즈로?');
  assert.deepEqual(app.calls, { guru: [], council: [], persona: [] });
});
