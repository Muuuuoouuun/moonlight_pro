import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import * as workflow from './office-workflow-client.js';
import {ownerAnchorKey,topNavigationForRoute,SIDEBAR_ANCHORS} from './hub-nav.js';

const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const input={intent:'weekly_report',scope:'personal',originRef:{periodStart:'2024-02-05',periodEnd:'2024-02-11',timezone:'Asia/Seoul'}};
const receipt=(changes={})=>({status:'generated',requestId:id,...input,ownerId:'vaporeon',mode:'draft',participants:[],createdAt:'2024-02-12T00:00:00Z',persistence:{persisted:true},result:{requestId:id,scope:'personal',summary:'지정한 요청의 결과',artifact:{kind:'text',body:'검증된 본문'}},...changes});
const fetcher=body=>async()=>Response.json(body);
const link=(...args)=>{assert.equal(typeof workflow.readOfficeRequestLink,'function','exact request deep-link reader must exist');return workflow.readOfficeRequestLink(...args);};
const selection=(...args)=>{assert.equal(typeof workflow.readOfficeWorkflowSelection,'function','origin-bound request selection must exist');return workflow.readOfficeWorkflowSelection(...args);};

test('direct request link restores arbitrary saved weekly period by one authenticated read and never generates',async()=>{
  const calls=[],data=receipt();
  const result=await link(id,{fetcher:async(path,options)=>{calls.push({path,options});return Response.json(data);}});
  assert.equal(result.status,'ready');assert.deepEqual(result.input,input);assert.deepEqual(result.receipt,data);
  assert.equal(calls.length,1);assert.equal(calls[0].path,`/api/hub/office/requests/${id}`);assert.notEqual(calls[0].options.method,'POST');
});
test('direct request link restores verified customer scope and origin, not URL-selected context',async()=>{
  const originRef={entityType:'customer_account',entityId:other},data=receipt({intent:'customer_reply',scope:'classin',originRef,result:{...receipt().result,scope:'classin'}});
  const result=await link(id,{fetcher:fetcher(data)});
  assert.equal(result.status,'ready');assert.deepEqual(result.input,{intent:'customer_reply',scope:'classin',originRef});
});
test('invalid request IDs never issue a read and mismatched or unsupported metadata never renders its body',async()=>{
  let calls=0;const badFetch=async()=>{calls++;return Response.json(receipt());};
  for(const value of [null,'',`${id}/apply`,'not-a-uuid'])assert.equal((await link(value,{fetcher:badFetch})).status,'invalid');
  assert.equal(calls,0);
  for(const change of [{requestId:other},{scope:'all'},{intent:'freeform'},{originRef:{periodStart:'2024-02-05',periodEnd:'2024-02-06',timezone:'Asia/Seoul'}},{persistence:{persisted:false}},{status:'expired',result:receipt().result},{source:'error'}]) {
    const result=await link(id,{fetcher:fetcher(receipt(change))});assert.equal(result.status,'error');assert.equal(result.receipt,undefined);
  }
});
test('direct request link distinguishes connection preview, failed read, authentication, generation failure and expired metadata',async()=>{
  for(const [body,status] of [[{status:'preview'},'preview'],[{status:'error',source:'error'},'error']])assert.equal((await link(id,{fetcher:fetcher(body)})).status,status);
  assert.equal((await link(id,{fetcher:async()=>Response.json({status:'unauthorized'},{status:401})})).status,'unauthorized');
  for(const status of ['running','unknown','error','expired']) {
    const result=await link(id,{fetcher:fetcher(receipt({status,result:null,...(status==='error'?{source:'error'}:{})}))});
    assert.equal(result.status,'ready');assert.equal(result.receipt.status,status);assert.equal(result.receipt.result,null);
  }
});
test('selection rejects scope, intent and origin drift even when no generated result exists',async()=>{
  for(const changes of [{scope:'classin'},{intent:'customer_reply',originRef:{entityType:'lead',entityId:other}},{originRef:{...input.originRef,periodStart:'2024-02-12',periodEnd:'2024-02-18'}}]) {
    const result=await selection(id,input,{fetcher:fetcher(receipt({status:'running',result:null,...changes}))});
    assert.equal(result.status,'error');assert.equal(result.error,'invalid-workflow-receipt');assert.equal(result.result,undefined);
  }
  assert.equal((await selection(id,input,{fetcher:fetcher(receipt())})).status,'generated');
});
test('initial request load selects only the named receipt without inspecting the latest origin result',async()=>{
  assert.equal(typeof workflow.loadOfficeWorkflowOrigin,'function','initial request loader must exist');
  const calls=[];
  const loaded=await workflow.loadOfficeWorkflowOrigin(input,{requestId:id,fetcher:async path=>{
    calls.push(path);
    if(path.includes('/context?'))return Response.json({status:'ready',capabilities:{generate:true}});
    if(path.includes('/requests?'))return Response.json({status:'ready',requests:[{requestId:other}],nextCursor:null});
    return Response.json(receipt());
  }});
  assert.equal(loaded.receipt.requestId,id);assert.equal(calls.filter(path=>path===`/api/hub/office/requests/${id}`).length,1);
  assert.equal(calls.some(path=>path===`/api/hub/office/requests/${other}`),false);assert.ok(calls.every(path=>!path.includes('/apply')&&!path.includes('/recover')));
});
test('deep-link screen mounts inside the existing Office navigation with no additional sidebar destination',async()=>{
  const app=await readFile(new URL('./hub-app.jsx',import.meta.url),'utf8');
  assert.match(app,/'dashboard\/agents\/office-request':/);assert.match(app,/OfficeRequest.*lazyPage|const OfficeRequest = lazyPage/);
  assert.equal(ownerAnchorKey(`dashboard/agents/office-request?request=${id}`),'ai');
  for(const scope of ['all','classin','personal'])assert.equal(topNavigationForRoute('dashboard/agents/office-request',scope).activeTab?.key,'ai-office');
  assert.equal(SIDEBAR_ANCHORS.length,12);
});
