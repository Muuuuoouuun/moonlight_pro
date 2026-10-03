'use client';
import React from 'react';
import { officeConnectionBinding, officeConnectionHumanCurrent } from '@com-moon/agent-contracts/office-connection';
import { officeConnectionInbox } from './office-connection-inbox.js';
import { OfficeConnectionBrandPicker } from './office-connection-source.jsx';
import { Button, CheckboxRow, SelectField, TextAreaField, TextField } from './hub-primitives';
import styles from './office-commander.module.css';
const lines = value => (value || '').split('\n').map(x => x.trim()).filter(Boolean);

export function OfficeCommanderBoundaryControl({ snapshot, disabled, onAction }) {
  const [open, setOpen] = React.useState(false);
  return <details className={styles.details} onToggle={event => setOpen(event.currentTarget.open)}><summary>이번 요청의 출처 브랜드</summary>
    <p className={styles.note}>원문을 연결하려면 회사·개인과 브랜드를 먼저 고릅니다. 선택을 바꾸면 이전 결과 원문을 보존하고 검토·입력·인계를 다시 확인합니다.</p>
    {open ? <OfficeConnectionBrandPicker scope={snapshot.scope} value={snapshot.boundary?.brandId} disabled={disabled} onChange={({brandId}) => onAction('set_boundary', null, {boundary:{scope:snapshot.scope,brandId}})} /> : null}
  </details>;
}
export function OfficeCommanderConnectionPanel({ task, snapshot, disabled, onAction, draft, onDraft, inbox = officeConnectionInbox }) {
  const subscribe = React.useCallback(listener => inbox.subscribe(listener), [inbox]);
  const read = React.useCallback(() => inbox.get(snapshot?.scope), [inbox,snapshot?.scope]);
  const sources = React.useSyncExternalStore(subscribe,read,read);
  return <OfficeCommanderConnectionControls task={task} snapshot={snapshot} disabled={disabled} onAction={onAction} draft={draft} onDraft={onDraft} sources={sources} onRemove={id=>inbox.remove(id)}/>;
}
export function OfficeCommanderConnectionControls({task,snapshot,disabled,onAction,draft,onDraft,sources=[],onRemove=()=>{}}){
  if (!snapshot) return null;
  const form = draft.connection || {}, source = sources.find(item => item.id === form.sourceId), c = task.connection;
  const patch = value => onDraft({connection:{...form,...value}});
  const sameBoundary = source && snapshot.boundary && source.boundary.scope === snapshot.boundary.scope && source.boundary.brandId === snapshot.boundary.brandId;
  const connect = () => onAction('prepare_connection',task.id,{source,inputSummary:form.inputSummary||'',excerpt:form.excerpt||'',completionCriteria:lines(form.criteria),roleInputs:(draft.depth?.ownerId===task.ownerId?draft.depth.inputs:null)||task.brief?.inputs||{}});
  const acknowledge = decision => onAction('ack_connection',task.id,{binding:officeConnectionBinding(c),decision,sourcesReviewed:form.reviewedFor===officeConnectionBinding(c),findingsAcknowledged:form.reviewedFor===officeConnectionBinding(c),reason:form.reason||''});
  return <details className={styles.details}><summary>고객·회의 결과를 이 업무의 입력으로 연결</summary>
    <p className={styles.note}>원문을 생성한 화면의 ‘이브이에게 입력 공유’로 넣은 세션 자료만 선택합니다. 기존 초안 승인·실행 권한은 상속하지 않습니다.</p>
    {!snapshot.boundary ? <p className={styles.note}>이번 요청의 출처 브랜드를 먼저 확인해 주세요.</p> : null}
    <SelectField label="받을 고객·회의 원문" value={form.sourceId||''} disabled={disabled} options={[{value:'',label:'세션 입력 선택'},...sources.map(item=>({value:item.id,label:item.label}))]} onChange={event=>patch({sourceId:event.target.value,reviewedFor:null})}/>
    {source?<Button variant="ghost" size="sm" disabled={disabled} onClick={()=>{onRemove(source.id);patch({sourceId:'',reviewedFor:null});}}>선택 원문을 세션 목록에서 제거</Button>:null}
    {!sources.length ? <p className={styles.note}>공유된 원문이 없습니다. 고객 대응이나 관점 회의 결과에서 현재 원문을 먼저 공유해 주세요.</p> : null}
    {source&&!sameBoundary ? <p className={styles.note} role="alert">선택 원문의 브랜드·회사/개인 범위가 다릅니다. 현재 업무로 연결할 수 없습니다.</p> : null}
    <TextAreaField label="인계에서 사용할 원문 부분 · 정확 인용" rows={3} maxLength={1000} value={form.excerpt||''} disabled={disabled} onChange={event=>patch({excerpt:event.target.value,reviewedFor:null})}/>
    <TextField label="이 담당이 사용할 입력 요약" maxLength={500} value={form.inputSummary||''} disabled={disabled} onChange={event=>patch({inputSummary:event.target.value,reviewedFor:null})}/>
    <TextAreaField label="인계 결과의 완료 기준 · 최대 세 개" rows={2} maxLength={750} value={form.criteria||''} disabled={disabled} onChange={event=>patch({criteria:event.target.value,reviewedFor:null})}/>
    <p className={styles.note}>위 전문 입력의 역할별 항목을 먼저 적습니다. 자료가 부족하면 확인 대기로 남습니다.</p>
    <Button variant="outline" size="sm" disabled={disabled||!sameBoundary||!task.ownerId||!form.excerpt?.trim()||!form.inputSummary?.trim()||!lines(form.criteria).length} onClick={connect}>현재 원문을 입력으로 연결</Button>
    {c ? <div className={styles.source}><strong>연결된 결과 원문</strong><pre className={styles.body}>{c.body}</pre>
      <details className={styles.details}><summary>자료 후보·확인 질문·현재 고객/회의 원자료</summary>{c.kind==='customer_reply'?<><strong>자료 후보 · 존재 미확인</strong>{c.sourceSnapshot.result.customerPreparation.materials.map((item,i)=><p className={styles.note} key={'material-'+i}>{item.title} · {item.reason}</p>)}<strong>확인 질문</strong>{c.sourceSnapshot.result.customerPreparation.questions.map((question,i)=><p className={styles.note} key={'question-'+i}>{question}</p>)}<strong>현재 고객 원자료</strong><pre className={styles.body}>{JSON.stringify(c.sourceSnapshot.context.facts,null,2)}</pre></>:<><strong>요청과 공개 회의 원문</strong><pre className={styles.body}>{JSON.stringify(c.sourceSnapshot,null,2)}</pre></>}</details>
      <p className={styles.note}>원문 버전 {c.artifact.revision} · {c.review.status==='failed'?'검토 결함 · 사용자 확인':c.review.status==='advisory_pass'?'검토 권고 · 사용자 확인':'의미 모델 미연결 · 사용자 확인'} · 독립 검증·실행 승인 아님</p>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={()=>onAction('check_connection_review',task.id,{})}>의미 검토 연결 상태 확인</Button>
      {c.review.findings.map((finding,i)=><p className={styles.note} key={i}>{finding}</p>)}
      <CheckboxRow text="현재 브랜드·원문·입력·검토 한계를 직접 확인했습니다" checked={form.reviewedFor===officeConnectionBinding(c)} disabled={disabled} onChange={reviewed=>patch({reviewedFor:reviewed?officeConnectionBinding(c):null})}/>
      <TextField label="수신 판단과 남은 조건" value={form.reason||''} maxLength={500} disabled={disabled} onChange={event=>patch({reason:event.target.value})}/>
      <div className={styles.actions}><Button variant="outline" size="sm" disabled={disabled||officeConnectionHumanCurrent(c)||form.reviewedFor!==officeConnectionBinding(c)||!form.reason?.trim()} onClick={()=>acknowledge('accepted_for_draft')}>초안 작업의 입력으로 수락</Button><Button variant="ghost" size="sm" disabled={disabled||form.reviewedFor!==officeConnectionBinding(c)||!form.reason?.trim()} onClick={()=>acknowledge('rejected')}>입력 반려</Button></div>
      <p className={styles.note}>수락은 이 담당의 초안을 준비할 입력 확인입니다. 결과 원문 검토와 실제 할 일 확인은 뒤에서 따로 합니다. 실제 연락·게시·일정 변경은 하지 않습니다.</p>
    </div> : null}
  </details>;
}
