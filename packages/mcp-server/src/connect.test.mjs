import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFile} from 'node:child_process';
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
