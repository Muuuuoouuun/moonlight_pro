import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { projectCustomerRef } from '../../lib/project-customer-context.js';
import { deadlineDayKey } from '../../lib/deadline-alert-reset.js';

// 고객 드로어 › 거래 › 연결 프로젝트(2026-09-29): 이름만 있던 행에 상태 · 기한 · 제품을 붙인다.
// 상태는 PMS와 같은 ProjectStatusBadge(§8.2 lifecycle, 막힘만 danger), 기한은 .mono 서울 날짜,
// 제품 이름은 색 없는 보조 글자(§5.2 카테고리 색 금지). 행은 여전히 .hub-row 링크 하나 + 44px.
const src = await readFile(new URL('./related-customer-projects.jsx', import.meta.url), 'utf8');

test('status reuses the PMS badge, due is instrument data, product is plain text; tokens only', () => {
  assert.match(src, /import \{ ProjectStatusBadge \} from '\.\/pages\/project-pms-components'/);
  assert.match(src, /<ProjectStatusBadge status=\{PMS_STATUS\[project\.status\] \|\| 'In progress'\} \/>/);
  assert.match(src, /<span className="mono">\{due\.text\}<\/span>/);
  assert.match(src, /· \{product\}/);
  assert.match(src, /className="hub-row"[^>]*minHeight: 44/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/, 'tokens only, no raw color literals');
  assert.doesNotMatch(src, /var\(--(success|warning|info|personal|company)/, 'no category color');
  assert.doesNotMatch(src, /onMouseEnter|onMouseLeave/, '.hub-row owns hover');
  assert.doesNotMatch(src, /--danger-bg|borderLeft|inset 1px/, 'overdue is a direct label — no fill, no rail');
  for (const size of [...src.matchAll(/fontSize: ([\d.]+)/g)].map(match => Number(match[1]))) assert.ok(size >= 12, `font ${size}px below the data floor`);
  assert.doesNotMatch(src, /'최근 3개만 보기'/, 'open work comes first, so the collapsed three are not "the most recent three"');
});

// ── 렌더 — JSX를 격리된 훅으로 그린다(customers.test.mjs와 같은 방식) ─────────────
const ts = (await import('typescript')).default;
const js = ts.transpileModule(src.replace(/^"use client";/, '').replace(/^import[\s\S]*?;\s*$/gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^export /gm, '');

function mount(data) {
  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(c => c != null && c !== false && c !== '') } }),
    useState: (initial) => [initial, () => {}],
  };
  const deps = { React, Link: 'Link', Button: 'Button', Skeleton: 'Skeleton', TruthBadge: 'TruthBadge', ProjectStatusBadge: 'ProjectStatusBadge',
    projectCustomerRef, deadlineDayKey, useCustomerContext: () => ({ reload() {}, ...data }) };
  const { RelatedCustomerProjects, customerProjectDue } = new Function(...Object.keys(deps), `${js}; return { RelatedCustomerProjects, customerProjectDue };`)(...Object.values(deps));
  const tree = RelatedCustomerProjects({ type: 'lead', id: '33333333-3333-4333-8333-333333333333' });
  const findAll = (predicate, node = tree) => Array.isArray(node) ? node.flatMap(child => findAll(predicate, child))
    : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...findAll(predicate, node.props?.children || [])];
  const text = (node) => Array.isArray(node) ? node.map(text).join('') : node == null || typeof node !== 'object' ? String(node ?? '') : text(node.props?.children || []);
  return { tree, findAll, text, customerProjectDue };
}

const today = deadlineDayKey(new Date());
const year = Number(today.slice(0, 4));
const project = (over) => ({ id: over.name, href: `/dashboard/work/projects?project=${over.name}&focus=overview`, dueAt: null, productId: null, productName: null, ...over });

test('each row reads status · due · product; overdue is a short danger label only while the work is open', () => {
  const rows = [
    project({ name: '연장 계약', status: 'active', dueAt: `${year - 1}-12-30T00:00:00+09:00`, productId: 'p', productName: '클래스문 앱' }),
    project({ name: '교사 연수', status: 'blocked' }),
    project({ name: '지난 도입', status: 'completed', dueAt: `${year - 1}-08-01T00:00:00+09:00` }),
  ];
  const { findAll, text } = mount({ status: 'live', failedSources: [], projects: rows, hasMore: false });
  const links = findAll(node => node.type === 'Link');
  assert.equal(links.length, 3);
  assert.ok(links.every(link => link.props.className === 'hub-row' && link.props.style.minHeight === 44));
  assert.deepEqual(findAll(node => node.type === 'ProjectStatusBadge').map(node => node.props.status), ['In progress', 'Blocked', 'Done']);
  const [open, blocked, done] = links.map(text);
  assert.match(open, /연장 계약 →/);
  assert.match(open, /· 클래스문 앱/);
  assert.match(open, new RegExp(`기한 지남 ${year - 1}\\.12\\.30`));
  assert.match(blocked, /기한 없음/);
  assert.match(done, new RegExp(`기한 ${year - 1}\\.08\\.01`), 'another year keeps the year');
  assert.doesNotMatch(done, /기한 지남/, 'finished work is not overdue');
  assert.equal(links[2].props.style.color, 'var(--fg-muted)', 'finished work reads one step quieter');
  assert.deepEqual(findAll(node => node.props?.className === 'mono').map(text), [`${year - 1}.12.30`, `${year - 1}.08.01`], 'dates render in .mono');
});

test('due helper: Seoul day, same-year short form, overdue only for open work', () => {
  const { customerProjectDue } = mount({ status: 'loading' });
  const late = { status: 'active', dueAt: '2026-09-01' };
  assert.deepEqual(customerProjectDue(late, '2026-09-29'), { text: '09.01', overdue: true, dismissed: false });
  assert.deepEqual(customerProjectDue({ ...late, status: 'blocked' }, '2026-09-29'), { text: '09.01', overdue: false, dismissed: false }, 'blocked wins, as in the PMS list: one red signal');
  assert.deepEqual(customerProjectDue({ ...late, deadlineAlertSuppressed: true }, '2026-09-29'), { text: '09.01', overdue: false, dismissed: true }, 'a dismissed alert stays dismissed');
  assert.deepEqual(customerProjectDue(late, '2026-09-29', false), { text: '09.01', overdue: false, dismissed: false }, 'unknown dismissal → no red guess');
  assert.deepEqual(customerProjectDue({ status: 'active', dueAt: '2026-09-28T15:30:00Z' }, '2026-09-29'), { text: '09.29', overdue: false, dismissed: false }, 'UTC evening is the next Seoul day');
  assert.deepEqual(customerProjectDue({ status: 'active', dueAt: '2026-09-28' }, '2026-09-29'), { text: '09.28', overdue: true, dismissed: false });
  assert.deepEqual(customerProjectDue({ status: 'archived', dueAt: '2026-09-28' }, '2026-09-29'), { text: '09.28', overdue: false, dismissed: false });
  assert.deepEqual(customerProjectDue({ status: 'draft', dueAt: '2027-01-05' }, '2026-09-29'), { text: '2027.01.05', overdue: false, dismissed: false });
  assert.equal(customerProjectDue({ status: 'active', dueAt: null }, '2026-09-29'), null);
});

test('a failed products read is said on the rows that have a product, never shown as "no product"', () => {
  const rows = [project({ name: '앱 연동', status: 'active', productId: 'p' }), project({ name: '현장 방문', status: 'draft' })];
  const { findAll, text } = mount({ status: 'partial', failedSources: ['products'], projects: rows });
  const [withProduct, without] = findAll(node => node.type === 'Link').map(text);
  assert.match(withProduct, /· 제품 확인 못 함/);
  assert.doesNotMatch(without, /제품|·/, 'no product line on a row without one');
  assert.equal(findAll(node => node.props?.role === 'alert').length, 0, 'the project list itself was read');
});

// §5.3 partial: 빠진 출처 이름 + 재시도. 기존 '다시 확인'과 같은 reload를 목록 아래 한 줄로만 준다.
test('a partial read names the missing source and offers the same retry', () => {
  const reload = () => {};
  const rows = [project({ name: '앱 연동', status: 'active', productId: 'p', dueAt: `${year - 1}-09-01` })];
  const { findAll, text } = mount({ status: 'partial', failedSources: ['products', 'deadline_alerts'], projects: rows, reload });
  const [status] = findAll(node => node.props?.role === 'status');
  assert.ok(status, 'partial line is rendered');
  assert.deepEqual(findAll(node => node.type === 'TruthBadge', status).map(node => [node.props.state, node.props.reason]), [['partial', '제품 이름·기한 알림 해제 여부 확인 못 함']]);
  const [retry] = findAll(node => node.type === 'Button', status);
  assert.equal(retry.props.onClick, reload);
  assert.match(text(retry), /다시 확인/);
  const [row] = findAll(node => node.type === 'Link').map(text);
  assert.doesNotMatch(row, /기한 지남/, 'without the dismissal setting the overdue date is shown plain, not red');
  assert.equal(findAll(node => node.props?.style?.color === 'var(--danger)').length, 0);

  const live = mount({ status: 'live', failedSources: [], projects: rows });
  assert.equal(live.findAll(node => node.props?.role === 'status').length, 0, 'no partial line when everything was read');
});

test('blocked + overdue carries one red signal; a dismissed deadline reads "알림 해제" without red', () => {
  const rows = [
    project({ name: '막힌 일', status: 'blocked', dueAt: `${year - 1}-09-01` }),
    project({ name: '해제한 일', status: 'active', dueAt: `${year - 1}-09-01`, deadlineAlertSuppressed: true }),
  ];
  const { findAll, text } = mount({ status: 'live', failedSources: [], projects: rows });
  assert.deepEqual(findAll(node => node.type === 'ProjectStatusBadge').map(node => node.props.status), ['Blocked', 'In progress']);
  const [blocked, dismissed] = findAll(node => node.type === 'Link').map(text);
  assert.doesNotMatch(blocked, /기한 지남/, 'the 막힘 badge is the one risk signal, as in the PMS list');
  assert.match(blocked, new RegExp(`기한 ${year - 1}\\.09\\.01`));
  assert.match(dismissed, new RegExp(`기한 ${year - 1}\\.09\\.01 · 알림 해제`));
  assert.equal(findAll(node => node.props?.style?.color === 'var(--danger)').length, 0);
});

test('envelope handling is unchanged: projects failure → retry, preview → badge, more than 3 → toggle', () => {
  const failed = mount({ status: 'partial', failedSources: ['projects'], projects: [] });
  assert.equal(failed.findAll(node => node.props?.role === 'alert').length, 1);
  assert.equal(mount({ status: 'preview', projects: [] }).findAll(node => node.type === 'TruthBadge').length, 1);
  const many = mount({ status: 'live', failedSources: [], projects: Array.from({ length: 5 }, (_, i) => project({ name: `일 ${i}`, status: 'active' })), hasMore: true });
  assert.equal(many.findAll(node => node.type === 'Link').length, 3);
  assert.match(many.text(many.findAll(node => node.type === 'Button')), /연결 프로젝트 더 보기/);
  assert.match(many.text(many.tree), /최근 프로젝트 20개를 표시했어요/);
});
