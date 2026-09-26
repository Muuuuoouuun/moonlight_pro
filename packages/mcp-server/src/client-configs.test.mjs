import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clientTargets,findTomlBlock,httpSnippet,inspectEntry,launcherFlags,mergeStdioEntry,privateEnvFile,readEntry,stdioSnippet,upsertJsonEntry,upsertTomlEntry} from './client-configs.js';

const LAUNCHER='/repo/packages/mcp-server/bin/moonlight-mcp.js';
// Shape of a real Codex config: other servers before/after, a stale cwd, extra keys, an env subtable.
const CODEX=`model = "gpt-5"

[mcp_servers.node_repl]
command = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl"
args = []

[mcp_servers.node_repl.env]
CODEX_HOME = "/Users/me/.codex"

[mcp_servers.moonlight]
command = "/Users/me/.nvm/versions/node/v24.14.0/bin/node"
args = ["--env-file=/Users/me/Desktop/Projects/moonlight_pro/apps/hub/.env.local", "/Users/me/Desktop/Projects/moonlight_pro/packages/mcp-server/src/index.js"]
cwd = "/Users/me/Desktop/Projects/moonlight_pro"
startup_timeout_sec = 30
enabled = true

[mcp_servers.moonlight.env]
COM_MOON_MCP_PROFILE = "pms"

[mcp_servers.computer-use]
command = "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
args = ["mcp"]
enabled = false
`;

test('reads the Codex moonlight block including its env subtable',()=>{
  const {entry}=findTomlBlock(CODEX);
  assert.equal(entry.command,'/Users/me/.nvm/versions/node/v24.14.0/bin/node');
  assert.equal(entry.args.length,2);
  assert.equal(entry.cwd,'/Users/me/Desktop/Projects/moonlight_pro');
  assert.equal(entry.startup_timeout_sec,30);
  assert.equal(entry.enabled,true);
  assert.deepEqual(entry.env,{COM_MOON_MCP_PROFILE:'pms'});
});

test('rewrites only the launch keys of the Codex block and leaves every other byte alone',()=>{
  const next=upsertTomlEntry(CODEX,{command:'/opt/homebrew/bin/node',args:[LAUNCHER]});
  const {entry}=findTomlBlock(next);
  assert.equal(entry.command,'/opt/homebrew/bin/node');
  assert.deepEqual(entry.args,[LAUNCHER]);
  assert.equal(entry.cwd,undefined);
  assert.equal(entry.startup_timeout_sec,30);
  assert.equal(entry.enabled,true);
  assert.deepEqual(entry.env,{COM_MOON_MCP_PROFILE:'pms'});
  const outside=text=>text.replace(/\[mcp_servers\.moonlight\][\s\S]*?(?=\n\[mcp_servers\.computer-use\])/,'');
  assert.equal(outside(next),outside(CODEX));
  assert.equal(upsertTomlEntry(next,{command:'/opt/homebrew/bin/node',args:[LAUNCHER]}),next,'idempotent');
});

test('appends a Codex block when none exists and handles multi-line arrays',()=>{
  const appended=upsertTomlEntry('model = "gpt-5"\n',{command:'/opt/homebrew/bin/node',args:[LAUNCHER]});
  assert.match(appended,/^model = "gpt-5"\n\n\[mcp_servers\.moonlight\]\ncommand = "\/opt\/homebrew\/bin\/node"\nargs = \[".*moonlight-mcp\.js"\]\nstartup_timeout_sec = 30\n$/);
  const multi='[mcp_servers.moonlight]\ncommand = "node"\nargs = [\n  "/old/index.js",\n  "--x",\n]\nenabled = true\n';
  assert.deepEqual(findTomlBlock(multi).entry.args,['/old/index.js','--x']);
  const next=upsertTomlEntry(multi,{command:'/opt/homebrew/bin/node',args:[LAUNCHER]});
  assert.equal(next,`[mcp_servers.moonlight]\ncommand = "/opt/homebrew/bin/node"\nargs = ["${LAUNCHER}"]\nenabled = true\n`);
});

test('refuses to edit TOML it cannot map safely',()=>{
  assert.throws(()=>upsertTomlEntry('[mcp_servers.moonlight.env]\nA = "b"\n',{command:'n',args:[]}),/without its parent/);
  assert.throws(()=>upsertTomlEntry('[mcp_servers.moonlight]\ncommand = "n"\n[other]\n[mcp_servers.moonlight.env]\nA = "b"\n',{command:'n',args:[]}),/split/);
  assert.throws(()=>findTomlBlock('[mcp_servers.moonlight]\ncommand = { inline = "table" }\n'),/unsupported/);
});

test('JSON clients keep unrelated settings, other servers and env overrides',()=>{
  const target=clientTargets({home:'/h',root:'/r'}).find(t=>t.id==='claude-desktop');
  const before=JSON.stringify({mcpServers:{other:{command:'x'},moonlight:{command:'/old/node',args:['--env-file=/dead/apps/hub/.env.local','/dead/index.js'],cwd:'/dead',env:{COM_MOON_MCP_PROFILE:'sales'}}},preferences:{keepAwakeEnabled:true}},null,2);
  const existing=readEntry(before,target);
  const entry=mergeStdioEntry(existing,{command:'/opt/homebrew/bin/node',launcher:LAUNCHER,flags:[]});
  const after=JSON.parse(upsertJsonEntry(before,target,entry));
  assert.deepEqual(after.mcpServers.moonlight,{command:'/opt/homebrew/bin/node',args:[LAUNCHER],env:{COM_MOON_MCP_PROFILE:'sales'}});
  assert.deepEqual(after.mcpServers.other,{command:'x'});
  assert.deepEqual(after.preferences,{keepAwakeEnabled:true});
  const vscode=clientTargets({home:'/h',root:'/r'}).find(t=>t.id==='vscode');
  assert.deepEqual(JSON.parse(upsertJsonEntry('',vscode,mergeStdioEntry(null,{command:'/n',launcher:LAUNCHER,flags:[],typed:true}))),{servers:{moonlight:{type:'stdio',command:'/n',args:[LAUNCHER]}}});
  assert.throws(()=>upsertJsonEntry('{ // comment\n}',target,entry));
});

test('a private env file (no write secret) survives install; only Hub .env.local is dropped',()=>{
  const PRIVATE='/Users/me/private/moonlight-mcp.env';
  const registered={command:'/opt/homebrew/bin/node',args:[`--env-file=${PRIVATE}`,'/r/packages/mcp-server/src/index.js']};
  assert.equal(privateEnvFile(registered),PRIVATE);
  assert.equal(privateEnvFile({args:['--env-file=/r/apps/hub/.env.local']}),null);
  assert.deepEqual(mergeStdioEntry(registered,{command:'/n',launcher:LAUNCHER,flags:[]}),{command:'/n',args:[LAUNCHER],env:{COM_MOON_MCP_ENV_FILE:PRIVATE}});
  assert.deepEqual(mergeStdioEntry({...registered,env:{COM_MOON_MCP_ENV_FILE:'/chosen.env'}},{command:'/n',launcher:LAUNCHER,flags:[]}).env,{COM_MOON_MCP_ENV_FILE:'/chosen.env'},'an explicit env value wins');
  const toml=`[mcp_servers.moonlight]\ncommand = "node"\nargs = ["--env-file=${PRIVATE}", "/r/packages/mcp-server/src/index.js"]\n\n[other]\nx = 1\n`;
  const next=upsertTomlEntry(toml,{command:'/n',args:[LAUNCHER]});
  assert.deepEqual(findTomlBlock(next).entry,{command:'/n',args:[LAUNCHER],env:{COM_MOON_MCP_ENV_FILE:PRIVATE}});
  assert.match(next,/\n\[other\]\nx = 1\n$/);
  assert.equal(upsertTomlEntry(next,{command:'/n',args:[LAUNCHER]}),next,'idempotent');
  const withEnv=upsertTomlEntry(`[mcp_servers.moonlight]\ncommand = "node"\nargs = ["--env-file=${PRIVATE}"]\n[mcp_servers.moonlight.env]\nCOM_MOON_MCP_PROFILE = "assistant"\n`,{command:'/n',args:[LAUNCHER]});
  assert.deepEqual(findTomlBlock(withEnv).entry.env,{COM_MOON_MCP_ENV_FILE:PRIVATE,COM_MOON_MCP_PROFILE:'assistant'});
  const inspected=inspectEntry(registered,{exists:()=>true,isExecutable:()=>true});
  assert.equal(inspected.state,'ok','a private env file is not the legacy full-secret registration');
  assert.ok(inspected.issues.some(i=>i.level==='info'&&i.message.includes('COM_MOON_MCP_ENV_FILE')));
});

test('launcher flags carry over unless replaced',()=>{
  assert.deepEqual(launcherFlags({args:[LAUNCHER,'--profile','pms','--read-only']}),['--profile','pms','--read-only']);
  assert.deepEqual(launcherFlags({args:[LAUNCHER,'--profile','pms']},{profile:'sales',readOnly:true}),['--profile','sales','--read-only']);
  assert.deepEqual(launcherFlags(null),[]);
});

test('inspection names the exact failure: dead cwd, missing files, pinned node, legacy env loading',()=>{
  const exists=path=>!path.includes('/dead')&&!path.includes('/Desktop/');
  const ok=()=>true;
  assert.equal(inspectEntry(null).state,'absent');
  const codex=inspectEntry(findTomlBlock(CODEX).entry,{exists,isExecutable:ok});
  assert.equal(codex.state,'broken');
  assert.ok(codex.issues.some(i=>i.level==='error'&&i.message.includes('cwd 없음')));
  assert.ok(codex.issues.some(i=>i.level==='warn'&&i.message.includes('nvm')));
  const legacy=inspectEntry({command:'/opt/homebrew/bin/node',args:['--env-file=/r/apps/hub/.env.local','/r/packages/mcp-server/src/index.js']},{exists:()=>true,isExecutable:ok});
  assert.equal(legacy.state,'legacy');
  assert.equal(inspectEntry({command:'/opt/homebrew/bin/node',args:[LAUNCHER]},{exists:()=>true,isExecutable:ok}).state,'ok');
  assert.equal(inspectEntry({command:'node',args:[LAUNCHER]},{exists:()=>true,isExecutable:ok}).state,'warn');
  assert.equal(inspectEntry({command:'/opt/homebrew/bin/node',args:[LAUNCHER]},{exists:()=>true,isExecutable:()=>false}).state,'broken');
  assert.equal(inspectEntry({type:'http',url:'http://127.0.0.1:3333/mcp'}).state,'http');
});

test('snippets are valid for their client format',()=>{
  const toml=stdioSnippet('codex',{command:'/opt/homebrew/bin/node',launcher:LAUNCHER,flags:['--profile','pms']});
  assert.deepEqual(findTomlBlock(toml).entry,{command:'/opt/homebrew/bin/node',args:[LAUNCHER,'--profile','pms'],startup_timeout_sec:30});
  assert.deepEqual(JSON.parse(stdioSnippet('vscode',{command:'/n',launcher:LAUNCHER})).servers.moonlight.type,'stdio');
  assert.match(httpSnippet('codex',{url:'http://127.0.0.1:3333/mcp'}),/bearer_token_env_var = "MOONLIGHT_MCP_TOKEN"/);
  for(const id of ['claude-code','cursor','vscode','gemini']){
    const snippet=JSON.parse(httpSnippet(id,{url:'http://127.0.0.1:3333/mcp'}));
    const server=(snippet.mcpServers||snippet.servers).moonlight;
    assert.match(server.headers.Authorization,/^Bearer \$/,`${id} reads the token from env/input, never inline`);
  }
});

test('install --mcp-env-file points one registration at its own env file, replacing any previous file',()=>{
  const OWN='/Users/me/.moonlight/mcp/codex.env';
  const next=upsertTomlEntry(CODEX,{command:'/opt/homebrew/bin/node',args:[LAUNCHER],envFile:OWN});
  assert.deepEqual(findTomlBlock(next).entry.env,{COM_MOON_MCP_ENV_FILE:OWN,COM_MOON_MCP_PROFILE:'pms'});
  const outside=text=>text.replace(/\[mcp_servers\.moonlight\][\s\S]*?(?=\n\[mcp_servers\.computer-use\])/,'');
  assert.equal(outside(next),outside(CODEX),'other servers stay byte for byte');
  assert.equal(upsertTomlEntry(next,{command:'/opt/homebrew/bin/node',args:[LAUNCHER],envFile:OWN}),next,'idempotent');
  assert.equal(upsertTomlEntry(next,{command:'/opt/homebrew/bin/node',args:[LAUNCHER]}),next,'a later plain install keeps the file');
  const moved=upsertTomlEntry(next,{command:'/opt/homebrew/bin/node',args:[LAUNCHER],envFile:'/Users/me/.moonlight/mcp/other.env'});
  assert.deepEqual(findTomlBlock(moved).entry.env,{COM_MOON_MCP_ENV_FILE:'/Users/me/.moonlight/mcp/other.env',COM_MOON_MCP_PROFILE:'pms'});
  assert.equal((moved.match(/COM_MOON_MCP_ENV_FILE/g)||[]).length,1);
  const legacy=upsertTomlEntry('[mcp_servers.moonlight]\ncommand = "node"\nargs = ["--env-file=/private/old.env", "/r/src/index.js"]\n',{command:'/n',args:[LAUNCHER],envFile:OWN});
  assert.deepEqual(findTomlBlock(legacy).entry,{command:'/n',args:[LAUNCHER],env:{COM_MOON_MCP_ENV_FILE:OWN}},'the explicit file wins over a carried-over private file');
  const fresh=upsertTomlEntry('model = "gpt-5"\n',{command:'/n',args:[LAUNCHER],envFile:OWN});
  assert.deepEqual(findTomlBlock(fresh).entry,{command:'/n',args:[LAUNCHER],startup_timeout_sec:30,env:{COM_MOON_MCP_ENV_FILE:OWN}});
  assert.match(fresh,/^model = "gpt-5"\n\n\[mcp_servers\.moonlight\]\n/);

  const target=clientTargets({home:'/h',root:'/r'}).find(t=>t.id==='claude-desktop');
  const before=JSON.stringify({mcpServers:{moonlight:{command:'/old/node',args:[LAUNCHER],env:{COM_MOON_MCP_PROFILE:'core',COM_MOON_MCP_ENV_FILE:'/old.env'}}}});
  const entry=mergeStdioEntry(readEntry(before,target),{command:'/n',launcher:LAUNCHER,flags:[],envFile:OWN});
  assert.deepEqual(entry,{command:'/n',args:[LAUNCHER],env:{COM_MOON_MCP_PROFILE:'core',COM_MOON_MCP_ENV_FILE:OWN}});
  assert.deepEqual(mergeStdioEntry(null,{command:'/n',launcher:LAUNCHER,flags:[],envFile:OWN}),{command:'/n',args:[LAUNCHER],env:{COM_MOON_MCP_ENV_FILE:OWN}});
});

test('status names a client env file and breaks on one that is missing or relative',()=>{
  const ok=()=>true;
  const entry=env=>({command:'/opt/homebrew/bin/node',args:[LAUNCHER],env});
  const own=inspectEntry(entry({COM_MOON_MCP_ENV_FILE:'/Users/me/.moonlight/mcp/codex.env'}),{exists:()=>true,isExecutable:ok});
  assert.equal(own.state,'ok');
  assert.ok(own.issues.some(i=>i.level==='info'&&i.message.includes('/Users/me/.moonlight/mcp/codex.env')));
  const missing=inspectEntry(entry({COM_MOON_MCP_ENV_FILE:'/gone/codex.env'}),{exists:path=>!path.startsWith('/gone'),isExecutable:ok});
  assert.equal(missing.state,'broken');
  assert.ok(missing.issues.some(i=>i.level==='error'&&i.message.includes('/gone/codex.env')));
  assert.equal(inspectEntry(entry({COM_MOON_MCP_ENV_FILE:'codex.env'}),{exists:()=>true,isExecutable:ok}).state,'broken');
  assert.equal(inspectEntry(entry({COM_MOON_MCP_PROFILE:'core'}),{exists:()=>true,isExecutable:ok}).state,'ok');
});
