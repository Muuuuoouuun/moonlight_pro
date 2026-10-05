import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createMyWorkQuickTask } from './my-work-quick-task.js';
import { QUICK_TASK_RECOVERY_KEY, QUICK_TASK_RECOVERY_TTL, checkpointQuickTask, isQuickTaskContext, readQuickTaskRecovery, resetQuickTasks, validQuickTaskPayload } from './quick-task-recovery.js';
import { executePmsCommand } from '../../engine/lib/pms-command-service.ts';
import { clearSubmittedQuickTaskDraft } from './quick-task-capture.js';
const ID='11111111-1111-4111-8111-111111111111', NEXT='22222222-2222-4222-8222-222222222222', WORK='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONTEXT={ownerKey:'a'.repeat(64),workspaceId:WORK,expiresAt:3600000};
const DRAFT={title:'합성 다음 행동',dueAt:'2026-10-06',priority:'high'};
const writers=[];
afterEach(()=>{for(const writer of writers.splice(0))writer.deactivate();});
function memory() { const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}; }
function writer(storage, options={}) {const value=createMyWorkQuickTask({storage,now:()=>1000,getContext:async()=>CONTEXT,createId:()=>ID,...options});writers.push(value);return value;}
const saved = payload => Response.json({status:'saved',task:{id:payload.id,workspace_id:WORK,title:payload.title,status:"todo",priority:payload.priority||"medium",due_at:payload.dueAt?new Date(payload.dueAt).toISOString():null}});
const lost=async()=>{throw new TypeError('synthetic lost response');};
const stored=storage=>JSON.parse(storage.getItem(QUICK_TASK_RECOVERY_KEY));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('opaque owner assertions must be strings, never coercible arrays',()=>{
  assert.equal(isQuickTaskContext({...CONTEXT,ownerKey:[CONTEXT.ownerKey]},1000),false);
  assert.equal(validQuickTaskPayload({id:ID,title:DRAFT.title,expectedWorkspaceId:WORK,recoveryOwner:[CONTEXT.ownerKey]}),false);
});

test('reload replays the exact payload through actual Engine canonical dedup, one insert',async()=>{
  const storage=memory(),rows=new Map(),sent=[];let inserts=0,requests=0;
  const fetchImpl=async(_url,{body})=>{
    sent.push(body);const payload=JSON.parse(body);
    const result=await executePmsCommand({...payload,action:'create_task'},{workspaceId:WORK,now:'2026-10-05T00:00:00Z'}, {
      insert:async(_table,row)=>{if(rows.has(row.id))return{persisted:false,reason:'duplicate'};rows.set(row.id,row);inserts++;return{persisted:true,record:row};},
      update:async()=>{throw Error('unexpected update');},fetchRows:async()=>[rows.get(payload.id)],
    });
    if(++requests===1)throw new TypeError('synthetic acknowledgement lost');
    return Response.json({...result,task:result.entity});
  };
  const first=writer(storage);await first.submit(DRAFT,{details:true,fetchImpl});first.deactivate();
  const restored=writer(storage,{createId:()=>{throw Error('must not rotate restored ID');}});
  await restored.initialize();assert.equal(requests,1);assert.equal(restored.snapshot().recoverable,true);
  const next={...DRAFT,title:'후속 합성 입력'};
  const result=await restored.submit(next,{details:false,fetchImpl});
  assert.equal(result.status,'duplicate');assert.equal(inserts,1);assert.equal(sent[0],sent[1]);
  assert.equal(clearSubmittedQuickTaskDraft(next,result.submittedDraft),next);assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
});

test('first POST observes an exact persisted checkpoint; next draft text is never stored',async()=>{
  const storage=memory(),value=writer(storage);
  await value.submit(DRAFT,{details:true,fetchImpl:async(_url,{body})=>{
    assert.equal(stored(storage).attempted,true);assert.deepEqual(stored(storage).payload,JSON.parse(body));throw new TypeError('lost');
  }});
  await value.submit({...DRAFT,title:'다음 입력 원문'}, {fetchImpl:lost});
  assert.doesNotMatch(storage.getItem(QUICK_TASK_RECOVERY_KEY),/다음 입력 원문/);
  assert.equal(stored(storage).payload.title,DRAFT.title);
});

for(const failure of ['set','readback','get']) test(`${failure} storage failure prevents the first POST and preserves memory input`,async()=>{
  const storage=memory();if(failure==='set')storage.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};
  if(failure==='get')storage.getItem=()=>{throw new DOMException('blocked','SecurityError');};
  if(failure==='readback'){const get=storage.getItem;storage.getItem=key=>{const text=get(key);return text===null?null:'wrong';};}
  let calls=0;const value=writer(storage),result=await value.submit(DRAFT,{fetchImpl:async()=>{calls++;}});
  assert.equal(calls,0);assert.equal(result.status,'error');assert.match(result.message,/전송하지 않았/);
});

test('storage read failure after unknown keeps the original in-memory dedup ID',async()=>{
  const storage=memory();let ids=0;const value=writer(storage,{createId:()=>{ids++;return ID;}});
  await value.submit(DRAFT,{fetchImpl:lost});const get=storage.getItem;storage.getItem=()=>{throw Error('blocked');};
  await value.initialize();assert.equal(value.getPending().id,ID);
  await value.submit(DRAFT,{fetchImpl:lost});assert.equal(ids,1);
  storage.getItem=get;const result=await value.submit(DRAFT,{fetchImpl:async(_url,{body})=>saved(JSON.parse(body))});assert.equal(result.status,'saved');
});

test('missing storage after unknown heals with the same UUID, never rotates it',async()=>{
  const storage=memory();let ids=0;const value=writer(storage,{createId:()=>{ids++;return ID;}});
  await value.submit(DRAFT,{fetchImpl:lost});storage.values.clear();
  const result=await value.submit(DRAFT,{fetchImpl:async(_url,{body})=>saved(JSON.parse(body))});
  assert.equal(result.status,'saved');assert.equal(ids,1);
});

test('TTL does not extend across retries; expiration removes capture text and requires explicit restart',async()=>{
  const storage=memory();let clock=1000,calls=0,ids=0;
  const value=writer(storage,{now:()=>clock,createId:()=>++ids===1?ID:NEXT});
  const fetchImpl=async()=>{calls++;throw new TypeError('lost');};
  await value.submit(DRAFT,{fetchImpl});const expires=stored(storage).expiresAt;
  clock+=QUICK_TASK_RECOVERY_TTL-1;await value.submit(DRAFT,{fetchImpl});assert.equal(stored(storage).expiresAt,expires);
  clock++;await value.initialize();assert.equal(value.snapshot().status,'expired');assert.doesNotMatch(storage.getItem(QUICK_TASK_RECOVERY_KEY),/합성 다음 행동|priority|payload|dueAt/);
  assert.equal((await value.submit(DRAFT,{fetchImpl})).status,'expired');assert.equal(calls,2);assert.equal(ids,1);
  assert.equal(value.startAfterExpiry(),true);await value.submit(DRAFT,{fetchImpl});assert.equal(ids,2);
});

test('shorter session expiry removes all recovery records',async()=>{
  const storage=memory();let clock=1000;const context={...CONTEXT,expiresAt:2000};
  const value=writer(storage,{now:()=>clock,getContext:async()=>context});await value.submit(DRAFT,{fetchImpl:lost});
  assert.equal(stored(storage).expiresAt,2000);clock=2000;await value.initialize();
  assert.equal(value.snapshot().status,'unauthorized');assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
});

test('tab privacy timer removes title after unmount and removes the marker at session expiry',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const storage=memory(),value=writer(storage,{now:()=>Date.now()});
  await value.submit(DRAFT,{fetchImpl:lost});value.deactivate();
  t.mock.timers.tick(QUICK_TASK_RECOVERY_TTL);
  assert.equal(stored(storage).state,'expired');assert.doesNotMatch(storage.getItem(QUICK_TASK_RECOVERY_KEY),/합성 다음 행동|payload/);
  t.mock.timers.tick(CONTEXT.expiresAt-Date.now());assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
});

for(const change of ['owner','workspace']) test(`${change} mismatch deletes the original payload and never retries it`,async()=>{
  const storage=memory();let context=CONTEXT,calls=0;const value=writer(storage,{getContext:async()=>context});
  const fetchImpl=async()=>{calls++;throw new TypeError('lost');};await value.submit(DRAFT,{fetchImpl});
  context=change==='owner'?{...CONTEXT,ownerKey:'b'.repeat(64)}:{...CONTEXT,workspaceId:NEXT};
  const result=await value.submit(DRAFT,{fetchImpl});assert.equal(result.status,'stale');assert.equal(calls,1);
  assert.equal(value.getPending(),null);assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
});

test('restored storage is not disclosed before a verified owner; anonymous deletes it',async()=>{
  const storage=memory(),original=writer(storage);await original.submit(DRAFT,{fetchImpl:lost});original.deactivate();
  const restored=writer(storage,{getContext:async()=>null});assert.equal(restored.getPending(),null);
  await restored.initialize();assert.equal(restored.snapshot().status,'unauthorized');assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
});

test('owner ABA and a late saved reply cannot erase a new draft or write new owner recovery',async()=>{
  const storage=memory();let context=CONTEXT,resolve;const value=writer(storage,{getContext:async()=>context});
  const request=value.submit(DRAFT,{fetchImpl:async(_url,{body})=>new Promise(r=>{resolve=()=>r(saved(JSON.parse(body)));})});await tick();
  context={...CONTEXT,ownerKey:'b'.repeat(64)};await value.initialize();context=CONTEXT;await value.initialize();await value.initialize();
  resolve();assert.equal((await request).status,'stale');assert.equal(value.getPending(),null);assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
});

test('an older owner GET cannot overwrite the newest verification',async()=>{
  const storage=memory();let first,reads=0;
  const value=writer(storage,{getContext:()=>++reads===1?new Promise(resolve=>{first=resolve;}):Promise.resolve({...CONTEXT,ownerKey:'b'.repeat(64)})});
  const older=value.initialize();await value.initialize();first(CONTEXT);await older;
  assert.equal(value.snapshot().status,'ready');
  await value.submit(DRAFT,{fetchImpl:lost});assert.equal(stored(storage).ownerKey,'b'.repeat(64));
});

test('unmount during owner lookup produces no POST; remount may restore without writing',async()=>{
  const storage=memory();let release,calls=0;const value=writer(storage,{getContext:()=>new Promise(resolve=>{release=resolve;})});
  const request=value.submit(DRAFT,{fetchImpl:async()=>{calls++;}});value.deactivate();release(CONTEXT);
  assert.equal((await request).status,'stale');assert.equal(calls,0);
});

test('logout invalidates an in-flight reply before clearing the single owned key',async()=>{
  const storage=memory();storage.setItem('unrelated','preserved');let resolve;const value=writer(storage);await value.activate();
  const request=value.submit(DRAFT,{fetchImpl:async(_url,{body})=>new Promise(r=>{resolve=()=>r(saved(JSON.parse(body)));})});await tick();
  resetQuickTasks(storage);resolve();assert.equal((await request).status,'stale');assert.equal(value.getPending(),null);
  assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);assert.equal(storage.getItem('unrelated'),'preserved');
});

test('logout cleanup failure stays explicit rather than pretending private data was deleted',async()=>{
  const storage=memory();storage.setItem(QUICK_TASK_RECOVERY_KEY,'private');storage.removeItem=()=>{};
  assert.throws(()=>resetQuickTasks(storage),/remove-failed/);
});

test('confirmed saved receipt survives cleanup denial and leaves a text-free settled marker',async()=>{
  const storage=memory();storage.removeItem=()=>{};const value=writer(storage);
  const result=await value.submit(DRAFT,{fetchImpl:async(_url,{body})=>saved(JSON.parse(body))});
  assert.equal(result.status,'saved');assert.equal(result.cleanupWarning,true);assert.equal(value.getPending(),null);
  assert.equal(stored(storage).state,'settled');assert.doesNotMatch(storage.getItem(QUICK_TASK_RECOVERY_KEY),/합성 다음 행동|payload/);
  let calls=0;await value.submit(DRAFT,{fetchImpl:async()=>{calls++;}});assert.equal(calls,0);
});

for(const patch of [{payload:{id:ID,title:'too long'.repeat(50)}},{id:'wrong'},{createdAt:5000},{version:2},{payload:{title:'bad\0text'}},{unexpected:'sensitive'}]) test(`invalid recovery shape is cleared and never submitted: ${Object.keys(patch)[0]}`,async()=>{
  const storage=memory(),first=writer(storage);await first.submit(DRAFT,{fetchImpl:lost});first.deactivate();
  storage.setItem(QUICK_TASK_RECOVERY_KEY,JSON.stringify({...stored(storage),...patch}));const restored=writer(storage);
  await restored.initialize();assert.equal(restored.snapshot().status,'blocked');assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
});

test('invalid clock reversal clears the record and reports failed recovery',async()=>{
  const storage=memory(),first=writer(storage);await first.submit(DRAFT,{fetchImpl:lost});
  assert.throws(()=>readQuickTaskRecovery(storage,CONTEXT,999),/invalid/);assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
});

for(const field of ['id','workspace','title','priority','dueAt']) test(`wrong ${field} acknowledgement retains the immutable pending ID`,async()=>{
  const storage=memory(),value=writer(storage);
  const result=await value.submit(DRAFT,{fetchImpl:async(_url,{body})=>{const p=JSON.parse(body);return Response.json({status:'saved',task:{id:field==='id'?NEXT:p.id,workspace_id:field==='workspace'?NEXT:WORK,title:field==='title'?'different':p.title,status:'todo',priority:field==='priority'?'low':p.priority||'medium',due_at:field==='dueAt'?'2026-12-31T00:00:00.000Z':p.dueAt?new Date(p.dueAt).toISOString():null}});}});
  assert.equal(result.status,'error');assert.equal(value.getPending().id,ID);
});

test('edited task replay through real Engine remains conflict, not a new ID',async()=>{
  const storage=memory(),rows=new Map();let ids=0;const value=writer(storage,{createId:()=>{ids++;return ID;}});
  await value.submit(DRAFT,{fetchImpl:lost});
  const result=await value.submit(DRAFT,{fetchImpl:async(_url,{body})=>{
    const p=JSON.parse(body);const row={id:p.id,workspace_id:WORK,project_id:null,title:p.title,status:'done',priority:'medium',meta:{source:'manual'}};rows.set(p.id,row);
    const result=await executePmsCommand({...p,action:'create_task'},{workspaceId:WORK},{insert:async()=>({persisted:false,reason:'duplicate'}),update:async()=>{throw Error('unexpected');},fetchRows:async()=>[row]});
    assert.equal(result.status,'conflict');return Response.json({...result,task:result.entity},{status:409});
  }});
  assert.equal(result.status,'error');assert.equal(ids,1);assert.equal(rows.size,1);assert.equal(value.getPending().id,ID);
});
