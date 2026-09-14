export const validCodexPrompt=prompt=>Boolean(prompt.trim())&&new TextEncoder().encode(prompt.trim()).length<=16384;
export const requiresCodexReconciliation=job=>Boolean(job&&job.mode!=='read'&&['failed','cancelled','needs_attention'].includes(job.state));
export const validCodexReconciliationNote=note=>note.trim().length>=16&&new TextEncoder().encode(note.trim()).length<=2048;
export const CODEX_JOB_LABELS={queued:'대기',running:'진행 중',succeeded:'완료',failed:'실패',cancelled:'중단',needs_attention:'확인 필요'};
export const CODEX_JOB_LIFECYCLE={queued:'queued',running:'active',succeeded:'done',failed:'blocked',cancelled:'cancelled',needs_attention:'waiting'};
export async function requestCodexJobs(action,input={},options={}){
 const write=['submit','cancel','resume'].includes(action);
 const url=write?'/api/hub/codex/jobs':`/api/hub/codex/jobs?${new URLSearchParams({action,...input})}`;
 const response=await fetch(url,{method:write?'POST':'GET',headers:{'content-type':'application/json'},cache:'no-store',signal:options.signal,...(write?{body:JSON.stringify({action,...input})}:{})});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data||['error','forbidden','unauthorized','conflict'].includes(data.status))throw new Error(data?.message||data?.error||'작업 상태를 확인하지 못했어요.');
 return data;
}
