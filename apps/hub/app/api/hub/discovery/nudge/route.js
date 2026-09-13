import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { getDiscoveryNudge, saveDiscoveryNudge } from '@/lib/repositories/discovery-nudge-ledger';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req) {
  try {return NextResponse.json(await getDiscoveryNudge(new URL(req.url).searchParams.get('id')));}
  catch {return NextResponse.json({status:'error',context:null,message:'다음 행동을 확인하지 못했어요.'});}
}
export async function POST(req) {
  try {
    const guard=assertHubWriteAllowed(req);if(guard)return guard;
    const body=await readHubWriteJson(req,{maxBytes:4096});if(body.error)return body.error;
    const {httpStatus=200,...data}=await saveDiscoveryNudge(body.data);
    return NextResponse.json(data,{status:httpStatus});
  }catch{return NextResponse.json({status:'error',context:null,message:'표시 설정을 저장하지 못했어요.'},{status:502});}
}
