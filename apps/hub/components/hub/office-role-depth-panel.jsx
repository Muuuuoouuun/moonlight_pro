'use client';
import React from 'react';
import { getOfficeRoleDepth } from '@com-moon/agent-contracts/office-role-depth';
import { officeCommanderReviewCurrent } from '@com-moon/agent-contracts/office-commander';
import { Button, CheckboxRow, SelectField, TextAreaField, TextField } from './hub-primitives';
import { officeRoleBriefFromDraft, officeRoleOutputFromDraft, officeRoleOutputDraftBinding } from './office-role-depth-client';
import styles from './office-commander.module.css';

export function OfficeRoleDepthPanel({ task, snapshot, tasks, disabled, onAction, draft, onDraft }) {
  if (!task.ownerId) return null;
  const role = getOfficeRoleDepth(task.ownerId), form = draft.depth?.ownerId === task.ownerId ? draft.depth : {};
  const patch = changes => onDraft({ reviewed: false, depth: { ...form, ...changes, ownerId: task.ownerId } });
  const outputBinding = officeRoleOutputDraftBinding(task), outputCurrent = !!outputBinding && form.outputBinding === outputBinding;
  const outputForm = outputCurrent ? form : {};
  const hasRetainedOutput = Object.values(form.fields || {}).some(Boolean) || Object.values(form.questions || {}).some(Boolean) || [form.claimText, form.uncertainties, form.nextAction, form.nextCondition, form.calculationText].some(Boolean);
  const previousOutput = !outputCurrent && hasRetainedOutput ? { fields: form.fields, questions: form.questions, claimText: form.claimText, uncertainties: form.uncertainties, status: form.status, nextAction: form.nextAction, nextCondition: form.nextCondition, outputBinding: form.outputBinding, calculationText: form.calculationText } : form.previousOutput;
  const patchOutput = changes => patch({ fields: outputForm.fields || {}, questions: outputForm.questions || {}, claimText: outputForm.claimText || '', uncertainties: outputForm.uncertainties || '', status: outputForm.status || 'draft', nextAction: outputForm.nextAction || '', nextCondition: outputForm.nextCondition || '', calculationText:outputForm.calculationText||'', previousOutput, ...changes, outputBinding });
  const submit = (type, build) => { try { const payload = build(); patch({ error: null }); onAction(type, task.id, payload); } catch (error) { patch({ error: error instanceof SyntaxError ? '주장 목록의 JSON 형식을 확인해 주세요.' : error.message }); } };
  const readySources = tasks.filter(item => item.id !== task.id && officeCommanderReviewCurrent(item));
  const inputValue = key => form.inputs?.[key] ?? task.brief?.inputs[key] ?? '';
  return <details className={styles.details}>
    <summary>전문 판단·입력·산출물·인계</summary>
    <p className={styles.note}>{role.responsibility}</p>
    <p className={styles.note}>좋은 판단 · {role.behavior.goodJudgment}</p><p className={styles.note}>피할 판단 · {role.behavior.badJudgment}</p>
    <p className={styles.note}>필요할 때 묻는 질문 · {role.behavior.exampleQuestion}</p>
    <p className={styles.note}>검토 기준 · {role.qualityChecks.join(' / ')}</p>
    <details className={styles.details}><summary>{task.brief ? '전문 입력·완료 기준 수정' : '전문 입력·완료 기준 연결'}</summary>
      {role.inputFields.map(item => <TextAreaField key={item.key} label={item.label} rows={2} maxLength={500} value={inputValue(item.key)} disabled={disabled} onChange={event => patch({ inputs: { ...Object.fromEntries(role.inputFields.map(field => [field.key, inputValue(field.key)])), [item.key]: event.target.value } })}/>)}
      <TextAreaField label="직접 제공할 원문 자료 · 이 범위에서만 사용" rows={3} maxLength={1000} value={form.source ?? task.brief?.sources[0]?.excerpt ?? ''} disabled={disabled} onChange={event => patch({ source: event.target.value })}/>
      <TextAreaField label="이번 완료 기준 · 한 줄에 하나, 최대 세 개" rows={2} maxLength={750} value={form.criteria ?? task.brief?.completionCriteria.join('\n') ?? ''} disabled={disabled} onChange={event => patch({ criteria: event.target.value })}/>
      <TextAreaField label="지킬 제약 · 한 줄에 하나, 최대 세 개" rows={2} maxLength={750} value={form.constraints ?? task.brief?.constraints.join('\n') ?? ''} disabled={disabled} onChange={event => patch({ constraints: event.target.value })}/>
      <Button variant="outline" size="sm" disabled={disabled || !snapshot?.goal} onClick={() => submit('set_role_brief', () => ({ brief: officeRoleBriefFromDraft(task, snapshot, form) }))}>전문 입력 연결</Button><p className={styles.note}>입력이 부족해도 빈칸으로 보존합니다. 입력을 바꾸면 기존 결과 검토는 해제됩니다.</p>
    </details>
    {task.brief ? <details className={styles.details}><summary>전달받은 전문 산출물 기록</summary>
      {previousOutput ? <details className={styles.details}><summary>이전 버전 입력 보존 · 현재 자료 대조 필요</summary><pre className={styles.body}>{[...role.outputFields.filter(item => previousOutput.fields?.[item.key]).map(item => `${item.label}\n${previousOutput.fields[item.key]}`), ...role.inputFields.filter(item => previousOutput.questions?.[item.key]).map(item => `${item.label} · 이전 질문\n${previousOutput.questions[item.key]}`), previousOutput.uncertainties ? `이전 미확인\n${previousOutput.uncertainties}` : null, previousOutput.claimText ? `이전 주장 원문\n${previousOutput.claimText}` : null, previousOutput.calculationText ? `이전 정형 계산\n${previousOutput.calculationText}` : null].filter(Boolean).join('\n\n')}</pre><CheckboxRow text="이전 입력을 현재 원문·완료 기준과 대조했습니다" checked={form.reuseReviewedFor === outputBinding} disabled={disabled} onChange={checked => patch({ reuseReviewedFor: checked ? outputBinding : null })}/><Button variant="outline" size="sm" disabled={disabled || form.reuseReviewedFor !== outputBinding} onClick={() => patchOutput({ ...previousOutput, previousOutput: null, reuseReviewedFor: null })}>대조한 이전 입력 불러오기</Button></details> : null}
      <SelectField label="전문 결과 상태" value={outputForm.status || 'draft'} disabled={disabled} options={[{ value: 'draft', label: '검토할 초안' }, { value: 'needs_input', label: '필요한 입력 확인' }]} onChange={event => patchOutput({ status: event.target.value })}/>
      {role.outputFields.map(item => <TextAreaField key={item.key} label={item.label} rows={3} maxLength={1000} value={outputForm.fields?.[item.key] || ''} disabled={disabled} onChange={event => patchOutput({ fields: { ...outputForm.fields, [item.key]: event.target.value } })}/>)}
      {outputForm.status === 'needs_input' ? role.inputFields.map(item => <TextField key={item.key} label={`${item.label} · 필요한 질문`} maxLength={250} value={outputForm.questions?.[item.key] || ''} disabled={disabled} onChange={event => patchOutput({ questions: { ...outputForm.questions, [item.key]: event.target.value } })}/>) : null}
      <TextAreaField label="미확인 사항 · 한 줄에 하나, 최대 네 개" rows={2} maxLength={1000} value={outputForm.uncertainties || ''} disabled={disabled} onChange={event => patchOutput({ uncertainties: event.target.value })}/>
      <TextField label="이 담당의 다음 행동 제안 · 선택" maxLength={400} value={outputForm.nextAction || ''} disabled={disabled} onChange={event => patchOutput({ nextAction: event.target.value })}/><TextField label="다음 행동이 필요한 조건 · 선택" maxLength={300} value={outputForm.nextCondition || ''} disabled={disabled} onChange={event => patchOutput({ nextCondition: event.target.value })}/>
      <details className={styles.details}><summary>사실·추론·제안의 원문 연결 · 선택</summary><p className={styles.note}>원문 참조 {task.brief.sources.map(source => source.id).join(' · ') || '없음'} · 사실은 정확 인용, 추론은 이유·가정이 필요합니다. 인용 연결이 의미 정확성을 보장하지 않습니다.</p><TextAreaField label="구조화된 주장 목록 JSON · 최대 네 개" rows={3} maxLength={6000} value={outputForm.claimText || ''} disabled={disabled} onChange={event => patchOutput({ claimText: event.target.value })}/><p className={styles.note}>각 항목: kind(fact/inference/proposal), text, sourceIds(목록), quote(원문 인용 또는 null), reason(추론 이유 또는 null)</p></details>
      <details className={styles.details}><summary>정형 시간 계산 · 선택</summary><TextAreaField label="정수 분 단위의 계산 목록 JSON · 최대 세 개" rows={3} maxLength={3000} value={outputForm.calculationText||''} disabled={disabled} onChange={event=>patchOutput({calculationText:event.target.value})}/><p className={styles.note}>kind=net_time, basis=estimated 또는 observed, weeks, savedMinutesPerWeek, setupMinutes, maintenanceMinutesPerWeek, firstPeriodMinutes, repeatedPeriodMinutes를 제공합니다. 입력 산식 결과만 확인하며 원자료의 진실성과 자유 본문 숫자는 인증하지 않습니다.</p></details>
      <Button variant="outline" size="sm" disabled={disabled || !outputCurrent} onClick={() => submit('record_specialist_result', () => ({ output: officeRoleOutputFromDraft(task, outputForm) }))}>전문 산출물 기록</Button><p className={styles.note}>담당이 실제 생성하거나 실행한 증거가 아닙니다. 전달받은 초안을 입력하고 직접 검토합니다.</p>
    </details> : null}
    {readySources.length ? <details className={styles.details}><summary>현재 원문을 수신 인계로 연결</summary>
      <SelectField label="받을 선행 결과" value={form.fromTaskId || ''} disabled={disabled} options={[{ value: '', label: '검토된 원문 선택' }, ...readySources.map(item => ({ value: item.id, label: item.title }))]} onChange={event => patch({ fromTaskId: event.target.value })}/>
      <SelectField label="이 담당의 수신 응답" value={form.ackStatus || 'accepted'} disabled={disabled} options={[{ value: 'accepted', label: '담당 범위로 수락' }, { value: 'needs_input', label: '입력 확인 필요' }, { value: 'rejected_out_of_scope', label: '담당 범위 밖' }]} onChange={event => patch({ ackStatus: event.target.value })}/>
      <TextAreaField label="수신 원문에서 사용할 입력" rows={2} maxLength={500} value={form.ackInput || ''} disabled={disabled} onChange={event => patch({ ackInput: event.target.value })}/><TextField label="수신 응답 이유" maxLength={500} value={form.ackReason || ''} disabled={disabled} onChange={event => patch({ ackReason: event.target.value })}/>
      <Button variant="outline" size="sm" disabled={disabled || !form.fromTaskId} onClick={() => submit('ack_handoff', () => ({ fromTaskId: form.fromTaskId, ack: { status: form.ackStatus || 'accepted', toOwnerId: task.ownerId, consumedResultBinding: readySources.find(item => item.id === form.fromTaskId)?.review.binding, inputSummary: form.ackInput || '', reason: form.ackReason || '' } }))}>수신 응답 연결</Button><p className={styles.note}>수락한 현재 원문만 선행 조건으로 연결합니다. 새 업무·모델 호출은 만들지 않습니다.</p>
    </details> : null}
    {task.handoffAcks?.map(ack => <p className={styles.note} key={ack.fromTaskId}>수신 · {ack.status === 'accepted' ? '수락' : ack.status === 'needs_input' ? '입력 확인 필요' : '담당 범위 밖'} · {ack.inputSummary} · {ack.reason}</p>)}
    {form.error ? <p className={styles.note} role="alert">{form.error}</p> : null}
  </details>;
}
