import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {parseEnv} from 'node:util';
import {parseAgentClientTokenHashes} from '@com-moon/agent-contracts';
import {createClientTokenFile} from './client-token.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
// Throwaway Hub env and home; nothing here reads a real env file or client config.
function fixture(hubEnv){
  const dir=mkdtempSync(join(tmpdir(),'moonlight-client-token-'));
  const hub=join(dir,'hub.env');writeFileSync(hub,hubEnv);
  return {dir,hub,out:join(dir,'home','.moonlight','mcp','claude-code.env')};
}
const HUB=['COM_MOON_HUB_URL=http://127.0.0.1:3000/x?y=1','COM_MOON_AGENT_API_TOKEN=shared-agent-token',"COM_MOON_HUB_WRITE_SECRET='write#secret with space'",
  'COM_MOON_MCP_PROFILE=core','COM_MOON_MCP_API_MODE=agent','COM_MOON_MCP_ENV_FILE=/elsewhere.env','COM_MOON_MCP_TIMEOUT_MS=','GEMINI_API_KEY=model-secret',
  'SUPABASE_SERVICE_ROLE_KEY=db-secret','COM_MOON_SHARED_WEBHOOK_SECRET=engine-secret','COM_MOON_AGENT_CLIENT_TOKEN_HASHES='].join('\n');

test('writes a 0600 client file with a fresh token and only MCP keys, and returns only the digest pair',()=>{
  const {hub,out}=fixture(HUB);
  const result=createClientTokenFile({actorId:'claude-code',out,hubEnvFile:hub});
  const text=readFileSync(out,'utf8');const env=parseEnv(text);
  assert.deepEqual(Object.keys(env).sort(),['COM_MOON_AGENT_API_TOKEN','COM_MOON_HUB_URL','COM_MOON_HUB_WRITE_SECRET','COM_MOON_MCP_API_MODE','COM_MOON_MCP_PROFILE']);
  assert.equal(env.COM_MOON_HUB_URL,'http://127.0.0.1:3000/x?y=1');
  assert.equal(env.COM_MOON_HUB_WRITE_SECRET,'write#secret with space','quoted so it reads back exactly');
  assert.match(env.COM_MOON_AGENT_API_TOKEN,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(result.pair,`claude-code:${sha(env.COM_MOON_AGENT_API_TOKEN)}`);
  assert.equal(JSON.stringify(result).includes(env.COM_MOON_AGENT_API_TOKEN),false,'the token is never returned');
  assert.equal(statSync(out).mode&0o777,0o600);
  assert.equal(statSync(dirname(out)).mode&0o777,0o700);
  for(const secret of ['model-secret','db-secret','engine-secret','shared-agent-token','/elsewhere.env'])assert.equal(text.includes(secret),false,secret);
  assert.deepEqual(parseAgentClientTokenHashes(result.pair,{sharedToken:'shared-agent-token'}).entries,[{actorId:'claude-code',digest:sha(env.COM_MOON_AGENT_API_TOKEN)}]);
  assert.deepEqual(result.warnings,[]);
  const other=createClientTokenFile({actorId:'codex',out:join(dirname(out),'codex.env'),hubEnvFile:hub});
  assert.notEqual(other.pair.split(':')[1],result.pair.split(':')[1],'every client gets its own token');
});

test('never overwrites without --force; --force rotates the token in place',()=>{
  const {hub,out}=fixture(HUB);
  const first=createClientTokenFile({actorId:'codex',out,hubEnvFile:hub});
  assert.throws(()=>createClientTokenFile({actorId:'codex',out,hubEnvFile:hub}),/이미 있습니다/);
  assert.equal(`codex:${sha(parseEnv(readFileSync(out,'utf8')).COM_MOON_AGENT_API_TOKEN)}`,first.pair,'refusal leaves the file alone');
  const second=createClientTokenFile({actorId:'codex',out,hubEnvFile:hub,force:true});
  assert.notEqual(second.pair,first.pair);
  assert.equal(second.pair,`codex:${sha(parseEnv(readFileSync(out,'utf8')).COM_MOON_AGENT_API_TOKEN)}`);
  assert.equal(statSync(out).mode&0o777,0o600);
  const link=join(dirname(out),'link.env');symlinkSync(join(dirname(out),'nowhere.env'),link);
  assert.throws(()=>createClientTokenFile({actorId:'codex',out:link,hubEnvFile:hub}),/이미 있습니다/,'a dangling symlink is not followed');
  assert.equal(existsSync(join(dirname(out),'nowhere.env')),false);
});

test('refuses bad actors, relative paths, the Hub env, paths inside a checkout and an unreadable Hub env',()=>{
  const {dir,hub,out}=fixture(HUB);
  for(const actorId of ['claude code','a,b','',`${'x'.repeat(129)}`,undefined])assert.throws(()=>createClientTokenFile({actorId,out,hubEnvFile:hub}),/actor/,String(actorId));
  assert.throws(()=>createClientTokenFile({actorId:'claude-code',out:'claude-code.env',hubEnvFile:hub}),/절대 경로/);
  assert.throws(()=>createClientTokenFile({actorId:'claude-code',out:hub,hubEnvFile:hub,force:true}),/Hub env/);
  assert.throws(()=>createClientTokenFile({actorId:'claude-code',out:'/r/apps/hub/.env.local',hubEnvFile:hub}),/Hub env/);
  const repo=join(dir,'repo');mkdirSync(repo);symlinkSync(repo,join(dir,'alias'));
  for(const path of [join(repo,'.env.claude'),join(dir,'alias','nested','x.env')])assert.throws(()=>createClientTokenFile({actorId:'claude-code',out:path,hubEnvFile:hub,protectedRoots:[repo]}),/저장소/,path);
  assert.throws(()=>createClientTokenFile({actorId:'claude-code',out,hubEnvFile:join(dir,'missing.env')}),/Hub env 파일을 읽지 못했습니다/);
  assert.equal(existsSync(out),false,'nothing is written on refusal');
  assert.equal(readFileSync(hub,'utf8'),HUB,'the Hub env is only read');
});

test('warns about an existing entry for the actor, a malformed list and a missing write secret',()=>{
  const {hub,out}=fixture(`COM_MOON_AGENT_API_TOKEN=shared\nCOM_MOON_AGENT_CLIENT_TOKEN_HASHES=claude-code:${'a'.repeat(64)}\n`);
  const result=createClientTokenFile({actorId:'claude-code',out,hubEnvFile:hub});
  assert.equal(result.warnings.length,2);
  assert.match(result.warnings[0],/이미 COM_MOON_AGENT_CLIENT_TOKEN_HASHES/);
  assert.match(result.warnings[1],/COM_MOON_HUB_WRITE_SECRET/);
  assert.deepEqual(Object.keys(parseEnv(readFileSync(out,'utf8'))),['COM_MOON_AGENT_API_TOKEN']);
  const broken=fixture('COM_MOON_AGENT_CLIENT_TOKEN_HASHES=oops\nCOM_MOON_HUB_WRITE_SECRET=w\n');
  assert.deepEqual(createClientTokenFile({actorId:'codex',out:broken.out,hubEnvFile:broken.hub}).warnings,['Hub의 COM_MOON_AGENT_CLIENT_TOKEN_HASHES가 형식 오류(invalid-entry)입니다 — 고치기 전까지 Agent API는 503으로 닫혀 있습니다.']);
});

test('refuses to carry a value that would not read back exactly',()=>{
  const {hub,out}=fixture('COM_MOON_HUB_WRITE_SECRET="it\'s"\n');
  assert.throws(()=>createClientTokenFile({actorId:'codex',out,hubEnvFile:hub}),/작은따옴표/);
  assert.equal(existsSync(out),false);
});
