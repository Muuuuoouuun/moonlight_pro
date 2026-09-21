"use client";
import React from 'react';
import { Button, Card, EmptyState, Kbd, Progress, SelectField, Skeleton, TextAreaField, TextField, TruthBadge } from './hub-primitives';
import { goalMetricInput, goalObjectiveInput, goalObservationInput, goalWriteErrorMessage, measurementLabel, safeGoalEvidenceHref } from '@/lib/goal-client';
import { goalPeriodPreset } from '@/lib/goal-input-ux';
import { useGoalCommand, useGoalDraft } from './use-goals';
import './goals.css';

export const GOAL_SOURCE_OPTIONS = [
  { value: 'manual', label: '직접 관측·근거 기록' },
  { value: 'tasks_completed', label: '완료 상태인 할 일 · 현재 상태 기준' },
  { value: 'contacts_recorded', label: '기록한 고객 연락' },
  { value: 'content_published', label: '발행 기록' },
  { value: 'reviews_completed', label: '하루 리뷰 기록' },
];
const roles = [{ value: 'outcome', label: '결과 · 달성하려는 변화' }, { value: 'driver', label: '선행 활동 · 결과를 돕는 실행' }, { value: 'guardrail', label: '유지 기준 · 지켜야 할 한계' }];
const directions = [{ value: 'increase', label: '늘리기' }, { value: 'decrease', label: '줄이기' }, { value: 'range', label: '범위 유지' }];
export const goalScopeLabel = value => value === 'company' ? 'ClassIn' : '개인';
const dateTime = value => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '확인되지 않음';
const localInputTime = value => { const date = value ? new Date(value) : new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
function submitShortcut(event) {
  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return;
  event.preventDefault();
  const submitter = event.currentTarget.querySelector('button[type="submit"]');
  if (submitter && !submitter.disabled && !event.currentTarget.querySelector('fieldset:disabled')) event.currentTarget.requestSubmit(submitter);
}
const optionalNumber = value => value === '' || value == null ? null : Number(value);

export function GoalReadFeedback({ model, emptyTitle = '아직 목표가 없습니다', onCreate }) {
  if (model.status === 'loading') return <Skeleton lines={3} height={18} label="목표 원장 불러오는 중" />;
  if (model.status === 'error' || model.status === 'preview') return <EmptyState title={model.status === 'preview' ? '목표 저장소 연결이 필요합니다' : '목표를 불러오지 못했습니다'} description={model.status === 'preview' ? '연결하면 목표와 실제 측정 기록을 관리할 수 있습니다.' : model.error} action={<Button variant="outline" onClick={model.refresh}>다시 불러오기</Button>} />;
  if (!model.objectives.length) return <EmptyState title={emptyTitle} description="목표를 만들고, 확인 가능한 지표와 실제 업무를 연결하세요." action={onCreate ? <Button variant="primary" onClick={onCreate}>목표 만들기</Button> : undefined} />;
  return null;
}

export function GoalCommandFeedback({ command }) {
  if (command.state === 'idle') return null;
  if (command.state === 'saving') return <p role="status" className="goal-muted">저장 결과를 확인하고 있습니다…</p>;
  if (command.state === 'saved') return <p role="status" className="goal-muted">저장했습니다.</p>;
  if (command.state === 'unknown') return <section className="goal-feedback" aria-label="저장 결과 확인" role="status">
    <p>저장 여부를 아직 확인하지 못했습니다. 입력과 같은 요청 번호를 유지하고 있습니다.</p>
    {command.pending && <span className="mono goal-request-id">요청 {command.pending.commandId}</span>}
    <div className="goal-actions"><Button variant="outline" onClick={command.checkReceipt}>저장 기록 확인</Button><Button onClick={command.retry}>같은 요청 다시 보내기</Button></div>
  </section>;
  return <div className="goal-feedback" role="alert"><p>{command.state === 'conflict' ? '다른 변경이 먼저 저장됐습니다. 내 입력은 그대로 남아 있습니다. 최신 내용을 확인한 뒤 다시 저장하세요.' : command.status === 'preview' ? '저장소 연결이 필요합니다. 입력은 이 창에 보관됩니다.' : goalWriteErrorMessage(command.error)}</p></div>;
}

export function GoalMetricSummary({ metric, scope }) {
  const measurement = metric.measurement;
  const progress = metric.progress;
  const value = Number.isFinite(progress?.value) ? progress.value : null;
  const label = progress?.state === 'achieved' ? '기준 달성' : progress?.state === 'partial' ? '일부 근거 · 달성 판단 보류' : progress?.state === 'target_unset' ? '목표 기준 미설정' : progress?.state === 'unmeasured' || !measurement ? '미측정' : progress?.achieved === false ? '진행 중' : '진척률 산정 전';
  return <div className="goal-metric-summary">
    <div className="goal-actions"><span className="stat goal-measurement">{measurementLabel(metric)}</span><span className="goal-muted">{metric.direction === 'range' ? `기준 ${metric.targetMin ?? '—'}–${metric.targetMax ?? '—'}` : `목표 ${metric.target ?? '—'}`} {metric.unit}</span></div>
    <div className="goal-actions"><span>{label}</span>{value !== null && <span className="mono">{value}%</span>}</div>
    {value !== null && measurement?.coverage === 'complete' && <Progress value={value} tone="neutral" />}
    <p className="goal-muted">{GOAL_SOURCE_OPTIONS.find(item => item.value === metric.sourceKey)?.label || '출처 확인 필요'}{measurement?.observedAt ? ` · 관측 ${dateTime(measurement.observedAt)}` : ''}</p>
    {metric.sourceKey !== 'manual' && scope && <p className="goal-muted">{goalScopeLabel(scope)} 전체의 기간 내 기록을 집계합니다. 연결한 업무만의 실적은 아닙니다.</p>}
    {measurement?.coverage !== 'complete' && measurement?.reason && <p className="goal-muted">이 기간의 근거가 부족해 달성을 확정하지 않습니다.</p>}
  </div>;
}

export function GoalEvidence({ evidence = [] }) {
  if (!evidence.length) return <p className="goal-muted">연결된 측정 근거가 없습니다.</p>;
  return <ul className="goal-evidence">{evidence.map((entry, index) => {
    const href = safeGoalEvidenceHref(entry.href);
    return <li key={`${entry.href || entry.id || 'evidence'}:${index}`}>{href ? <a className="hub-row" href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{entry.label || '근거 열기'} ↗</a> : <span>{entry.label || '집계 근거'}</span>}{entry.occurredAt && <span className="mono goal-muted">{dateTime(entry.occurredAt)}</span>}</li>;
  })}</ul>;
}

export function GoalObjectiveForm({ objective, scope = 'personal', onSaved, onCancel, onBusyChange }) {
  const key = objective ? `objective:${objective.id}` : `new:${scope}`;
  const [draft, change, clear] = useGoalDraft(key, () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    return { title: objective?.title || '', description: objective?.description || '', scope: objective?.scope || scope, periodStart: objective?.periodStart || today, periodEnd: objective?.periodEnd || today, timezone: objective?.timezone || 'Asia/Seoul', status: objective?.status || 'active' };
  });
  const [revision, setRevision] = React.useState(objective?.revision);
  const [validation, setValidation] = React.useState('');
  const command = useGoalCommand(key, result => { clear(); onSaved?.(result); });
  const formId = React.useId();
  React.useEffect(() => { onBusyChange?.(command.state === 'saving'); return () => onBusyChange?.(false); }, [command.state, onBusyChange]);
  async function submit(event) {
    event.preventDefault();
    if (command.locked || command.state === 'conflict') return;
    if (!draft.title.trim() || !draft.periodStart || !draft.periodEnd || draft.periodStart > draft.periodEnd) { setValidation('목표 이름과 올바른 시작·종료일을 입력하세요.'); return; }
    setValidation('');
    await command.submit(objective ? 'update_objective' : 'create_objective', goalObjectiveInput(draft, objective), revision);
  }
  return <form id={formId} className="goal-form" onSubmit={submit} onKeyDown={submitShortcut} aria-busy={command.state === 'saving'}>
    <fieldset disabled={command.locked}>
      <TextField label="목표 이름" required maxLength={240} value={draft.title} onChange={event => change('title', event.target.value)} autoFocus />
      <details className="goal-options" open={draft.description ? true : undefined}><summary>설명 추가 · 선택</summary><TextAreaField label="어떤 변화가 필요한가요?" maxLength={4000} value={draft.description} onChange={event => change('description', event.target.value)} rows={3} /></details>
      {!objective ? <><SelectField label="소속" value={draft.scope} options={[{ value: 'personal', label: '개인' }, { value: 'company', label: 'ClassIn' }]} onChange={event => change('scope', event.target.value)} /><div className="goal-actions" role="group" aria-label="목표 기간 빠른 선택">{[{value:'week',label:'이번 주'},{value:'month',label:'이번 달'},{value:'quarter',label:'이번 분기'}].map(item => <Button key={item.value} size="xs" variant="outline" onClick={() => { const period = goalPeriodPreset(item.value); change('periodStart', period.periodStart); change('periodEnd', period.periodEnd); }}>{item.label}</Button>)}</div><div className="goal-fields-two"><TextField label="시작일" type="date" required value={draft.periodStart} onChange={event => change('periodStart', event.target.value)} /><TextField label="종료일" type="date" required min={draft.periodStart} value={draft.periodEnd} onChange={event => change('periodEnd', event.target.value)} /></div><p className="goal-muted">Asia/Seoul 기준, 시작일과 종료일을 포함합니다. 실제 계획 기간을 선택하세요.</p></> : <><p className="goal-muted">{goalScopeLabel(objective.scope)} · {objective.periodStart}–{objective.periodEnd} · {objective.timezone}</p><SelectField label="목표 상태" value={draft.status} options={[{ value: 'active', label: '진행' }, { value: 'archived', label: '보관' }]} onChange={event => change('status', event.target.value)} /></>}
    </fieldset>
    {validation && <p role="alert" className="goal-error">{validation}</p>}
    <GoalCommandFeedback command={command} />
    {command.state === 'conflict' && <div className="goal-feedback"><p>현재 저장본: {command.entity?.title || objective?.title}</p><p className="goal-muted">{command.entity?.description || '설명 없음'}</p><Button disabled={!Number.isFinite(command.entity?.revision ?? objective?.revision)} onClick={() => { setRevision(command.entity?.revision ?? objective?.revision); command.reset(); }}>현재 저장본과 비교했고 내 입력 유지</Button></div>}
    <div className="goal-actions"><Button type="submit" variant="primary" disabled={command.locked || command.state === 'conflict'}>{objective ? '변경 저장' : '목표 만들기'} <Kbd>⌘↵</Kbd></Button><Button onClick={onCancel} disabled={command.state === 'saving'}>닫기</Button><span className="goal-muted">닫아도 작성 중인 입력은 이 창에 남습니다.</span></div>
  </form>;
}

export function GoalMetricForm({ objective, onSaved, onCancel }) {
  const key = `metric:new:${objective.id}`;
  const [draft, change, clear] = useGoalDraft(key, { name: '', unit: '', role: 'outcome', direction: 'increase', baseline: '', target: '', targetMin: '', targetMax: '', sourceKey: 'manual' });
  const [validation, setValidation] = React.useState('');
  const command = useGoalCommand(key, result => { clear(); onSaved?.(result); });
  async function submit(event) {
    event.preventDefault();
    if (command.locked) return;
    const numeric = { baseline: optionalNumber(draft.baseline), target: optionalNumber(draft.target), targetMin: optionalNumber(draft.targetMin), targetMax: optionalNumber(draft.targetMax) };
    if (!draft.name.trim() || !draft.unit.trim() || (draft.direction === 'range' ? !Number.isFinite(numeric.targetMin) || !Number.isFinite(numeric.targetMax) || numeric.targetMin > numeric.targetMax : !Number.isFinite(numeric.target))) { setValidation('지표 이름·단위와 올바른 목표 기준을 입력하세요.'); return; }
    setValidation('');
    await command.submit('create_metric', goalMetricInput(draft, objective.id));
  }
  return <form className="goal-form" onSubmit={submit} onKeyDown={submitShortcut} aria-busy={command.state === 'saving'}>
    <h3>측정 지표 추가</h3><fieldset disabled={command.locked}>
      <TextField label="측정할 변화" required maxLength={240} value={draft.name} onChange={event => change('name', event.target.value)} autoFocus />
      <div className="goal-fields-two"><SelectField label="역할" value={draft.role} options={roles} onChange={event => change('role', event.target.value)} /><TextField label="단위" required maxLength={40} value={draft.unit} onChange={event => change('unit', event.target.value)} /></div>
      <SelectField label="측정 방법" value={draft.sourceKey} options={GOAL_SOURCE_OPTIONS} onChange={event => { change('sourceKey', event.target.value); if (event.target.value !== 'manual') change('role', 'driver'); }} />
      {draft.sourceKey !== 'manual' && <p className="goal-muted">{goalScopeLabel(objective.scope)} 전체의 {objective.periodStart}–{objective.periodEnd} 기록을 집계합니다. 연결한 업무는 목표의 맥락이며 집계 대상을 그 업무로 제한하지 않습니다.</p>}
      <SelectField label="목표 방향" value={draft.direction} options={directions} onChange={event => change('direction', event.target.value)} />
      <TextField label="기준값 · 선택" type="number" step="any" value={draft.baseline} onChange={event => change('baseline', event.target.value)} hint="시작 시점의 값입니다. 모르면 비워두세요." />
      {draft.direction === 'range' ? <div className="goal-fields-two"><TextField required label="최솟값" type="number" step="any" value={draft.targetMin} onChange={event => change('targetMin', event.target.value)} /><TextField required label="최댓값" type="number" step="any" value={draft.targetMax} onChange={event => change('targetMax', event.target.value)} /></div> : <TextField required label="목표값" type="number" step="any" value={draft.target} onChange={event => change('target', event.target.value)} />}
    </fieldset>
    <p className="goal-muted">지표의 의미는 생성 뒤 바꾸지 않습니다. 변경이 필요하면 기존 지표를 보관하고 새로 만드세요.</p>
    {validation && <p role="alert" className="goal-error">{validation}</p>}<GoalCommandFeedback command={command} />
    <div className="goal-actions"><Button type="submit" variant="primary" disabled={command.locked}>지표 추가 <Kbd>⌘↵</Kbd></Button><Button disabled={command.state === 'saving'} onClick={onCancel}>닫기</Button></div>
  </form>;
}

export function GoalObservationForm({ metric, objective, onSaved, onCancel }) {
  const key = `observation:${metric.id}:${objective.periodStart}:${objective.periodEnd}`;
  const [draft, change, clear] = useGoalDraft(key, () => ({ value: '', coverage: 'complete', observedAt: localInputTime(), evidenceLabel: '', evidenceHref: '', evidenceAt: localInputTime(), note: '' }));
  const [validation, setValidation] = React.useState('');
  const command = useGoalCommand(key, result => { clear(); onSaved?.(result); });
  async function submit(event) {
    event.preventDefault();
    if (command.locked) return;
    const observedAt = new Date(draft.observedAt), occurredAt = new Date(draft.evidenceAt);
    const hasEvidence = draft.evidenceLabel.trim() && safeGoalEvidenceHref(draft.evidenceHref) && Number.isFinite(occurredAt.getTime());
    const value = draft.coverage === 'unmeasured' ? null : optionalNumber(draft.value);
    if (!Number.isFinite(observedAt.getTime()) || (draft.coverage === 'complete' && (!Number.isFinite(value) || !hasEvidence))) { setValidation('관측 일시와 실제값, 날짜가 있는 근거 이름·주소를 입력하세요. 미측정이면 상태를 바꾸세요.'); return; }
    if ((draft.evidenceLabel.trim() || draft.evidenceHref.trim()) && !hasEvidence) { setValidation('근거는 이름·안전한 주소·일시를 함께 입력하세요.'); return; }
    setValidation('');
    await command.submit('record_observation', goalObservationInput(draft, metric.id, objective));
  }
  return <form className="goal-form" onSubmit={submit} onKeyDown={submitShortcut} aria-busy={command.state === 'saving'}><h3>실제 관측 기록</h3><p className="goal-muted">{metric.name} · {objective.periodStart}–{objective.periodEnd}. 이 기간의 관측값입니다. 이전 기록과 합산하지 않습니다.</p>
    <fieldset disabled={command.locked}>
      <SelectField label="측정 상태" value={draft.coverage} options={[{ value: 'complete', label: '관측 시점까지 확인함' }, { value: 'partial', label: '일부만 확인함' }, { value: 'unmeasured', label: '아직 측정하지 못함' }]} onChange={event => change('coverage', event.target.value)} />
      {draft.coverage !== 'unmeasured' && <TextField label={`실제값 (${metric.unit})`} type="number" step="any" required={draft.coverage === 'complete'} value={draft.value} onChange={event => change('value', event.target.value)} autoFocus inputMode="decimal" hint="실제 0과 미측정은 다릅니다." />}
      {metric.measurement?.evidence?.some(item => item.label && safeGoalEvidenceHref(item.href) && Number.isFinite(Date.parse(item.occurredAt))) && <Button className="goal-reuse-evidence" size="xs" variant="outline" onClick={() => { const last = metric.measurement.evidence.find(item => item.label && safeGoalEvidenceHref(item.href) && Number.isFinite(Date.parse(item.occurredAt))); change('evidenceLabel', last.label); change('evidenceHref', last.href); change('evidenceAt', localInputTime(last.occurredAt)); }}>최근 근거 불러오기</Button>}
      <TextField label="근거 이름" required={draft.coverage === 'complete'} maxLength={240} value={draft.evidenceLabel} onChange={event => change('evidenceLabel', event.target.value)} />
      <TextField label="근거 주소" required={draft.coverage === 'complete'} value={draft.evidenceHref} onChange={event => change('evidenceHref', event.target.value)} hint="https:// 주소 또는 /dashboard/로 시작하는 업무 주소" />
      <p className="goal-muted">관측 {draft.observedAt.replace('T', ' ')} · 근거 {draft.evidenceAt.replace('T', ' ')} (기기 시간대)</p><details className="goal-options"><summary>일시 변경 · 메모 추가</summary><p className="goal-muted">근거의 실제 발생 일시를 기록하세요. 최근 근거를 불러오면 기존 날짜도 유지합니다.</p>
      <TextField label="관측 일시 · 현재 기기 시간대" type="datetime-local" required value={draft.observedAt} onChange={event => change('observedAt', event.target.value)} />
      <TextField label="근거가 발생한 일시 · 현재 기기 시간대" type="datetime-local" required={draft.coverage === 'complete'} value={draft.evidenceAt} onChange={event => change('evidenceAt', event.target.value)} />
      <TextAreaField label="관측·정정 메모" value={draft.note} maxLength={4000} onChange={event => change('note', event.target.value)} /></details>
    </fieldset>
    {validation && <p role="alert" className="goal-error">{validation}</p>}<GoalCommandFeedback command={command} />
    <div className="goal-actions"><Button type="submit" variant="primary" disabled={command.locked}>관측 저장 <Kbd>⌘↵</Kbd></Button><Button disabled={command.state === 'saving'} onClick={onCancel}>닫기</Button></div>
  </form>;
}

export function GoalMetricCard({ metric, objective, observations = [], onRefresh }) {
  const [editing, setEditing] = React.useState(false);
  const [archiveConfirm, setArchiveConfirm] = React.useState(false);
  const command = useGoalCommand(`archive:${metric.id}`, () => { setArchiveConfirm(false); onRefresh?.(); });
  const archived = metric.status === 'archived' || Boolean(metric.archivedAt);
  return <Card className="goal-metric-card">
    <div className="goal-card-heading"><div><h3>{metric.name}</h3><p className="goal-muted">{roles.find(role => role.value === metric.role)?.label || metric.role}{archived ? ' · 보관됨' : ''}</p></div>{!archived && objective.status !== 'archived' && <Button onClick={() => setArchiveConfirm(value => !value)}>보관</Button>}</div>
    <GoalMetricSummary metric={metric} scope={objective.scope} />
    <details className="goal-details"><summary>측정 근거</summary><GoalEvidence evidence={metric.measurement?.evidence || []} /></details>
    {observations.length > 0 && <details className="goal-details"><summary>관측 이력 {observations.length}개</summary><ul className="goal-history">{observations.map(item => <li key={item.id}><div className="goal-actions"><span className="mono">{item.value ?? '미측정'} {metric.unit}</span><span>{item.coverage === 'complete' ? '관측 시점까지 확인' : item.coverage === 'partial' ? '일부 확인' : '미측정'}</span></div><span className="mono goal-muted">{dateTime(item.observedAt)} · {item.periodStart}–{item.periodEnd}</span>{item.note && <p>{item.note}</p>}<GoalEvidence evidence={item.evidence} /></li>)}</ul></details>}
    {metric.sourceKey === 'manual' && !archived && objective.status !== 'archived' && !editing && <Button variant="outline" onClick={() => setEditing(true)}>실제값 기록</Button>}
    {editing && <GoalObservationForm metric={metric} objective={objective} onSaved={() => { setEditing(false); onRefresh?.(); }} onCancel={() => setEditing(false)} />}
    {archiveConfirm && <div className="goal-feedback"><p>지표와 관측 이력을 보존하고 새 관측 입력을 종료합니다.</p><Button variant="outline" disabled={command.locked} onClick={() => command.submit('archive_metric', { id: metric.id }, metric.revision)}>이 지표 보관</Button><Button disabled={command.state === 'saving'} onClick={() => setArchiveConfirm(false)}>취소</Button></div>}
    <GoalCommandFeedback command={command} />
    {command.state === 'conflict' && <Button onClick={() => { command.reset(); onRefresh?.(); }}>최신 지표 다시 확인</Button>}
  </Card>;
}
