#!/usr/bin/env node
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

function dataOf(result){if(result.structuredContent)return result.structuredContent;const text=result.content.find(item=>item.type==='text')?.text||'';try{return JSON.parse(text);}catch{return {status:'error',error:text.slice(0,200)};}}
const client=new Client({name:'moonlight-doctor',version:'0.2.0'},{capabilities:{}});
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('COM_MOON_')||['PATH','HOME','TMPDIR','SYSTEMROOT'].includes(key)));
env.COM_MOON_MCP_PROFILE='core';
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./index.js',import.meta.url))],env,stderr:'pipe'});
const report={configured:{hub:Boolean(env.COM_MOON_HUB_URL),agentToken:Boolean(env.COM_MOON_AGENT_API_TOKEN),legacyWriteSecret:Boolean(env.COM_MOON_HUB_WRITE_SECRET)},discovered:false,tools:[],read:null,capabilities:null};
try{
  await client.connect(transport,{timeout:10_000});
  const listing=await client.listTools(undefined,{timeout:10_000});
  report.discovered=true;report.tools=listing.tools.map(tool=>tool.name);
  const started=Date.now();
  const read=await client.callTool({name:'list_tasks',arguments:{limit:1,fields:['id','status','updatedAt']}},undefined,{timeout:20_000});
  const payload=dataOf(read);
  report.read={ok:!read.isError,status:payload.status,source:payload.source,latencyMs:Date.now()-started,responseBytes:Buffer.byteLength(JSON.stringify(read)),returnedCount:payload.page?.returnedCount??null};
  if(read.isError)report.read.error=String(payload.error||'Read failed').slice(0,200);
  if(env.COM_MOON_AGENT_API_TOKEN){
    const result=await client.callTool({name:'get_hub_health',arguments:{}},undefined,{timeout:20_000});
    report.capabilities={ok:!result.isError,data:dataOf(result)};
  }
  if(read.isError)process.exitCode=1;
}catch(error){report.error=String(error.message||error).slice(0,250);process.exitCode=1;}
finally{await client.close().catch(()=>{});console.log(JSON.stringify(report,null,2));}
