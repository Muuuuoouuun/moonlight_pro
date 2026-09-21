import {parseOfficeWorkflowOrigin,parseOfficeWorkflowRequest} from '@com-moon/agent-contracts/office-workflow';

export function officeWorkflowQuery({intent,scope,originRef}) {
  if (!['personal','classin'].includes(scope)) throw new Error('범위를 선택해 주세요.');
  const ref=parseOfficeWorkflowOrigin(originRef,intent);
  return new URLSearchParams({intent,scope,...ref}).toString();
}
export function officeWorkflowKey(input) { return officeWorkflowQuery(input); }

export function officeWorkflowNote(receipt) {
  const messages={
    preview:'업무 자료 또는 요청 저장 연결이 준비되면 사용할 수 있습니다.',
    running:'결과를 만드는 중입니다. 패널을 닫아도 이 요청은 취소되지 않습니다.',
    unknown:'처리 여부를 확인하지 못했습니다. 같은 요청의 상태를 먼저 확인해 주세요.',
    unsaved:'초안은 생성됐지만 저장 확인이 필요합니다. 복사하거나 생성 없이 저장을 복구할 수 있습니다.',
    expired:'본문 보관 기간이 끝났습니다. 연결된 업무와 저장 상태는 계속 확인할 수 있습니다.',
    conflict:'참고 자료 또는 저장 대상이 변경됐습니다. 자료를 다시 확인한 뒤 새 요청을 보내 주세요.',
    error:'요청을 처리하지 못했습니다. 입력을 보존했으니 자료와 연결 상태를 다시 확인해 주세요.',
  };
  if (receipt?.error==='customer-scope-mismatch') return '선택한 범위와 고객의 범위가 다릅니다. 고객의 회사·개인 분류를 확인해 주세요.';
  if (receipt?.error==='customer-scope-unavailable') return '고객의 회사·개인 분류를 먼저 확인해 주세요.';
  if (receipt?.error==='context-too-large') return '참고 자료가 길어 이 요청으로 처리할 수 없습니다. 필요한 부분을 Office 자유 요청에서 선택해 주세요.';
  if (receipt?.error==='office-result-expired') return '결과 보관 기간이 끝나 저장을 복구할 수 없습니다. 현재 본문을 복사한 뒤 새 요청을 준비해 주세요.';
  if (receipt?.error==='office-result-storage-rejected') return '결과는 생성됐지만 저장이 거절됐습니다. 본문을 복사하거나 연결을 확인한 뒤 저장을 복구해 주세요.';
  return messages[receipt?.status]||'';
}

export async function readOfficeWorkflow(path, {fetcher=fetch}={}) {
  try {
    const response=await fetcher(`/api/hub/office/${path}`,{cache:'no-store'});
    const data=await response.json();
    if (!response.ok || !data || data.status==='error' || data.source==='error') return {...data,status:'error'};
    return data;
  } catch { return {status:'error',error:'office-read-failed'}; }
}

export function validWorkflowReceipt(data, {requestId,scope}) {
  if (!data || typeof data!=='object' || data.requestId!==requestId) return false;
  if (data.result && (data.result.requestId!==requestId || data.result.scope!==scope || typeof data.result.artifact?.body!=='string' || typeof data.result.summary!=='string')) return false;
  if(data.status==='generated' && (!data.result || data.persistence?.persisted!==true))return false;
  if(data.status==='unsaved' && !data.result)return false;
  if(data.status==='saved' && (data.application?.state!=='saved' || !data.application?.commandId || !data.application?.entityId || data.persistence?.persisted!==true))return false;
  return ['running','generated','saved','error','unknown','expired','conflict','preview','unsaved'].includes(data.status);
}

// A failed read or save-only recovery is not permission to discard the only
// local copy of a reviewed answer or its signed recovery token.
export function mergeOfficeWorkflowReceipt(previous,incoming) {
  if(previous?.requestId!==incoming?.requestId)return incoming;
  if(previous?.result && ['error','unknown','running','preview','conflict','invalid-input'].includes(incoming?.status)) {
    return {...previous,...(incoming.application?{application:incoming.application}:{}),
      ...(previous.recoveryToken?{status:'unsaved',capabilities:{generate:false,applyTask:false}}:{})};
  }
  if(previous?.recoveryToken && previous.result && incoming?.status==='expired')return {...previous,status:'unsaved',expired:true,error:'office-result-expired',capabilities:{generate:false,applyTask:false}};
  return incoming;
}

export async function writeOfficeWorkflow(path, body, {fetcher=fetch,requestId,scope}={}) {
  try {
    const response=await fetcher(`/api/hub/office/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    const data=await response.json();
    // Error envelopes may omit request metadata; they must never become success.
    if(response.status>=500)return {status:'unknown',requestId,error:data?.error||'workflow-outcome-unknown'};
    if (!response.ok) return {status:data?.status==='conflict'?'conflict':'error',requestId,error:data?.error};
    if(['preview','error','conflict','invalid-input'].includes(data?.status)&&!data.result&&!data.requestId)return {...data,status:data.status==='invalid-input'?'error':data.status,requestId};
    if (!validWorkflowReceipt(data,{requestId,scope})) return {status:'unknown',requestId,error:'invalid-workflow-receipt'};
    return data;
  } catch { return {status:'unknown',requestId,error:'workflow-outcome-unknown'}; }
}

export async function sendOfficeWorkflow(input, options={}) {
  let request;
  try { request=parseOfficeWorkflowRequest(input); }
  catch { return {status:'error',requestId:input?.requestId,error:'invalid-workflow-request'}; }
  return writeOfficeWorkflow('requests',request,{...options,requestId:request.requestId,scope:request.scope});
}

const initial = () => ({open:false,draft:'',sentDraft:'',sourceExcerpt:'',sentExcerpt:'',sourceExcerpts:{},context:null,loading:false,requests:[],nextCursor:null,receipt:null,request:null,inspectToken:null,pending:false,note:'',taskFields:null,applyInput:null,applicationUnknown:false,projects:[],copied:false});
export function createOfficeWorkflowSessions() {
  const entries=new Map(), listeners=new Set();
  return {
    get(key) { if(!entries.has(key))entries.set(key,initial());return entries.get(key); },
    update(key,patch) { const old=this.get(key);entries.set(key,{...old,...(typeof patch==='function'?patch(old):patch)});listeners.forEach(listener=>listener()); },
    subscribe(listener) { listeners.add(listener);return ()=>listeners.delete(listener); },
    hasDrafts() { return [...entries.values()].some(entry=>entry.draft.trim() || entry.sourceExcerpt.trim() || Object.values(entry.sourceExcerpts).some(value=>value.trim()) || entry.taskFields || (entry.receipt?.result && entry.receipt.persistence?.persisted!==true)); },
    selectReceipt(key,receipt) {
      this.update(key,current=>{
        const switched=current.receipt?.requestId!==receipt.requestId;
        const sourceExcerpts=switched&&current.receipt?.requestId?{...current.sourceExcerpts,[current.receipt.requestId]:current.sourceExcerpt}:current.sourceExcerpts;
        return {receipt:mergeOfficeWorkflowReceipt(current.receipt,receipt),note:officeWorkflowNote(receipt),copied:false,
          ...(switched?{sourceExcerpts,sourceExcerpt:sourceExcerpts[receipt.requestId]||'',taskFields:null,applyInput:null}:{}),
          ...(['saved','rejected'].includes(receipt.application?.state)?{applicationUnknown:false,applyInput:null,taskFields:null}:{})};
      });
    },
    accept(key,requestId,receipt) {
      if(this.get(key).request?.requestId!==requestId)return false;
      const current=this.get(key);
      this.update(key,{receipt,pending:false,note:officeWorkflowNote(receipt),...(receipt.status==='generated'&&current.draft===current.sentDraft?{draft:''}:{}),...(receipt.status==='generated'&&current.sourceExcerpt===current.sentExcerpt?{sourceExcerpt:''}:{}),copied:false});return true;
    },
  };
}
