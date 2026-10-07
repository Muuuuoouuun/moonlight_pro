import { fetchSupabaseRowsDetailed, eqFilter } from '../server-read.js';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '../server-write.js';
import { projectFinance } from '../finance-ledger.js';
export async function getFinance({scope='personal'}={}, {workspaceId=resolveDefaultWorkspaceId(),configured=Boolean(resolveSupabaseConfig()),readRows=fetchSupabaseRowsDetailed}={}) {
 const empty=projectFinance([],[],[]);
 if(scope!=='personal')return {...empty,status:'error',error:'개인 현금 흐름에서 확인하세요.'};
 if(!configured||!workspaceId)return {...empty,status:'preview'};
 try {
  const readAll=async table=>{
   const rows=[];
   for(let offset=0;;offset+=1000) {
    const r=await readRows(table,{filters:[['workspace_id',eqFilter(workspaceId)]],order:'id.asc',limit:1000,offset,strictRows:true});
    if(r.error||!Array.isArray(r.rows))throw new Error('finance-read-failed');
    rows.push(...r.rows);if(r.rows.length<1000)return rows;
    if(offset>=99000)throw new Error('finance-read-limit');
   }
  };
  const [rawEntries,rawSubscriptions,rawImports]=await Promise.all(['finance_entries','finance_subscriptions','finance_imports'].map(readAll));
  const entries=rawEntries.map(r=>({...r.data,id:r.id,review:r.review,revision:r.revision}));
  const subscriptions=rawSubscriptions.map(r=>({...r.data,...r.review,id:r.id,revision:r.revision}));
  const imports=rawImports.map(r=>({id:r.id,importKey:r.import_key,from:r.period_start,through:r.period_end,coverage:r.coverage,createdAt:r.created_at}));
  const result=projectFinance(entries,subscriptions,imports);
  return {...result,status:imports.length ? (result.coverage?.bankAccountCollected===true?'live':'partial'):'live'};
 }catch{return {...empty,status:'error',error:'금융 기록을 읽지 못했습니다. 다시 시도하세요.'};}
}
