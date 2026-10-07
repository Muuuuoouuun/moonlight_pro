'use client';
import React from 'react';
import {OFFICE_ROSTER} from '@com-moon/agent-contracts/office';
import {OFFICE_COMMANDER_SPECIALISTS,officeCommanderReviewBinding,officeCommanderReviewCurrent} from '@com-moon/agent-contracts/office-commander';
import {Button,CheckboxRow,LifecycleBadge,SelectField,TextAreaField,TextField,TruthBadge} from './hub-primitives';
import {OfficeAvatar} from './office-avatar';
import {OfficeCommanderConnectionPanel,OfficeCommanderBoundaryControl} from './office-commander-connection-panel';
import {officeConnectionHumanCurrent} from '@com-moon/agent-contracts/office-connection';
import {OfficeRoleDepthPanel} from './office-role-depth-panel';
import {createOfficeCommanderController} from './office-commander-client';
import styles from './office-commander.module.css';
const ownerOptions=[{value:'',label:'담당 확인 필요'},...OFFICE_ROSTER.filter(p=>OFFICE_COMMANDER_SPECIALISTS.includes(p.id)).map(p=>({value:p.id,label:`${p.name} · ${p.role}`}))];
const taskLabels={needs_user:'담당 확인 필요',queued_shadow:'분담 제안',working_shadow:'진행 표시 · shadow',blocked:'확인 대기',failed:'실패 표시',result_provided:'원문 검토 대기',reviewed_shadow:'결과 검토됨 · shadow',cancelled:'취소됨'};
const lifecycle={needs_user:'waiting',queued_shadow:'queued',working_shadow:'active',blocked:'blocked',failed:'blocked',result_provided:'waiting',reviewed_shadow:'waiting',cancelled:'cancelled'};
const rootLabels={needs_user:'사용자 확인 필요',active_shadow:'전문 결과 준비 중 · shadow',partial_shadow:'부분 결과 · 확인 대기 있음',ready_shadow:'검토한 결과 취합 가능',compiled_shadow:'검토한 결과 취합안',cancelled:'이 요청 취소됨'};
const blankView={snapshot:null,pending:false,error:null,retryRequest:null,gate:null};
const lines=text=>text.split('\n').map(x=>x.trim()).filter(Boolean);
export function OfficeCommanderGoalEditor({snapshot,value,disabled,onChange,onAction}){
  return <div className={styles.actions}><TextField label={snapshot.goal?'이번 목표 정정':'목표 확인'} value={value} maxLength={300} disabled={disabled} onChange={event=>onChange(event.target.value)}/><Button variant="outline" disabled={disabled||!value.trim()||value.trim()===snapshot.goal} onClick={()=>onAction('set_goal',null,{goal:value})}>{snapshot.goal?'이 목표로 정정':'이 목표로 정리'}</Button></div>;
}
export function OfficeCommanderTask({task,tasks,snapshot,busy,onAction,draft,onDraft}){
  const current=officeCommanderReviewCurrent(task),hasCurrentResult=task.result?.ownerId===task.ownerId&&task.result?.epoch===task.epoch;
  const owner=OFFICE_ROSTER.find(p=>p.id===task.ownerId),disabled=busy||task.state==='cancelled';
  return <article className={styles.task} aria-label={task.title}>
    <header className={styles.taskHeader}><div><strong>{task.title}</strong><p className={styles.note}>{owner?`${owner.name} · ${owner.role}`:'이브이가 담당 확인을 기다립니다.'}</p></div><LifecycleBadge state={lifecycle[task.state]} label={taskLabels[task.state]}/></header>
    {task.error?<p className={styles.note} role="status">{task.error}</p>:null}
    <SelectField label="결과 담당 한 명" options={ownerOptions} value={task.ownerId||''} disabled={disabled} onChange={event=>{if(event.target.value)onAction('assign_owner',task.id,{ownerId:event.target.value});}}/>
    <OfficeCommanderConnectionPanel task={task} snapshot={snapshot} disabled={disabled} onAction={onAction} draft={draft} onDraft={onDraft}/>
    <OfficeRoleDepthPanel task={task} tasks={tasks} snapshot={snapshot} disabled={disabled} onAction={onAction} draft={draft} onDraft={onDraft}/>
    <details className={styles.details}><summary>선행 업무·막힘·실패</summary>
      <SelectField label="먼저 검토할 업무" value={task.dependencies[0]||''} options={[{value:'',label:'선행 업무 없음'},...tasks.filter(t=>t.id!==task.id).map(t=>({value:t.id,label:t.title}))]} disabled={disabled} onChange={event=>onAction('set_dependencies',task.id,{dependencies:event.target.value?[event.target.value]:[]})}/>
      <TextField label="확인이 필요한 이유" value={draft.reason||''} maxLength={600} onChange={event=>onDraft({reason:event.target.value})} disabled={disabled}/>
      <div className={styles.actions}><Button variant="outline" size="sm" disabled={disabled||!draft.reason?.trim()} onClick={()=>onAction('block',task.id,{reason:draft.reason})}>막힘 표시</Button><Button variant="ghost" size="sm" disabled={disabled||!draft.reason?.trim()} onClick={()=>onAction('fail',task.id,{reason:draft.reason})}>실패 표시</Button></div>
    </details>
    <div className={styles.actions}>{['queued_shadow','blocked'].includes(task.state)?<Button variant="outline" size="sm" disabled={disabled||!task.ownerId} onClick={()=>onAction('start',task.id)}>착수 표시</Button>:null}{['failed','blocked'].includes(task.state)?<Button variant="ghost" size="sm" disabled={disabled} onClick={()=>onAction('retry',task.id)}>다시 준비 대기</Button>:null}<Button variant="ghost" size="sm" disabled={disabled} onClick={()=>onAction('cancel_task',task.id)}>이 업무 취소</Button></div>
    {task.result?<div className={styles.source}><strong>전달받은 결과 원문</strong><pre className={styles.body}>{task.result.body}</pre><p className={styles.note}>근거 참조 · {task.result.evidence.join(' · ')||'확인 필요'}</p>{task.result.uncertainties.length?<p className={styles.note}>미확인 · {task.result.uncertainties.join(' · ')}</p>:null}{!hasCurrentResult?<p className={styles.note}>담당·목표·선행 조건이 바뀌었습니다. 이 원문을 보존하고 새 결과를 다시 기록해 주세요.</p>:null}
      <CheckboxRow text="현재 결과와 원문·근거를 직접 검토했습니다" checked={draft.reviewed===true} disabled={disabled||!hasCurrentResult||current} onChange={checked=>onDraft({reviewed:checked})}/>
      <Button variant="outline" size="sm" disabled={disabled||!hasCurrentResult||current||draft.reviewed!==true||!task.result.evidence.length||Boolean(task.connection&&!officeConnectionHumanCurrent(task.connection))} onClick={()=>onAction('review_result',task.id,{binding:officeCommanderReviewBinding(task),reviewedSources:true})}>이 결과 검토 확인</Button><p className={styles.note}>세션 검토 표시입니다. 독립 사실 인증·업무 실행 승인이 아닙니다.</p>
    </div>:null}
    {!task.brief?<details className={styles.details}><summary>{task.result?'수정 결과 기록':'전달받은 결과 원문 기록'}</summary>
      <TextAreaField label="담당 결과 원문" rows={3} value={draft.body||''} maxLength={4000} disabled={disabled} onChange={event=>onDraft({body:event.target.value,reviewed:false})}/>
      <TextAreaField label="근거 참조 · 한 줄에 하나" rows={2} value={draft.evidence||''} maxLength={1500} disabled={disabled} onChange={event=>onDraft({evidence:event.target.value,reviewed:false})}/>
      <TextAreaField label="미확인 사항 · 한 줄에 하나" rows={2} value={draft.uncertainties||''} maxLength={1500} disabled={disabled} onChange={event=>onDraft({uncertainties:event.target.value,reviewed:false})}/>
      <Button variant="outline" size="sm" disabled={disabled||!task.ownerId||!draft.body?.trim()} onClick={()=>onAction('record_result',task.id,{body:draft.body,evidence:lines(draft.evidence||''),uncertainties:lines(draft.uncertainties||'')})}>결과 원문 기록</Button>
    </details>:null}
  </article>;
}
export function OfficeCommander({scope='all'}){
  const [pickedScope,setPickedScope]=React.useState('');const effectiveScope=['classin','personal'].includes(scope)?scope:pickedScope;
  const [,setView]=React.useState(blankView),[drafts,setDrafts]=React.useState({}),[taskDrafts,setTaskDrafts]=React.useState({}),[copyNote,setCopyNote]=React.useState('');
  const controllers=React.useRef({}),activeScope=React.useRef(effectiveScope),alive=React.useRef(true);activeScope.current=effectiveScope;
  React.useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  if(effectiveScope&&!controllers.current[effectiveScope])controllers.current[effectiveScope]=createOfficeCommanderController({onChange:next=>{if(alive.current&&activeScope.current===effectiveScope)setView(next);}});
  const controller=controllers.current[effectiveScope],view=controller?.value()||blankView;
  React.useEffect(()=>{setView(controller?.value()||blankView);setCopyNote('');},[controller]);
  const input=drafts[effectiveScope]||{goal:'',source:''},patchInput=changes=>setDrafts(all=>({...all,[effectiveScope]:{...input,...changes}}));const snapshot=view.snapshot;
  const intake=async()=>{setCopyNote('');await controller?.intake({scope:effectiveScope,goal:input.goal,source:input.source,boundary:effectiveScope==='classin'?{scope:effectiveScope,brandId:null}:null});};
  const action=async(type,taskId,payload={})=>{setCopyNote('');const ok=await controller?.act(type,taskId,payload);if(ok&&taskId)setTaskDrafts(all=>({...all,[taskId]:{...all[taskId],reviewed:false}}));};
  const cancel=()=>controller?.cancel();const retry=()=>controller?.retry();const reset=()=>{controller?.reset();setCopyNote('');};
  const copyReport=async()=>{try{await navigator.clipboard.writeText(snapshot.report.body);setCopyNote('취합안을 복사했습니다.');}catch{setCopyNote('복사하지 못했습니다. 원문을 선택해 복사해 주세요.');}};
  return <section className={styles.page}>
    <header className={styles.header}><OfficeAvatar agentId="eevee"/><div><h2 className={styles.title}>이브이 커맨더</h2><p className={styles.note}>요청을 정리하고 전문 담당의 결과·막힘을 모아 다음 결정을 준비합니다.</p></div></header>
    <div className={styles.truth}><TruthBadge state="preview" label="Shadow · 세션 자료"/><span className={styles.note}>이 화면에만 남습니다 · 모델 호출 0 · 운영 업무 변경 없음</span></div>
    {!['classin','personal'].includes(scope)?<SelectField label="이번 요청의 업무 범위" value={pickedScope} onChange={event=>setPickedScope(event.target.value)} options={[{value:'',label:'범위 먼저 선택'},{value:'classin',label:'회사'},{value:'personal',label:'개인'}]}/>:null}
    {!snapshot?<div className={styles.intake}><TextField label="이번에 얻을 결과" value={input.goal} maxLength={300} disabled={!effectiveScope||view.pending} onChange={event=>patchInput({goal:event.target.value})}/><TextAreaField label="요청 원문 · 결과를 한 줄씩, 최대 세 개" rows={3} value={input.source} maxLength={4000} disabled={!effectiveScope||view.pending} onChange={event=>patchInput({source:event.target.value})}/><div className={styles.actions}><Button variant="primary" disabled={!effectiveScope||view.pending||!input.source.trim()} onClick={intake}>{view.pending?'분담안 확인 중…':'업무 분담안 만들기'}</Button>{view.pending?<Button variant="ghost" onClick={cancel}>요청 취소</Button>:null}</div><p className={styles.note}>한 번에 결과 세 개까지 분담합니다. 목표·담당이 모호하면 이브이가 사용자 확인 대기로 남깁니다.</p></div>:<>
      <div className={styles.summary}><strong>{rootLabels[snapshot.state]}</strong><p className={styles.note}>{snapshot.goal||'이번에 얻을 결과를 확인해 주세요.'}</p><span className={styles.note}>전문 담당 결과 {snapshot.tasks.filter(officeCommanderReviewCurrent).length}/{snapshot.tasks.length} 검토 · 이브이 총괄</span></div>
      {!snapshot.goal?<OfficeCommanderGoalEditor snapshot={snapshot} value={input.goal} disabled={view.pending||snapshot.cancelled} onChange={goal=>patchInput({goal})} onAction={action}/>:null}
      <OfficeCommanderBoundaryControl snapshot={snapshot} disabled={view.pending||snapshot.cancelled} onAction={action}/>
      <div className={styles.tasks}>{snapshot.tasks.map(task=><OfficeCommanderTask key={task.id} task={task} tasks={snapshot.tasks} snapshot={snapshot} busy={view.pending||snapshot.cancelled} onAction={action} draft={taskDrafts[task.id]||{}} onDraft={changes=>setTaskDrafts(all=>({...all,[task.id]:{...all[task.id],...changes}}))}/>)}</div>
      <div className={styles.actions}><Button variant="primary" disabled={view.pending||snapshot.cancelled||!snapshot.goal} onClick={()=>action('compile_report')}>이브이 결과 취합</Button><Button variant="ghost" disabled={snapshot.cancelled} onClick={cancel}>이 요청 취소</Button><Button variant="ghost" disabled={view.pending} onClick={reset}>새 요청</Button></div>
      {snapshot.report?<section className={styles.report} aria-label="이브이 취합안"><strong>{snapshot.report.complete?'검토한 결과 취합안':'부분 결과 취합안 · 대기 항목 포함'}</strong><pre className={styles.body}>{snapshot.report.body}</pre><Button variant="outline" size="sm" onClick={copyReport}>취합안 복사</Button>{copyNote?<p className={styles.note} role="status">{copyNote}</p>:null}</section>:null}
      <details className={styles.details}><summary>목표 정정·실행·보관 범위</summary>{snapshot.goal?<><OfficeCommanderGoalEditor snapshot={snapshot} value={input.goal} disabled={view.pending||snapshot.cancelled} onChange={goal=>patchInput({goal})} onAction={action}/><p className={styles.note}>목표를 정정하면 이전 결과 원문을 보존하고 검토 표시·전문 입력·인계는 다시 확인합니다.</p></>:null}<p className={styles.note}>이브이는 전달된 결과 원문을 취합합니다. 세션 밖 보관·전문가 모델 호출·자동 스케줄·외부 전송은 연결하지 않았습니다. 새 요청은 현재 세션의 취합안을 대신합니다.</p><Button variant="outline" size="sm" disabled={view.pending||snapshot.cancelled} onClick={()=>action('check_execution')}>자동 실행 조건 확인</Button>{view.gate?<p className={styles.note} role="status">{view.gate.reason} · 비용 확인 필요</p>:null}</details>
    </>}
    {view.error?<div className={styles.error} role="alert"><TruthBadge state="error"/><p>{view.error}</p>{view.retryRequest?<Button variant="outline" size="sm" disabled={view.pending} onClick={retry}>같은 요청 다시 확인</Button>:null}</div>:null}
  </section>;
}
