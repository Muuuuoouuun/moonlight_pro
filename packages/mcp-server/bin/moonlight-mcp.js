#!/usr/bin/env node
// Entry point for every MCP client. stdio by default (Claude Code/Desktop, Codex, Cursor, …);
// --http serves Streamable HTTP for tools that cannot spawn a local process.
import {parseArgs} from 'node:util';
import {loadMcpEnv} from '../src/env.js';
import {PROFILE_NAMES} from '../src/tools.js';

const USAGE=`moonlight-mcp [--profile ${PROFILE_NAMES.join('|')}] [--read-only] [--http [--port 3333] [--host 127.0.0.1]]`;
let values;
try{({values}=parseArgs({options:{profile:{type:'string'},'read-only':{type:'boolean'},http:{type:'boolean'},port:{type:'string'},host:{type:'string'},help:{type:'boolean',short:'h'}}}));}
catch(error){process.stderr.write(`${error.message}\n${USAGE}\n`);process.exit(2);}
if(values.help){process.stdout.write(`${USAGE}\n`);process.exit(0);}
if(values.profile&&!PROFILE_NAMES.includes(values.profile)){process.stderr.write(`Unknown profile: ${values.profile}\n${USAGE}\n`);process.exit(2);}
if(values.port!==undefined&&!/^\d{1,5}$/.test(values.port)||Number(values.port)>65535){process.stderr.write(`Invalid port: ${values.port}\n${USAGE}\n`);process.exit(2);}

const env=loadMcpEnv();
if(env.missing)process.stderr.write(`moonlight-mcp: ${env.file} not found — tools will report missing configuration.\n`);
if(values.profile)process.env.COM_MOON_MCP_PROFILE=values.profile;
if(values['read-only'])process.env.COM_MOON_MCP_READ_ONLY='1';

if(values.http){
  const {startHttpServer}=await import('../src/http.js');
  await startHttpServer({host:values.host,port:values.port});
}else{
  await import('../src/index.js');
}
