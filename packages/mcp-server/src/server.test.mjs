import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMoonlightServer,INSTRUCTIONS,version} from './server.js';
import {PROFILE_NAMES} from './tools.js';

test('readOnly keeps exactly the tools annotated readOnlyHint, in every profile',()=>{
  for(const profile of PROFILE_NAMES){
    const all=createMoonlightServer({profile,mode:'agent'}).names;
    const readOnly=createMoonlightServer({profile,mode:'agent',readOnly:true}).names;
    assert.ok(readOnly.every(name=>all.includes(name)),profile);
    assert.equal(readOnly.some(name=>/^(create|update|complete|record|decide|start|cancel|resume|request)_/.test(name)),false,profile);
  }
  const jobs=createMoonlightServer({profile:'jobs',mode:'agent',readOnly:true}).names;
  assert.deepEqual(jobs.sort(),['get_codex_job','get_hub_health','list_codex_jobs','list_codex_projects']);
});

test('the package version and operating instructions are exported for every transport',()=>{
  assert.match(version,/^\d+\.\d+\.\d+$/);
  assert.match(INSTRUCTIONS,/commandId/);
});
