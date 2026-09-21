import {NextResponse} from 'next/server.js';
import {getGoalsLedger} from '@/lib/repositories/goals-ledger';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request) {
  const params=new URL(request.url).searchParams;
  return NextResponse.json(await getGoalsLedger({scope:params.get('scope'),objectiveId:params.get('objectiveId'),entityType:params.get('entityType'),entityId:params.get('entityId')}));
}
