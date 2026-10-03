"use client";

import React from 'react';
import {Button,Card,EmptyState,Skeleton,TruthBadge} from '../hub-primitives';
import {OfficeWorkflowPanel} from '../office-workflow-panel';
import {readOfficeRequestLink} from '../office-workflow-client';

const notices={
  invalid:['요청 링크를 확인해 주세요','펫의 Office 작업 목록에서 요청을 다시 열어 주세요.'],
  error:['Office 요청을 읽지 못했어요','이 요청을 확인할 수 없습니다. 연결 상태를 확인하고 다시 불러와 주세요.'],
  unauthorized:['Hub 로그인이 필요해요','로그인한 뒤 이 요청으로 돌아올 수 있습니다.'],
  preview:['Office 저장 연결이 필요해요','업무 자료와 요청 저장소 연결을 확인해 주세요.'],
};

export function OfficeRequestReadState({state,onRetry,onNavigate,onLogin}) {
  if(state.status==='loading')return <Card><Skeleton lines={3} label="지정한 Office 요청 확인 중" /></Card>;
  if(state.status==='ready')return null;
  const [title,description]=notices[state.status]||notices.error;
  return <Card><TruthBadge state={state.status==='preview'?'preview':'error'} /><EmptyState icon={state.status==='preview'?'link':'x'} title={title} description={description}
    action={<Button variant="outline" onClick={state.status==='invalid'?()=>onNavigate?.('dashboard/agents/office-council'):state.status==='unauthorized'?onLogin:onRetry}>{state.status==='invalid'?'Office 열기':state.status==='unauthorized'?'로그인':'다시 불러오기'}</Button>} /></Card>;
}

export function OfficeRequest({requestId,onNavigate}) {
  const [state,setState]=React.useState({status:'loading'}),[retry,setRetry]=React.useState(0);
  React.useEffect(()=>{
    let active=true;
    setState({status:'loading'});
    readOfficeRequestLink(requestId).then(result=>{if(active)setState(result);});
    return ()=>{active=false;};
  },[requestId,retry]);
  const shown=state.status==='ready'&&state.requestId!==requestId?.toLowerCase()?{status:'loading'}:state;
  return <div style={{padding:'var(--section-gap)',display:'grid',gap:16}}>
    <h2 style={{margin:0,fontSize:20,fontWeight:500}}>Office 요청</h2>
    <OfficeRequestReadState state={shown} onRetry={()=>setRetry(value=>value+1)} onNavigate={onNavigate}
      onLogin={()=>window.location.assign(`/login?next=${encodeURIComponent(`/dashboard/agents/office-request?request=${requestId}`)}`)} />
    {shown.status==='ready'&&<>
      <p style={{margin:0,color:'var(--fg-muted)',fontSize:12}}>{shown.input.scope==='classin'?'회사':'개인'} · {shown.input.intent==='weekly_report'?<span className="mono">{shown.input.originRef.periodStart} ~ {shown.input.originRef.periodEnd}</span>:'선택한 고객의 요청'} · <span className="mono">{shown.requestId}</span></p>
      <OfficeWorkflowPanel {...shown.input} initialRequestId={shown.requestId} title={shown.input.intent==='weekly_report'?'주간 정리':'고객 대응 준비'} onNavigate={onNavigate} />
    </>}
  </div>;
}
