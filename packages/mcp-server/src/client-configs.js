import {accessSync,constants,existsSync} from 'node:fs';
import {join} from 'node:path';

// Every AI client keeps its own MCP registry in its own format. These adapters read and write
// only the `moonlight` entry and leave the rest of each file alone.
export const SERVER_NAME='moonlight';
export const LAUNCHER_PATH='packages/mcp-server/bin/moonlight-mcp.js';

export function clientTargets({home,root}){
  return [
    {id:'claude-code',label:'Claude Code (project .mcp.json)',file:join(root,'.mcp.json'),format:'json',key:'mcpServers'},
    {id:'claude-desktop',label:'Claude Desktop · Cowork',file:join(home,'Library/Application Support/Claude/claude_desktop_config.json'),format:'json',key:'mcpServers',gui:true},
    {id:'codex',label:'Codex (CLI · app)',file:join(home,'.codex/config.toml'),format:'toml'},
    {id:'cursor',label:'Cursor',file:join(home,'.cursor/mcp.json'),format:'json',key:'mcpServers',gui:true},
    {id:'vscode',label:'VS Code (user mcp.json)',file:join(home,'Library/Application Support/Code/User/mcp.json'),format:'json',key:'servers',typed:true,gui:true},
    {id:'gemini',label:'Gemini CLI',file:join(home,'.gemini/settings.json'),format:'json',key:'mcpServers'},
  ];
}

// ---- TOML (Codex) -------------------------------------------------------------------------
// Codex writes plain `key = value` tables. We parse only the [mcp_servers.moonlight] block and
// splice it; anything we do not understand makes the edit refuse instead of guessing.
const HEADER=/^\s*\[\s*mcp_servers\.moonlight\s*\]\s*(#.*)?$/;
const SUBHEADER=/^\s*\[\s*mcp_servers\.moonlight\.([A-Za-z0-9_-]+)\s*\]\s*(#.*)?$/;
const ANY_HEADER=/^\s*\[/;
const tomlString=value=>JSON.stringify(String(value));
const tomlArray=values=>`[${values.map(tomlString).join(', ')}]`;

function parseTomlValue(raw){
  const value=raw.trim();
  if(value.startsWith('"'))return JSON.parse(value);
  if(value.startsWith("'"))return value.slice(1,value.lastIndexOf("'"));
  if(value.startsWith('['))return value.slice(1,value.lastIndexOf(']')).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(item=>item.trim()).filter(Boolean).map(parseTomlValue);
  if(value==='true'||value==='false')return value==='true';
  if(/^-?\d+$/.test(value))return Number(value);
  throw new Error(`unsupported TOML value: ${value.slice(0,40)}`);
}

// Returns {start,end,entry} for the moonlight block (end exclusive), or null when absent.
export function findTomlBlock(text){
  const lines=text.split('\n');
  const start=lines.findIndex(line=>HEADER.test(line));
  if(start<0){
    if(lines.some(line=>SUBHEADER.test(line)))throw new Error('[mcp_servers.moonlight.*] exists without its parent table');
    return null;
  }
  let end=start+1;
  while(end<lines.length&&!(ANY_HEADER.test(lines[end])&&!SUBHEADER.test(lines[end])))end++;
  if(lines.slice(end).some(line=>HEADER.test(line)||SUBHEADER.test(line)))throw new Error('moonlight tables are split across the file');
  const entry={};let table=entry;
  for(let i=start+1;i<end;i++){
    let line=lines[i];
    const sub=SUBHEADER.exec(line);
    if(sub){table=entry[sub[1]]={};continue;}
    if(!line.trim()||line.trim().startsWith('#'))continue;
    // Multi-line arrays: keep reading until the bracket closes.
    while(/=\s*\[/.test(line)&&!/\]\s*(#.*)?$/.test(line)&&i+1<end)line+=` ${lines[++i].trim()}`;
    const match=/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*(#[^"']*)?$/.exec(line);
    if(!match)throw new Error(`unreadable line in moonlight block: ${line.trim().slice(0,60)}`);
    table[match[1]]=parseTomlValue(match[2]);
  }
  return {start,end,entry,lines};
}

// A registration that loaded a *private* env file (only HUB_URL + AGENT_API_TOKEN, no write secret)
// keeps that file after install: it moves from `--env-file=` to COM_MOON_MCP_ENV_FILE, which the
// launcher reads instead of Hub's .env.local. Only Hub's own .env.local is dropped.
const ENV_FILE_ARG=/^--env-file(?:-if-exists)?=(.+)$/;
export const isHubEnvFile=path=>/(^|\/)apps\/hub\/\.env\.local$/.test(path);
export function privateEnvFile(entry){
  const args=Array.isArray(entry?.args)?entry.args.map(String):[];
  for(const arg of args){
    const path=ENV_FILE_ARG.exec(arg)?.[1];
    if(path&&!isHubEnvFile(path))return path;
  }
  return null;
}

// Replace command/args, drop cwd (the launcher locates itself), keep every other key and subtable.
export function upsertTomlEntry(text,{command,args}){
  const block=findTomlBlock(text);
  const rendered=[`command = ${tomlString(command)}`,`args = ${tomlArray(args)}`];
  if(!block){
    const base=text.endsWith('\n')||!text?text:`${text}\n`;
    return `${base}${base.trim()?'\n':''}[mcp_servers.moonlight]\n${rendered.join('\n')}\nstartup_timeout_sec = 30\n`;
  }
  const {lines,start,end}=block;
  const body=[];let inserted=false;let inSub=false;
  for(let i=start+1;i<end;i++){
    const line=lines[i];
    if(SUBHEADER.test(line)){if(!inserted){body.push(...rendered);inserted=true;}inSub=true;body.push(line);continue;}
    const key=/^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
    if(!inSub&&['command','args','cwd'].includes(key)){
      if(!inserted){body.push(...rendered);inserted=true;}
      // Skip continuation lines of a multi-line array.
      if(/=\s*\[/.test(line)&&!/\]\s*(#.*)?$/.test(line))while(i+1<end&&!/\]\s*(#.*)?$/.test(lines[i]))i++;
      continue;
    }
    body.push(line);
  }
  if(!inserted)body.unshift(...rendered);
  const envFile=privateEnvFile(block.entry);
  if(envFile&&block.entry.env?.COM_MOON_MCP_ENV_FILE===undefined){
    const line=`COM_MOON_MCP_ENV_FILE = ${tomlString(envFile)}`;
    const at=body.findIndex(item=>SUBHEADER.exec(item)?.[1]==='env');
    if(at>=0)body.splice(at+1,0,line);
    else{
      let tail=body.length;while(tail>0&&!body[tail-1].trim())tail--;
      body.splice(tail,0,'','[mcp_servers.moonlight.env]',line);
    }
  }
  return [...lines.slice(0,start+1),...body,...lines.slice(end)].join('\n');
}

// ---- JSON (Claude, Cursor, VS Code, Gemini) -------------------------------------------------
export function readJsonEntry(text,target){
  const data=text.trim()?JSON.parse(text):{};
  return data?.[target.key]?.[SERVER_NAME]??null;
}

export function upsertJsonEntry(text,target,entry){
  const data=text.trim()?JSON.parse(text):{};
  if(typeof data!=='object'||Array.isArray(data))throw new Error('config root is not an object');
  data[target.key]={...(data[target.key]||{}),[SERVER_NAME]:entry};
  return `${JSON.stringify(data,null,2)}\n`;
}

export function readEntry(text,target){
  return target.format==='toml'?(findTomlBlock(text)?.entry??null):readJsonEntry(text,target);
}

// Keeps env overrides and unknown keys; replaces how the process is launched.
export function mergeStdioEntry(existing,{command,launcher,flags,typed}){
  const {command:_command,args:_args,cwd:_cwd,type:_type,...rest}=existing||{};
  const envFile=privateEnvFile(existing);
  if(envFile&&rest.env?.COM_MOON_MCP_ENV_FILE===undefined)rest.env={...(rest.env||{}),COM_MOON_MCP_ENV_FILE:envFile};
  return {...(typed?{type:'stdio'}:{}),command,args:[launcher,...flags],...rest};
}

// Carry over launcher flags the operator already chose unless new ones are given.
export function launcherFlags(existing,{profile,readOnly}={}){
  const args=Array.isArray(existing?.args)?existing.args:[];
  const at=args.indexOf('--profile');
  const chosenProfile=profile??(at>=0?args[at+1]:undefined);
  const chosenReadOnly=readOnly??args.includes('--read-only');
  return [...(chosenProfile?['--profile',chosenProfile]:[]),...(chosenReadOnly?['--read-only']:[])];
}

// ---- Inspection -----------------------------------------------------------------------------
const executable=path=>{try{accessSync(path,constants.X_OK);return true;}catch{return false;}};

export function inspectEntry(entry,{exists=existsSync,isExecutable=executable}={}){
  if(!entry)return {state:'absent',issues:[]};
  const issues=[];const add=(level,message)=>issues.push({level,message});
  if(entry.url||entry.httpUrl||entry.type==='http'){
    add('info',`HTTP 연결: ${entry.url||entry.httpUrl}`);
    return {state:'http',issues};
  }
  const command=String(entry.command||'');
  const args=Array.isArray(entry.args)?entry.args.map(String):[];
  if(!command)add('error','command가 비어 있음');
  else if(command.startsWith('/')){if(!exists(command))add('error',`실행 파일 없음: ${command}`);else if(!isExecutable(command))add('error',`실행 권한 없음: ${command}`);}
  else add('warn',`'${command}'를 PATH에서 찾음 — GUI 앱은 셸 PATH를 못 볼 수 있음`);
  if(command.includes('/.nvm/versions/'))add('warn','nvm 버전 경로에 고정됨 — Node를 올리면 조용히 죽음');
  for(const arg of args){
    const path=arg.replace(/^--env-file(?:-if-exists)?=/,'');
    if(path.startsWith('/')&&!exists(path))add('error',`경로 없음: ${path}`);
  }
  if(entry.cwd&&!exists(entry.cwd))add('error',`cwd 없음: ${entry.cwd}`);
  const envFiles=args.map(arg=>ENV_FILE_ARG.exec(arg)?.[1]).filter(Boolean);
  const legacy=envFiles.some(isHubEnvFile);
  if(legacy)add('warn','구형 등록 — Hub .env.local 전체(모델·OAuth 비밀 포함)를 MCP 프로세스에 싣는다');
  const privateFile=envFiles.find(path=>!isHubEnvFile(path));
  if(privateFile)add('info',`비공개 env 파일 등록(${privateFile}) — install하면 런처 + COM_MOON_MCP_ENV_FILE로 옮기고 파일은 그대로 쓴다`);
  const state=issues.some(issue=>issue.level==='error')?'broken':legacy?'legacy':issues.some(issue=>issue.level==='warn')?'warn':'ok';
  return {state,issues};
}

// ---- Snippets for manual setup ---------------------------------------------------------------
export function stdioSnippet(targetId,{command,launcher,flags=[]}){
  const args=[launcher,...flags];
  const json=(key,extra={})=>JSON.stringify({[key]:{[SERVER_NAME]:{...extra,command,args}}},null,2);
  switch(targetId){
    case 'codex':return `[mcp_servers.moonlight]\ncommand = ${tomlString(command)}\nargs = ${tomlArray(args)}\nstartup_timeout_sec = 30`;
    case 'vscode':return json('servers',{type:'stdio'});
    default:return json('mcpServers');
  }
}

export function httpSnippet(targetId,{url,tokenEnv='MOONLIGHT_MCP_TOKEN'}){
  switch(targetId){
    case 'codex':return `[mcp_servers.moonlight_http]\nurl = ${tomlString(url)}\nbearer_token_env_var = ${tomlString(tokenEnv)}`;
    case 'claude-code':return JSON.stringify({mcpServers:{moonlight:{type:'http',url,headers:{Authorization:`Bearer \${${tokenEnv}}`}}}},null,2);
    case 'cursor':return JSON.stringify({mcpServers:{moonlight:{url,headers:{Authorization:`Bearer \${env:${tokenEnv}}`}}}},null,2);
    case 'vscode':return JSON.stringify({inputs:[{type:'promptString',id:'moonlight-token',description:'Moonlight MCP token',password:true}],servers:{moonlight:{type:'http',url,headers:{Authorization:'Bearer ${input:moonlight-token}'}}}},null,2);
    case 'gemini':return JSON.stringify({mcpServers:{moonlight:{httpUrl:url,headers:{Authorization:`Bearer $${tokenEnv}`}}}},null,2);
    default:return `URL: ${url}\nHeader: Authorization: Bearer <token>\n(헤더를 못 넣는 SaaS만: --allow-url 토큰으로 ${url.replace(/\/mcp\/?$/,'')}/mcp/<token>)`;
  }
}
