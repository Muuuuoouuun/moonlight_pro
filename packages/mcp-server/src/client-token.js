import {randomBytes} from 'node:crypto';
import {chmodSync,closeSync,lstatSync,mkdirSync,openSync,readFileSync,realpathSync,renameSync,unlinkSync,writeSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,relative} from 'node:path';
import {parseEnv} from 'node:util';
import {AGENT_ACTOR_PATTERN,agentClientTokenDigest,parseAgentClientTokenHashes} from '@com-moon/agent-contracts';
import {MCP_ENV_KEY} from './env.js';
import {isHubEnvFile} from './client-configs.js';

// `mcp:connect -- client-token <actor> --out <file>`: one private env file per MCP client, so the
// Hub can tell Claude Code, Codex and Claude Desktop apart in command and skill receipts. The new
// token is written only to that file; the Hub keeps its SHA-256 in COM_MOON_AGENT_CLIENT_TOKEN_HASHES.

// Everything the launcher would otherwise load from the Hub env, except the shared Agent token it
// replaces and the pointer to this very file. HUB_WRITE_SECRET is kept: legacy tools such as
// get_daily_brief still call Hub routes with it.
const carried=key=>MCP_ENV_KEY.test(key)&&key!=='COM_MOON_AGENT_API_TOKEN'&&key!=='COM_MOON_MCP_ENV_FILE';
const SAFE=/^[A-Za-z0-9_\-.:/@+=,~%]*$/;

// Real path even when the file (or some parents) do not exist yet.
function real(path){
  try{return realpathSync(path);}catch{const parent=dirname(path);return parent===path?path:join(real(parent),basename(path));}
}
const within=(path,root)=>{const rel=relative(root,path);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));};
const present=path=>{try{lstatSync(path);return true;}catch{return false;}};

function envLine(key,value){
  if(SAFE.test(value))return `${key}=${value}`;
  if(!/['\r\n]/.test(value))return `${key}='${value}'`;
  throw new Error(`${key} 값에 작은따옴표나 줄바꿈이 있어 자동으로 옮기지 않습니다. 파일을 만든 뒤 직접 적으세요.`);
}

function writePrivate(file,content,force){
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  // O_EXCL: never follows or replaces an existing path; --force swaps a finished file in by rename.
  const target=force?`${file}.${process.pid}.tmp`:file;
  const fd=openSync(target,'wx',0o600);
  try{writeSync(fd,content);}catch(error){closeSync(fd);unlinkSync(target);throw error;}
  closeSync(fd);chmodSync(target,0o600);
  if(force)renameSync(target,file);
}

export function createClientTokenFile({actorId,out,hubEnvFile,force=false,protectedRoots=[],now=new Date()}){
  if(typeof actorId!=='string'||!AGENT_ACTOR_PATTERN.test(actorId))throw new Error(`actor는 영문·숫자·. _ : @ / - 1–128자여야 합니다: ${actorId}`);
  if(typeof out!=='string'||!isAbsolute(out))throw new Error(`--out은 절대 경로여야 합니다: ${out}`);
  const target=real(out);
  if(isHubEnvFile(out)||(hubEnvFile&&target===real(hubEnvFile)))throw new Error('--out이 Hub env 파일입니다. 클라이언트 토큰은 Hub env와 다른 비공개 파일에 둡니다.');
  const root=protectedRoots.map(real).find(dir=>within(target,dir));
  if(root)throw new Error(`--out이 저장소(${root}) 안입니다. 커밋되거나 워크트리와 함께 지워지지 않게 저장소 밖(예: ~/.moonlight/mcp/${actorId.replace(/[^A-Za-z0-9._-]/g,'_')}.env)에 둡니다.`);
  if(present(out)&&!force)throw new Error(`이미 있습니다: ${out} — 토큰을 바꾸려면 --force (Hub의 이전 해시를 새 쌍으로 교체해야 옛 토큰이 막힙니다).`);
  let hub;
  try{hub=parseEnv(readFileSync(hubEnvFile,'utf8'));}catch{throw new Error(`Hub env 파일을 읽지 못했습니다: ${hubEnvFile} (--hub-env로 지정)`);}

  const token=randomBytes(32).toString('base64url');
  const digest=agentClientTokenDigest(token);
  const values=[];
  if(hub.COM_MOON_HUB_URL?.trim())values.push(['COM_MOON_HUB_URL',hub.COM_MOON_HUB_URL]);
  values.push(['COM_MOON_AGENT_API_TOKEN',token]);
  for(const [key,value] of Object.entries(hub))if(carried(key)&&key!=='COM_MOON_HUB_URL'&&value.trim())values.push([key,value]);
  const content=[
    `# Moonlight MCP client identity "${actorId}" — created ${now.toISOString()} by mcp:connect client-token.`,
    '# Private: keep mode 0600 and outside any checkout. The Hub env holds only the digest pair below',
    `# in COM_MOON_AGENT_CLIENT_TOKEN_HASHES: ${actorId}:${digest}`,
    ...values.map(([key,value])=>envLine(key,value)),'',
  ].join('\n');
  // Refuse to write a file that would not read back exactly (quoting, comments).
  const parsed=parseEnv(content);
  const drift=values.find(([key,value])=>parsed[key]!==value);
  if(drift)throw new Error(`${drift[0]} 값을 env 파일에 그대로 옮기지 못했습니다. 파일을 만든 뒤 직접 적으세요.`);
  writePrivate(out,content,force);

  const configured=parseAgentClientTokenHashes(hub.COM_MOON_AGENT_CLIENT_TOKEN_HASHES,{sharedToken:hub.COM_MOON_AGENT_API_TOKEN?.trim()});
  const warnings=[];
  if(!configured.ok)warnings.push(`Hub의 COM_MOON_AGENT_CLIENT_TOKEN_HASHES가 형식 오류(${configured.reason})입니다 — 고치기 전까지 Agent API는 503으로 닫혀 있습니다.`);
  else if(configured.entries.some(entry=>entry.actorId===actorId))warnings.push(`"${actorId}"는 이미 COM_MOON_AGENT_CLIENT_TOKEN_HASHES에 있습니다 — 그 항목을 새 쌍으로 바꿉니다(같은 actor가 두 번이면 503).`);
  if(!hub.COM_MOON_HUB_WRITE_SECRET?.trim())warnings.push('Hub env에 COM_MOON_HUB_WRITE_SECRET이 없어 옮기지 않았습니다 — 기존 Hub 경로를 쓰는 도구(get_daily_brief 등)는 인증되지 않습니다.');
  return {pair:`${actorId}:${digest}`,file:out,keys:values.map(([key])=>key),warnings};
}
