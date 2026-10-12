import React from 'react';
import { Button, CheckboxRow, LifecycleBadge } from './hub-primitives';
import { officeCustomerApprovalCurrent, officeCustomerCallSummary, officeCustomerStage } from './office-customer-preparation-client.js';
import styles from './office-workflow-panel.module.css';

export function OfficeCustomerContext({ context }) {
  const customer = context.facts?.customer;
  const activities = Array.isArray(context.facts?.activities) ? context.facts.activities : [];
  return <details className={styles.comparison}>
    <summary>현재 확인한 고객 원문 · {context.sourceRefs?.length || 0}건</summary>
    <div className={styles.stack}>
      <p className={styles.meta}>조회 기준 <span className="mono">{context.asOf}</span> · 직접 연결된 최근 기록 최대 5건</p>
      {customer && <div className={styles.note}>
        <strong>{customer.name || '선택한 고객'}</strong>
        <p>단계: {customer.stage || '미확인'} · 다음 행동: {customer.nextAction || '미확인'}</p>
        <p>다음 연락 날짜: {customer.nextContactAt || '미확인'}</p>
      </div>}
      {activities.map(item => <blockquote key={item.id} className={styles.sourceQuote}>
        <p className={styles.meta}>{item.kind} · <span className="mono">{item.occurredAt || '날짜 미확인'}</span></p>
        <p className={styles.body}>{item.body || '본문이 기록되지 않았습니다.'}</p>
      </blockquote>)}
      {!activities.length && <p className={styles.note}>직접 연결된 활동 기록이 없습니다. 요청에 연락 목적과 확인된 원문을 덧붙여 주세요.</p>}
      <ul>{(context.sourceRefs || []).map(ref => <li key={ref.id}>{ref.label || ref.type} · <span className="mono">{ref.id}</span></li>)}</ul>
    </div>
  </details>;
}

export function OfficeCustomerProgress({ state }) {
  const stage = officeCustomerStage(state);
  return <div className={styles.stack} aria-live="polite">
    <LifecycleBadge state={stage.state} label={stage.label} />
    <p className={styles.meta}>{officeCustomerCallSummary(state.receipt)}</p>
  </div>;
}

export function OfficeCustomerPreparationReview({ state, onChange, onApprove, onCancel, onReject }) {
  const result = state.receipt?.result;
  const preparation = result?.customerPreparation;
  if (!preparation) return null;
  const approved = officeCustomerApprovalCurrent(state);
  const cancelled = state.cancelledRequestId === result.requestId;
  const rejected = state.rejectedRequestId === result.requestId;
  const disabled = state.context?.status !== 'ready' || state.pending || state.applicationUnknown || state.approvalBusy || Boolean(state.receipt.application?.commandId);
  const ownerChanged = Boolean(state.ownerId && state.ownerId !== result.ownerId);
  return <div className={styles.stack}>
    <p className={styles.note}><strong>이번 연락 목적</strong> · {preparation.purpose}</p>
    <details className={styles.comparison} open={preparation.questions.length > 0}>
      <summary>자료 후보 · 확인 질문</summary>
      <div className={styles.stack}>
        {preparation.materials.length ? <ul>{preparation.materials.map((item, i) => <li key={i}><strong>{item.title}</strong> · 존재·내용 미확인<p>{item.reason}</p></li>)}</ul> : <p className={styles.note}>추가 자료 제안 없음</p>}
        {preparation.questions.length ? <ul>{preparation.questions.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className={styles.note}>추가 확인 질문 없음</p>}
      </div>
    </details>
    <p className={styles.meta}>초안 기준 <span className="mono">{result.context?.asOf}</span> · {result.sourceCheck==='traced'?'원문 연결 있음':'원문 연결 확인 필요'} · AI 대조는 같은 모델의 편집 검토입니다</p>
    {state.context?.contextHash !== result.context?.contextHash && <p className={styles.note}>현재 자료와 초안의 기준 시점이 다릅니다. 할 일 등록 전에 바뀐 기록을 다시 확인합니다.</p>}
    {!approved && !cancelled && !rejected && !state.receipt.application?.commandId && <div className={styles.controls}>
      <CheckboxRow text="고객 원문·출처·답장에 담긴 약속을 확인했습니다" checked={state.reviewedSources === true} disabled={disabled} onChange={() => onChange({ reviewedSources: !state.reviewedSources })} />
      <CheckboxRow text="자료 후보의 미확인 상태와 확인 질문을 검토했습니다" checked={state.reviewedQuestions === true} disabled={disabled} onChange={() => onChange({ reviewedQuestions: !state.reviewedQuestions })} />
      <div className={styles.actions}><Button size="sm" variant="primary" onClick={onApprove} disabled={disabled || ownerChanged || !state.reviewedSources || !state.reviewedQuestions || Boolean(state.draft.trim()) || state.receipt.persistence?.persisted !== true}>{state.approvalBusy ? '승인 확인 중…' : '이 초안 승인'}</Button>
        <Button size="xs" variant="outline" onClick={onReject} disabled={disabled}>반려·수정 요청</Button>
        <Button size="xs" variant="ghost" onClick={onCancel} disabled={disabled}>이 결과 사용 취소</Button></div>
      {state.draft.trim() && <p className={styles.note}>수정 요청을 먼저 반영하거나 입력을 지운 뒤 현재 초안을 승인해 주세요.</p>}
      {ownerChanged && <p className={styles.note}>담당이 바뀌었습니다. 새 연락 목적이나 수정 내용을 적어 선택한 담당의 결과를 준비해 주세요.</p>}
    </div>}
    {approved && !state.receipt.application?.commandId && <div className={styles.actions}><Button size="xs" variant="ghost" onClick={onCancel} disabled={disabled}>초안 승인 취소</Button><span className={styles.meta}>새로고침하면 초안을 다시 검토·승인합니다</span></div>}
    {cancelled && <p className={styles.note}>이 결과를 승인하거나 할 일로 연결하지 않습니다. 새 연락 목적을 입력해 다시 준비할 수 있습니다.</p>}
    {rejected && <p className={styles.note}>반려한 초안입니다. 위 수정할 내용에 바꿀 점을 적고 수정 요청을 보내 주세요. 새 결과는 다시 원문 검토·승인합니다.</p>}
  </div>;
}
