// Opt-in purpose simulation. All HTTP calls are intercepted in memory; no sockets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import { saveRevenueCreate, rememberRevenueDraft, pendingRevenueCreates, hasPendingRevenueCreate, notifyRevenueSaveFailure } from '../../apps/hub/components/hub/pages/revenue-create-client.js';
import { accountKey, accountCreateScope, queueAccountRename } from '../../apps/hub/components/hub/pages/account-identity.js';
import { newRevenueCreateId, REVENUE_CREATE_KINDS, CREATE_UNKNOWN_MESSAGE } from '../../apps/hub/lib/sales-os/revenue-create-command.js';
import { getRevenueLedger, getCrmActivities } from '../../apps/hub/lib/repositories/revenue-ledger.js';
registerHooks({ resolve(s,c,next) { return next(s === 'next/server' ? 'next/server.js' : s,c); } });
const routes=Object.fromEntries(await Promise.all(['lead','account','deal','case','activity'].map(async k=>[k,(await import(`../../apps/hub/app/api/hub/revenue/${k}/route.js`)).POST])));
const root=new URL('../../',import.meta.url), source=path=>readFileSync(new URL(path,root),'utf8');
const revenue=source('apps/hub/components/hub/pages/revenue.jsx'), customers=source('apps/hub/components/hub/pages/customers.jsx'), core=source('apps/hub/components/hub/pages/revenue-core.jsx');
function expression(text,name,dependencies={}) {
  const ast=ts.createSourceFile('source.jsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let code;
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)code=n.initializer.getText(ast);if(ts.isFunctionDeclaration(n)&&n.name?.text===name)code=n.getText(ast).replace(/^export /,'');ts.forEachChild(n,visit);}visit(ast);assert.ok(code,name);
  return new Function(...Object.keys(dependencies),`return (${code});`)(...Object.values(dependencies));
}
const save=expression(core,'saveRevenueRecord',{saveRevenueCreate,REVENUE_CREATE_KINDS,CREATE_UNKNOWN_MESSAGE});
const customerPayload=values=>expression(customers,'createPayload',values);
const customerRows=expression(customers,'toRows',{subjectLabels:()=>[],LEAD_STAGE_ORDER:{New:0,Contact:1},scoreBand:()=>null,parseMoney:Number,isTemplateNextAction:()=>false});
const workspace='00000000-0000-4000-8000-000000000001';
function business(t){
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','COM_MOON_DEFAULT_WORKSPACE_ID','COM_MOON_HUB_WRITE_SECRET'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',COM_MOON_DEFAULT_WORKSPACE_ID:workspace,COM_MOON_HUB_WRITE_SECRET:'synthetic-only'});
  const tables=new Map(),calls=[],lost=new Set(),held=new Map();let auto=100;
  const rows=table=>{if(!tables.has(table))tables.set(table,new Map());return tables.get(table);};
  const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
  globalThis.fetch=async(input,init={})=>{
    if(String(input).startsWith('/api/hub/revenue/')){
      const kind=String(input).split('/').at(-1),body=JSON.parse(init.body);calls.push({layer:'ui',kind,op:body.op,payload:body});
      const res=await routes[kind](new Request(`https://synthetic.invalid${input}`,{...init,headers:{...init.headers,'x-com-moon-hub-write-secret':'synthetic-only'}}));
      if(held.has(kind)){const gate=held.get(kind);held.delete(kind);gate.ready();await gate.wait;}
      if(lost.delete(`${kind}:${body.createId}`))throw Error('Synthetic acknowledgement lost after commit');return res;
    }
    const url=new URL(String(input));assert.equal(url.origin,'https://synthetic.invalid','network is forbidden');assert.ok(url.pathname.startsWith('/rest/v1/'));
    const table=url.pathname.split('/').at(-1),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;calls.push({layer:'rest',table,method,body});
    const matches=row=>[...url.searchParams].every(([key,value])=>{
      if(['select','limit','offset','order'].includes(key))return true;
      const actual=key==='meta'?JSON.stringify(row.meta):row[key];
      if(value.startsWith('eq.'))return String(actual)===value.slice(3);
      if(value==='is.null')return row[key]==null;
      if(value.startsWith('in.('))return value.slice(4,-1).split(',').map(v=>v.replaceAll('"','')).includes(String(actual));
      assert.fail(`unsupported fixture filter ${key}=${value}`);
    });
    if(method==='GET')return response([...rows(table).values()].filter(matches));
    if(method==='POST'){
      assert.ok(!(init.headers.Prefer||'').includes('resolution='),'upsert forbidden');
      const id=body.id||`00000000-0000-4000-8000-${String(++auto).padStart(12,'0')}`;
      if(rows(table).has(id))return response({code:'23505',message:'primary key collision'},409);
      const row={...(table==='deals'?{stage:'prospect'}:{}),...(table==='customer_accounts'?{status:'active'}:{}),...body,id};rows(table).set(id,row);return response([row],201);
    }
    if(method==='PATCH'){const selected=[...rows(table).values()].filter(matches),updated=selected.map(row=>({...row,...body}));updated.forEach(row=>rows(table).set(row.id,row));return response(updated);}
    assert.fail(`unsupported REST write ${method}`);
  };
  t.after(()=>{globalThis.fetch=oldFetch;for(const key of keys)old[key]===undefined?delete process.env[key]:process.env[key]=old[key];});
  return {rows,calls,lose:(kind,id)=>lost.add(`${kind}:${id}`),hold(kind){
    let ready,release;const committed=new Promise(resolve=>ready=resolve),wait=new Promise(resolve=>release=resolve);
    held.set(kind,{ready,wait});t.after(release);return {committed,release};
  }};
}
const draft=(extra={})=>({createId:newRevenueCreateId(),name:'Synthetic Cedar Academy',stage:'New',phone:'000-0000-0101',next_action:'Send synthetic demo outline',next_action_at:'2026-10-22',workspace:'classin',focusOverride:'raise',...extra});

function accountUi(io){
 let local=[],selected=null,details={},notice=null,names={};const ref={current:new Map()};
 const setter=(current,put)=>value=>put(typeof value==='function'?value(current()):value);
 const dependencies={accountKey, accountCreateScope,queueAccountRename,accountRenameQueueRef:{current:new Map()},accountRenameIntentRef:{current:new Map()},reloadLedger:async()=>({ledger:await getRevenueLedger()}),setAccountNameEdits:setter(()=>names,v=>names=v),newRevenueCreateId,pendingRevenueCreates,rememberRevenueDraft,hasPendingRevenueCreate,notifyRevenueSaveFailure,saveRevenueRecord:save,filter:'company',pendingAccountCreateRef:ref,
 setLocalAccounts:setter(()=>local,v=>local=v),setSelected:setter(()=>selected,v=>selected=v),setDetails:setter(()=>details,v=>details=v),setView(){},setAccountsNotice:v=>notice=v,setActivityError(){},toast:{success(){},error(){},info(){}}};
 return {local:()=>local,selected:()=>selected,details:()=>details,notice:()=>notice,create:(scope='classin',remount=false)=>expression(revenue,'createAccount',{...dependencies,ws:{key:scope},workspace:scope,pendingAccountCreateRef:remount?{current:new Map()}:ref}),rename:expression(revenue,'renameAccount',dependencies),loseNext(){const generator=dependencies.newRevenueCreateId;dependencies.newRevenueCreateId=()=>{const id=generator();io.lose('account',id);return id;};}};
}


export { business, draft, save, customerRows, customerPayload, accountUi };
