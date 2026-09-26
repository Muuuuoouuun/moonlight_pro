import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
const stubs = {
  'next/server': `export const NextResponse = {json: body => Response.json(body)};`,
  '@/lib/repositories/attention-ledger': `export async function getAttentionLedger() {return {raw: {projectLedger:{source:'supabase',projects:globalThis.__blocked ? [{id:'p',name:'업무',status:'Blocked'}]:[],todos:[]},revenue:{source:'supabase',deals:[],leads:[]},calendar:{ok:true,items:[]}},inquiries:{status:'live'}}}`,
  '@/lib/repositories/automations-ledger': `export async function getAutomationsLedger() {return globalThis.__automationHome;}`,
  '@/lib/repositories/brief-ledger': `export async function getMorningBrief(){return {source:'supabase',brief:null};}`,
  '@/lib/repositories/content-ledger': `export async function getContentLedger(){return {source:'supabase'};}`,
  '@/lib/repositories/work-ledger': `export async function getWorkLedger(){return {source:'supabase'};}`,
  '@/lib/sales-os/work-orders': `export async function getWorkOrders(){return {source:'supabase',orders:[]};}`,
  '@/lib/sales-os/work-order-counts': `export async function getWorkOrderCounts(){return {source:'supabase',counts:{proposed:0}};}`,
};
registerHooks({resolve(specifier,context,next){return stubs[specifier] ? {url:`data:text/javascript,${encodeURIComponent(stubs[specifier])}`,shortCircuit:true} : next(specifier,context);}});
const { GET } = await import('./route.js?automation-signals');
async function read(ledger, blocked=false) {
  globalThis.__automationHome = {source:'supabase',summary:{attentionCount:0},automations:[],incidents:[],runs:[],...ledger};
  globalThis.__blocked = blocked;
  return (await GET()).json();
}
test('historical failures and intentionally paused flows do not become home work', async () => {
  const result = await read({runs:[{id:'old',statusKey:'failure',flow:'Old batch'}],automations:[{id:'paused',status:'Paused',name:'Paused batch'}]},true);
  assert.equal(result.signals.filter(s=>s.kind==='Automation').length,0);
  assert.equal(result.signals.some(s=>s.id==='risk-convergence'),false);
});
test('home shows repository incidents, with dates and grouped count', async () => {
  const incident = {id:'latest',flow:'문의 동기화',dateLabel:'2026. 09. 26. 07:00',detail:'연결 확인 필요',failureCount:3};
  const result = await read({incidents:[incident], summary:{attentionCount:1}},true);
  const signal = result.signals.find(s=>s.kind==='Automation');
  assert.equal(signal?.id,'automation-failed-latest');
  assert.match(signal?.meta || '',/2026.*3건/);
  assert.equal(result.signals.some(s=>s.id==='risk-convergence'),true);
  assert.equal(result.metrics.find(m=>m.label==='자동화 확인 필요')?.value,'1');
});
test('automation read errors remain explicit with unknown count',async()=>{
  const result=await read({source:'error',error:'automations-ledger-core-read-failed'});
  assert.ok(result.failedSources.includes('automations'));
  assert.equal(result.metrics.find(m=>m.label==='자동화 확인 필요')?.value,'—');
});
