import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {REPO_ROOT} from './env.js';
import {findTomlBlock} from './client-configs.js';

const CLI=fileURLToPath(new URL('./connect.js',import.meta.url));
const LAUNCHER=join(REPO_ROOT,'packages/mcp-server/bin/moonlight-mcp.js');
// os.homedir() follows $HOME, so every client file below lives in a throwaway home.
const run=(home,...args)=>new Promise(resolve=>execFile(process.execPath,[CLI,...args,'--root',REPO_ROOT],{env:{PATH:process.env.PATH,HOME:home}},(error,stdout,stderr)=>resolve({code:error?.code??0,stdout,stderr})));

function home(){
  const dir=mkdtempSync(join(tmpdir(),'moonlight-connect-'));
  mkdirSync(join(dir,'.codex'));
  writeFileSync(join(dir,'.codex/config.toml'),'[mcp_servers.node_repl]\ncommand = "/bin/cat"\n\n[mcp_servers.moonlight]\ncommand = "/opt/homebrew/bin/node"\nargs = ["--env-file=/gone/apps/hub/.env.local", "/gone/packages/mcp-server/src/index.js"]\ncwd = "/gone"\nstartup_timeout_sec = 30\nenabled = true\n');
  const desktop=join(dir,'Library/Application Support/Claude');mkdirSync(desktop,{recursive:true});
  writeFileSync(join(desktop,'claude_desktop_config.json'),JSON.stringify({mcpServers:{moonlight:{command:'/old/node',args:['/gone/index.js'],env:{COM_MOON_MCP_PROFILE:'pms'}}},preferences:{keepAwakeEnabled:true}},null,2));
  chmodSync(join(desktop,'claude_desktop_config.json'),0o600);
  // Gemini settings managed as a dotfile symlink.
  mkdirSync(join(dir,'dotfiles'));mkdirSync(join(dir,'.gemini'));
  writeFileSync(join(dir,'dotfiles/gemini.json'),JSON.stringify({theme:'dark'}));
  symlinkSync(join(dir,'dotfiles/gemini.json'),join(dir,'.gemini/settings.json'));
  return dir;
}

test('status flags the dead registration and exits non-zero',async()=>{
  const dir=home();
  const {code,stdout}=await run(dir,'status','--json');
  assert.equal(code,1);
  const report=JSON.parse(stdout);
  const state=Object.fromEntries(report.clients.map(client=>[client.id,client.state]));
  assert.equal(state.codex,'broken');
  assert.equal(state['claude-desktop'],'broken');
  assert.equal(state.gemini,'absent');
  assert.equal(state.cursor,'no-config');
});

test('install repairs every client in place, backs up outside the client folders and verifies startup',async()=>{
  const dir=home();
  const dry=await run(dir,'install','codex','--dry-run');
  assert.equal(dry.code,0);
  assert.match(readFileSync(join(dir,'.codex/config.toml'),'utf8'),/cwd = "\/gone"/,'dry run writes nothing');

  const {code,stdout}=await run(dir,'install','codex','claude-desktop','gemini');
  assert.equal(code,0,stdout);
  assert.equal((stdout.match(/기동 확인 \d+개 도구/g)||[]).length,3,stdout);

  const codex=readFileSync(join(dir,'.codex/config.toml'),'utf8');
  const {entry}=findTomlBlock(codex);
  assert.deepEqual(entry.args,[LAUNCHER]);
  assert.equal(entry.cwd,undefined);
  assert.equal(entry.startup_timeout_sec,30);
  assert.match(codex,/^\[mcp_servers\.node_repl\]\ncommand = "\/bin\/cat"\n/);

  const desktopFile=join(dir,'Library/Application Support/Claude/claude_desktop_config.json');
  const desktop=JSON.parse(readFileSync(desktopFile,'utf8'));
  assert.deepEqual(desktop.mcpServers.moonlight.args,[LAUNCHER]);
  assert.deepEqual(desktop.mcpServers.moonlight.env,{COM_MOON_MCP_PROFILE:'pms'});
  assert.deepEqual(desktop.preferences,{keepAwakeEnabled:true});
  assert.equal(statSync(desktopFile).mode&0o777,0o600);

  assert.equal(lstatSync(join(dir,'.gemini/settings.json')).isSymbolicLink(),true);
  const gemini=JSON.parse(readFileSync(join(dir,'dotfiles/gemini.json'),'utf8'));
  assert.equal(gemini.theme,'dark');
  assert.deepEqual(gemini.mcpServers.moonlight.args,[LAUNCHER]);

  assert.deepEqual(readdirSync(join(dir,'.moonlight/mcp/backups')).map(name=>name.split('-')[0]).sort(),['claude','codex','gemini']);
  assert.deepEqual(readdirSync(join(dir,'.codex')),['config.toml']);

  const again=await run(dir,'install','codex');
  assert.match(again.stdout,/이미 최신/);
  const status=JSON.parse((await run(dir,'status','--json')).stdout);
  for(const id of ['codex','claude-desktop','gemini'])assert.equal(status.clients.find(client=>client.id===id).state,'ok',id);
});

test('token commands never echo a stored secret',async()=>{
  const dir=home();
  const created=await run(dir,'token','create','n8n','--profile','sales','--read-only');
  assert.equal(created.code,0);
  const token=/(mlm_[A-Za-z0-9_-]{43})/.exec(created.stdout)[1];
  const listed=await run(dir,'token','list');
  assert.match(listed.stdout,/n8n\tprofile=sales read-only/);
  assert.equal(listed.stdout.includes(token),false);
  assert.equal(readFileSync(join(dir,'.moonlight/mcp/clients.json'),'utf8').includes(token),false);
  const url=await run(dir,'token','create','web','--allow-url');
  assert.equal(url.code,1);
  assert.match(url.stderr,/URL tokens are read-only/);
  assert.match((await run(dir,'token','revoke','n8n')).stdout,/폐기함: n8n/);
});

// Per-client identity: every path below is a throwaway file; no real client config or env is read.
function hubEnv(dir){
  const file=join(dir,'hub.env');
  writeFileSync(file,'COM_MOON_HUB_URL=http://127.0.0.1:9\nCOM_MOON_AGENT_API_TOKEN=shared-agent-token\nCOM_MOON_HUB_WRITE_SECRET=write-secret\nGEMINI_API_KEY=model-secret\n');
  return file;
}

test('client-token prints only the digest pair and keeps the token in a private file',async()=>{
  const dir=home();const out=join(dir,'.moonlight/mcp/claude-code.env');
  const created=await run(dir,'client-token','claude-code','--out',out,'--hub-env',hubEnv(dir));
  assert.equal(created.code,0,created.stderr);
  const token=/^COM_MOON_AGENT_API_TOKEN=(.+)$/m.exec(readFileSync(out,'utf8'))[1];
  assert.equal(created.stdout,`claude-code:${createHash('sha256').update(token).digest('hex')}\n`);
  for(const stream of [created.stdout,created.stderr])for(const secret of [token,'shared-agent-token','write-secret','model-secret'])assert.equal(stream.includes(secret),false,secret);
  assert.match(created.stderr,/install <client> --mcp-env-file/);
  assert.equal(statSync(out).mode&0o777,0o600);
  const again=await run(dir,'client-token','claude-code','--out',out,'--hub-env',hubEnv(dir));
  assert.equal(again.code,1);assert.match(again.stderr,/--force/);assert.equal(again.stdout,'');
  assert.equal((await run(dir,'client-token','claude-code')).code,2,'--out is required');
  const inside=join(REPO_ROOT,'packages/mcp-server/.client-token-test.env');
  const refused=await run(dir,'client-token','claude-code','--out',inside,'--hub-env',hubEnv(dir));
  assert.equal(refused.code,1);assert.match(refused.stderr,/저장소/);
  assert.throws(()=>statSync(inside),'nothing is written inside the checkout');
});

test('install --mcp-env-file gives exactly one client its own env file, verified at startup',async()=>{
  const dir=home();const own=join(dir,'.moonlight/mcp/codex.env');
  assert.equal((await run(dir,'client-token','codex','--out',own,'--hub-env',hubEnv(dir))).code,0);
  const {code,stdout}=await run(dir,'install','codex','--mcp-env-file',own);
  assert.equal(code,0,stdout);
  assert.match(stdout,/codex: 등록 갱신 · 기동 확인 \d+개 도구/);
  const {entry}=findTomlBlock(readFileSync(join(dir,'.codex/config.toml'),'utf8'));
  assert.deepEqual(entry.args,[LAUNCHER]);
  assert.deepEqual(entry.env,{COM_MOON_MCP_ENV_FILE:own});
  const desktopFile=join(dir,'Library/Application Support/Claude/claude_desktop_config.json');
  const desktopOwn=join(dir,'.moonlight/mcp/claude-desktop.env');
  assert.equal((await run(dir,'client-token','claude-desktop','--out',desktopOwn,'--hub-env',hubEnv(dir))).code,0);
  assert.equal((await run(dir,'install','claude-desktop','--mcp-env-file',desktopOwn)).code,0);
  assert.deepEqual(JSON.parse(readFileSync(desktopFile,'utf8')).mcpServers.moonlight.env,{COM_MOON_MCP_PROFILE:'pms',COM_MOON_MCP_ENV_FILE:desktopOwn});
  const status=JSON.parse((await run(dir,'status','--json')).stdout);
  const codex=status.clients.find(client=>client.id==='codex');
  assert.equal(codex.state,'ok');
  assert.ok(codex.issues.some(issue=>issue.message.includes(own)));
});

test('install --mcp-env-file refuses a shared, missing, relative or Hub env file',async()=>{
  const dir=home();const own=join(dir,'.moonlight/mcp/codex.env');
  assert.equal((await run(dir,'client-token','codex','--out',own,'--hub-env',hubEnv(dir))).code,0);
  const hubLike=join(dir,'checkout/apps/hub/.env.local');mkdirSync(join(dir,'checkout/apps/hub'),{recursive:true});writeFileSync(hubLike,'COM_MOON_AGENT_API_TOKEN=shared\n');
  for(const [args,pattern] of [[['codex','claude-desktop','--mcp-env-file',own],/하나에만/],[['--all','--mcp-env-file',own],/하나에만/],[['codex','--mcp-env-file','codex.env'],/절대 경로/],[['codex','--mcp-env-file',join(dir,'missing.env')],/env 파일이 없습니다/],[['codex','--mcp-env-file',hubLike],/Hub env/]]){
    const result=await run(dir,'install',...args);
    assert.equal(result.code,2,args.join(' '));
    assert.match(result.stderr,pattern);
  }
  assert.match(readFileSync(join(dir,'.codex/config.toml'),'utf8'),/cwd = "\/gone"/,'refusals write nothing');
});

test('install --mcp-env-file warns when the registration env still pins a token that would win',async()=>{
  const dir=home();const own=join(dir,'.moonlight/mcp/claude-desktop.env');
  assert.equal((await run(dir,'client-token','claude-desktop','--out',own,'--hub-env',hubEnv(dir))).code,0);
  const desktopFile=join(dir,'Library/Application Support/Claude/claude_desktop_config.json');
  writeFileSync(desktopFile,JSON.stringify({mcpServers:{moonlight:{command:'/old/node',args:['/gone/index.js'],env:{COM_MOON_AGENT_API_TOKEN:'pinned'}}}}));
  const result=await run(dir,'install','claude-desktop','--mcp-env-file',own);
  assert.match(result.stdout,/COM_MOON_AGENT_API_TOKEN이 env 파일보다 우선/);
  assert.equal(result.stdout.includes('pinned'),false);
});
