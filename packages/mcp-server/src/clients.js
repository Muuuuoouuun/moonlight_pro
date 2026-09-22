import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {PROFILE_NAMES} from './tools.js';

// Registry of HTTP clients (one entry per external tool). Only SHA-256 digests are stored;
// a token is shown once at creation. Lives outside the repo next to other ~/.moonlight state.
export const clientsFile=(env=process.env)=>env.COM_MOON_MCP_CLIENTS_FILE||join(homedir(),'.moonlight','mcp','clients.json');
const NAME=/^[a-z0-9][a-z0-9._-]{0,39}$/;
const digest=token=>createHash('sha256').update(token).digest();

export function readClients(file){
  if(!existsSync(file))return [];
  const data=JSON.parse(readFileSync(file,'utf8'));
  if(!Array.isArray(data?.clients))throw new Error(`Invalid client registry: ${file}`);
  return data.clients;
}

function writeClients(file,clients){
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const tmp=`${file}.${process.pid}.tmp`;
  writeFileSync(tmp,`${JSON.stringify({version:1,clients},null,2)}\n`,{mode:0o600});
  renameSync(tmp,file);
}

export function createClient(file,{name,profile='core',readOnly=false,allowUrl=false}){
  if(!NAME.test(name||''))throw new Error('Client name must be 1–40 chars of lowercase letters, digits, ".", "_" or "-".');
  if(!PROFILE_NAMES.includes(profile))throw new Error(`Unknown profile "${profile}". Use one of: ${PROFILE_NAMES.join(', ')}.`);
  // A token in a URL leaks through proxy logs and connector settings (Claude's connector docs and
  // the MCP authorization spec both advise against it), so such a client may only read.
  if(allowUrl&&!readOnly)throw new Error('URL tokens are read-only: add --read-only. Writes need a header token (or OAuth).');
  const clients=readClients(file);
  if(clients.some(client=>client.name===name))throw new Error(`Client "${name}" already exists. Revoke it first to rotate its token.`);
  const token=`mlm_${randomBytes(32).toString('base64url')}`;
  const client={name,profile,readOnly:Boolean(readOnly),allowUrl:Boolean(allowUrl),tokenSha256:digest(token).toString('hex'),createdAt:new Date().toISOString()};
  writeClients(file,[...clients,client]);
  return {token,client};
}

export function revokeClient(file,name){
  const clients=readClients(file);
  const kept=clients.filter(client=>client.name!==name);
  if(kept.length===clients.length)return false;
  writeClients(file,kept);
  return true;
}

// Compares against every entry (no early exit) so timing does not reveal which name matched.
export function findClient(clients,token){
  if(typeof token!=='string'||!token)return null;
  const wanted=digest(token);let found=null;
  for(const client of clients){
    const stored=Buffer.from(String(client.tokenSha256||''),'hex');
    if(stored.length===wanted.length&&timingSafeEqual(stored,wanted))found=client;
  }
  return found;
}
