import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as delivery from '../../../../../packages/project-delivery/index.ts';

const source = readFileSync(new URL('./project-delivery.jsx', import.meta.url), 'utf8');
const compiled = ts.transpile(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
function load(React, extra = {}) {
  const scope = { React, Button: 'Button', Drawer: 'Drawer', Checkbox: 'Checkbox', Iconed: 'Iconed', styles: new Proxy({}, { get: (_, key) => key }), requestAnimationFrame: fn => fn(), ...delivery, ...extra };
  return new Function(...Object.keys(scope), `${compiled}\nreturn { ProjectDeliveryEditor, ProjectDeliverySummary, deliveryVerificationAt, deliveryValidationIssue, Field };`)(...Object.values(scope));
}
function walk(node, predicate, ancestors = []) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return { node, ancestors };
  for (const child of [node.props?.footer, ...[node.props?.children || []].flat(Infinity)]) {
    const found = walk(child, predicate, [...ancestors, node]);
    if (found) return found;
  }
  return null;
}
const text = node => typeof node === 'string' ? node : node && typeof node === 'object' ? [node.props?.children || []].flat(Infinity).map(text).join('') : '';
const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
const helpers = load({ createElement });
const initialProject = () => ({ id: 'delivery-project', name: '검증 프로젝트', dueAt: null, statusKey: 'active', updatedAt: 'version-1', delivery: delivery.deliveryDraft() });
function editor(project = initialProject(), options = {}) {
  const slots = [];
  const frames = [];
  let cursor = 0;
  let tree;
  const React = { createElement, Fragment: 'fragment', useId: () => 'delivery-editor',
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(value) { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index]; } };
  const { ProjectDeliveryEditor } = load(React, { requestAnimationFrame: fn => frames.push(fn) });
  const render = () => { cursor = 0; tree = ProjectDeliveryEditor({ project, onClose() {}, onSave: options.onSave || (async () => { throw new Error('unexpected save'); }), ...options }); return tree; };
  const find = predicate => walk(tree, predicate)?.node;
  render();
  return { render, find, get tree() { return tree; }, flushFrames() { frames.splice(0).forEach(fn => fn()); } };
}

// This is the same evidence invalidation enforced by the service, not a UI-only
// alternate completion rule. Checking a condition is intentionally not a change
// to the acceptance contract.
test('artifact and acceptance edits invalidate verification before completion is offered', () => {
  const project = initialProject();
  project.delivery = { ...delivery.deliveryDraft({ deliverable: '출시 결과', resultUrl: 'https://example.com/result', criteria: [{ id: 'criterion', text: '고객 확인', done: false }] }), prototypeVerifiedAt: 'verified-at' };
  assert.equal(helpers.deliveryVerificationAt(project, delivery.deliveryDraft(project.delivery)), 'verified-at');
  const plan = delivery.deliveryDraft(project.delivery);
  assert.equal(helpers.deliveryVerificationAt(project, { ...plan, criteria: [{ ...plan.criteria[0], done: true }] }), 'verified-at');
  for (const patch of [{ deliverable: '다른 결과' }, { resultUrl: 'https://example.com/new' }, { criteria: [{ ...plan.criteria[0], text: '다른 기준' }] }]) {
    assert.equal(helpers.deliveryVerificationAt(project, { ...plan, ...patch }), null);
  }
});

test('hidden invalid optional fields have a specific reveal and focus target', () => {
  const plan = delivery.deliveryDraft();
  assert.equal(helpers.deliveryValidationIssue(plan, ''), null, 'planning is optional');
  assert.equal(helpers.deliveryValidationIssue({ ...plan, prototypeDate: '2026-02-31' }, '').field, 'prototypeDate');
  assert.equal(helpers.deliveryValidationIssue({ ...plan, availableHours: -1 }, '').field, 'availableHours');
  assert.equal(helpers.deliveryValidationIssue({ ...plan, resultUrl: 'javascript:bad' }, '').field, 'resultUrl');
});

test('default editor keeps result, due date and criteria ahead of folded planning and execution', () => {
  const view = editor();
  assert.equal(view.tree.props.title, '결과·완료 기준');
  const form = view.find(node => node.type === 'form');
  assert.equal(form.props.noValidate, true, 'hidden native invalid inputs must not block focus recovery');
  for (const predicate of [node => node.type === 'textarea', node => node.type === 'input' && node.props.type === 'date', node => node.props?.['aria-label'] === '완료 기준 추가']) {
    assert.equal(walk(view.tree, predicate).ancestors.some(node => node.type === 'details'), false);
  }
  const advanced = view.find(node => node.type === 'details' && text(node).includes('자세한 계획'));
  const execution = view.find(node => node.type === 'details' && text(node).includes('실행·완료 기록'));
  assert.equal(advanced.props.open, false);
  assert.equal(execution.props.open, false);
});

test('saving a folded plan preserves optional data and never requires upfront planning', async () => {
  const project = initialProject();
  project.delivery = delivery.deliveryDraft({ remainingHours: 0, availableHours: 2, blocker: '확인 대기', nextAction: '담당자 확인', nextVersion: '후속 범위' });
  let saved;
  const view = editor(project, { onSave: async (base, fields) => { saved = { base, fields }; return { ok: false, status: 'preview' }; } });
  view.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await Promise.resolve();
  assert.deepEqual(saved.fields.delivery, project.delivery);
  assert.equal(saved.fields.dueAt, '');
});

test('invalid hidden URL unfolds execution, retains input, and focuses the result URL', async () => {
  const project = initialProject();
  project.delivery = delivery.deliveryDraft({ resultUrl: 'javascript:bad' });
  const view = editor(project);
  let focused = false;
  view.find(node => node.type === 'input' && node.props.type === 'url').props.ref({ focus() { focused = true; } });
  view.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  view.render();
  view.flushFrames();
  assert.equal(view.find(node => node.type === 'details' && text(node).includes('실행·완료 기록')).props.open, true);
  assert.equal(view.find(node => node.type === 'input' && node.props.type === 'url').props.value, 'javascript:bad');
  assert.equal(focused, true);
});

test('unsubmitted criterion is preserved by save and Korean Enter composition adds no row', async () => {
  let submitted;
  const view = editor(initialProject(), { onSave: async (_base, fields) => { submitted = fields; return { ok: false }; } });
  view.find(node => node.props?.['aria-label'] === '완료 기준 추가').props.onChange({ target: { value: '다시 조회할 수 있다' } });
  view.render();
  view.find(node => node.props?.['aria-label'] === '완료 기준 추가').props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() { throw new Error('IME must remain intact'); } });
  view.render();
  assert.equal(view.find(node => node.props?.['aria-label'] === '1번 완료 기준'), undefined);
  view.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await Promise.resolve();
  assert.equal(submitted.delivery.criteria.length, 1);
  assert.equal(submitted.delivery.criteria[0].text, '다시 조회할 수 있다');
  assert.equal(submitted.delivery.criteria[0].done, false);
  view.render();
  assert.equal(view.find(node => node.props?.['aria-label'] === '1번 완료 기준').props.value, '다시 조회할 수 있다', 'failed save retains the draft condition');
});

test('empty summary has no fabricated timeline or feasibility warning', () => {
  const summary = helpers.ProjectDeliverySummary({ project: initialProject() });
  assert.equal(walk(summary, node => node.type === 'ol'), null);
  assert.doesNotMatch(text(summary), /미정|판단 전|계획 필요/);
  assert.match(text(summary), /결과·완료 기준/);
});

test('changed verified results block completion locally and reveal the recheck step', async () => {
  let writes = 0;
  const project = initialProject();
  project.startedAt = '2026-09-20T00:00:00Z';
  project.delivery = { ...delivery.deliveryDraft({ deliverable: '출시 결과', prototypeDate: '2026-09-21', resultUrl: 'https://example.com/result', criteria: [{ id: 'criterion', text: '고객 확인', done: true }] }), prototypeVerifiedAt: '2026-09-21T00:00:00Z' };
  const view = editor(project, { onSave: async () => { writes++; return { ok: false }; } });
  view.find(node => node.type === 'textarea').props.onChange({ target: { value: '수정된 결과' } });
  view.render();
  await view.find(node => node.type === 'Button' && text(node) === '결과 확인 후 프로젝트 완료').props.onClick();
  view.render();
  assert.equal(writes, 0);
  assert.equal(view.find(node => node.type === 'details' && text(node).includes('실행·완료 기록')).props.open, true);
  assert.match(text(view.tree), /작동 재확인 필요/);
});

test('ordinary work can complete with a result and no prototype, link, or start event', async () => {
  let saved;
  const project = initialProject();
  project.delivery = delivery.deliveryDraft({ deliverable: '고객에게 안내 발송' });
  const view = editor(project, { onSave: async (_base, fields) => { saved = fields; return { ok: false, status: 'preview' }; } });
  await view.find(node => node.type === 'Button' && text(node) === '결과 확인 후 프로젝트 완료').props.onClick();
  assert.equal(saved.status, 'completed');
  assert.equal(saved.delivery.resultUrl, '');
  assert.equal(saved.delivery.criteria.length, 0);
});

test('pending save is locked synchronously and a failed reply preserves the edited result', async () => {
  let writes = 0;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const view = editor(initialProject(), { onSave: async () => { writes++; return pending; } });
  view.find(node => node.type === 'textarea').props.onChange({ target: { value: '보존할 결과' } });
  view.render();
  const submit = view.find(node => node.type === 'form').props.onSubmit;
  submit({ preventDefault() {} });
  submit({ preventDefault() {} });
  assert.equal(writes, 1);
  finish({ ok: false, status: 'preview', message: '연결이 필요합니다.' });
  await new Promise(resolve => setImmediate(resolve));
  view.render();
  assert.equal(view.find(node => node.type === 'textarea').props.value, '보존할 결과');
  assert.equal(view.find(node => node.type === 'fieldset').props.disabled, false);
  assert.match(text(view.tree.props.footer), /연결이 필요합니다/);
});


test('validation descriptions do not change a field accessible name', () => {
  const field = helpers.Field({ label: '결과물 링크', children: createElement('input', { type: 'url', 'aria-describedby': 'url-error' }), error: 'http 또는 https 주소를 입력하세요.', errorId: 'url-error' });
  const label = walk(field, node => node.type === 'label');
  assert.equal(text(label.node), '결과물 링크');
  const error = walk(field, node => node.props?.id === 'url-error');
  assert.equal(error.ancestors.some(node => node.type === 'label'), false);
});
