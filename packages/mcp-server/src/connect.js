#!/usr/bin/env node
// npm run mcp:connect -- <status|install|print|token> …
// Keeps every AI client's `moonlight` registration pointed at a path that exists, and manages
// the per-client tokens used by the HTTP transport.
import {execFileSync} from 'node:child_process';
import {chmodSync,copyFileSync,existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,renameSync,statSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {parseArgs} from 'node:util';
import {REPO_ROOT} from './env.js';
import {PROFILE_NAMES} from './tools.js';
import {version} from './server.js';
import {clientsFile,createClient,readClients,revokeClient} from './clients.js';
import {LAUNCHER_PATH,clientTargets,httpSnippet,inspectEntry,launcherFlags,mergeStdioEntry,readEntry,stdioSnippet,upsertJsonEntry,upsertTomlEntry} from './client-configs.js';

const USAGE=`사용법: npm run mcp:connect -- <명령>
  status [--probe] [--json]            모든 클라이언트의 moonlight 등록 상태 (--probe: 실제로 띄워 도구 목록 확인)
  install <client…|--all> [--profile P] [--read-only] [--dry-run] [--root DIR]
                                       등록을 런처 기준으로 쓰거나 고친다 (원본은 .bak으로 백업)
  print <client> [--http] [--url URL]  직접 붙여 넣을 설정 조각
  token create <name> [--profile P] [--read-only] [--allow-url]
  token list | token revoke <name>     HTTP 클라이언트 토큰 관리
클라이언트: claude-code, claude-desktop, codex, cursor, vscode, gemini
프로필: ${PROFILE_NAMES.join(', ')}`;

const {values:opts,positionals}=(()=>{try{return parseArgs({allowPositionals:true,options:{probe:{type:'boolean'},json:{type:'boolean'},all:{type:'boolean'},profile:{type:'string'},'read-only':{type:'boolean'},'dry-run':{type:'boolean'},root:{type:'string'},http:{type:'boolean'},url:{type:'string'},'allow-url':{type:'boolean'},help:{type:'boolean',short:'h'}}});}catch(error){console.error(`${error.message}\n\n${USAGE}`);process.exit(2);}})();
const [command='status',...rest]=positionals;
const die=(message,code=1)=>{console.error(message);process.exit(code);};
if(opts.help)(console.log(USAGE),process.exit(0));
if(opts.profile&&!PROFILE_NAMES.includes(opts.profile))die(`알 수 없는 프로필: ${opts.profile}\n${USAGE}`,2);

// Linked worktrees get removed after merge; registrations must point at the main checkout.
function mainRoot(){
  if(opts.root)return opts.root.replace(/\/$/,'');
  try{return /^worktree (.+)$/m.exec(execFileSync('git',['worktree','list','--porcelain'],{cwd:REPO_ROOT,encoding:'utf8'}))?.[1]||REPO_ROOT;}catch{return REPO_ROOT;}
}

// Homebrew's node symlink survives upgrades; an nvm path is pinned to one version.
function stableNode(){
  for(const candidate of ['/opt/homebrew/bin/node','/usr/local/bin/node']){
    if(!existsSync(candidate))continue;
    try{const major=Number(/^v(\d+)/.exec(execFileSync(candidate,['--version'],{encoding:'utf8'}))?.[1]);if(major>=22)return candidate;}catch{}
  }
  return process.execPath;
}

const root=mainRoot();
const targets=clientTargets({home:homedir(),root});
const targetById=id=>targets.find(target=>target.id===id)||die(`알 수 없는 클라이언트: ${id}\n${USAGE}`,2);
const launcher=join(root,LAUNCHER_PATH);
const readText=file=>existsSync(file)?readFileSync(file,'utf8'):null;

async function probe(entry,target){
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
  const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
  // GUI apps launch servers without the login shell PATH; reproduce that for them.
  const PATH=target.gui?'/usr/bin:/bin:/usr/sbin:/sbin':process.env.PATH;
  const transport=new StdioClientTransport({command:entry.command,args:(entry.args||[]).map(String),cwd:entry.cwd,env:{PATH,HOME:homedir(),...(entry.env||{})},stderr:'pipe'});
  let stderr='';transport.stderr?.on('data',chunk=>{stderr+=chunk;});
  const client=new Client({name:'moonlight-connect',version},{capabilities:{}});
  const started=Date.now();
  try{await client.connect(transport,{timeout:15_000});const {tools}=await client.listTools(undefined,{timeout:15_000});return {ok:true,tools:tools.length,ms:Date.now()-started};}
  catch(error){return {ok:false,error:String(error.message||error).slice(0,200),stderr:stderr.trim().split('\n').slice(-2).join(' | ').slice(0,300)};}
  finally{await client.close().catch(()=>{});}
}

async function status(){
  const rows=[];
  for(const target of targets){
    const text=readText(target.file);
    let entry=null,parseError=null;
    try{entry=text===null?null:readEntry(text,target);}catch(error){parseError=error.message;}
    const inspection=parseError?{state:'unreadable',issues:[{level:'error',message:`설정을 읽을 수 없음: ${parseError}`}]}:text===null?{state:'no-config',issues:[]}:inspectEntry(entry);
    const row={id:target.id,label:target.label,file:target.file,...inspection,entry};
    if(opts.probe&&entry&&!['broken','http','unreadable'].includes(inspection.state))row.probe=await probe(entry,target);
    rows.push(row);
  }
  let httpClients=[];let registryError=null;
  try{httpClients=readClients(clientsFile());}catch(error){registryError=error.message;}
  const report={root,launcher,launcherExists:existsSync(launcher),clients:rows,http:{registry:clientsFile(),clients:httpClients.map(({tokenSha256:_hash,...client})=>client),error:registryError}};
  // Non-zero when a registration cannot start, so status doubles as a scripted health check.
  if(rows.some(row=>['broken','unreadable'].includes(row.state)||row.probe&&!row.probe.ok))process.exitCode=1;
  if(opts.json)return console.log(JSON.stringify(report,null,2));
  const icon={ok:'✔',warn:'!',legacy:'!',broken:'✖',unreadable:'✖',absent:'·','no-config':'·',http:'↗'};
  const word={ok:'정상',warn:'주의',legacy:'구형',broken:'고장',unreadable:'읽기 실패',absent:'미등록','no-config':'설정 없음',http:'HTTP'};
  console.log(`Moonlight MCP ${version} — 연결 상태\n  기준 체크아웃: ${root}${root!==REPO_ROOT?` (지금은 ${REPO_ROOT}에서 실행)`:''}\n  런처: ${report.launcherExists?launcher:`${launcher} — 아직 없음(이 브랜치가 병합되기 전)`}\n`);
  for(const row of rows){
    const probeText=row.probe?row.probe.ok?` · 기동 확인 ${row.probe.tools}개 도구 ${row.probe.ms}ms`:` · 기동 실패: ${row.probe.error}${row.probe.stderr?` (${row.probe.stderr})`:''}`:'';
    console.log(`  ${icon[row.state]} ${row.id.padEnd(15)} ${word[row.state]}${probeText}`);
    for(const issue of row.issues)console.log(`      ${issue.level==='error'?'✖':issue.level==='warn'?'!':'·'} ${issue.message}`);
  }
  console.log(`\n  HTTP 클라이언트 ${httpClients.length}개 (${clientsFile()})${registryError?` — 읽기 실패: ${registryError}`:''}`);
  for(const client of httpClients)console.log(`    - ${client.name}: profile=${client.profile}${client.readOnly?' read-only':''}${client.allowUrl?' url-token':''} (${client.createdAt.slice(0,10)})`);
  const fixable=rows.filter(row=>['broken','legacy'].includes(row.state)).map(row=>row.id);
  if(fixable.length)console.log(`\n  고치기: npm run mcp:connect -- install ${fixable.join(' ')}`);
}

async function install(ids){
  if(!existsSync(launcher))die(`런처가 ${launcher}에 아직 없습니다. 이 브랜치를 ${root}에 병합한 뒤 다시 실행하거나 --root로 다른 체크아웃을 지정하세요.`);
  const node=stableNode();
  const chosen=opts.all?targets.filter(target=>existsSync(target.file)):ids.map(targetById);
  if(!chosen.length)die(`설치할 클라이언트를 지정하세요.\n${USAGE}`,2);
  if(node.includes('/.nvm/'))console.log(`! Homebrew Node를 못 찾아 ${node}을 씁니다. Node를 올린 뒤에는 install을 다시 실행하세요.`);
  for(const target of chosen){
    const before=readText(target.file)??'';
    let after;
    try{
      const existing=before?readEntry(before,target):null;
      const flags=launcherFlags(existing,{profile:opts.profile,readOnly:opts['read-only']?true:undefined});
      after=target.format==='toml'
        ?upsertTomlEntry(before,{command:node,args:[launcher,...flags]})
        :upsertJsonEntry(before,target,mergeStdioEntry(existing,{command:node,launcher,flags,typed:target.typed}));
    }catch(error){
      console.log(`✖ ${target.id}: 자동 수정하지 않음 (${error.message}). 아래를 직접 넣으세요:\n${stdioSnippet(target.id,{command:node,launcher})}\n`);
      process.exitCode=1;continue;
    }
    if(after===before){console.log(`✔ ${target.id}: 이미 최신`);continue;}
    if(opts['dry-run']){console.log(`— ${target.id} (${target.file}) 변경 예정:\n${after}\n`);continue;}
    // Backups live outside the repo and the clients' folders so nothing stray gets committed or loaded.
    if(before){
      const dir=join(dirname(clientsFile()),'backups');mkdirSync(dir,{recursive:true,mode:0o700});
      const backup=join(dir,`${target.id}-${new Date().toISOString().replace(/[:.]/g,'-')}.bak`);
      copyFileSync(target.file,backup);console.log(`  백업: ${backup}`);
    }
    // Write through a symlink (dotfile managers) instead of replacing it.
    const file=existsSync(target.file)&&lstatSync(target.file).isSymbolicLink()?realpathSync(target.file):target.file;
    const mode=existsSync(file)?statSync(file).mode&0o777:0o600;
    if(!existsSync(dirname(file)))mkdirSync(dirname(file),{recursive:true});
    const tmp=`${file}.moonlight-tmp`;
    writeFileSync(tmp,after,{mode});chmodSync(tmp,mode);renameSync(tmp,file);
    const check=await probe(readEntry(after,target),target);
    console.log(check.ok?`✔ ${target.id}: 등록 갱신 · 기동 확인 ${check.tools}개 도구`:`✖ ${target.id}: 등록은 썼지만 기동 실패 — ${check.error}${check.stderr?` (${check.stderr})`:''}`);
    if(!check.ok)process.exitCode=1;
    if(['claude-desktop','cursor','vscode'].includes(target.id))console.log(`  → ${target.label}는 앱을 재시작해야 새 등록을 읽습니다.`);
  }
}

function print(id){
  const target=targetById(id);
  if(opts.http)return console.log(httpSnippet(target.id,{url:opts.url||'http://127.0.0.1:3333/mcp'}));
  console.log(`# ${target.label} → ${target.file}\n${stdioSnippet(target.id,{command:stableNode(),launcher,flags:launcherFlags(null,{profile:opts.profile,readOnly:opts['read-only']})})}`);
}

function token([action,name]){
  const file=clientsFile();
  if(action==='list'){
    const clients=readClients(file);
    if(!clients.length)return console.log(`등록된 HTTP 클라이언트 없음 (${file})`);
    for(const client of clients)console.log(`${client.name}\tprofile=${client.profile}${client.readOnly?' read-only':''}${client.allowUrl?' url-token':''}\t${client.createdAt}`);
    return;
  }
  if(action==='revoke'){if(!name)die('토큰을 폐기할 클라이언트 이름을 주세요.',2);return console.log(revokeClient(file,name)?`폐기함: ${name} — 실행 중인 HTTP 서버에도 다음 요청부터 적용`:`없음: ${name}`);}
  if(action!=='create'||!name)die(USAGE,2);
  const {token:secret,client}=createClient(file,{name,profile:opts.profile||'core',readOnly:opts['read-only'],allowUrl:opts['allow-url']});
  console.log(`HTTP 클라이언트 "${client.name}" 생성 — profile=${client.profile}${client.readOnly?' · read-only':''}${client.allowUrl?' · URL 토큰 허용':''}
토큰(지금 한 번만 표시, 저장소에는 해시만 남음):

  ${secret}

헤더:  Authorization: Bearer <토큰>   (Claude 커넥터 Request headers에는 값에 "Bearer "까지 넣는다)
서버:  npm run mcp:http   (기본 http://127.0.0.1:3333/mcp)${client.allowUrl?`
URL 토큰:  <공개 주소>/mcp/<토큰> — 헤더를 못 넣는 커넥터(예: ChatGPT 무인증)용 최후 수단. URL 자체가 비밀번호라
           로그·설정 화면에 남는다. 읽기 전용으로만 발급되며, 유출이 의심되면 즉시 revoke.`:''}
폐기:  npm run mcp:connect -- token revoke ${client.name}`);
}

try{
  if(command==='status')await status();
  else if(command==='install')await install(rest);
  else if(command==='print')print(rest[0]||die(USAGE,2));
  else if(command==='token')token(rest);
  else die(USAGE,2);
}catch(error){die(`✖ ${error.message}`);}
