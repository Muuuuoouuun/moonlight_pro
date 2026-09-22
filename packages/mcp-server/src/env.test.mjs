import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadMcpEnv,REPO_ROOT,DEFAULT_ENV_FILE} from './env.js';

const envFile=content=>{const dir=mkdtempSync(join(tmpdir(),'moonlight-env-'));const file=join(dir,'.env.local');writeFileSync(file,content);return file;};

test('loads only the MCP keys from the Hub env file',()=>{
  const file=envFile(['COM_MOON_HUB_URL=http://127.0.0.1:3000','COM_MOON_AGENT_API_TOKEN=agent-token','COM_MOON_HUB_WRITE_SECRET=write-secret','COM_MOON_MCP_PROFILE=pms','GEMINI_API_KEY=model-secret','GOOGLE_CLIENT_SECRET=oauth-secret','COM_MOON_SHARED_WEBHOOK_SECRET=engine-secret','COM_MOON_OAUTH_STATE_SECRET=state-secret'].join('\n'));
  const env={};
  const result=loadMcpEnv({file,env});
  assert.deepEqual(Object.keys(env).sort(),['COM_MOON_AGENT_API_TOKEN','COM_MOON_HUB_URL','COM_MOON_HUB_WRITE_SECRET','COM_MOON_MCP_PROFILE']);
  assert.deepEqual(result.loaded.sort(),Object.keys(env).sort());
  assert.equal(result.missing,false);
});

test('values already in the environment win over the file',()=>{
  const file=envFile('COM_MOON_MCP_PROFILE=all\nCOM_MOON_HUB_URL=http://file\n');
  const env={COM_MOON_MCP_PROFILE:'core'};
  loadMcpEnv({file,env});
  assert.equal(env.COM_MOON_MCP_PROFILE,'core');
  assert.equal(env.COM_MOON_HUB_URL,'http://file');
});

test('a missing env file is reported, not thrown',()=>{
  const env={};
  const result=loadMcpEnv({file:'/nonexistent/moonlight/.env.local',env});
  assert.equal(result.missing,true);
  assert.deepEqual(env,{});
});

test('COM_MOON_MCP_ENV_FILE overrides the default location, which is resolved from the package itself',()=>{
  const file=envFile('COM_MOON_HUB_URL=http://override\n');
  const env={COM_MOON_MCP_ENV_FILE:file};
  assert.equal(loadMcpEnv({env}).file,file);
  assert.equal(DEFAULT_ENV_FILE,`${REPO_ROOT}/apps/hub/.env.local`);
  assert.match(REPO_ROOT,/^\/.+[^/]$/);
});
