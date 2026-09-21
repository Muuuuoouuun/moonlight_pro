"use client";

import React from 'react';
import {Button,EditDrawer,EmptyState,SelectField,Skeleton,TextAreaField,TruthBadge} from './hub-primitives';
import {createOfficeWorkflowSessions,officeWorkflowKey,officeWorkflowQuery,officeWorkflowNote,readOfficeWorkflow,sendOfficeWorkflow,writeOfficeWorkflow,validWorkflowReceipt,mergeOfficeWorkflowReceipt} from './office-workflow-client';
import styles from './office-workflow-panel.module.css';

const Sessions=React.createContext(null);
export function OfficeWorkflowSessionProvider({children}) {
  const [store]=React.useState(createOfficeWorkflowSessions);
  React.useEffect(()=>{
    const warn=event=>{if(store.hasDrafts()){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[store]);
  return <Sessions.Provider value={store}>{children}</Sessions.Provider>;
}
const ownerNames={vaporeon:'샤미드',flareon:'부스터'};
const initialMessage={weekly_report:'선택한 7일의 확인된 기록으로 주간 정리를 작성해 주세요. 확인된 활동, 변화와 막힘, 다음 주 남길 행동을 구분하고 미측정 값은 그대로 표시해 주세요.',customer_reply:'선택한 고객의 실제 기록과 약속을 참고해 보낼 답장 초안 한 개와 이번 접촉 목적을 작성해 주세요. 자료에 없는 약속이나 고객 발언을 만들지 마세요.'};
const missingLabels={'recorded-customer-words-unavailable':'직접 연결된 발언 기록 없음','activities-limited-to-latest-five':'최근 기록 5건만 참고','contacts_recorded':'고객 연락 미측정','tasks_completed':'완료 할 일 미측정','content_published':'발행 미측정','goals':'목표 조회 미완료','deals':'거래 조회 미완료','deal-win-timestamps':'성사일 일부 미확인'};

export function OfficeWorkflowPanel({intent,scope,originRef,title,onTaskCreated,onNavigate}) {
  const [pickedScope,setPickedScope]=React.useState('');
  const effectiveScope=scope||pickedScope;
  if (!effectiveScope) return <div className={styles.panel}><SelectField label={`${title} · 업무 범위`} value={pickedScope} onChange={event=>setPickedScope(event.target.value)} options={[{value:'',label:'범위 확인 후 선택'},{value:'classin',label:'회사'},{value:'personal',label:'개인'}]} /></div>;
  let key;
  try { key=officeWorkflowKey({intent,scope:effectiveScope,originRef}); }
  catch { return <p className={styles.note}>업무 대상이나 보고 기간을 확인해야 Office를 사용할 수 있습니다.</p>; }
  return <WorkflowForOrigin key={key} sessionKey={key} intent={intent} scope={effectiveScope} originRef={originRef} title={title} onTaskCreated={onTaskCreated} onNavigate={onNavigate} />;
}

function WorkflowForOrigin({sessionKey,intent,scope,originRef,title,onTaskCreated,onNavigate}) {
  const shared=React.useContext(Sessions);
  const [local]=React.useState(createOfficeWorkflowSessions);
  const store=shared||local;
  const subscribe=React.useCallback(listener=>store.subscribe(listener),[store]);
  const snapshot=React.useCallback(()=>store.get(sessionKey),[store,sessionKey]);
  const state=React.useSyncExternalStore(subscribe,snapshot,snapshot);
  const patch=changes=>store.update(sessionKey,changes);
  const loadTicket=React.useRef(0),trigger=React.useRef(null);
  const ownerId=intent==='weekly_report'?'vaporeon':'flareon';
  const input={intent,scope,originRef};
  const query=officeWorkflowQuery(input);
  const receipt=state.receipt, result=receipt?.result;
  const inProgress=state.pending || ['running','unknown'].includes(receipt?.status);
  const application=receipt?.application;
  const hasApplication=Boolean(application?.commandId);

  const inspect=async id=>{
    const inspectToken=crypto.randomUUID();
    patch({inspectToken});
    const data=await readOfficeWorkflow(`requests/${encodeURIComponent(id)}`);
    if(store.get(sessionKey).inspectToken!==inspectToken)return;
    if(!validWorkflowReceipt(data,{requestId:id,scope})){patch({note:officeWorkflowNote({status:'error'})});return;}
    store.selectReceipt(sessionKey,data);
    return data;
  };
  const load=async()=>{
    const ticket=++loadTicket.current;
    patch({open:true,loading:true,note:''});
    const [context,list]=await Promise.all([readOfficeWorkflow(`context?${query}`),readOfficeWorkflow(`requests?${query}`)]);
    if(ticket!==loadTicket.current)return;
    patch({loading:false,context,requests:Array.isArray(list.requests)?list.requests:[],nextCursor:list.nextCursor||null,
      note:context.status==='ready'?officeWorkflowNote(list):officeWorkflowNote(context)});
    if(!store.get(sessionKey).receipt && !store.get(sessionKey).pending && list.requests?.length) await inspect(list.requests[0].requestId);
  };
  const generate=async()=>{
    const current=store.get(sessionKey);
    if(current.pending||!current.context?.capabilities?.generate)return;
    const parent=current.receipt?.requestId;
    const previousBody=current.receipt?.result?.artifact?.body;
    if(previousBody?.length>6000&&!current.sourceExcerpt.trim()){patch({note:'이전 결과가 길어 수정할 부분을 아래 입력란에 선택해 주세요.'});return;}
    const previous=previousBody?.length>6000?current.sourceExcerpt.trim():previousBody;
    const request={...input,requestId:crypto.randomUUID(),ownerId,mode:'draft',participants:[],expectedContextHash:current.context.contextHash,
      message:current.draft.trim()||initialMessage[intent],boundedHistory:previous?[{role:'assistant',text:previous}]:[],...(parent?{parentRequestId:parent}:{})};
    patch({request,sentDraft:current.draft,sentExcerpt:current.sourceExcerpt,pending:true,inspectToken:null,note:'',copied:false,applyInput:null,applicationUnknown:false});
    const data=await sendOfficeWorkflow(request);
    store.accept(sessionKey,request.requestId,data);
    const list=await readOfficeWorkflow(`requests?${query}`);
    if(Array.isArray(list.requests))patch({requests:list.requests,nextCursor:list.nextCursor||null});
  };
  const copy=async()=>{
    try { await navigator.clipboard.writeText(result.artifact.body);patch({copied:true,note:''}); }
    catch {patch({copied:false,note:'복사하지 못했습니다. 결과 본문을 선택해 복사해 주세요.'});}
  };
  const recover=async()=>{
    if(store.get(sessionKey).pending)return;
    patch({pending:true,inspectToken:null});
    const data=await writeOfficeWorkflow(`requests/${receipt.requestId}/recover`,{recoveryToken:receipt.recoveryToken},{requestId:receipt.requestId,scope});
    patch(current=>({pending:false,receipt:mergeOfficeWorkflowReceipt(current.receipt,data),note:officeWorkflowNote(data)}));
  };
  const openTask=async()=>{
    const targetRequestId=receipt?.requestId;
    patch({note:''});
    const projects=await fetch('/api/hub/projects',{cache:'no-store'}).then(res=>res.ok?res.json():null).catch(()=>null);
    if(store.get(sessionKey).receipt?.requestId!==targetRequestId || store.get(sessionKey).pending)return;
    if(!projects || !['live','partial'].includes(projects.status) || projects.source==='error') {patch({note:'프로젝트를 읽지 못했습니다. 기존 할 일 화면에서 대상을 확인해 주세요.'});return;}
    const choices=(projects.projects||[]).filter(project=>project.orgScope===scope);
    if(!choices.length){patch({note:'같은 범위의 프로젝트를 먼저 선택해야 합니다. 프로젝트 없이 등록하려면 기존 할 일 화면을 이용해 주세요.'});return;}
    const proposed=result?.nextStep?.fields||{};
    patch({projects:choices,taskFields:{id:receipt.requestId,title:proposed.title||'',description:proposed.description||'',nextAction:proposed.nextAction||'',dealId:proposed.dealId||null,projectId:choices.some(p=>p.id===proposed.projectId)?proposed.projectId:'',dueAt:(proposed.dueAt||'').slice(0,10),priority:proposed.priority||'medium'}});
  };
  const apply=async(fields)=>{
    if(store.get(sessionKey).pending)return {ok:false,status:'error'};
    patch({pending:true,inspectToken:null,applyInput:fields||state.applyInput});
    const data=await writeOfficeWorkflow(`requests/${receipt.requestId}/apply`,{resultRevision:result?.resultRevision||1,...(fields?{fields}: {})},{requestId:receipt.requestId,scope});
    const uncertain=['unknown','running'].includes(data.status);
    patch({pending:false,receipt:{...receipt,application:data.application||receipt.application,capabilities:data.application?data.capabilities:receipt.capabilities},note:officeWorkflowNote(data),applicationUnknown:uncertain,
      ...(uncertain?{taskFields:null}:{}),...(['saved','conflict','error'].includes(data.status)?{applyInput:null}:{})});
    const saved=data.application?.state==='saved';
    if(saved){window.dispatchEvent(new Event('moonlight:tasks-saved'));onTaskCreated?.();}
    else if(['conflict','error'].includes(data.status))await inspect(receipt.requestId);
    return {ok:saved,status:saved?'saved':data.status,message:saved?'':officeWorkflowNote(data)||'저장 여부를 다시 확인해 주세요.'};
  };
  const saveTask=async()=>{
    const fields=store.get(sessionKey).taskFields;
    if(fields?.id!==store.get(sessionKey).receipt?.requestId)return {ok:false,status:'error',message:'결과가 바뀌었습니다. 연결할 결과에서 할 일을 다시 열어 주세요.'};
    if(!fields?.projectId||!fields.title.trim())return {ok:false,status:'error',message:'할 일 제목과 같은 범위의 프로젝트를 선택해 주세요.'};
    if(fields.title.trim().length>300 || fields.description.trim().length>4000 || (fields.nextAction||'').trim().length>1000)return {ok:false,status:'error',message:'제목은 300자, 상세는 4,000자, 다음 행동은 1,000자 이내로 입력해 주세요.'};
    const payload={title:fields.title.trim(),projectId:fields.projectId,priority:fields.priority,...(fields.description.trim()?{description:fields.description.trim()}:{}),...(fields.nextAction?.trim()?{nextAction:fields.nextAction.trim()}:{}),...(fields.dealId?{dealId:fields.dealId}:{}),...(fields.dueAt?{dueAt:`${fields.dueAt}T09:00:00+09:00`}:{})};
    return apply(payload);
  };
  const showTask=()=>onNavigate?onNavigate(`dashboard/work/projects?view=todos&task=${encodeURIComponent(application.entityId)}`):window.location.assign(`/dashboard/work/projects?view=todos&task=${encodeURIComponent(application.entityId)}`);
  return <section className={styles.panel} aria-label={title}>
    <div className={styles.actions}><Button ref={trigger} variant="outline" size="xs" onClick={()=>state.open?patch({open:false}):load()} aria-expanded={state.open}>{title} · {ownerNames[ownerId]}</Button>
      {state.open&&<span className={styles.meta}>{scope==='classin'?'회사':'개인'} · 선택한 업무의 자료</span>}
    </div>
    {state.open&&<div className={styles.stack} onKeyDown={event=>{if(event.key==='Escape'&&!state.taskFields){event.stopPropagation();patch({open:false});trigger.current?.focus();}}}>
      {state.loading?<Skeleton lines={2} label="Office 자료와 이전 결과 확인 중" />:state.context?.status!=='ready'?<EmptyState icon="sparkle" title="업무 연결 확인 필요" description={officeWorkflowNote(state.context)||'자료를 확인할 수 없습니다.'} action={<Button size="xs" onClick={load}>다시 확인</Button>} />:null}
      {state.context?.status==='ready'&&<>
        <div className={styles.actions}><TruthBadge state={state.context.missing?.length?'partial':'live'} /><Button size="xs" variant="ghost" onClick={load} disabled={state.pending}>자료·이전 결과 새로고침</Button></div>
        {!!state.context.missing?.length&&<p className={styles.note}>{state.context.missing.map(reason=>missingLabels[reason]||reason).join(' · ')}</p>}
        <TextAreaField label={result?'수정할 내용':'요청에 덧붙일 내용'} value={state.draft} maxLength={6000} onChange={event=>patch({draft:event.target.value})} placeholder={intent==='weekly_report'?'특히 살펴볼 변화나 막힘이 있다면 적어주세요.':'이번 연락의 목적이나 지켜야 할 약속을 적어주세요.'} rows={3} />
        {result?.artifact?.body?.length>6000&&<TextAreaField label="수정할 이전 결과 부분 · 최대 6,000자" value={state.sourceExcerpt} onChange={event=>patch({sourceExcerpt:event.target.value})} maxLength={6000} rows={4} />}
        <div className={styles.actions}><Button variant="primary" size="sm" onClick={generate} disabled={inProgress || state.applicationUnknown || receipt?.status==='unsaved' || !state.context.capabilities?.generate}>{state.pending?'요청 처리 중…':result?'수정 요청 보내기':'초안 만들기'}</Button></div>
      </>}
      {!!state.note&&<p role="status" className={styles.note}>{state.note}</p>}
      {['running','unknown','unsaved'].includes(receipt?.status)&&<div className={styles.actions}>
        <Button size="xs" onClick={()=>inspect(receipt.requestId)} disabled={state.pending}>같은 요청 상태 확인</Button>
        {receipt.recoveryToken&&!receipt.expired&&<Button size="xs" onClick={recover} disabled={state.pending}>생성 없이 저장 복구</Button>}
        {!state.pending&&<details><summary>새 요청이 필요한 경우</summary><p className={styles.note}>{receipt.status==='unsaved'?'저장되지 않은 본문을 먼저 복사해 주세요. 새 결과를 만들면 현재 본문이 바뀝니다.':'이전 요청이 계속 처리될 수 있습니다. 새 요청은 별도로 실행되며 비용이 중복될 수 있습니다.'}</p><Button size="xs" onClick={()=>patch({receipt:{...receipt,status:'error'},note:'이전 요청을 목록에 보존했습니다. 새 요청을 보낼 수 있습니다.'})}>별도 요청 준비</Button></details>}
      </div>}
      {result&&<article className={styles.result}>
        <div className={styles.actions}><strong>{result.summary}</strong><TruthBadge state={receipt.persistence?.persisted===true?'live':'partial'} label={receipt.persistence?.persisted===true?'초안 저장됨':'저장 확인 필요'} /></div>
        <pre className={styles.body}>{result.artifact.body}</pre>
        <div className={styles.actions}><Button size="xs" onClick={copy}>{state.copied?'복사됨':'복사'}</Button>
          {result.nextStep && !hasApplication && <Button size="xs" onClick={openTask} disabled={!receipt.capabilities?.applyTask || receipt.persistence?.persisted!==true || state.pending || state.applicationUnknown}>할 일로 연결</Button>}
        </div>
        <p className={styles.note}>{result.nextStep?`다음 행동 제안: ${result.nextStep.label}`:'추가 행동 없음'}</p>
        {(result.uncertainties?.length>0||result.dissent?.length>0)&&<div className={styles.note}>{[...(result.uncertainties||[]),...(result.dissent||[])].map((line,i)=><p key={i}>{line}</p>)}</div>}
        {!!result.evidence?.length&&<details><summary>참고한 자료</summary><ul>{result.evidence.map((item,i)=><li key={i}>{item.explanation}</li>)}</ul></details>}
      </article>}
      {receipt?.logState==='error'&&<p className={styles.note}>결과는 저장됐지만 활동 로그를 남기지 못했습니다.</p>}
      {state.applicationUnknown&&!hasApplication&&<div className={styles.actions}><span className={styles.note}>할 일 저장 요청을 확인해야 합니다. 편집과 새 저장은 확인 뒤에 가능합니다.</span><Button size="xs" onClick={()=>apply(state.applyInput)} disabled={state.pending}>같은 내용으로 저장 확인</Button></div>}
      {hasApplication&&<div className={styles.actions}>
        <span className={styles.note}>{application.state==='saved'?(application.entityConfirmed?'할 일 등록됨':'저장됨 · 화면 확인 중'):application.state==='rejected'?'할 일 등록이 거절됐습니다. 새 요청에서 대상을 다시 확인해 주세요.':'할 일 저장 여부 확인 필요'}</span>
        {application.entityId?<Button size="xs" onClick={showTask}>연결된 할 일</Button>:null}
        {!['saved','rejected'].includes(application.state)&&<Button size="xs" onClick={()=>apply(state.applyInput)} disabled={state.pending}>같은 명령으로 저장 확인</Button>}
      </div>}
      {!!state.requests.length&&<details><summary>이 업무의 요청 기록 ({state.requests.length})</summary><ul className={styles.history}>{state.requests.map(item=><li key={item.requestId}><Button size="xs" variant="ghost" onClick={()=>inspect(item.requestId)} disabled={state.pending || receipt?.status==='unsaved' || state.applicationUnknown}>{new Date(item.createdAt).toLocaleString('ko-KR')} · {item.expired?'본문 만료':({generated:'초안 저장됨',running:'처리 중',unknown:'확인 필요',error:'생성 실패'}[item.state]||item.state)}</Button></li>)}</ul>
        {state.nextCursor&&<Button size="xs" onClick={async()=>{const list=await readOfficeWorkflow(`requests?${query}&cursor=${encodeURIComponent(state.nextCursor)}`);if(Array.isArray(list.requests))patch(current=>({requests:[...current.requests,...list.requests.filter(item=>!current.requests.some(old=>old.requestId===item.requestId))],nextCursor:list.nextCursor||null}));else patch({note:officeWorkflowNote(list)});}}>이전 요청 더 보기</Button>}
      </details>}
      <p className={styles.meta}>초안 생성·복사는 실제 연락이나 업무 완료를 기록하지 않습니다.</p>
    </div>}
    {state.taskFields&&<EditDrawer title="Office 제안을 할 일로 연결" subtitle="같은 범위의 프로젝트에 저장합니다." record={state.taskFields} presentation="compact" onChange={(field,value)=>patch(current=>({taskFields:{...current.taskFields,[field]:value}}))} onClose={()=>patch({taskFields:null})} onSave={saveTask} saveLabel="할 일 등록" fields={[
      {key:'title',label:'할 일',type:'text',required:true},{key:'projectId',label:'프로젝트',type:'select',options:[{value:'',label:'프로젝트 선택'},...state.projects.map(project=>({value:project.id,label:project.name}))]},
      {key:'dueAt',label:'기한',inputType:'date',optional:true},{key:'nextAction',label:'다음 행동',type:'text',optional:true},{key:'description',label:'상세',type:'textarea',optional:true},
    ]}><p className={styles.note}>저장 확인이 끊기면 새 할 일을 만들지 않고 같은 명령을 확인합니다.</p></EditDrawer>}
  </section>;
}
