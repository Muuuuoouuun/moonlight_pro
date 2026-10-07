import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// 막힌 프로젝트 신호(확인할 것 스펙 §5.4) — 병목 라벨을 글로, 막힘 풀기에 필요한 계획·버전을 싣고,
// 계획을 읽지 못했으면 프로젝트 열기로 돌아간다.
for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']) delete process.env[key];
const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const stubs = {
  'next/server': `export const NextResponse = {json: body => Response.json(body)};`,
  // 운영 게이트(lib/feature-gates.js)는 feature-gates.test가 고정한다 — 여기서는 끝내기 계약 전체를 본다.
  '@/lib/feature-gates': `export const FEATURE_GATES = {officeWorkBreakdown:true, checkItemUnblock:true, decisionJournal:true};`,
  '@/lib/repositories/attention-ledger': `export async function getAttentionLedger() {return {raw: {projectLedger:{source:'supabase',projects:globalThis.__projects,todos:[]},revenue:{source:'supabase',deals:[],leads:[]},calendar:{ok:true,items:[]}},inquiries:{status:'live'}}}`,
  '@/lib/repositories/automations-ledger': `export async function getAutomationsLedger() {return {source:'supabase',summary:{attentionCount:0},automations:[],incidents:[],runs:[]};}`,
  '@/lib/repositories/brief-ledger': `export async function getMorningBrief(){return {source:'supabase',brief:null};}`,
  '@/lib/repositories/content-ledger': `export async function getContentLedger(){return {source:'supabase'};}`,
  '@/lib/repositories/work-ledger': `export async function getWorkLedger(){return {source:'supabase'};}`,
  '@/lib/sales-os/work-orders': `export async function getWorkOrders(){return {source:'supabase',orders:[]};}`,
  '@/lib/sales-os/work-order-counts': `export async function getWorkOrderCounts(){return {source:'supabase',counts:{proposed:0}};}`,
};
registerHooks({ resolve(specifier, context, next) { return stubs[specifier] ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true } : next(specifier, context); } });
const { GET } = await import('./route.js?work-signals');

async function blockedSignal(project) {
  globalThis.__projects = [project];
  const result = await (await GET()).json();
  return result.signals.find((signal) => signal.subject?.type === 'project');
}

test('막힌 프로젝트: 병목·며칠째를 글로, 막힘 풀기 두 갈래가 끝내기 1·2', async () => {
  const pausedAt = new Date(Date.now() - 9 * 86400000 - 3600000).toISOString();
  const signal = await blockedSignal({
    id: PROJECT, name: '프로젝트 C', status: 'Blocked', updatedAt: '2026-10-01T01:00:00.000000+00:00', dueAt: '2026-10-20T00:00:00Z',
    delivery: { blocker: '대표 승인 대기', blockerKind: 'decision', pausedAt, deliverable: '', criteria: [] },
  });
  assert.equal(signal.title, '프로젝트 C — 막힘');
  assert.equal(signal.summary, '대표 승인 대기');
  assert.match(signal.meta, /^막힘 · 의사결정 · 9일 · 목표 2026-10-20$/);
  assert.equal(signal.unblock.updatedAt, '2026-10-01T01:00:00.000000+00:00');
  assert.deepEqual(signal.outcomes.map((outcome) => outcome.key), ['unblock-decision', 'unblock-resolved', 'task', 'snooze']);
  assert.equal(signal.outcomes[0].recommended, true);
  assert.equal(signal.schedule.minutes, 30);
  assert.equal(signal.schedule.title, '확인할 것 · 프로젝트 C 정하기');
});

test('계획을 읽지 못한 막힌 프로젝트는 프로젝트 열기로 — 지어낸 계획으로 풀지 않는다', async () => {
  const signal = await blockedSignal({ id: PROJECT, name: '프로젝트 C', status: 'Blocked' });
  assert.equal(signal.unblock, undefined);
  assert.equal(signal.meta, '막힘');
  assert.deepEqual(signal.outcomes.map((outcome) => outcome.key), ['open', 'task', 'snooze']);
  assert.doesNotMatch(JSON.stringify(signal), /undefined/);
});
