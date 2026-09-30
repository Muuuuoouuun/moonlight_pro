#!/usr/bin/env node
// Local launchd companion for Vercel Hobby's daily fallback. The server owns
// due slots and durable claims; repeated wakeups never request another generation.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
const SWEEPS=['research-sweep','reports-sweep'];
export async function runScheduler(env,fetchImpl=fetch){
  let origin;
  try{const url=new URL(env.COM_MOON_HUB_URL);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!env.CRON_SECRET?.trim())throw Error('invalid');origin=url.origin;}
  catch{return[{status:'error',reason:'scheduler-not-configured'}];}
  return Promise.all(SWEEPS.map(async sweep=>{
    try{
      const response=await fetchImpl(`${origin}/api/cron/${sweep}`,{headers:{authorization:`Bearer ${env.CRON_SECRET.trim()}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(295000)});
      const data=await response.json();
      if(!response.ok||!['ok','live','partial','error','disabled','idle'].includes(data?.status))return{sweep,status:'error',reason:'sweep-response-invalid',httpStatus:response.status};
      return{sweep,status:data.status,preparedCount:(data.runs||[]).reduce((sum,row)=>sum+(Number.isSafeInteger(row.run?.preparedCount)?row.run.preparedCount:0),0),reportCount:Array.isArray(data.results)?data.results.length:0};
    }catch{return{sweep,status:'error',reason:'sweep-outcome-unknown'};}
  }));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const index=process.argv.indexOf('--env-file');let env;
  try{if(index<0||!process.argv[index+1])throw Error('missing');env=parseEnv(readFileSync(process.argv[index+1],'utf8'));}
  catch{console.error(JSON.stringify({status:'error',reason:'scheduler-env-unavailable'}));process.exit(1);}
  const results=await runScheduler(env);console.log(JSON.stringify({at:new Date().toISOString(),results}));
  if(results.some(row=>row.status==='error'))process.exitCode=1;
}
