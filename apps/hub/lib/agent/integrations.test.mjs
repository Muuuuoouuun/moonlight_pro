import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {getAgentIntegrationHealth,CONNECTION_METADATA_SELECT} from './integrations.js';
import {createAgentHttpHandler} from './http.js';

const workspaceId='11111111-1111-4111-8111-111111111111';
const context={workspaceId,actorId:'codex',scopes:['read']};
const originalEnv={...process.env};afterEach(()=>{process.env={...originalEnv};});
const row={id:'connection-id',workspace_id:workspaceId,provider:'instagram_api',account_key:'28472190629148289',status:'connected',
  brand_key:'studyseagull',brand_handle:'study_seagull',username:'study_seagull',app_key:'studyseagull',app_id:'study-app',expires_at:'2026-12-26T00:00:00Z'};

test('integration diagnostics read only projected metadata in the authenticated workspace',async()=>{
  Object.assign(process.env,{COM_MOON_INSTAGRAM_STUDY_SEAGULL_APP_ID:'study-app',COM_MOON_INSTAGRAM_STUDY_SEAGULL_APP_SECRET:'private-app-secret'});
  let requested;
  const result=await getAgentIntegrationHealth({brandKey:'studyseagull',limit:'1'},context,{now:Date.parse('2026-10-27'),fetchRows:async(table,options)=>{
    requested={table,options};return {configured:true,rows:[{...row,accessToken:'private-access',config:{refreshToken:'private-refresh'}}]};
  }});
  assert.equal(requested.table,'integration_connections');
  assert.ok(requested.options.filters.some(([key,value])=>key==='workspace_id'&&value===`eq.${workspaceId}`));
  assert.equal(requested.options.select,CONNECTION_METADATA_SELECT);
  assert.doesNotMatch(requested.options.select,/(?:access|refresh)Token(?!Expires)|(?:^|,)config(?:,|$)/);
  assert.equal(result.data.tokenValuesRead,false);assert.equal(result.data.providerRequestsMade,false);
  assert.equal(result.data.data.connections[0].appBindingMatches,true);
  assert.equal(result.data.data.connections[0].tokenStatus,'stored-active');
  assert.equal(result.data.data.metaApps.length,1);assert.equal(result.data.data.metaApps[0].provider,'instagram_api');
  assert.doesNotMatch(JSON.stringify(result),/private-app-secret|private-access|private-refresh/);
});

test('invalid selectors, absent scopes and foreign source rows cannot leak metadata',async()=>{
  let reads=0;const fetchRows=async()=>{reads++;return {configured:true,rows:[{...row,workspace_id:'other-workspace'}]};};
  for(const query of [{workspaceId:'other'}, {provider:'other'}, {limit:'101'}, {limit:'0'}, {offset:'-1'}, {brandKey:'x,y'}]){
    assert.equal((await getAgentIntegrationHealth(query,context,{fetchRows})).httpStatus,400);
  }
  assert.equal((await getAgentIntegrationHealth({}, {...context,scopes:[]},{fetchRows})).httpStatus,403);
  assert.equal(reads,0);
  const result=await getAgentIntegrationHealth({},context,{fetchRows});
  assert.equal(result.httpStatus,502);assert.equal(result.data.data,undefined);
});

test('legacy BridgeMaker metadata remains discoverable without reading its config object',async()=>{
  let filters;
  const result=await getAgentIntegrationHealth({brandKey:'bridgemaker'},context,{fetchRows:async(_table,options)=>{
    filters=options.filters;return {configured:true,rows:[{...row,brand_key:null,username:'ml_bridgemaker',brand_handle:'ml_bridgemaker',app_key:null,app_id:null}]};
  }});
  assert.ok(filters.some(([key,value])=>key==='or'&&value.includes('config->>brandKey.is.null')&&value.includes('config->>username.eq.ml_bridgemaker')));
  assert.equal(result.data.data.connections[0].brandKey,'bridgemaker');
});

test('metadata distinguishes expired grants, expired access and app binding mismatches without refreshing',async()=>{
  const youtube={...row,provider:'youtube',account_key:'UC_channel',brand_key:'moonpm',expires_at:'2026-10-26T00:00:00Z',refresh_expires_at:'2026-11-02T00:00:00Z'};
  const result=await getAgentIntegrationHealth({limit:'2'},context,{now:Date.parse('2026-10-27'),fetchRows:async()=>({configured:true,rows:[youtube,{...youtube,refresh_expires_at:'2026-10-25T00:00:00Z'},row]})});
  assert.deepEqual(result.data.data.connections.map(item=>item.tokenStatus),['refresh-required','reauthorization-required']);
  assert.equal(result.data.page.hasMore,true);assert.equal(result.data.page.nextOffset,2);
  const mismatch=await getAgentIntegrationHealth({},context,{fetchRows:async()=>({configured:true,rows:[row]})});
  assert.equal(mismatch.data.data.connections[0].tokenStatus,'app-config-required');
  Object.assign(process.env,{COM_MOON_INSTAGRAM_STUDY_SEAGULL_APP_ID:'different-app',COM_MOON_INSTAGRAM_STUDY_SEAGULL_APP_SECRET:'private-app-secret'});
  const replaced=await getAgentIntegrationHealth({},context,{fetchRows:async()=>({configured:true,rows:[row]})});
  assert.equal(replaced.data.data.connections[0].tokenStatus,'app-binding-review-required');
  const unknownGrant=await getAgentIntegrationHealth({},context,{now:Date.parse('2026-10-27'),fetchRows:async()=>({configured:true,rows:[{...youtube,refresh_expires_at:null}]})});
  assert.equal(unknownGrant.data.data.connections[0].tokenStatus,'access-expired');
});

test('the Agent HTTP endpoint authenticates before reading integration metadata',async()=>{
  let called=false;
  const denied=createAgentHttpHandler('integrations',{authorize:()=>({ok:false,httpStatus:401,data:{status:'error'}}),integrations:()=>{called=true;}});
  assert.equal((await denied(new Request('https://hub.example/api/agent/v1/integrations'))).status,401);
  assert.equal(called,false);
  const allowed=createAgentHttpHandler('integrations',{authorize:(_req,{scope})=>{assert.equal(scope,'read');return {ok:true,context};},integrations:async(query,identity)=>{
    assert.equal(identity.workspaceId,workspaceId);assert.deepEqual(query,{brandKey:'studyseagull'});return {httpStatus:200,data:{status:'live'}};
  }});
  const response=await allowed(new Request('https://hub.example/api/agent/v1/integrations?brandKey=studyseagull'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
});

test('the exported integration route rejects a request without an Agent credential',async()=>{
  Object.assign(process.env,{COM_MOON_AGENT_API_TOKEN:'private-route-token',COM_MOON_DEFAULT_WORKSPACE_ID:workspaceId,COM_MOON_AGENT_SCOPES:'read'});
  delete process.env.COM_MOON_AGENT_CLIENT_TOKEN_HASHES;
  const {GET}=await import('../../app/api/agent/v1/integrations/route.js');
  assert.equal((await GET(new Request('https://hub.example/api/agent/v1/integrations'))).status,401);
});
