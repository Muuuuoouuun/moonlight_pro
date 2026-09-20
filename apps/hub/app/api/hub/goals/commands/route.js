import {NextResponse} from 'next/server.js';
import {assertHubWriteAllowed,readHubWriteJson} from '@/lib/hub-write-guard';
import {executeGoalCommand,getGoalCommandReceipt} from '@/lib/repositories/goals-ledger';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request) {
  const guard=assertHubWriteAllowed(request);
  if(guard)return guard;
  const parsed=await readHubWriteJson(request,{maxBytes:65536});
  if(parsed.error)return parsed.error;
  const {httpStatus=200,...result}=await executeGoalCommand(parsed.data);
  return NextResponse.json(result,{status:httpStatus});
}
export async function GET(request) {
  const {httpStatus=200,...result}=await getGoalCommandReceipt(new URL(request.url).searchParams.get('commandId'));
  return NextResponse.json(result,{status:httpStatus});
}
