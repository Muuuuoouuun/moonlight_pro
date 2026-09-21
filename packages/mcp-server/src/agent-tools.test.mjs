import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerMoonlightTools } from './tools.js';

const commandId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
function registry(options = { mode: 'agent' }) {
  const result = new Map();
  registerMoonlightTools({registerTool(name,definition,handler){assert.ok(!result.has(name), 'register once');result.set(name,{definition,handler});}},options);
  return result;
}
function setup(t, fetchImpl) {
  const old = {...process.env}, fetch = globalThis.fetch;
  Object.assign(process.env,{COM_MOON_AGENT_API_TOKEN:'agent-test-token',COM_MOON_HUB_URL:'http://localhost:3000'});
  globalThis.fetch=fetchImpl;
  t.after(()=>{process.env=old;globalThis.fetch=fetch;});
}
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});

test('Agent MCP uses authenticated narrow query instead of the dashboard ledger',async t=>{
  let sent;
  setup(t,async(url,init)=>{sent={url:String(url),...init};return response({schemaVersion:1,status:'live',source:'supabase',data:{resource:'tasks',rows:[]},page:{returnedCount:0,hasMore:false,nextCursor:null,totalCount:null}});});
  const tool=registry().get('list_tasks');
  const result=await tool.handler({limit:5,status:'todo',fields:['id','title','updatedAt']});
  assert.equal(sent.url,'http://localhost:3000/api/agent/v1/query');
  assert.equal(sent.headers.authorization,'Bearer agent-test-token');
  assert.deepEqual(JSON.parse(sent.body),{resource:'tasks',detail:'rows',limit:5,filters:{status:'todo'},fields:['id','title','updatedAt']});
  assert.equal(result.structuredContent.status,'live');
  assert.equal(tool.definition.annotations.readOnlyHint,true);
});

test('complete task sends stable command and exact database version, with no retry',async t=>{
  let sent,calls=0;
  setup(t,async(url,init)=>{calls++;sent=JSON.parse(init.body);return response({status:'saved',persisted:true,commandId,updatedAt:'2026-09-13T01:00:01.123456+00:00',entity:{id:taskId,status:'done'}});});
  const tool=registry().get('complete_task');
  assert.ok(tool,'complete task must be available');
  await tool.handler({commandId,id:taskId,expectedUpdatedAt:'2026-09-13T01:00:00.123456+00:00'});
  assert.deepEqual(sent,{commandId,action:'complete_task',targetId:taskId,expectedUpdatedAt:'2026-09-13T01:00:00.123456+00:00',input:{}});
  assert.equal(calls,1);
  assert.equal(tool.definition.annotations.idempotentHint,true);
});

test('Agent task creation requires caller commandId and sends the same ID on a retry',async t=>{
  const sent=[];
  setup(t,async(url,init)=>{sent.push(JSON.parse(init.body));return response({status:'saved',persisted:true,commandId,entity:{id:commandId}});});
  const tool=registry().get('create_task');
  assert.equal(tool.definition.inputSchema.commandId.safeParse(undefined).success,false);
  await tool.handler({commandId,title:'고객 후속'});
  await tool.handler({commandId,title:'고객 후속'});
  assert.deepEqual(sent[0],sent[1]);
  assert.equal(sent[0].commandId,commandId);
});

test('missing Agent token fails before network; writes never fall back to unrestricted legacy routes',async t=>{
  setup(t,async()=>{throw new Error('must not call');});
  delete process.env.COM_MOON_AGENT_API_TOKEN;
  process.env.COM_MOON_HUB_WRITE_SECRET='legacy-secret';
  const tool=registry().get('update_task');
  assert.ok(tool);
  const result=await tool.handler({commandId,id:taskId,expectedUpdatedAt:'2026-09-13T00:00:00Z',title:'수정'});
  assert.equal(result.isError,true);
  assert.match(result.content[0].text,/COM_MOON_AGENT_API_TOKEN/);
});

test('write timeout retains commandId and directs receipt lookup instead of retry',async t=>{
  let calls=0;
  setup(t,async()=>{calls++;throw Object.assign(new Error('timeout'),{name:'TimeoutError'});});
  const result=await registry().get('create_task').handler({commandId,title:'후속'});
  assert.equal(result.isError,true);
  assert.equal(calls,1);
  assert.match(result.content[0].text,new RegExp(commandId));
  assert.match(result.content[0].text,/get_command_receipt/);
});

test('source errors are tool errors but preview and partial remain honest results',async t=>{
  let payload={status:'error',error:'source-unavailable',retryable:true};
  setup(t,async()=>response(payload));
  const tool=registry().get('list_tasks');
  assert.equal((await tool.handler({})).isError,true);
  for(const status of ['preview','partial']){
    payload={status,source:status,partial:status==='partial',data:{rows:[]}};
    const result=await tool.handler({});
    assert.notEqual(result.isError,true);assert.equal(JSON.parse(result.content[0].text).status,status);
  }
});
test('job submission and resume uncertainty retain retry identity and disable automatic retry',async t=>{
 setup(t,async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'});});
 for(const name of ['start_codex_job','resume_codex_job']){
  const result=await registry().get(name).handler({id:taskId,requestId:commandId,expectedTurnCount:2,projectId:'moonlight',prompt:'검토',mode:'read'});
  assert.equal(result.structuredContent.requestId,commandId);
  assert.equal(result.structuredContent.retryable,false);
  assert.equal(result.structuredContent.persisted,null);
  assert.match(result.structuredContent.error,/same requestId/);
 }
});

test('core profile is small and all profile retains legacy aliases',()=>{
  const core=registry({mode:'agent',profile:'core'});
  for(const name of ['get_hub_health','get_daily_brief','list_tasks','get_task','create_task','update_task','complete_task','get_command_receipt']) assert.ok(core.has(name),name);
  assert.ok(core.size<=9);assert.equal(core.has('get_revenue'),false);
  const all=registry({mode:'agent',profile:'all'});
  for(const name of ['get_content','get_content_queue','create_calendar_event'])assert.ok(all.has(name));
  assert.throws(()=>registry({profile:'misspelled'}),/profile/i);
});

test('search_knowledge queries the Agent API search endpoint with query and limit', async t => {
  let sent;
  setup(t, async (url, init) => {
    sent = { url: String(url), ...init };
    return response({ status: 'live', query: '세팅', items: [{ id: 'k1', title: '세팅 메모', snippet: '…세팅 부족…' }] });
  });
  const tool = registry().get('search_knowledge');
  assert.ok(tool, 'search_knowledge tool must exist');
  const result = await tool.handler({ query: '세팅', limit: 3 });
  assert.equal(sent.url, 'http://localhost:3000/api/agent/v1/search');
  assert.equal(sent.headers.authorization, 'Bearer agent-test-token');
  assert.deepEqual(JSON.parse(sent.body), { query: '세팅', limit: 3 });
  assert.equal(result.structuredContent.status, 'live');
  assert.equal(result.structuredContent.items.length, 1);
});


test('assistant profile exposes grounded work, goals and persisted candidate tools with small discovery', async t => {
  let sent;
  setup(t, async (url, init) => { sent = { url, body: init.body && JSON.parse(init.body) }; return response({ status: 'saved', persisted: true }); });
  const tools = registry({ mode: 'agent', profile: 'assistant' });
  for (const name of ['get_work_context', 'get_goals', 'record_goal_command', 'get_goal_receipt', 'save_ai_candidate', 'request_ai_assist', 'record_assist_outcome', 'get_assistance_receipt', 'search_knowledge', 'get_weekly_report']) assert.ok(tools.has(name), name);
  assert.ok(tools.size <= 15);
  await tools.get('request_ai_assist').handler({ commandId, entityType: 'tasks', entityId: taskId, scope: 'personal', expectedSourceUpdatedAt: '2026-09-21T00:00:00Z', operation: 'draft', instruction: '원문 정리' });
  assert.equal(sent.body.commandId, commandId); assert.equal(sent.body.action, 'generate');
  assert.equal(sent.body.input.entityId, taskId);
  assert.equal(tools.get('request_ai_assist').definition.annotations.readOnlyHint, false);
});

test('assistance and goal write uncertainty keeps stable ID and correct receipt tool without retry', async t => {
  let calls = 0;
  setup(t, async () => { calls++; throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); });
  const tools = registry({ mode: 'agent', profile: 'assistant' });
  for (const [name, receipt] of [['request_ai_assist', 'get_assistance_receipt'], ['record_goal_command', 'get_goal_receipt']]) {
    const result = await tools.get(name).handler({ commandId, operation: 'draft', input: {}, action: 'create_objective' });
    assert.equal(result.structuredContent.persisted, null);
    assert.equal(result.structuredContent.retryable, false);
    assert.equal(result.structuredContent.commandId, commandId);
    assert.match(result.structuredContent.error, new RegExp(receipt));
  }
  assert.equal(calls, 2);
});
