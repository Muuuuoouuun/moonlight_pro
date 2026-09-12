import assert from 'node:assert/strict';
import {after,beforeEach,test} from 'node:test';
const ledger=await import('./discovery-ledger.js').catch(()=>({}));
const W='11111111-1111-4111-8111-111111111111',ID='33333333-3333-4333-8333-333333333333';
const input={id:ID,requestId:ID,expectedRevision:0,title:'가능성',orgScope:'personal',discoveryMode:'capture',status:'captured',evidence:'',hypothesis:'',experiment:'',findings:'',decisionReason:'',resumeCondition:'',reviewDate:null,links:[]};
const {id,requestId,expectedRevision,...snapshot}=input;
const row={id:ID,workspace_id:W,snapshot,revision:1,updated_at:'2026-09-13T00:00:00Z'};
const keys=['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','COM_MOON_DEFAULT_WORKSPACE_ID','DEFAULT_WORKSPACE_ID'];
const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const originalFetch=globalThis.fetch,originalError=console.error;let state;
beforeEach(()=>{for(const key of keys)delete process.env[key];process.env.SUPABASE_URL='https://discovery.example';process.env.SUPABASE_SERVICE_ROLE_KEY='test';process.env.COM_MOON_DEFAULT_WORKSPACE_ID=W;
 state={calls:[],rows:[row],workspaces:[{id:W}],rpc:{status:'saved',record:row},targets:[{id:ID,workspace_id:W,name:'파일럿'}]};console.error=()=>{};
 globalThis.fetch=async(target,options={})=>{const url=new URL(target),table=url.pathname.split('/').at(-1);state.calls.push({url,table,body:options.body?JSON.parse(options.body):null});if(state.fail===table)return new Response('private database failure',{status:500});return Response.json(table==='workspaces'?state.workspaces:table==='save_discovery_v1'?state.rpc:table==='projects'?state.targets:state.rows);};
});
after(()=>{globalThis.fetch=originalFetch;console.error=originalError;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}});
test('discovery repository exports real scoped read/save/history/target operations',()=>{for(const name of ['getDiscoveryLedger','saveDiscovery','getDiscoveryTargets','getDiscoveryHistory'])assert.equal(typeof ledger[name],'function');});
test('missing configuration is explicit preview without queries or fake data',async()=>{delete process.env.SUPABASE_SERVICE_ROLE_KEY;const result=await ledger.getDiscoveryLedger();assert.equal(result.status,'preview');assert.deepEqual(result.records,[]);assert.equal((await ledger.saveDiscovery(input)).httpStatus,503);assert.equal(state.calls.length,0);});
test('reads scope all queries and map complete validated snapshots',async()=>{const result=await ledger.getDiscoveryLedger({id:ID,workspaceId:'foreign'});assert.equal(result.status,'live');assert.equal(result.records[0].title,input.title);assert.equal(result.records[0].revision,1);const call=state.calls.find(c=>c.table==='discovery_records');assert.equal(call.url.searchParams.get('workspace_id'),`eq.${W}`);assert.equal(call.url.searchParams.get('id'),`eq.${ID}`);});
test('malformed/foreign rows and transport failures cannot masquerade as empty lists',async()=>{for(const bad of [{...row,workspace_id:ID},{...row,snapshot:{...snapshot,title:''}},{...row,revision:0}]){state.rows=[bad];assert.equal((await ledger.getDiscoveryLedger()).status,'error');}state.rows=[];state.fail='discovery_records';assert.equal((await ledger.getDiscoveryLedger()).status,'error');state.fail=null;state.workspaces=[];assert.equal((await ledger.getDiscoveryLedger()).status,'error');});
test('save sends only accepted snapshot with server workspace to one atomic RPC',async()=>{const result=await ledger.saveDiscovery({...input,workspaceId:'foreign',junk:'ignored'});assert.equal(result.status,'saved');const call=state.calls.find(c=>c.table==='save_discovery_v1');assert.deepEqual(call.body,{p_workspace_id:W,p_payload:input});});
test('save errors, duplicate/current conflict and invalid success responses are explicit',async()=>{for(const [status,httpStatus] of [['duplicate',200],['conflict',409],['invalid-input',400]]){state.rpc={status,record:status==='invalid-input'?null:row};const result=await ledger.saveDiscovery(input);assert.equal(result.status,status);assert.equal(result.httpStatus??200,httpStatus);}state.rpc={status:'saved',record:{...row,workspace_id:ID}};assert.equal((await ledger.saveDiscovery(input)).status,'error');state.fail='save_discovery_v1';assert.equal((await ledger.saveDiscovery(input)).status,'error');});
test('target search uses actual table fields, escaped query, scoped verified ids and known deep links',async()=>{const result=await ledger.getDiscoveryTargets({type:'project',q:'파일럿'});assert.equal(result.status,'live');assert.deepEqual(result.targets,[{type:'project',id:ID,title:'파일럿',href:`/dashboard/work/projects?project=${ID}`}]);const call=state.calls.find(c=>c.table==='projects');assert.equal(call.url.searchParams.get('name'),'ilike.%파일럿%');assert.equal(call.url.searchParams.get('workspace_id'),`eq.${W}`);state.targets[0].workspace_id=ID;assert.equal((await ledger.getDiscoveryTargets({type:'project'})).status,'error');assert.equal((await ledger.getDiscoveryTargets({type:'invalid'})).status,'error');});
test('history maps immutable recorded snapshots and scopes record id',async()=>{state.rows=[{...row,record_id:ID}];const result=await ledger.getDiscoveryHistory(ID);assert.equal(result.status,'live');assert.equal(result.history[0].revision,1);const call=state.calls.find(c=>c.table==='discovery_revisions');assert.equal(call.url.searchParams.get('record_id'),`eq.${ID}`);assert.equal((await ledger.getDiscoveryHistory('bad')).status,'error');});
test('bounded list and history expose subsequent pages with validated offsets',async()=>{
 await ledger.getDiscoveryLedger({offset:200});assert.equal(state.calls.find(c=>c.table==='discovery_records').url.searchParams.get('offset'),'200');
 state.calls=[];state.rows=[{...row,record_id:ID}];await ledger.getDiscoveryHistory(ID,{offset:100});assert.equal(state.calls.find(c=>c.table==='discovery_revisions').url.searchParams.get('offset'),'100');
 for(const offset of [-1,1.2,'bad',1000001]){assert.equal((await ledger.getDiscoveryLedger({offset})).status,'error');assert.equal((await ledger.getDiscoveryHistory(ID,{offset})).status,'error');}
});
test('malformed HTTP200 bodies stay errors for records, history and targets',async()=>{
 for(const rows of [{message:'private database error'},null,'not an array']){
  state.rows=rows;assert.equal((await ledger.getDiscoveryLedger()).status,'error');assert.equal((await ledger.getDiscoveryHistory(ID)).status,'error');
  state.targets=rows;assert.equal((await ledger.getDiscoveryTargets({type:'project'})).status,'error');
 }
});

test('fallback labels offered by target search survive save and reread',async()=>{
 for(const name of [null,'  \t\n ']) {
  state.targets=[{id:ID,workspace_id:W,name}];
  const target=(await ledger.getDiscoveryTargets({type:'project'})).targets[0];assert.equal(target.title,'이름 없음');
  const linkedRow={...row,snapshot:{...snapshot,status:'connected',links:[target]}};
  state.rpc={status:'saved',record:linkedRow};
  const saved=await ledger.saveDiscovery({...input,status:'connected',links:[{type:'project',id:ID}]});assert.equal(saved.status,'saved');
  state.rows=[linkedRow];const read=await ledger.getDiscoveryLedger();assert.equal(read.status,'live');assert.deepEqual(read.records[0],saved.record);
 }
});
