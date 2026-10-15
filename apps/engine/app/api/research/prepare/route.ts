import { NextResponse } from 'next/server.js';
import { validateSharedWebhookRequest } from '../../../../lib/shared-webhook.ts';
import { executeResearchPrepare, MAX_RESEARCH_PREPARE_BYTES } from '../../../../lib/research-prepare.ts';

export const runtime='nodejs';
export const maxDuration=120;
export async function POST(req:Request) {
  const auth=validateSharedWebhookRequest(req);
  if(!auth.ok||auth.mode==='open')return NextResponse.json({status:'error',reason:'invalid-shared-secret'},{status:401});
  if(Number(req.headers.get('content-length')||0)>MAX_RESEARCH_PREPARE_BYTES)return NextResponse.json({status:'invalid-input',reason:'payload-too-large'},{status:413});
  let body:unknown;try{const raw=await req.text();if(Buffer.byteLength(raw)>MAX_RESEARCH_PREPARE_BYTES)return NextResponse.json({status:'invalid-input',reason:'payload-too-large'},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({status:'invalid-input',reason:'invalid-json'},{status:400});}
  try{const result=await executeResearchPrepare(body,{workspaceId:process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim()});return NextResponse.json(result,{status:result.status==='invalid-input'?400:result.status==='conflict'?409:200,headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({status:'unknown',reason:'preparation-outcome-unknown'},{status:202});}
}
