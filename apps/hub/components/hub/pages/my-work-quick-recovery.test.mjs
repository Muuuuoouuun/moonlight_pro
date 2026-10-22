import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import React from 'react';
import ts from 'typescript';
import * as primitives from '../hub-primitives.jsx';
import { Iconed } from '../hub-icons.jsx';
import * as mute from './my-work-mute.js';
import { createMyWorkQuickTask } from '../../../lib/my-work-quick-task.js';
import { clearSubmittedQuickTaskDraft, shouldSubmitQuickTask } from '../../../lib/quick-task-capture.js';
import { QUICK_TASK_RECOVERY_KEY, resetQuickTasks } from '../../../lib/quick-task-recovery.js';
import { MAX_FOCUS_PER_DAY, focusLimitMessage } from '../../../lib/task-today.js';
const source=readFileSync(new URL('./my-work.jsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source.replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,''),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const WORK='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ID='11111111-1111-4111-8111-111111111111';
const CONTEXT={ownerKey:'a'.repeat(64),workspaceId:WORK,expiresAt:Date.now()+3600000};
const originals={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,BroadcastChannel:globalThis.BroadcastChannel};
const cleanups=[];
afterEach(()=>{for(const cleanup of cleanups.splice(0))cleanup();Object.assign(globalThis,originals);});
function memory(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
const noAction=()=>{throw Error('unexpected unrelated action');};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function descendants(node){if(!node||typeof node!=='object')return[];return[node,...React.Children.toArray(node.props?.children).flatMap(descendants)];}
function harness(storage,fetchImpl,readOverrides={},undoable={schedule:noAction,cancel:noAction}){
  const slots=[],effects=[],routes=[];let cursor=0;
  const hookReact={...React,
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
    useMemo:fn=>fn(),useCallback:fn=>fn,
    useEffect(fn,deps){const i=cursor++;if(!(i in slots)){slots[i]=deps;effects.push(fn);}},
  };
  globalThis.window={sessionStorage:storage,localStorage:memory(),setTimeout:()=>{},addEventListener:()=>{},removeEventListener:()=>{}};
  globalThis.document={visibilityState:'visible',addEventListener:()=>{},removeEventListener:()=>{},getElementById:()=>null};
  globalThis.BroadcastChannel=undefined;globalThis.fetch=fetchImpl;
  const read={items:[],sources:{tasks:'live',deals:'live',calendar:'live'},projects:[],focusToday:null,state:'ready',reload:async()=>({items:[{lane:'task',entityId:'22222222-2222-4222-8222-222222222222',title:'합성 첫 요청',id:'wrong-row',bucket:'today'}]})};
  Object.assign(read,readOverrides);
  const scope={...primitives,...mute,React:hookReact,Iconed,createMyWorkQuickTask,clearSubmittedQuickTaskDraft,shouldSubmitQuickTask,MAX_FOCUS_PER_DAY,focusLimitMessage,
    fetch:fetchImpl,useSearchParams:()=>new URLSearchParams(),useRouter:()=>({replace:path=>routes.push(path)}),usePathname:()=>'/dashboard/work/my',useToast:()=>({success:()=>{},error:()=>{},info:()=>{}}),
    useUndoableAction:()=>undoable,UNDO_WINDOW_MS:3500,JournalSources:()=>null,MeetingWatchCard:()=>null,TASK_PRIORITY_OPTIONS:[],TASK_STATUS_OPTIONS:[],TASK_OUTCOME:{},
    freezeTaskCommand:noAction,saveTaskCommand:noAction,triggerCelebration:noAction,triggerSparkleAt:noAction,requestPersonaChat:noAction,buildMyWorkChecklistToggle:noAction,readMyWorkChecklistReceipt:noAction};
  // read is intentionally passed as a real captured dependency, not a rewritten loader.
  const evaluate=new Function(...Object.keys(scope),'read',`${compiled}\nuseAttentionLedger=()=>read;return MyWork;`)(...Object.values(scope),read);
  const render=()=>{cursor=0;return evaluate({onNavigate:noAction});};
  render();for(const effect of effects.splice(0)){const cleanup=effect();if(cleanup)cleanups.push(cleanup);}
  return {render,routes,input:()=>descendants(render()).find(n=>n.type==='input'&&n.props['aria-label']==='새 할 일 제목'),button:()=>descendants(render()).find(n=>n.props.onClick&&n.props.icon==='plus'),nodes:()=>descendants(render())};
}
async function pending(storage){const first=createMyWorkQuickTask({storage,getContext:async()=>CONTEXT,createId:()=>ID});await first.submit({title:'합성 첫 요청'},{fetchImpl:async()=>{throw new TypeError('synthetic lost');}});first.deactivate();}

for(const undoAt of [0,100,250]) test(`actual MyWork keeps an undone row visible after Undo at ${undoAt}ms`,async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const item={lane:'task',entityId:ID,title:'합성 완료 복구',id:`task-${ID}`,bucket:'today'};
  const scheduled=new Map();let writes=0;
  const view=harness(memory(),async(url)=>{
    if(url==='/api/operator/session')return Response.json({status:'authenticated',recovery:CONTEXT});
    writes++;throw Error('Undo must not write');
  },{items:[item]},{schedule:(key,run)=>scheduled.set(key,run),cancel:key=>scheduled.delete(key)});
  await tick();
  const row=()=>view.nodes().find(n=>n.props.item?.id===item.id&&n.props.onComplete);
  assert.ok(row());row().props.onComplete(item);
  t.mock.timers.tick(undoAt);
  const undo=view.nodes().find(n=>n.props.onClick&&n.props.children==='되돌리기');assert.ok(undo);
  undo.props.onClick();assert.ok(row(),'Undo restores the row immediately');
  t.mock.timers.tick(400);
  assert.ok(row(),'a late strike animation must not hide an undone row');
  assert.equal(row().props.completing,false);assert.equal(scheduled.size,0);assert.equal(writes,0);
});

test('actual MyWork keeps capture blocked and input intact when the session has no recovery workspace',async()=>{
  const storage=memory();let posts=0;
  const view=harness(storage,async(url)=>{if(url==='/api/operator/session')return Response.json({status:'authenticated',recovery:null});posts++;throw Error('unexpected POST');});
  await tick();view.input().props.onChange({target:{value:'합성 보관할 입력'}});
  assert.equal(view.button().props.disabled,true);
  const notice=view.nodes().find(n=>typeof n.props.children==='string'&&/로그인.*작업 범위/.test(n.props.children));
  assert.ok(notice);assert.doesNotMatch(notice.props.children,/브라우저 복구 기록|저장 공간/);
  const retry=view.nodes().find(n=>n.props.onClick&&n.props.children==='다시 확인');assert.ok(retry);
  await retry.props.onClick();await view.button().props.onClick();
  assert.equal(view.button().props.disabled,true);assert.equal(posts,0);assert.equal(view.input().props.value,'합성 보관할 입력');
});

test('actual MyWork mount restores pending without POST and can verify an empty input',async()=>{
  const storage=memory();await pending(storage);let posts=0;
  const view=harness(storage,async(url,options)=>{if(url==='/api/operator/session')return Response.json({status:'authenticated',recovery:CONTEXT});posts++;const p=JSON.parse(options.body);return Response.json({status:'duplicate',task:{id:p.id,workspace_id:WORK,title:p.title,status:"todo",priority:p.priority||"medium",due_at:p.dueAt?new Date(p.dueAt).toISOString():null}});});
  await tick();assert.equal(posts,0);assert.equal(view.input().props.value,'');assert.equal(view.button().props.disabled,false);
  assert.match(JSON.stringify(view.button().props.children),/이전 요청 확인/);await view.button().props.onClick();assert.equal(posts,1);
  assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);
  assert.equal(view.nodes().some(n=>n.type==='button'&&n.props.children==='보기'),false,'wrong same-title row must not become a view target');
});

test('actual MyWork preserves next input while confirming the previous restored UUID',async()=>{
  const storage=memory();await pending(storage);let payload;
  const view=harness(storage,async(url,options)=>{if(url==='/api/operator/session')return Response.json({status:'authenticated',recovery:CONTEXT});payload=JSON.parse(options.body);return Response.json({status:'duplicate',task:{id:payload.id,workspace_id:WORK,title:payload.title,status:"todo",priority:payload.priority||"medium",due_at:payload.dueAt?new Date(payload.dueAt).toISOString():null}});});await tick();
  view.input().props.onChange({target:{value:'합성 후속 입력'}});await view.button().props.onClick();
  assert.equal(payload.id,ID);assert.equal(payload.title,'합성 첫 요청');assert.equal(view.input().props.value,'합성 후속 입력');
});

test('actual MyWork owner change clears prior input and suppresses a late saved notice',async()=>{
  const storage=memory();let context=CONTEXT,resolve;
  const view=harness(storage,async(url,options)=>{if(url==='/api/operator/session')return Response.json({status:'authenticated',recovery:context});const p=JSON.parse(options.body);return new Promise(r=>{resolve=()=>r(Response.json({status:'saved',task:{id:p.id,workspace_id:WORK,title:p.title,status:"todo",priority:p.priority||"medium",due_at:p.dueAt?new Date(p.dueAt).toISOString():null}}));});});await tick();
  view.input().props.onChange({target:{value:'합성 이전 입력'}});const request=view.button().props.onClick();await tick();context={...CONTEXT,ownerKey:'b'.repeat(64)};resolve();await request;
  assert.equal(view.input().props.value,'');assert.equal(view.nodes().some(n=>typeof n.props.children==='string'&&/할 일 저장됨/.test(n.props.children)),false);
});

for(const bucket of ['later','today']) test(`saved task View keeps the ${bucket} task reachable beyond its temporary highlight`,async()=>{
  const storage=memory();await pending(storage);
  const item={lane:'task',entityId:ID,title:'합성 첫 요청',id:`task-${ID}`,bucket};
  const view=harness(storage,async(url,options)=>{
    if(url==='/api/operator/session')return Response.json({status:'authenticated',recovery:CONTEXT});
    const p=JSON.parse(options.body);
    return Response.json({status:'duplicate',task:{id:p.id,workspace_id:WORK,title:p.title,status:'todo',priority:'medium',due_at:null}});
  },{items:[item],reload:async()=>({items:[item]})});
  await tick();await view.button().props.onClick();
  // Filters can change after saving, before the persistent receipt's View action.
  view.nodes().find(n=>n.props.label==='레인 필터').props.onChange('deal');
  view.nodes().find(n=>n.props.placeholder==='제목 검색').props.onChange('unrelated search');
  view.nodes().find(n=>n.props.label==='기한 필터').props.onChange('overdue');
  view.nodes().find(n=>n.props.onClick&&n.props.children==='보기').props.onClick();
  const nodes=view.nodes();
  assert.equal(view.routes.at(-1),'/dashboard/work/my');
  assert.equal(nodes.find(n=>n.props.label==='기한 필터').props.value,bucket==='later'?'later':'all');
  assert.equal(window.localStorage.getItem('mlp.mywork.bucket'),bucket==='later'?'later':'all','the destination must persist independently of the highlight timer');
  assert.equal(nodes.find(n=>n.props.label==='레인 필터').props.value,'task');
  assert.equal(nodes.find(n=>n.props.placeholder==='제목 검색').props.value,'');
  assert.ok(nodes.some(n=>n.props.item?.id===item.id),'the saved row is visible in its destination');
});

function logout(storage,fetchImpl,{blockedAccess=false}={}){globalThis.window={sessionStorage:storage,location:{replace:href=>{redirect=href;}}};if(blockedAccess)Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('blocked','SecurityError');}});globalThis.BroadcastChannel=undefined;let redirect='',error='',busy=false;
  const settings=readFileSync(new URL('./evolution-settings.jsx',import.meta.url),'utf8');const start=settings.indexOf('  const logout = async () => {'),end=settings.indexOf('  const loadDeadlineAlerts',start);
  const action=new Function('logoutBusy','setLogoutBusy','setLogoutError','resetQuickTasks','fetch','window',`${settings.slice(start,end)}\nreturn logout;`)(false,value=>{busy=value;},value=>{error=value;},resetQuickTasks,fetchImpl,window);
  return {run:action,get:()=>({redirect,error,busy})};}

test('actual logout handler deletes only QuickTask recovery before logout POST',async()=>{
  const storage=memory();storage.setItem(QUICK_TASK_RECOVERY_KEY,'private capture');storage.setItem('other','preserved');let calls=0;
  const view=logout(storage,async()=>{calls++;assert.equal(storage.getItem(QUICK_TASK_RECOVERY_KEY),null);return Response.json({status:'logged_out'});});await view.run();
  assert.equal(calls,1);assert.equal(view.get().redirect,'/login');assert.equal(storage.getItem('other'),'preserved');
});

for(const failure of ['remove','read','access']) test(`actual logout revokes the cookie despite ${failure} cleanup denial and carries a text-free warning`,async()=>{
  const storage=memory();storage.setItem(QUICK_TASK_RECOVERY_KEY,'private capture');
  if(failure==='remove')storage.removeItem=()=>{};if(failure==='read')storage.getItem=()=>{throw new DOMException('blocked','SecurityError');};let calls=0;
  const view=logout(storage,async()=>{calls++;return Response.json({status:'logged_out'});},{blockedAccess:failure==='access'});await view.run();
  assert.equal(calls,1);assert.equal(view.get().redirect,'/login?recoveryCleanup=failed');assert.match(view.get().error,/복구 입력을 정리하지 못했습니다/);
  assert.doesNotMatch(view.get().redirect,/private capture/);
});

test('actual logout preserves both cleanup and server failure information without claiming session revocation',async()=>{
  const storage=memory();storage.removeItem=()=>{throw Error('denied');};let calls=0;
  const view=logout(storage,async()=>{calls++;return Response.json({status:'error'},{status:503});});await view.run();
  assert.equal(calls,1);assert.equal(view.get().redirect,'');assert.equal(view.get().busy,false);
  assert.match(view.get().error,/로그아웃하지 못했습니다/);assert.match(view.get().error,/복구 입력을 정리하지 못했습니다/);
});
