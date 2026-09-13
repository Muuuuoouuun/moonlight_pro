"use client";
import React from 'react';
import {Card,Button,TruthBadge,LifecycleBadge,EmptyState,Drawer,SelectField,TextAreaField,Checkbox,SectionTitle} from '../hub-primitives';
import {requestCodexJobs,CODEX_JOB_LABELS,CODEX_JOB_LIFECYCLE,requiresCodexReconciliation,validCodexReconciliationNote,validCodexPrompt} from './codex-jobs-client';
const ACTIVE=new Set(['queued','running']);
const MODE_LABELS={read:'조회·검토',draft:'초안 작성',apply:'파일 수정'};
const empty={status:'loading',jobs:[],projects:[],availability:null,error:null};
const errorText=error=>({
 'agent-auth-not-configured':'Codex 연결 설정이 아직 준비되지 않았습니다.',
 'agent-scope-denied':'이 연결에 작업 권한이 없습니다.',
 'Job storage unavailable':'작업 기록 저장소에 연결하지 못했습니다.',
 'worker-offline':'실행기가 연결되지 않았습니다. 대기열에 저장하거나 연결 후 다시 시도해 주세요.',
}[error?.message]||error?.message||'작업을 확인하지 못했습니다.');
export function CodexJobsPanel(){
 const [state,setState]=React.useState(empty);
 const [projectId,setProjectId]=React.useState('');
 const [mode,setMode]=React.useState('read');
 const [prompt,setPrompt]=React.useState('');
 const [queueIfOffline,setQueue]=React.useState(false);
 const [busy,setBusy]=React.useState(false);
 const [selected,setSelected]=React.useState(null);
 const [resumePrompt,setResumePrompt]=React.useState('');
 const [reconciled,setReconciled]=React.useState(false);
 const [reconcileNote,setReconcileNote]=React.useState('');
 const [events,setEvents]=React.useState([]);
 const [notice,setNotice]=React.useState('');
 const requestRef=React.useRef(null),resumeRef=React.useRef(null),busyRef=React.useRef(false);
 const mounted=React.useRef(false);
 const load=React.useCallback(async(signal)=>{
  const results=await Promise.allSettled([requestCodexJobs('list',{}, {signal}),requestCodexJobs('projects',{}, {signal})]);
  if(signal?.aborted||!mounted.current)return;
  const errors=results.filter(r=>r.status==='rejected').map(r=>errorText(r.reason));
  const jobs=results[0].status==='fulfilled'?results[0].value:null;
  const projects=results[1].status==='fulfilled'?results[1].value:null;
  setState(prev=>({...prev,status:errors.length?'error':jobs?.status==='preview'?'preview':'live',error:errors.join(' '),...(jobs?{jobs:jobs.jobs||[]} : {}),...(projects?{projects:projects.projects||[],availability:projects.availability}: {})}));
  if(projects?.projects?.length)setProjectId(prev=>projects.projects.some(p=>p.id===prev)?prev:projects.projects[0].id);
 },[]);
 React.useEffect(()=>{mounted.current=true;const controller=new AbortController();load(controller.signal);return()=>{mounted.current=false;controller.abort();};},[load]);
 const hasActive=state.jobs.some(job=>ACTIVE.has(job.state));
 React.useEffect(()=>{
  if(!hasActive)return;
  const controller=new AbortController();const timer=setInterval(()=>{if(document.visibilityState==='visible')load(controller.signal);},10000);
  return()=>{clearInterval(timer);controller.abort();};
 },[hasActive,load]);
 const openJob=async(job)=>{
  setSelected(job);setEvents([]);setResumePrompt('');setReconciled(false);setReconcileNote('');
  try{const d=await requestCodexJobs('get',{id:job.id});if(mounted.current&&d.job)setSelected(prev=>prev?.id===job.id?d.job:prev);}catch(error){setNotice(errorText(error));}
 };
 const selectedId=selected?.id,selectedState=selected?.state;
 React.useEffect(()=>{
  if(!selectedId||!ACTIVE.has(selectedState))return;
  const source=new EventSource(`/api/hub/codex/jobs?${new URLSearchParams({action:'events',id:selectedId})}`);
  let previous=selectedState;
  source.addEventListener('update',event=>{try{const e=JSON.parse(event.data);setEvents(prev=>prev.some(x=>x.seq===e.seq)?prev:[...prev,e].slice(-30));}catch{}});
  source.addEventListener('state',async event=>{
   try{const {state:next}=JSON.parse(event.data);if(!next||next===previous)return;previous=next;
    if(!ACTIVE.has(next))source.close();
    setSelected(prev=>prev?.id===selectedId?{...prev,state:next}:prev);load();
    const d=await requestCodexJobs('get',{id:selectedId});if(mounted.current&&d.job)setSelected(prev=>prev?.id===selectedId?d.job:prev);
   }catch{setNotice('진행 상태는 확인했지만 상세 결과를 불러오지 못했습니다. 새로고침으로 다시 확인해 주세요.');}
  });
  source.addEventListener('failure',()=>{source.close();setNotice('진행 연결이 끊겼습니다. 새로고침으로 저장된 상태를 확인해 주세요.');});
  return()=>source.close();
 },[selectedId,selectedState,load]);
 const refresh=async()=>{await load();if(selected){try{const d=await requestCodexJobs('get',{id:selected.id});if(mounted.current&&d.job)setSelected(prev=>prev?.id===selected.id?d.job:prev);}catch(error){setNotice(errorText(error));}}};
 const project=state.projects.find(p=>p.id===projectId);
 const modes=project?.modes||['read'];
 const effectiveMode=modes.includes(mode)?mode:modes[0]||'read';
 const online=state.availability?.executorOnline===true;
 const runAction=async(action,input)=>{
  if(busyRef.current)return null;busyRef.current=true;setBusy(true);setNotice('');
  try{
   const d=await requestCodexJobs(action,input);
   if(!d.job){setNotice('아직 저장되지 않았습니다. 연결 상태를 확인해 주세요.');return null;}
   setSelected(d.job);setNotice(action==='cancel'?'중단을 요청했습니다. 저장된 결과는 유지됩니다.':'작업 요청이 저장되었습니다.');await load();return d;
  }catch(error){setNotice(errorText(error));return null;}
  finally{busyRef.current=false;setBusy(false);}
 };
 const submit=async event=>{
  event.preventDefault();if(!validCodexPrompt(prompt)||!project)return;
  const input={projectId,mode:effectiveMode,prompt:prompt.trim(),queueIfOffline};const fingerprint=JSON.stringify(input);
  if(requestRef.current?.fingerprint!==fingerprint)requestRef.current={fingerprint,id:crypto.randomUUID()};
  const d=await runAction('submit',{...input,requestId:requestRef.current.id});
  if(d){setPrompt('');requestRef.current=null;}
 };
 const resume=async()=>{
  const input={id:selected.id,expectedTurnCount:selected.turnCount,...(resumePrompt.trim()?{prompt:resumePrompt.trim()}:{}),...(requiresCodexReconciliation(selected)?{reconciliation:{confirmed:reconciled,note:reconcileNote.trim(),checkedThreadId:selected.threadId??null}}:{})};
  const fingerprint=JSON.stringify(input);
  if(resumeRef.current?.fingerprint!==fingerprint)resumeRef.current={fingerprint,id:crypto.randomUUID()};
  const d=await runAction('resume',{...input,requestId:resumeRef.current.id});
  if(d)resumeRef.current=null;
 };
 return <>
  <Card>
   <SectionTitle right={<div style={{display:'flex',gap:8,alignItems:'center'}}><TruthBadge state={state.status}/><Button icon="refresh" onClick={refresh} disabled={busy}>새로고침</Button></div>} subtitle="프로젝트를 고르고 작업을 맡긴 뒤, 결과와 진행 상태를 확인합니다.">Codex 작업</SectionTitle>
   {state.error?<div role="alert" style={{fontSize:12.5,color:'var(--fg-muted)',marginBottom:12}}>{state.error}</div>:null}
   {state.status==='loading'?<div role="status" style={{fontSize:12.5,color:'var(--fg-muted)'}}>연결과 작업 기록 불러오는 중…</div>:state.projects.length===0?<EmptyState icon="agents" title="연결된 Codex 실행기가 없습니다" description="로컬 실행기와 사용할 프로젝트를 연결하면 이곳에서 작업을 맡길 수 있습니다."/>:
    <form onSubmit={submit} style={{display:'grid',gap:12}}>
     <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
      <SelectField label="프로젝트" value={projectId} onChange={e=>setProjectId(e.target.value)} options={state.projects.map(p=>({value:p.id,label:p.label}))}/>
      <SelectField label="작업 범위" value={effectiveMode} onChange={e=>setMode(e.target.value)} options={modes.map(value=>({value,label:MODE_LABELS[value]||value}))}/>
     </div>
     <TextAreaField label="맡길 작업" error={prompt.trim()&&!validCodexPrompt(prompt)?'입력이 깁니다. 한글은 약 5,400자 이내로 줄여 주세요.':null} placeholder="예: 최근 변경을 검토하고 다음 작업을 정리해 줘" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={12000} required rows={3}/>
     {!online?<Checkbox checked={queueIfOffline} onChange={setQueue} label="실행기가 연결될 때까지 대기열에 저장"/>:null}
     <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><Button type="submit" variant="primary" disabled={busy||!validCodexPrompt(prompt)||!project||(!online&&!queueIfOffline)}>{busy?'저장 중…':'작업 맡기기'}</Button><span style={{fontSize:12,color:'var(--fg-muted)'}}>{online?'실행기 연결됨':'실행기 연결 대기'} · {effectiveMode==='apply'?'분리된 작업 공간의 파일을 수정합니다.':'원본 파일을 수정하지 않습니다.'}</span></div>
    </form>}
   {notice?<div role="status" style={{fontSize:12.5,marginTop:12,color:'var(--fg-muted)'}}>{notice}</div>:null}
   {state.jobs.length>0?<div style={{marginTop:18,borderTop:'1px solid var(--line-soft)'}}>{state.jobs.map(job=><button key={job.id} className="hub-row" onClick={()=>openJob(job)} style={{display:'flex',width:'100%',alignItems:'center',gap:12,padding:'12px 4px',border:0,borderBottom:'1px solid var(--line-soft)',background:'transparent',textAlign:'left'}}><span style={{flex:1,minWidth:0,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{job.promptSummary||'Codex 작업'}</span><LifecycleBadge state={CODEX_JOB_LIFECYCLE[job.state]||'waiting'} label={CODEX_JOB_LABELS[job.state]||'확인 필요'}/></button>)}</div>:state.status==='live'&&state.projects.length>0?<p style={{fontSize:12,color:'var(--fg-muted)',marginBottom:0}}>아직 맡긴 작업이 없습니다.</p>:null}
  </Card>
  {selected?<Drawer title="Codex 작업" subtitle={selected.projectId} width="min(560px, 94vw)" onClose={()=>setSelected(null)}>
   <div style={{display:'grid',gap:16,padding:20}}>
    <div style={{justifySelf:'start'}}><LifecycleBadge state={CODEX_JOB_LIFECYCLE[selected.state]||'waiting'} label={CODEX_JOB_LABELS[selected.state]||'확인 필요'}/></div>
    <div style={{fontSize:14,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{selected.promptSummary}</div>
    {selected.cancelRequestedAt&&ACTIVE.has(selected.state)?<p role="status" style={{fontSize:12.5}}>중단 요청을 전달했습니다. 실행기 확인을 기다리고 있습니다.</p>:null}
    {selected.result?.text?<div style={{fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{selected.result.text}</div>:null}
    {selected.error?<p role="alert" style={{fontSize:12.5,color:'var(--fg-muted)'}}>{typeof selected.error==='string'?selected.error: selected.error.message||selected.error.code||'실행 결과를 확인해 주세요.'}</p>:null}
    {events.length?<details><summary style={{fontSize:12.5,cursor:'pointer'}}>최근 진행 {events.length}건</summary><ul style={{fontSize:12,lineHeight:1.8,paddingLeft:18}}>{events.map(e=><li key={e.seq}>{e.payload?.message||e.payload?.text||e.type}</li>)}</ul></details>:null}
    <details><summary style={{fontSize:12.5,cursor:'pointer'}}>사용량과 작업 정보</summary><dl style={{fontSize:12,lineHeight:1.8}}><dt>입력 토큰</dt><dd className="mono">{selected.usage?.inputTokens??'제공되지 않음'}</dd><dt>출력 토큰</dt><dd className="mono">{selected.usage?.outputTokens??'제공되지 않음'}</dd><dt>작업 ID</dt><dd className="mono" style={{marginLeft:0,overflowWrap:'anywhere'}}>{selected.id}</dd></dl></details>
    {ACTIVE.has(selected.state)?<Button disabled={busy||Boolean(selected.cancelRequestedAt)} onClick={()=>runAction('cancel',{id:selected.id,expectedTurnCount:selected.turnCount})}>중단 요청</Button>:<>
     <TextAreaField label="이어갈 작업" error={resumePrompt.trim()&&!validCodexPrompt(resumePrompt)?'입력이 깁니다. 한글은 약 5,400자 이내로 줄여 주세요.':null} value={resumePrompt} onChange={e=>setResumePrompt(e.target.value)} placeholder="확인할 부분이나 다음 지시를 적어 주세요" maxLength={12000}/>
     {requiresCodexReconciliation(selected)?<><Checkbox label="변경 파일과 저장된 결과를 확인했습니다" checked={reconciled} onChange={setReconciled}/><TextAreaField label="확인한 내용" hint="확인한 변경과 중단 상태를 16자 이상 적어 주세요. 한글은 약 680자까지 저장할 수 있습니다." value={reconcileNote} onChange={e=>setReconcileNote(e.target.value)} maxLength={2000}/></>:null}
     <Button variant="primary" disabled={busy||!validCodexPrompt(resumePrompt)||(requiresCodexReconciliation(selected)&&(!reconciled||!validCodexReconciliationNote(reconcileNote)))} onClick={resume}>이어가기</Button>
    </>}
   </div>
  </Drawer>:null}
 </>;
}
