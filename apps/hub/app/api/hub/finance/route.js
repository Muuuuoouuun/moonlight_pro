import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { getFinance } from '@/lib/repositories/finance';
import { runFinanceCommand } from '@/lib/finance-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
export async function GET(req) {
 try{return json(await getFinance({scope:new URL(req.url).searchParams.get('scope')||'personal'}));}
 catch{return json({status:'error',entries:[],subscriptions:[],error:'금융 기록을 읽지 못했습니다.'});}
}
export async function POST(req) {
 const denied=assertHubWriteAllowed(req);if(denied)return denied;
 const parsed=await readHubWriteJson(req,{maxBytes:2*1024*1024});if(parsed.error)return parsed.error;
 const {httpStatus,...result}=await runFinanceCommand(parsed.data);
 return json(result,httpStatus);
}
