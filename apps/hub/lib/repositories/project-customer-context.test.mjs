import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getProjectCustomerContext } from './project-customer-context.js';

// 고객 드로어의 "연결 프로젝트"(view=projects)가 상태·기한·제품 이름을 싣는다(2026-09-29).
// 제품(0049)은 운영 DB 적용 여부가 문서마다 달라, 제품 읽기가 프로젝트 읽기를 깨뜨리면 안 된다.
const W = '11111111-1111-4111-8111-111111111111';
const C = '33333333-3333-4333-8333-333333333333';
const P1 = '22222222-2222-4222-8222-222222222221';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '22222222-2222-4222-8222-222222222223';
const P4 = '22222222-2222-4222-8222-222222222224';
const PRODUCT = '55555555-5555-4555-8555-555555555555';
const OTHER_PRODUCT = '66666666-6666-4666-8666-666666666666';

// updated_at desc로 읽힌 순서 그대로다(가장 최근이 끝낸 일).
const PROJECT_ROWS = [
  { id: P1, name: '지난 도입', status: 'completed', due_at: '2026-08-01T00:00:00Z', product_id: PRODUCT, meta: {} },
  { id: P2, name: '연장 계약', status: 'active', due_at: '2026-09-30T00:00:00Z', product_id: PRODUCT },
  { id: P3, name: '보관한 일', status: 'archived', due_at: null, product_id: null },
  { id: P4, name: '교사 연수', status: 'blocked', due_at: null, product_id: OTHER_PRODUCT },
];

function source({ projects = PROJECT_ROWS, products = [{ id: PRODUCT, name: '클래스문 앱' }, { id: OTHER_PRODUCT, name: 'OMR 메이커' }], workspaces = [{ id: W, meta: {} }], fail = [], thrown = [] } = {}) {
  const calls = [];
  const read = async (table, query) => {
    calls.push([table, query]);
    if (thrown.includes(table)) throw Error('offline');
    if (fail.includes(table)) return null;
    if (table === 'leads' || table === 'customer_accounts') return [{ id: C, workspace_id: W, name: '기관' }];
    if (table === 'projects') return projects;
    if (table === 'products') return products;
    if (table === 'workspaces') return workspaces;
    return [];
  };
  return { calls, read };
}

// 서울 2026-09-29 정오 — 기한 비교가 실행 시각에 흔들리지 않게 고정한다.
const NOW = new Date('2026-09-29T03:00:00Z');
const context = (s, extra = {}) => getProjectCustomerContext({ kind: 'lead', id: C, workspaceId: W, configured: true, projectsOnly: true, read: s.read, now: NOW, ...extra });

test('project list view attaches product names from one workspace-scoped products read', async () => {
  const s = source();
  const result = await context(s);
  assert.equal(result.status, 'live');
  assert.deepEqual(result.failedSources, []);
  assert.deepEqual(result.projects.map(p => [p.name, p.status, p.dueAt, p.productName]), [
    ['연장 계약', 'active', '2026-09-30T00:00:00Z', '클래스문 앱'],
    ['교사 연수', 'blocked', null, 'OMR 메이커'],
    ['지난 도입', 'completed', '2026-08-01T00:00:00Z', '클래스문 앱'],
    ['보관한 일', 'archived', null, null],
  ], 'open work first, updated_at order kept inside each group');
  assert.equal(result.projects[0].href, `/dashboard/work/projects?project=${P2}&focus=overview`);
  assert.deepEqual(s.calls.map(([table]) => table), ['leads', 'projects', 'products']);
  const [, projectsQuery] = s.calls.find(([table]) => table === 'projects');
  assert.equal(projectsQuery.select, '*', 'naming product_id would break the whole read on a pre-0049 database');
  const [, productsQuery] = s.calls.find(([table]) => table === 'products');
  assert.equal(productsQuery.select, 'id,name');
  assert.ok(productsQuery.filters.some(([key, value]) => key === 'workspace_id' && value === `eq.${W}`));
  assert.deepEqual(productsQuery.filters.find(([key]) => key === 'id'), ['id', `in.(${PRODUCT},${OTHER_PRODUCT})`], 'distinct product ids only');
  assert.equal(productsQuery.limit, 2);
});

test('a pre-0049 database (no product_id column) reads no products and stays live', async () => {
  const s = source({ projects: PROJECT_ROWS.map(({ product_id, ...row }) => row) });
  const result = await context(s);
  assert.equal(result.status, 'live');
  assert.deepEqual(s.calls.map(([table]) => table), ['leads', 'projects']);
  assert.ok(result.projects.every(p => p.productId === null && p.productName === null));
});

// product_id가 있으면 0049가 적용된 DB다(같은 마이그레이션이 products를 만든다). 그래서 제품 읽기 실패는
// 스키마 캐시 미갱신(PGRST205 — fetchSupabaseRows는 null을 돌려준다)이든 네트워크든 모두 'products'로 밝힌다.
test('any products read failure (stale schema cache included) is named, never disguised as "no product"', async () => {
  for (const s of [source({ fail: ['products'] }), source({ thrown: ['products'] })]) {
    const result = await context(s);
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.failedSources, ['products']);
    assert.equal(result.projects.length, 4, 'projects still render');
    assert.ok(result.projects.every(p => p.productName === null));
    assert.equal(result.projects[0].productId, PRODUCT, 'the link stays so the drawer can say the name is unknown');
  }
});

test('a projects read failure keeps its existing meaning and skips the products read', async () => {
  const s = source({ fail: ['projects'] });
  const result = await context(s);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.failedSources, ['projects']);
  assert.deepEqual(result.projects, []);
  assert.deepEqual(s.calls.map(([table]) => table), ['leads', 'projects']);
});

test('the full customer context (project focus panel) never reads products, so it cannot turn partial over them', async () => {
  const s = source({ fail: ['products'] });
  const result = await context(s, { projectsOnly: false });
  assert.equal(result.status, 'live');
  assert.ok(!s.calls.some(([table]) => table === 'products'));
  assert.equal(result.customer.name, '기관');
  assert.equal(result.projects[0].productId, PRODUCT);
  assert.ok(result.projects.every(p => p.productName === null));
});

test('the reverse lookup stays bounded at 20 with hasMore after open-first ordering', async () => {
  const many = Array.from({ length: 21 }, (_, i) => ({ id: `${P1.slice(0, -2)}${String(i).padStart(2, '0')}`, name: `일 ${i}`, status: i < 2 ? 'completed' : 'active', product_id: null }));
  const result = await context(source({ projects: many }));
  assert.equal(result.projects.length, 20);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.projects.slice(-2).map(p => p.name), ['일 0', '일 1'], 'only the 20 most recent rows are reordered, never the 21st');
});

// ── 이전 기한 알림 해제 — PMS 목록(projects route)·주의 목록과 같은 판정 ─────────────
const LATE = { id: P2, name: '연장 계약', status: 'active', due_at: '2026-09-01T00:00:00+09:00', product_id: null };
const reset = (items) => [{ id: W, meta: { deadline_alert_reset: { resetAt: '2026-09-22T00:00:00Z', beforeDay: '2026-09-22', items } } }];

test('a dismissed overdue alert is carried per project from one workspace read', async () => {
  const other = { ...LATE, id: P4, name: '교사 연수', due_at: '2026-09-10' };
  const s = source({ projects: [LATE, other], workspaces: reset([{ kind: 'project', id: P2, dueAt: LATE.due_at }]) });
  const result = await context(s);
  assert.equal(result.status, 'live');
  assert.deepEqual(result.projects.map(p => [p.name, p.deadlineAlertSuppressed]), [['연장 계약', true], ['교사 연수', false]]);
  const [, query] = s.calls.find(([table]) => table === 'workspaces');
  assert.equal(query.select, 'id,meta,timezone,updated_at', 'shared workspace select so concurrent reads coalesce');
  assert.deepEqual(query.filters, [['id', `eq.${W}`]]);
  assert.equal(s.calls.filter(([table]) => table === 'workspaces').length, 1);

  const moved = await context(source({ projects: [{ ...LATE, due_at: '2026-09-05' }], workspaces: reset([{ kind: 'project', id: P2, dueAt: LATE.due_at }]) }));
  assert.equal(moved.projects[0].deadlineAlertSuppressed, false, 'a changed due date is a new deadline, not the dismissed one');
});

test('no open late project → no workspace read (blocked and finished work never show "기한 지남")', async () => {
  const s = source({ projects: [
    { ...LATE, status: 'blocked' }, { ...LATE, id: P1, status: 'completed' }, { ...LATE, id: P3, status: 'active', due_at: '2026-09-29' },
  ] });
  const result = await context(s);
  assert.equal(result.status, 'live');
  assert.ok(!s.calls.some(([table]) => table === 'workspaces'), 'due today is not late');
  assert.ok(result.projects.every(p => p.deadlineAlertSuppressed === false));
});

test('an unreadable dismissal setting is named, never guessed as red', async () => {
  for (const s of [source({ projects: [LATE], fail: ['workspaces'] }), source({ projects: [LATE], thrown: ['workspaces'] }), source({ projects: [LATE], workspaces: [] })]) {
    const result = await context(s);
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.failedSources, ['deadline_alerts']);
    assert.equal(result.projects.length, 1, 'projects still render');
    assert.equal(result.projects[0].deadlineAlertSuppressed, false);
  }
});

test('the full customer context never reads the dismissal setting', async () => {
  const s = source({ projects: [LATE], fail: ['workspaces'] });
  const result = await context(s, { projectsOnly: false });
  assert.equal(result.status, 'live');
  assert.ok(!s.calls.some(([table]) => table === 'workspaces'));
});
