import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { newRevenueCreateId, validRevenueCreateId } from '../../../lib/sales-os/revenue-create-command.js';
import { accountKey, accountCreateScope } from './account-identity.js';
import { notifyRevenueSaveFailure } from './revenue-create-client.js';
const source=readFileSync(new URL('./revenue.jsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('revenue.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
function handler(name, dependencies) {
  let initializer;
  function visit(node) { if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name&&ts.isArrowFunction(node.initializer)) initializer=node.initializer.getText(ast); ts.forEachChild(node,visit); }
  visit(ast);assert.ok(initializer,`${name} is an actual product callback`);
  return new Function(...Object.keys(dependencies),`return (${initializer});`)(...Object.values(dependencies));
}
for(const [kind,name,setter,prefix] of [['lead','createLead','setLocalLeads','local-lead-'],['deal','createDeal','setDeals','LOCAL-'],['case','createCase','setLocalCases','CASE-']]) test(`${kind}: actual create callback allocates a stable full UUID in every new draft`,()=>{
  let rows=[],editing;
  const callback=handler(name,{newRevenueCreateId,filter:'company',ws:null,workspace:null,effectiveWorkspace:null,ledgerUnavailable:false,DEAL_STAGES:[{key:'potential'}],
    [setter]:update=>{rows=update(rows);},setEditLeadId:id=>editing=id,setEditDealId:id=>editing=id,setEditCaseId:id=>editing=id});
  callback();callback();assert.equal(rows.length,2);assert.notEqual(rows[0].createId,rows[1].createId);
  for(const row of rows){assert.equal(validRevenueCreateId(row.createId),true);assert.equal(row.id,`${prefix}${row.createId}`);}
  assert.equal(editing,rows[0].id);
});
test('actual quick Account callback retains unknown draft and retries its command rather than creating another',async()=>{
  let rows=[],selected,view,notice,accept=false;const calls=[],pendingAccountCreateRef={current:new Map()};
  const create=handler('createAccount',{accountKey, accountCreateScope,newRevenueCreateId,pendingRevenueCreates:()=>[],filter:'company',ws:null,workspace:null,pendingAccountCreateRef,
    setLocalAccounts:update=>rows=update(rows),setSelected:value=>selected=value,setView:value=>view=value,setAccountsNotice:value=>notice=value,
    saveRevenueRecord:async(kind,op,record)=>{calls.push({kind,op,record});return accept?{ok:true,status:'saved',id:record.createId}:{ok:false,status:'unknown',message:'Unconfirmed'};},
    notifyRevenueSaveFailure,toast:{success(){},error(){}}});
  await create();assert.equal(rows.length,1);assert.equal(view,'detail');assert.equal(notice,'Unconfirmed');assert.equal(selected,accountKey(rows[0]));
  await create();assert.equal(rows.length,1);assert.equal(calls[0].record.createId,calls[1].record.createId);
  accept=true;await create();assert.equal(rows.length,1);assert.equal(rows[0].id,rows[0].createId);assert.equal(pendingAccountCreateRef.current.size,0);
  await create();assert.equal(rows.length,2);assert.notEqual(calls[3].record.createId,calls[0].record.createId);
});
for(const [name,idKey,recordKey,id,extra] of [['deleteLead','editLeadId','editingLead','local-lead-one',{}],['deleteDeal','editDealId','editingDeal','LOCAL-one',{deals:[]}],['deleteCase','editCaseId','editingCase','CASE-one',{}]]) test(`${name}: unresolved create is not discarded as an unsaved local record`,async()=>{
  let mutations=0;const fail=()=>mutations++;
  const callback=handler(name,{[idKey]:id,[recordKey]:{id,createId:'unresolved'},...extra,hasPendingRevenueCreate:()=>true,
    setLocalLeads:fail,setDeletedLeadIds:fail,setDeals:fail,setLocalCases:fail,setDeletedCaseIds:fail});
  assert.equal((await callback()).status,'unknown');assert.equal(mutations,0);
});
test('explicit recovery toast never writes until the operator selects its action',async()=>{
  let notification,writes=0;
  notifyRevenueSaveFailure({error:(message,options)=>notification={message,options},info(){}},{status:'unknown',message:'Unconfirmed',retryOriginal:async()=>{writes++;return{message:'Confirmed; edits still unsaved'};}},'Fallback');
  assert.equal(writes,0);assert.equal(notification.message,'Unconfirmed');assert.equal(notification.options.action.label,'처음 등록 재시도');
  await notification.options.action.onClick();assert.equal(writes,1);
});

test('Account caller separates unresolved commands across workspace switch and remount',async()=>{
  let rows=[];const pending=new Map(),requests=[],ref={current:new Map()};
  const make=(workspace,pendingAccountCreateRef=ref)=>handler('createAccount',{accountKey, accountCreateScope,newRevenueCreateId,filter:'company',ws:{key:workspace},workspace,pendingAccountCreateRef,
    pendingRevenueCreates:()=>[...pending.values()],setLocalAccounts:update=>rows=update(rows),setSelected(){},setView(){},setAccountsNotice(){},
    saveRevenueRecord:async(kind,op,record)=>{requests.push({...record});pending.set(record.createId,{...record});return{ok:false,status:'unknown',message:'Unconfirmed'};},notifyRevenueSaveFailure,toast:{error(){}}});
  await make('classin')();await make('personal')();assert.equal(requests.length,2);assert.notEqual(requests[0].createId,requests[1].createId);
  assert.equal(requests[0].workspace,'classin');assert.equal(requests[1].workspace,'personal');
  await make('classin')();assert.equal(requests[2].createId,requests[0].createId);assert.equal(rows.length,2);
  await make('personal',{current:new Map()})();assert.equal(requests[3].createId,requests[1].createId);assert.equal(rows.length,2);
});
