import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { GORE_THREADS_TEST as target, approvedGorePayload, normalizeGoreTestCommand, sha256 } from './gore-threads-test-contract.js';
import { runGoreThreadsTest } from './gore-threads-test-service.js';
import { createThreadsTextTestAdapter, verifiedGorePost } from './threads-text-test-adapter.js';
import { createGoreTestRepository } from './repositories/gore-threads-test-jobs.js';

const workspaceId='11111111-1111-1111-1111-111111111111',jobId='22222222-2222-2222-2222-222222222222';
const accountId='333333333',appId='444444444',owner='55555555-5555-5555-5555-555555555555';
const prepare={action:'prepare',accountId,appId,bodyHash:target.bodyHash,visibility:'public',confirmPrepare:true};
const execute={action:'execute',jobId,accountId,appId,bodyHash:target.bodyHash,visibility:'public',confirmPublish:true};
const lookup={action:'reconcile',jobId,accountId,appId,bodyHash:target.bodyHash,confirmLookup:true};
const originalEnv={...process.env},originalFetch=globalThis.fetch;
beforeEach(()=>{process.env={};globalThis.fetch=async()=>{throw Error('unexpected network attempt');};});
afterEach(()=>{process.env={...originalEnv};globalThis.fetch=originalFetch;});

// Dependency model for service races/failure injection. This is NOT an executed SQL test.
function harness({ failAt, saveLostAt, profile, post, containerStatus='FINISHED' }={}) {
 let job={...approvedGorePayload(workspaceId,accountId,appId),id:jobId,state:'prepared',version:1};
 let leaseOwner=null,leaseToken=null,alive=false,failOnce=true,clock=0,leaseDeadline=0;
 const clockEpoch=Date.parse('2026-09-30T12:00:00Z');
 const calls=[],effects={create:0,publish:0},clone=()=>({...job});
 const repo={async command(action,value){
  calls.push(action==='advance'?`save:${value.state}`:action);
  if(clock>=leaseDeadline)alive=false;
  if(action==='prepare')return value.payloadHash===job.payloadHash?{status:'duplicate',job:clone()}:{status:'conflict'};
  if(action==='get')return {status:'live',job:clone()};
  if(action==='claim'||action==='lookup'){
   if(alive)return {status:'busy',job:clone()};
   if(action==='claim'&&!['prepared','claimed'].includes(job.state)){
    if(job.state!=='ambiguous'){job.state='ambiguous';job.version++;job.errorCode='expired-effect-lease';}
    return {status:'blocked',job:clone()};
   }
   if(action==='lookup'&&['prepared','claimed'].includes(job.state))return {status:'blocked',job:clone()};
   leaseOwner=value.owner;leaseToken=`lease-${++job.version}`;alive=true;leaseDeadline=clock+90000;
   if(action==='claim')job.state='claimed';
   return {status:'claimed',job:clone(),leaseToken,leaseExpiresAt:new Date(clockEpoch+leaseDeadline).toISOString(),leaseRemainingMs:90000};
  }
  if(!alive||value.owner!==leaseOwner||value.leaseToken!==leaseToken||value.expectedVersion!==job.version)return {status:'conflict',job:clone()};
  if(failAt===value.state&&failOnce){failOnce=false;throw Error('synthetic-private-token');}
  Object.assign(job,{state:value.state,version:job.version+1},Object.fromEntries(['containerId','postId','permalink','receiptSource','errorCode'].filter(k=>k in value).map(k=>[k,value[k]])));
  if(['verified','ambiguous'].includes(job.state))alive=false;
  if(saveLostAt===value.state&&failOnce){failOnce=false;throw Error('synthetic-private-token');}
  return {status:'saved',job:clone()};
 }};
 const adapter={
  async profile(){calls.push('profile');return profile||{id:accountId,username:target.username};},
  async createContainer(){calls.push('create');effects.create++;if(failAt==='create')throw Error('synthetic-private-token');return '666666666';},
  async container(){calls.push('container');return {id:'666666666',status:containerStatus};},
  async publish(){calls.push('publish');effects.publish++;if(failAt==='publish')throw Error('synthetic-private-token');return '777777777';},
  async post(id){calls.push('post');if(failAt==='post')throw Error('synthetic-private-token');return post||{id,ownerId:accountId,username:target.username,body:target.body,permalink:'https://www.threads.com/@go_re_startagain/post/TEST'};},
 };
 const deps={workspaceId,enabled:true,repo,owner,now:()=>clockEpoch+clock,monotonicNow:()=>clock,readCredential:async()=>({accessToken:'synthetic-private-token'}),adapterFactory:()=>adapter};
 return {deps,calls,effects,adapter,job:()=>clone(),expire:()=>{clock=Math.max(clock,leaseDeadline+1);alive=false;},advanceTime:ms=>{clock+=ms;},setJob:value=>Object.assign(job,value)};
}

test('one-post contract pins the supplied text/hash and rejects unconfirmed/foreign requests',()=>{
 assert.equal(sha256(target.body),target.bodyHash);assert.equal([...target.body].length,67);
 assert.ok(normalizeGoreTestCommand(prepare));assert.ok(normalizeGoreTestCommand(execute));
 for(const input of [{...execute,confirmPublish:false},{...execute,bodyHash:'0'.repeat(64)},{...execute,workspaceId},
  {...execute,accountId:'@go_re_startagain'},{...prepare,visibility:'private'},{...lookup,observedPostId:'777777777'},
  {...prepare,brandKey:'classmoon'},{...execute,body:target.body+'!'}])assert.equal(normalizeGoreTestCommand(input),null);
});
test('disabled runtime performs no storage/provider access',async()=>{
 const result=await runGoreThreadsTest(execute,{workspaceId,enabled:false,repo:{command:()=>assert.fail('storage')}});
 assert.equal(result.status,'disabled');
});
test('successful execution saves each write intent before POST and repeat execution makes no post',async()=>{
 const h=harness();const result=await runGoreThreadsTest(execute,h.deps);
 assert.equal(result.status,'verified');assert.equal(result.job.postId,'777777777');
 assert.ok(h.calls.indexOf('save:creating')<h.calls.indexOf('create'));
 assert.ok(h.calls.indexOf('save:publish_requested')<h.calls.indexOf('publish'));
 assert.deepEqual(h.effects,{create:1,publish:1});
 assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'verified');assert.deepEqual(h.effects,{create:1,publish:1});
 assert.doesNotMatch(JSON.stringify(result),/synthetic-private-token|leaseToken|leaseExpiresAt|leaseRemainingMs|leaseWindow|leaseDeadline|payloadHash|workspaceId/);
});
test('two executors share one claimed job in the atomic repository model',async()=>{
 const h=harness();await Promise.all([runGoreThreadsTest(execute,h.deps),runGoreThreadsTest(execute,{...h.deps,owner:jobId})]);
 assert.deepEqual(h.effects,{create:1,publish:1});
});
test('prepare is idempotent and another app/account cannot reuse the reserved job',async()=>{
 const h=harness();assert.equal((await runGoreThreadsTest(prepare,h.deps)).status,'duplicate');
 assert.equal((await runGoreThreadsTest({...prepare,appId:'888888888'},h.deps)).status,'conflict');
 assert.equal((await runGoreThreadsTest({...execute,accountId:'888888888'},h.deps)).status,'conflict');
 assert.deepEqual(h.effects,{create:0,publish:0});
});
test('wrong provider profile fails before claim/create',async()=>{
 for(const profile of [{id:'888888888',username:target.username},{id:accountId,username:'moon.classin'}]){
  const h=harness({profile});assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'conflict');
  assert.ok(!h.calls.includes('claim'));assert.equal(h.effects.create,0);
 }
});
test('lost create response leaves ambiguous; later execute cannot create or publish again',async()=>{
 const h=harness({failAt:'create'});assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');
 assert.equal(h.job().containerId,undefined);assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'blocked');
 assert.deepEqual(h.effects,{create:1,publish:0});
});
test('lost publish response and PUBLISHED container never authorize a second publish',async()=>{
 const h=harness({failAt:'publish',containerStatus:'FINISHED'});
 assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');
 assert.equal(h.job().containerId,'666666666');assert.equal(h.job().postId,undefined);
 assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'blocked');
 h.adapter.container=async()=>({id:'666666666',status:'PUBLISHED'});
 assert.equal((await runGoreThreadsTest(lookup,h.deps)).status,'ambiguous');assert.deepEqual(h.effects,{create:1,publish:1});
});
test('operator candidate recovery verifies ID/owner/body/permalink with GET only',async()=>{
 const h=harness({failAt:'publish'});await runGoreThreadsTest(execute,h.deps);
 const result=await runGoreThreadsTest({...lookup,observedPostId:'777777777',confirmRecoveredPost:true},h.deps);
 assert.equal(result.status,'verified');assert.equal(result.job.receiptSource,'operator-reconciled');
 assert.deepEqual(h.effects,{create:1,publish:1});
});
test('mismatched or malicious recovery receipt is not attached',async()=>{
 for(const patch of [{ownerId:'888888888'},{body:target.body+'!'},{username:'moon.classin'},
  {permalink:'https://attacker.example/@go_re_startagain/post/TEST'}]){
  const h=harness({failAt:'publish',post:{id:'777777777',ownerId:accountId,username:target.username,body:target.body,permalink:'https://www.threads.com/@go_re_startagain/post/TEST',...patch}});
  await runGoreThreadsTest(execute,h.deps);
  assert.equal((await runGoreThreadsTest({...lookup,observedPostId:'777777777',confirmRecoveredPost:true},h.deps)).status,'ambiguous');
  assert.equal(h.job().postId,undefined);assert.equal(h.effects.publish,1);
 }
});
test('storage failure before write intent prevents provider POST',async()=>{
 const h=harness({failAt:'creating'});assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');
 assert.deepEqual(h.effects,{create:0,publish:0});
});
test('committed save with lost response cannot re-enter create after lease expiry',async()=>{
 const h=harness({saveLostAt:'creating'});assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');
 assert.equal(h.job().state,'creating');h.expire();
 assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'blocked');assert.equal(h.effects.create,0);
});
test('lost saved post-ID response keeps durable ID and reconcile completes without publishing again',async()=>{
 const h=harness({saveLostAt:'post_recorded'});await runGoreThreadsTest(execute,h.deps);h.expire();
 assert.equal(h.job().postId,'777777777');assert.equal((await runGoreThreadsTest(lookup,h.deps)).status,'verified');
 assert.equal(h.effects.publish,1);
});
test('container/publish-intent save loss never triggers a second external effect',async()=>{
 for(const injected of [{failAt:'container_ready'},{saveLostAt:'container_ready'},
  {failAt:'publish_requested'},{saveLostAt:'publish_requested'}]){
  const h=harness(injected);assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');h.expire();
  assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'blocked');assert.deepEqual(h.effects,{create:1,publish:0});
 }
});
test('expired execution lease cannot enter publish, and a new owner fences the old owner',async()=>{
 const h=harness();const first=await h.deps.repo.command('claim',{jobId,owner});h.expire();
 const second=await h.deps.repo.command('claim',{jobId,owner:jobId});
 assert.equal(second.status,'claimed');
 assert.equal((await h.deps.repo.command('advance',{jobId,owner,leaseToken:first.leaseToken,expectedVersion:first.job.version,state:'creating'})).status,'conflict');
 assert.equal(h.effects.create,0);
 const stage=harness(),command=stage.deps.repo.command;
 stage.deps.repo.command=async(action,value)=>{const result=await command(action,value);if(action==='advance'&&value.state==='container_ready')stage.expire();return result;};
 assert.equal((await runGoreThreadsTest(execute,stage.deps)).status,'ambiguous');assert.equal(stage.effects.publish,0);
});
test('lease expiry immediately after each durable POST intent stops the paused worker before sending',async()=>{
 for(const state of ['creating','publish_requested']){
  const h=harness(),command=h.deps.repo.command;
  h.deps.repo.command=async(action,value)=>{const result=await command(action,value);if(action==='advance'&&value.state===state)h.expire();return result;};
  const result=await runGoreThreadsTest(execute,h.deps);
  assert.equal(result.status,'ambiguous');assert.deepEqual(h.effects,{create:state==='creating'?0:1,publish:0});
  assert.doesNotMatch(JSON.stringify(result),/leaseToken|leaseExpiresAt|leaseRemainingMs|leaseWindow|leaseDeadline|synthetic-private-token/);
 }
});
test('expired intent followed by another execute/lookup claim fences both external POSTs from the old worker',async()=>{
 for(const state of ['creating','publish_requested']){
  const h=harness(),command=h.deps.repo.command;let recovered;
  h.deps.repo.command=async(action,value)=>{
   const result=await command(action,value);
   if(action==='advance'&&value.state===state){
    h.expire();assert.equal((await command('claim',{jobId,owner:jobId})).status,'blocked');
    const next=await command('lookup',{jobId,owner:jobId});assert.equal(next.status,'claimed');recovered=h.job();
   }
   return result; // Delayed acknowledgement to the old worker, after recovery changed ownership/version.
  };
  assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');
  assert.deepEqual(h.effects,{create:state==='creating'?0:1,publish:0});
  assert.deepEqual(h.job(),recovered);assert.equal(h.job().state,'ambiguous');
 }
});
test('both POST intents need strictly more than request timeout plus margin remaining',async()=>{
 for(const state of ['creating','publish_requested'])for(const remainingMs of [0,10000,12000,12001]){
  const h=harness(),command=h.deps.repo.command;
  h.deps.repo.command=async(action,value)=>{const result=await command(action,value);if(action==='advance'&&value.state===state)h.advanceTime(90000-remainingMs);return result;};
  const result=await runGoreThreadsTest(execute,h.deps);
  if(remainingMs>12000){assert.equal(result.status,'verified');assert.deepEqual(h.effects,{create:1,publish:1});}
  else{assert.equal(result.status,'ambiguous');assert.deepEqual(h.effects,{create:state==='creating'?0:1,publish:0});}
 }
});
test('claim acknowledgement delay consumes the budget instead of granting a new lease at receipt',async()=>{
 const h=harness(),command=h.deps.repo.command;
 h.deps.repo.command=async(action,value)=>{const result=await command(action,value);if(action==='claim')h.advanceTime(80000);return result;};
 assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');assert.deepEqual(h.effects,{create:0,publish:0});
});
test('missing or malformed private lease metadata fails closed without exposing it',async()=>{
 for(const patch of [{leaseExpiresAt:null},{leaseExpiresAt:'invalid'},{leaseRemainingMs:undefined},{leaseRemainingMs:'90000'},
  {leaseRemainingMs:NaN},{leaseRemainingMs:90001},{leaseRemainingMs:0},{leaseRemainingMs:-1}]){
  const h=harness(),command=h.deps.repo.command;
  h.deps.repo.command=async(action,value)=>{const result=await command(action,value);return action==='claim'?{...result,...patch}:result;};
  const result=await runGoreThreadsTest(execute,h.deps);
  assert.equal(result.status,'ambiguous');assert.deepEqual(h.effects,{create:0,publish:0});
  assert.doesNotMatch(JSON.stringify(result),/leaseToken|leaseExpiresAt|leaseRemainingMs|leaseWindow|synthetic-private-token/);
 }
});
test('elapsed wall time covers host sleep even if the monotonic clock does not move',async()=>{
 for(const state of ['creating','publish_requested']){
  const h=harness(),command=h.deps.repo.command;let wallOffset=0;
  const originalNow=h.deps.now;h.deps.now=()=>originalNow()+wallOffset;
  h.deps.repo.command=async(action,value)=>{const result=await command(action,value);if(action==='advance'&&value.state===state)wallOffset=90001;return result;};
  assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');
  assert.deepEqual(h.effects,{create:state==='creating'?0:1,publish:0});
 }
});
test('elapsed monotonic time still fences a paused worker after a wall-clock rollback',async()=>{
 const h=harness(),command=h.deps.repo.command;h.deps.now=()=>0;
 h.deps.repo.command=async(action,value)=>{const result=await command(action,value);if(action==='advance'&&value.state==='creating')h.advanceTime(90001);return result;};
 assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');assert.deepEqual(h.effects,{create:0,publish:0});
});
test('service supplies a final pre-send check so a pause inside either adapter entry cannot start POST',async()=>{
 for(const method of ['createContainer','publish']){
  const h=harness(),original=h.adapter[method];
  h.adapter[method]=async(value,options)=>{h.advanceTime(90001);options.beforeSend();return original(value);};
  assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');
  assert.deepEqual(h.effects,{create:method==='createContainer'?0:1,publish:0});
 }
});
test('in-progress/expired/error containers are never published or retried by this minimum path',async()=>{
 for(const containerStatus of ['IN_PROGRESS','EXPIRED','ERROR','PUBLISHED']){
  const h=harness({containerStatus});assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'ambiguous');
  assert.equal(h.effects.publish,0);assert.equal((await runGoreThreadsTest(execute,h.deps)).status,'blocked');
 }
});
test('default connection reader rejects expired/reduced/misbound credentials before preparing',async()=>{
 process.env={SUPABASE_URL:'https://db.example.com',SUPABASE_SERVICE_ROLE_KEY:'synthetic-db-key',
  COM_MOON_META_THREADS_GORE_APP_ID:appId,COM_MOON_META_THREADS_GORE_APP_SECRET:'synthetic-app-secret'};
 const row={id:jobId,workspace_id:workspaceId,provider:'meta_threads',account_key:accountId,status:'connected',
  config:{username:target.username,brandHandle:target.username,brandKey:'gore',oauthAppKey:'gore',oauthAppId:appId,
   accessToken:'synthetic-private-token',scope:'threads_basic,threads_content_publish',expiresAt:new Date(Date.now()+86400000).toISOString()}};
 for(const change of [{status:'disabled'},{account_key:'888888888'},{workspace_id:jobId},{config:{brandKey:'classmoon'}},
  {config:{oauthAppId:'888888888'}},{config:{scope:'threads_basic'}},{config:{expiresAt:'2000-01-01T00:00:00Z'}},{config:{accessToken:''}}]){
  const current={...row,...change,config:{...row.config,...change.config}};
  globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).hostname,'db.example.com');assert.equal(options.method,'GET');return new Response(JSON.stringify([current]));};
  assert.equal((await runGoreThreadsTest(prepare,{workspaceId,enabled:true,repo:{command:()=>assert.fail('must not store')}})).status,'blocked');
 }
});
test('adapter credentials never enter URL/body or raw provider errors; TEXT auto-publish is disabled',async()=>{
 const calls=[];const adapter=createThreadsTextTestAdapter({accessToken:'synthetic-private-token',fetchImpl:async(url,options)=>{
  calls.push({url,options});assert.doesNotMatch(url,/synthetic-private-token/);assert.equal(options.headers.authorization,'Bearer synthetic-private-token');
  assert.doesNotMatch(options.body||'',/synthetic-private-token/);
  return new Response(JSON.stringify(options.method==='POST'?{id:'666666666'}:{id:accountId,username:target.username}));
 }});
 await adapter.profile();await adapter.createContainer(target.body);await adapter.publish('666666666');
 const form=new URLSearchParams(calls[1].options.body);assert.equal(form.has('auto_publish_text'),false);assert.equal(form.get('text'),target.body);
 const failed=createThreadsTextTestAdapter({accessToken:'synthetic-private-token',fetchImpl:async()=>{throw Error('synthetic-private-token');}});
 await assert.rejects(failed.publish('666666666'),error=>error.message==='provider-effect-unconfirmed');
 assert.equal(verifiedGorePost({id:'777777777',ownerId:accountId,username:target.username,body:target.body,permalink:'https://www.threads.com/@go_re_startagain/post/TEST?tracking=1'},
  {...approvedGorePayload(workspaceId,accountId,appId),postId:'777777777'}).permalink,'https://www.threads.com/@go_re_startagain/post/TEST');
});
test('actual adapter stops both POSTs when the synchronous final pre-send guard rejects',async()=>{
 let fetched=0,checked=0;
 const adapter=createThreadsTextTestAdapter({accessToken:'synthetic-private-token',fetchImpl:async()=>{fetched++;return new Response(JSON.stringify({id:'666666666'}));}});
 const beforeSend=()=>{checked++;throw Error('effect-lease-unavailable');};
 await assert.rejects(adapter.createContainer(target.body,{beforeSend}),/effect-lease-unavailable/);
 await assert.rejects(adapter.publish('666666666',{beforeSend}),/effect-lease-unavailable/);
 assert.equal(checked,2);assert.equal(fetched,0);
 await adapter.createContainer(target.body,{beforeSend:()=>{assert.equal(fetched,0);}});assert.equal(fetched,1);
});
test('actual container adapter parses raw JSON statuses and excludes unrequested/error fields',async()=>{
 const id='666666666';
 for(const status of ['IN_PROGRESS','FINISHED','PUBLISHED','ERROR','EXPIRED']){
  const adapter=createThreadsTextTestAdapter({accessToken:'synthetic-private-token',fetchImpl:async(url,options)=>{
   assert.equal(new URL(url).pathname,`/v1.0/${id}`);assert.equal(new URL(url).searchParams.get('fields'),'id,status');assert.equal(options.method,'GET');
   return new Response(JSON.stringify({id,status,error_message:'synthetic-private-token',access_token:'synthetic-private-token'}));
  }});
  const result=await adapter.container(id);assert.deepEqual(result,{id,status});assert.doesNotMatch(JSON.stringify(result),/synthetic-private-token|error_message|access_token/);
 }
});
test('actual container adapter rejects mismatched IDs/status and malformed/error JSON with fixed errors',async()=>{
 const id='666666666';
 for(const response of [new Response(JSON.stringify({id:'888888888',status:'FINISHED'})),new Response(JSON.stringify({id})),
  new Response(JSON.stringify({id,status:'UNKNOWN'})),new Response('null'),new Response('[]'),new Response('{'),
  new Response(JSON.stringify({error:{message:'synthetic-private-token'}}),{status:400})]){
  const adapter=createThreadsTextTestAdapter({accessToken:'synthetic-private-token',fetchImpl:async()=>response});
  await assert.rejects(adapter.container(id),error=>error.message==='provider-read-unconfirmed');
 }
});
test('actual post adapter parses raw owner string/object and verifies the sanitized exact receipt',async()=>{
 const id='777777777',permalink='https://www.threads.com/@go_re_startagain/post/TEST?tracking=1#fragment';
 for(const owner of [accountId,{id:accountId,private_field:'synthetic-private-token'}]){
  const adapter=createThreadsTextTestAdapter({accessToken:'synthetic-private-token',fetchImpl:async(url,options)=>{
   assert.equal(new URL(url).pathname,`/v1.0/${id}`);assert.equal(new URL(url).searchParams.get('fields'),'id,username,owner,text,permalink');assert.equal(options.method,'GET');
   return new Response(JSON.stringify({id,username:target.username,owner,text:target.body,permalink,access_token:'synthetic-private-token'}));
  }});
  const post=await adapter.post(id);assert.deepEqual(post,{id,username:target.username,ownerId:accountId,body:target.body,permalink});
  assert.doesNotMatch(JSON.stringify(post),/synthetic-private-token|access_token|private_field/);
  assert.deepEqual(verifiedGorePost(post,{...approvedGorePayload(workspaceId,accountId,appId),postId:id}),
   {postId:id,permalink:'https://www.threads.com/@go_re_startagain/post/TEST'});
 }
});
test('actual post adapter rejects wrong ID/malformed JSON and incomplete or foreign receipts never verify',async()=>{
 const id='777777777';
 for(const response of [new Response(JSON.stringify({id:'888888888'})),new Response('null'),new Response('[]'),new Response('{'),
  new Response(JSON.stringify({error:{message:'synthetic-private-token'}}),{status:403})]){
  const adapter=createThreadsTextTestAdapter({accessToken:'synthetic-private-token',fetchImpl:async()=>response});
  await assert.rejects(adapter.post(id),error=>error.message==='provider-read-unconfirmed');
 }
 const job={...approvedGorePayload(workspaceId,accountId,appId),postId:id};
 for(const change of [{owner:null},{owner:{}},{owner:'888888888'},{text:undefined},{username:'moon.classin'},
  {permalink:'https://attacker.example/@go_re_startagain/post/TEST'}]){
  const adapter=createThreadsTextTestAdapter({accessToken:'synthetic-private-token',fetchImpl:async()=>new Response(JSON.stringify(
   {id,username:target.username,owner:{id:accountId},text:target.body,permalink:'https://www.threads.com/@go_re_startagain/post/TEST',...change}))});
  assert.equal(verifiedGorePost(await adapter.post(id),job),null);
 }
});
test('RPC storage errors are redacted and schema contains durable CAS/RLS without credentials',async()=>{
 const repo=createGoreTestRepository({workspaceId,rpc:async()=>{throw Error('synthetic-private-token');}});
 await assert.rejects(repo.command('get',{jobId}),error=>error.message==='job-storage-unconfirmed');
 // Static safety checks only; this does not validate SQL execution.
 const source=await readFile(new URL('../../../supabase/migrations/20261001_0064_gore_threads_text_test_job.sql',import.meta.url),'utf8');
 assert.match(source,/unique\(workspace_id,job_key\)/);assert.match(source,/for update/);assert.match(source,/expectedVersion/);
 assert.match(source,/expired-effect-lease/);
 assert.match(source,/'leaseExpiresAt',j\.lease_expires_at/);assert.match(source,/'leaseRemainingMs',greatest\(0,floor\(extract\(epoch/);
 const projection=source.split('create or replace function public.gore_threads_test_job_public_v1')[1].split('$$;')[0];
 assert.doesNotMatch(projection,/leaseToken|leaseExpiresAt|leaseRemainingMs|lease_owner|lease_expires_at/);assert.match(source,/enable row level security/);
 assert.match(source,/revoke all on public.gore_threads_test_jobs from public,anon,authenticated,service_role/);
 assert.doesNotMatch(source,/access_token|refresh_token|app_secret|^begin;|^commit;/m);
});
