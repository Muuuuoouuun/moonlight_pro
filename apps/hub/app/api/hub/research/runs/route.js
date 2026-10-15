import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { listResearchRuns } from '@/lib/repositories/research-runs-ledger';
import { runResearchPreparation } from '@/lib/research-run-service';
import { researchSettings } from '@/lib/research-run-contract';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
export async function GET(req){try{return json(await listResearchRuns({brand:new URL(req.url).searchParams.get('brand')}));}catch{return json({status:'error',runs:[],settings:researchSettings()});}}
export async function POST(req){const guard=assertHubWriteAllowed(req);if(guard)return guard;const parsed=await readHubWriteJson(req,{maxBytes:4096});if(parsed.error)return parsed.error;
  try{const {httpStatus,...result}=await runResearchPreparation(parsed.data);return json(result,httpStatus);}catch{return json({status:'unknown',reason:'research-outcome-unknown'},202);}}
