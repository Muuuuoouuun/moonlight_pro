import { NextResponse } from 'next/server.js';
import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { getDiscoveryLedger, getDiscoveryTargets, getDiscoveryHistory, saveDiscovery } from '@/lib/repositories/discovery-ledger';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  let key='records';
  try {
    const params=new URL(req.url).searchParams;
    if(params.get('targets')==='1') {
      key='targets';
      return NextResponse.json(await getDiscoveryTargets({type:params.get('type'),q:params.get('q')??''}));
    }
    if(params.has('history')) {
      key='history';
      return NextResponse.json(await getDiscoveryHistory(params.get('history'),{offset:Number(params.get('offset')??0)}));
    }
    return NextResponse.json(await getDiscoveryLedger({id:params.get('id'),offset:Number(params.get('offset')??0)}));
  }catch{
    return NextResponse.json({status:'error',configured:Boolean(resolveSupabaseConfig()&&resolveDefaultWorkspaceId()),[key]:[],message:'기회 탐색 기록을 불러오지 못했어요. 다시 시도해 주세요.'});
  }
}

export async function POST(req) {
  try {
    const guard=assertHubWriteAllowed(req);if(guard)return guard;
    const parsed=await readHubWriteJson(req,{maxBytes:128*1024});if(parsed.error)return parsed.error;
    const {httpStatus=200,...result}=await saveDiscovery(parsed.data);
    return NextResponse.json(result,{status:httpStatus});
  }catch{
    return NextResponse.json({status:'error',record:null,retryable:true,message:'저장을 확인하지 못했어요. 같은 요청으로 다시 시도해 주세요.'},{status:502});
  }
}
