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
  const commandId=new URL(request.url).searchParams.get('commandId');
  try {
    const {httpStatus=200,...result}=await getGoalCommandReceipt(commandId);
    if(httpStatus>=500 || (httpStatus===200 && (result.status==='error' || result.source==='error'))) {
      return NextResponse.json({...result,status:'error',source:'error',retryable:result.retryable!==false});
    }
    return NextResponse.json(result,{status:httpStatus});
  } catch {
    return NextResponse.json({status:'error',source:'error',error:'receipt-read-unavailable',commandId,persisted:null,nextAction:'get_goal_command_receipt',retryPolicy:'same-command-id-and-input-only',retryable:true});
  }
}
