import {existsSync,readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';

// Self-locating: client configs point at one absolute path (the launcher) and nothing else,
// so a moved repo breaks loudly in one place instead of leaving a dead cwd/env-file behind.
export const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/$/,'');
export const DEFAULT_ENV_FILE=`${REPO_ROOT}/apps/hub/.env.local`;
// Hub's .env.local also holds model/OAuth/DB secrets. The MCP process only needs these.
export const MCP_ENV_KEY=/^COM_MOON_(HUB_URL|HUB_WRITE_SECRET|AGENT_API_TOKEN|MCP_[A-Z0-9_]+)$/;

export function loadMcpEnv({file,env=process.env}={}){
  const path=file||env.COM_MOON_MCP_ENV_FILE||DEFAULT_ENV_FILE;
  if(!existsSync(path))return {file:path,missing:true,loaded:[]};
  const loaded=[];
  for(const [key,value] of Object.entries(parseEnv(readFileSync(path,'utf8')))){
    // Values already in the environment (client config env, shell) win over the file.
    if(MCP_ENV_KEY.test(key)&&env[key]===undefined){env[key]=value;loaded.push(key);}
  }
  return {file:path,missing:false,loaded};
}
