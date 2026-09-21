import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextMemoKey, projectCustomerHref, projectCustomerPatch, projectCustomerRef, projectMemoContexts } from './project-customer-context.js';
import { initialMemoContexts, buildNoteSave } from './journal-client.js';
import { getProjectCustomerContext } from './repositories/project-customer-context.js';

const W = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const A = '44444444-4444-4444-8444-444444444444';
const project = { id: P, name: '도입 검토', updatedAt: '2026-09-21T01:02:03.123456+00:00', entityRef: { type: 'lead', id: C } };

test('customer chips preserve typed identity and the precise optimistic-lock version', () => {
  assert.deepEqual(projectCustomerRef({ type: 'customer_account', id: C }), { type: 'account', id: C });
  assert.equal(projectCustomerRef({ type: 'company', id: C }), null);
  assert.equal(projectCustomerRef({ type: 'lead', id: 'bad' }), null);
  const patch = projectCustomerPatch(project, { type: 'account', id: C });
  assert.equal(patch.expectedUpdatedAt, project.updatedAt);
  assert.deepEqual(patch.entityRef, { type: 'customer_account', id: C });
  assert.deepEqual(Object.keys(projectCustomerPatch(project, null)), ['id', 'expectedUpdatedAt', 'entityRef']);
  assert.equal(projectCustomerPatch(project, null).entityRef, null);
  assert.throws(() => projectCustomerPatch({ id: P }, null));
  assert.throws(() => projectCustomerPatch(project, { type: 'lead', id: 'bad' }));
  assert.equal(projectCustomerHref(patch.entityRef), `/dashboard/revenue/customers?customer=account%3A${C}`);
});

test('project-only notes never inherit a customer; customer entry points save one note with both links', () => {
  const internal = projectMemoContexts(project);
  assert.deepEqual(internal, [{ type: 'project', id: P, label: project.name }]);
  const linked = projectMemoContexts(project, { type: 'lead', id: C, label: '담당자' });
  assert.equal(linked.length, 2);
  assert.equal(contextMemoKey(internal) === contextMemoKey(linked), false, 'drafts must be separate');
  assert.equal(contextMemoKey(linked), contextMemoKey([...linked].reverse()));
  const seeds = initialMemoContexts(null, [...linked, linked[0], { type: 'company', id: C }]);
  assert.deepEqual(seeds, linked);
  assert.deepEqual(initialMemoContexts(linked[0]), internal, 'existing single-context entry still works');
  const payload = buildNoteSave({ id: A, body: '교육 사례 전달 논의', title: '', occurredAt: '2026-09-21T01:00:00Z', expectedRevision: 0, noteMeta: { kind: 'note', enhancement: '' }, contexts: seeds }, W);
  assert.deepEqual(payload.contexts, [{ type: 'project', id: P }, { type: 'lead', id: C }]);
  assert.equal(payload.action, 'save');
});

function reader({ fail = [], direct = true, count = 1 } = {}) {
  const calls = [];
  const read = async (table, query) => {
    calls.push([table, query]);
    if (fail.includes(table)) return null;
    if (table === 'leads' || table === 'customer_accounts') return [{ id: C, workspace_id: W, name: '기관', company_id: A, next_action: '자료 확인', meta: { next_action_at: '2026-09-24' } }];
    if (table === 'companies') return [{ id: A, name: '기관' }];
    if (table === 'projects') return Array.from({ length: count }, (_, i) => ({ id: P, name: `프로젝트 ${i}`, status: 'active' }));
    if (table === 'crm_activities') {
      const own = query.filters.some(([key, value]) => ['lead_id', 'account_id'].includes(key) && value === `eq.${C}`);
      return own && !direct ? [] : [{ id: A, kind: 'call', body: own ? '고객 대화' : '기관 공통 대화', occurred_at: '2026-09-21T01:00:00Z' }];
    }
    return [];
  };
  return { calls, read };
}

test('exact customer reads scope every query, distinguish shared conversations and bound reverse project lookup', async () => {
  const source = reader({ direct: false, count: 21 });
  const result = await getProjectCustomerContext({ kind: 'lead', id: C, workspaceId: W, configured: true, read: source.read });
  assert.equal(result.status, 'live');
  assert.equal(result.customer.label, '기관', 'no invented person from a company');
  assert.equal(result.recent.scope, 'company');
  assert.equal(result.projects.length, 20); assert.equal(result.hasMore, true);
  for (const [, query] of source.calls) assert.ok(query.filters.some(([key, value]) => key === 'workspace_id' && value === `eq.${W}`));
  const common = source.calls.find(([table, query]) => table === 'crm_activities' && query.filters.some(([key]) => key === 'company_id'))[1];
  for (const key of ['lead_id', 'account_id', 'deal_id']) assert.ok(common.filters.some(([field, value]) => field === key && value === 'is.null'));
  assert.ok(source.calls.find(([table]) => table === 'projects')[1].filters.some(([key, value]) => key === 'lead_id' && value === `eq.${C}`));
});

test('failed reads never become empty truth and optional failures stay named', async () => {
  for (const kind of ['lead', 'account']) {
    const unavailable = reader({ fail: [kind === 'lead' ? 'leads' : 'customer_accounts'] });
    const failed = await getProjectCustomerContext({ kind, id: C, workspaceId: W, configured: true, read: unavailable.read });
    assert.equal(failed.status, 'error');
    assert.equal(unavailable.calls.length, 1);
  }
  const source = reader({ fail: ['crm_activities'] });
  const partial = await getProjectCustomerContext({ kind: 'lead', id: C, workspaceId: W, configured: true, read: source.read });
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.failedSources, ['customer_activities', 'company_activities']);
  assert.equal(partial.recent, null); assert.equal(partial.customer.nextAction, '자료 확인');
});

test('reverse project view avoids unrelated CRM reads; preview and invalid identity make no reads', async () => {
  const source = reader();
  const result = await getProjectCustomerContext({ kind: 'account', id: C, workspaceId: W, configured: true, projectsOnly: true, read: source.read });
  assert.equal(result.status, 'live');
  assert.deepEqual(source.calls.map(([table]) => table), ['customer_accounts', 'projects']);
  assert.ok(source.calls[1][1].filters.some(([key]) => key === 'customer_account_id'));
  const noRead = () => { throw Error('unexpected read'); };
  assert.equal((await getProjectCustomerContext({ kind: 'lead', id: C, configured: false, read: noRead })).status, 'preview');
  assert.equal((await getProjectCustomerContext({ kind: 'company', id: C, configured: true, read: noRead })).status, 'error');
});
