import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { afterEach, beforeEach, test } from 'node:test';
import ts from 'typescript';
import { normalizeCampaignBusinessTruth } from '../campaign-business-truth.js';

const state = globalThis.__campaignMetaReadTest = {};
const originalMeta = { origin: 'hub-campaigns', channels: ['Email'], progress: 55, goal: 'Synthetic goal', current: 7 };
const serverRead = `
export const eqFilter = value => 'eq.' + value;
export const withWorkspaceFilter = filters => filters || [];
export async function fetchSupabaseRows(table, options) {
  const s = globalThis.__campaignMetaReadTest;
  s.reads.push({ table, options });
  if (s.readError) throw new Error('synthetic read failure');
  return Array.isArray(s.rows) ? s.rows.slice(0, options?.limit ?? s.rows.length) : s.rows;
}`;
const serverWrite = `
export const resolveDefaultWorkspaceId = () => 'workspace-test';
export const resolveSupabaseConfig = () => globalThis.__campaignMetaReadTest.configured ? {} : null;
export async function insertSupabaseRecord(table, record) {
  const s = globalThis.__campaignMetaReadTest;
  s.inserts.push({ table, record });
  return { persisted: true, id: 'campaign-test', record: { id: 'campaign-test', ...record } };
}
export async function updateSupabaseRecord(table, filters, patch) {
  const s = globalThis.__campaignMetaReadTest;
  s.updates.push({ table, filters, patch });
  if (!s.configured) return { persisted: false, reason: 'missing-config' };
  return { persisted: true, record: { id: 'campaign-test', name: 'Synthetic', status: 'draft', ...patch } };
}
export async function deleteSupabaseRecord() {
  globalThis.__campaignMetaReadTest.unexpected.push('delete');
  return { persisted: false };
}`;
registerHooks({ resolve(specifier, context, next) {
  const source = specifier === '../server-read.js' ? serverRead : specifier === '../server-write.js' ? serverWrite : null;
  return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { saveCampaign } = await import('./campaigns-ledger.js?metadata-read-guard');
const command = { op: 'update', id: 'campaign-test', payload: { businessTruth: { primaryMetric: 'Synthetic metric', weeklyTarget: 1, weeklyActual: null } } };
const realFetch = globalThis.fetch;

beforeEach(() => {
  Object.assign(state, { rows: [{ meta: structuredClone(originalMeta) }], reads: [], updates: [], inserts: [], unexpected: [], configured: true, readError: false });
  globalThis.fetch = async () => { state.unexpected.push('network'); throw new Error('unexpected network'); };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  assert.deepEqual(state.unexpected, [], 'check boundaries outside application error handlers');
});

test('a valid singleton preserves unrelated metadata and unset actuals', async () => {
  const before = structuredClone(state.rows);
  const result = await saveCampaign(command);
  assert.equal(result.status, 'saved');
  assert.equal(state.updates.length, 1);
  const { meta } = state.updates[0].patch;
  for (const [key, value] of Object.entries(originalMeta)) assert.deepEqual(meta[key], value);
  assert.equal(meta.business_truth.weekly_actual, null);
  assert.equal(result.campaign.businessTruth.weeklyActual, null);
  assert.deepEqual(state.rows, before);
  assert.deepEqual(state.reads[0].options.filters, [['id', 'eq.campaign-test'], ['workspace_id', 'eq.workspace-test']]);
});

for (const meta of [null, {}]) {
  test(`an explicit ${meta === null ? 'null' : 'empty object'} meta still accepts strategy creation`, async () => {
    state.rows = [{ meta }];
    const result = await saveCampaign(command);
    assert.equal(result.status, 'saved');
    assert.equal(state.updates.length, 1);
    assert.equal(state.updates[0].patch.meta.business_truth.primary_metric, 'Synthetic metric');
  });
}

const invalidReads = [
  ['failed read', null], ['undefined read', undefined], ['missing row', []],
  ['non-array response', { meta: {} }], ['null row', [null]], ['missing meta', [{}]],
  ['undefined meta', [{ meta: undefined }]], ['array meta', [{ meta: [] }]],
  ['string meta', [{ meta: 'invalid' }]], ['number meta', [{ meta: 7 }]],
  ['boolean meta', [{ meta: false }]], ['multiple rows', [{ meta: {} }, { meta: {} }]],
];
for (const [label, rows] of invalidReads) {
  test(`${label} blocks every write before replacing metadata`, async () => {
    state.rows = rows;
    const result = await saveCampaign(command);
    assert.equal(state.updates.length, 0);
    assert.equal(state.inserts.length, 0);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'campaigns-meta-read-failed');
    assert.equal(result.retryable, true);
  });
}

test('a thrown read is a retryable failure without a write', async () => {
  state.readError = true;
  const result = await saveCampaign(command);
  assert.equal(state.updates.length, 0);
  assert.equal(result.status, 'failed');
  assert.equal(result.retryable, true);
});

test('display metadata patches also require a valid read', async () => {
  state.rows = [];
  const result = await saveCampaign({ op: 'update', id: 'campaign-test', payload: { progress: 80 } });
  assert.equal(state.updates.length, 0);
  assert.equal(result.status, 'failed');
});

test('column-only updates and creates keep their existing read-free behavior', async () => {
  state.rows = null;
  assert.equal((await saveCampaign({ op: 'update', id: 'campaign-test', payload: { status: 'Active' } })).status, 'saved');
  assert.equal(Object.hasOwn(state.updates[0].patch, 'meta'), false);
  assert.equal((await saveCampaign({ op: 'create', payload: { name: 'Synthetic', businessTruth: null } })).status, 'saved');
  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].record.meta.business_truth.weekly_actual, null);
  assert.equal(state.reads.length, 0);
});

test('unconfigured metadata updates preserve the preview outcome', async () => {
  state.configured = false;
  state.rows = null;
  const result = await saveCampaign(command);
  assert.equal(result.status, 'preview');
  assert.equal(result.reason, 'missing-config');
});

function parsed(relative, kind) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  return ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, kind);
}
function namedFunction(ast, name) {
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, `production function ${name} exists`);
  return node;
}
function variable(fn, name) {
  const node = fn.body.statements.filter(ts.isVariableStatement).flatMap(item => [...item.declarationList.declarations]).find(item => item.name.getText() === name);
  assert.ok(node, `production variable ${name} exists`);
  return node.initializer;
}

test('the actual route and strategy save handlers retain the draft on read failure, then save on retry', async () => {
  // Execute production handler bodies; replace only request/response and UI state
  // boundaries. This is not a mounted React/Next server or authorization test.
  const routeAst = parsed('../../app/api/hub/campaigns/route.js', ts.ScriptKind.JS);
  const post = namedFunction(routeAst, 'POST');
  const POST = new Function('NextResponse', 'assertHubWriteAllowed', 'readHubWriteJson', 'saveCampaign',
    `return async function POST(req) ${post.body.getText(routeAst)}`)(
      { json: (body, init) => Response.json(body, init) }, () => null,
      async req => ({ data: await req.json() }), saveCampaign);
  const contentAst = parsed('../../components/hub/pages/content.jsx', ts.ScriptKind.JSX);
  const callback = variable(namedFunction(contentAst, 'Campaigns'), 'saveBusinessTruth').arguments[0];
  const saveNode = variable(namedFunction(contentAst, 'CampaignStrategyPanel'), 'save');
  const draft = { ...command.payload.businessTruth };
  let campaigns = [{ id: 'campaign-test', businessTruth: { primaryMetric: 'old metric' } }];
  let editing = true, saveState = 'idle', feedback = '';
  const responses = [];
  const onSave = new Function('selected', 'fetch', 'normalizeCampaignBusinessTruth', 'setCampaigns', `return ${callback.getText(contentAst)}`)(
    campaigns[0], async (url, options) => {
      if (url !== '/api/hub/campaigns') state.unexpected.push(url);
      const response = await POST(new Request('http://synthetic.local/api/hub/campaigns', options));
      responses.push(response.status);
      return response;
    }, normalizeCampaignBusinessTruth, update => { campaigns = update(campaigns); });
  const submit = () => new Function('saveState', 'setSaveState', 'setFeedback', 'setEditing', 'onSave', 'draft', `return ${saveNode.getText(contentAst)}`)(
    saveState, value => { saveState = value; }, value => { feedback = value; }, value => { editing = value; }, onSave, draft)({ preventDefault() {} });
  state.rows = null;
  await submit();
  assert.equal(state.updates.length, 0);
  assert.deepEqual(responses, [502]);
  assert.equal(saveState, 'error');
  assert.equal(editing, true);
  assert.match(feedback, /저장 실패/);
  assert.equal(campaigns[0].businessTruth.primaryMetric, 'old metric');
  assert.deepEqual(draft, command.payload.businessTruth);
  state.rows = [{ meta: structuredClone(originalMeta) }];
  await submit();
  assert.deepEqual(responses, [502, 200]);
  assert.equal(state.updates.length, 1);
  assert.equal(saveState, 'saved');
  assert.equal(editing, false);
  assert.equal(campaigns[0].businessTruth.primaryMetric, 'Synthetic metric');
  assert.deepEqual(state.updates[0].patch.meta.channels, ['Email']);
});
