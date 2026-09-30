"use client";
import React from 'react';
import Link from 'next/link';
import { Badge, Button, CheckboxRow, Drawer, SegmentedControl, TextAreaField, TextField } from './hub-primitives';
import { createGoalCommandClient, goalSourceKeysFor, goalWriteErrorMessage, measurementLabel, readGoalLocal, writeGoalLocal } from '@/lib/goal-client';
import { FLOOR_SCORE, VERDICTS, floorStatus, isZeroKeep, keyResultScore, nextPeriodDraft, objectiveScore, objectiveVerdict, periodWeeks, splitObjectiveMetrics } from '@/lib/goal-concepts';
import { goalScopeLabel } from './goal-components';

// 월말 채점지 — 기간이 끝난 목표 카드가 제자리에서 채점 모드로 바뀐다(OKR·KPI 2단계 목업 ④, 2026-10-01).
// 새 화면을 만들지 않는다. 점수는 관측에서 다시 계산되므로 따로 저장하지 않고, 채점 저장은
// 회고 메모(decision) + 목표 보관이다. 안티 골을 평균에 넣는 채점(Q2)은 채점 방식 칸(0053) 뒤라
// 지금은 "지키는 약속" 줄로 따로 보인다.

const formatScore = score => score === null ? '—' : score.toFixed(2);
const seoulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const CHANGE_ONE = [{ key: 'offer', label: '오퍼' }, { key: 'price', label: '가격' }, { key: 'segment', label: '고객군' }];
export const CHANGE_ONE_LABEL = Object.fromEntries(CHANGE_ONE.map(item => [item.key, item.label]));
const FLOOR_LABEL = { reached: '✓ 달성', missed: '✗ 미달', unknown: '○ 확인 필요' };

const confirmedValue = metric => metric.measurement?.coverage === 'complete' && Number.isFinite(metric.measurement?.value) ? metric.measurement.value : null;
const insideLine = (metric, value) => metric.direction === 'range' ? value >= metric.targetMin && value <= metric.targetMax : metric.direction === 'decrease' ? value <= metric.target : value >= metric.target;
const dayOf = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

// 한 달 동안 주마다 마지막 확인 관측이 선 안이었는지.
function kpiMonthLine(metric, objective, observations) {
  if (isZeroKeep(metric)) { const value = confirmedValue(metric); return value === null ? '○ 확인 필요' : value > 0 ? `▲ ${value}건 어김` : '0건 ✓'; }
  const rows = observations.filter(item => item.coverage === 'complete' && Number.isFinite(item.value) && Number.isFinite(Date.parse(item.observedAt)));
  const weeks = periodWeeks(objective, seoulToday());
  let recorded = 0, inside = 0;
  for (const week of weeks) {
    const last = rows.filter(item => { const d = dayOf(item.observedAt); return d >= week.start && d <= week.end; }).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    if (!last) continue;
    recorded += 1; if (insideLine(metric, last.value)) inside += 1;
  }
  return recorded ? `${weeks.length}주 중 ${recorded}주 기록 · ${inside}주 선 안` : '기록 없음';
}

async function command(action, input, expectedRevision) {
  const result = await createGoalCommandClient().submit(action, input, expectedRevision);
  if (result.state !== 'saved') throw Object.assign(new Error(result.state), { result });
  return result;
}

async function objectiveRevision(id) {
  const response = await fetch(`/api/hub/goals?objectiveId=${encodeURIComponent(id)}`, { cache: 'no-store' });
  const data = await response.json().catch(() => null);
  const revision = data?.objectives?.find(item => item.id === id)?.revision;
  if (!Number.isFinite(revision)) throw Object.assign(new Error('read'), { result: { error: 'goal-storage-unavailable' } });
  return revision;
}

export function GoalScorecard({ objective, model, onRecord, onRefresh, onContinue }) {
  const { keyResults, references, healthIndicators } = splitObjectiveMetrics(model.metrics, objective.id);
  const zeroKeeps = healthIndicators.filter(isZeroKeep);
  const lines = healthIndicators.filter(metric => !isZeroKeep(metric));
  const { score, scored } = objectiveScore(keyResults);
  const reached = keyResults.filter(metric => floorStatus(metric) === 'reached').length;
  const verdict = objectiveVerdict(keyResults);
  const brokenPromise = zeroKeeps.some(metric => (confirmedValue(metric) || 0) > 0);
  const draftKey = `scorecard:${objective.id}`;
  const [draft, setDraft] = React.useState(() => readGoalLocal(draftKey, { retro: '', change: '' }));
  const update = patch => setDraft(current => { const next = { ...current, ...patch }; writeGoalLocal(draftKey, next); return next; });
  const [saving, setSaving] = React.useState('idle');
  const [message, setMessage] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const retroRequired = brokenPromise && !draft.retro.trim();

  async function save() {
    if (retroRequired) { setMessage('지키는 약속을 어긴 달은 "무엇을 만들었고 왜 팔기보다 급했는지"를 회고에 적어야 채점을 저장할 수 있습니다.'); return; }
    setSaving('saving'); setMessage('');
    try {
      if (draft.retro.trim()) {
        const entryId = crypto.randomUUID();
        const body = [draft.retro.trim(), '', `최종 점수 ${formatScore(score)} · 바닥 달성 KR ${reached}/${keyResults.length}`, verdict.key ? `판정: ${VERDICTS[verdict.key].title} — ${VERDICTS[verdict.key].text}` : '', draft.change ? `다음 기간에 바꿀 하나: ${CHANGE_ONE_LABEL[draft.change]}` : ''].filter(Boolean).join('\n');
        const response = await fetch('/api/hub/journal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', requestId: crypto.randomUUID(), entryId, expectedRevision: 0, body, title: `${objective.title} · 채점 회고`, occurredAt: new Date().toISOString(), noteMeta: { kind: 'decision', enhancement: '' }, contexts: [] }) });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.entry?.id !== entryId) throw Object.assign(new Error('journal'), { result: { message: data?.message || '회고 메모를 저장하지 못했습니다.' } });
        // 하루 리뷰·메모는 개인 기록이라 개인 목표에만 연결된다.
        if (objective.scope === 'personal') await command('link_entity', { objectiveId: objective.id, entityType: 'journal_entries', entityId }, await objectiveRevision(objective.id));
      }
      await command('update_objective', { id: objective.id, title: objective.title, description: objective.description || '', status: 'archived' }, await objectiveRevision(objective.id));
      writeGoalLocal(draftKey, null);
      setSaving('saved'); setConfirming(false); onRefresh?.();
    } catch (error) {
      setSaving('error');
      setMessage(error?.result?.message || (error?.result?.state === 'conflict' ? '다른 변경이 먼저 저장됐습니다. 새로고침한 뒤 다시 저장하세요. 회고는 이 창에 남아 있습니다.' : error?.result?.state === 'unknown' ? '저장 여부를 확인하지 못했습니다. 새로고침해 목표 상태를 확인하세요. 회고는 이 창에 남아 있습니다.' : goalWriteErrorMessage(error?.result?.error)));
    }
  }

  return <article className="goal-card goal-scorecard" aria-label={`${objective.title} 채점`}>
    <header className="goal-card-header">
      <div className="goal-card-header__top">
        <div className="goal-card-header__badges">
          <Badge tone="neutral" variant="outline" size="xs">{goalScopeLabel(objective.scope)}</Badge>
          <span className="mono goal-period-chip">{objective.periodStart}–{objective.periodEnd} · 기간 종료</span>
          <span className="goal-muted">◐ 채점 대기</span>
        </div>
      </div>
      <div className="goal-objective">
        <div className="goal-objective__text">
          <span className="goal-concept-eyebrow">Objective · 채점</span>
          <strong className="goal-card-title">{objective.title}</strong>
          {objective.description && <p className="goal-card-desc">{objective.description}</p>}
        </div>
        <div className="goal-objective__score">
          <div className="goal-objective__score-head"><span className="stat goal-objective__score-num">{formatScore(score)}</span><span className="goal-muted">최종 점수 · KR {scored}/{keyResults.length} 채점</span></div>
          <div className="goal-otrack" role="meter" aria-label="최종 점수" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score === null ? undefined : Math.round(score * 100)}>{score !== null && <span className="goal-otrack__fill" style={{ width: `${Math.min(100, score * 100)}%` }} />}<i className="goal-otrack__tick" style={{ left: `${FLOOR_SCORE * 100}%` }} aria-hidden="true" /></div>
          <span className="goal-muted">바닥 달성 KR {reached}/{keyResults.length} · 0.7이면 약속 달성 · 천장 미등록</span>
        </div>
      </div>
    </header>

    <table className="goal-score-table">
      <thead><tr><th>핵심 결과</th><th className="r">최종</th><th className="r">바닥</th><th>달성</th><th className="r">점수</th><th><span className="goal-sr-only">기록</span></th></tr></thead>
      <tbody>{keyResults.map(metric => {
        const status = floorStatus(metric);
        const needsClose = status === 'unknown' && metric.sourceKey === 'manual';
        return <tr key={metric.id}>
          <td><span className="goal-kr-row__name">{metric.name}</span> <span className="goal-muted">{metric.role === 'outcome' ? '결과 KR' : '선행 KR'}</span></td>
          <td className="r mono">{measurementLabel(metric)}</td>
          <td className="r mono goal-muted">{metric.direction === 'range' ? `${metric.targetMin}–${metric.targetMax}` : metric.target} {metric.unit}</td>
          <td>{FLOOR_LABEL[status]}{needsClose && metric.measurement?.reason === 'period-not-fully-observed' ? <span className="goal-muted"> · 마감 값 없음</span> : null}</td>
          <td className="r stat goal-score-table__score">{formatScore(keyResultScore(metric))}</td>
          <td className="r">{needsClose ? <Button size="xs" variant="outline" data-record-metric={metric.id} onClick={event => onRecord(event, objective, metric)} aria-label={`${metric.name} 마감 값 기록`}>마감 값</Button> : null}</td>
        </tr>;
      })}</tbody>
    </table>

    {zeroKeeps.length > 0 && <div className="goal-zero-keeps" aria-label="지키는 약속">
      <span className="goal-milestones__label">지키는 약속</span>
      {zeroKeeps.map(metric => <span key={metric.id} className={`goal-zero-keep${(confirmedValue(metric) || 0) > 0 ? ' goal-zero-keep--broken' : ''}`}>{metric.name} · {kpiMonthLine(metric, objective, [])}</span>)}
      <span className="goal-muted">안티 골을 점수에 넣는 채점은 채점 방식 칸(0053) 뒤</span>
    </div>}

    <section className="goal-score-block" aria-label="판정">
      <div className="goal-score-block__head"><span className="goal-concept-eyebrow">판정</span><span className="goal-muted">결과 KR · 선행 KR의 바닥 달성만 봅니다</span></div>
      {verdict.key ? <>
        <div className="goal-verdict" role="table" aria-label="2×2 판정">
          <span /><span className="goal-verdict__axis">선행 KR 달성</span><span className="goal-verdict__axis">선행 KR 미달</span>
          <span className="goal-verdict__axis">결과 KR 달성</span>{['repeat', 'redefine'].map(key => <VerdictCell key={key} id={key} current={verdict.key} />)}
          <span className="goal-verdict__axis">결과 KR 미달</span>{['change-one', 'volume'].map(key => <VerdictCell key={key} id={key} current={verdict.key} />)}
        </div>
        {verdict.key === 'change-one' && <div className="goal-actions"><span className="goal-muted">다음 기간에 바꿀 하나</span><SegmentedControl label="다음 기간에 바꿀 하나" value={draft.change || ''} options={CHANGE_ONE} onChange={value => update({ change: value })} /><span className="goal-muted">셋 중 하나만 고릅니다</span></div>}
      </> : <p className="goal-muted">{verdict.reason === 'unmeasured' ? `마감 값이 없는 KR ${verdict.unknown}개가 있어 판정을 보류합니다. 위 표에서 마감 값을 기록하세요.` : '결과 KR과 선행 KR이 모두 있어야 판정할 수 있습니다.'}</p>}
    </section>

    <div className="goal-score-two">
      <section className="goal-score-block" aria-label="KPI 한 달"><span className="goal-concept-eyebrow">KPI · 한 달</span>
        <dl className="goal-score-kv">{lines.map(metric => <React.Fragment key={metric.id}><dt>{metric.name}</dt><dd className="mono">{kpiMonthLine(metric, objective, model.observations.filter(item => item.metricId === metric.id))}</dd></React.Fragment>)}{!lines.length && <><dt>지킬 범위</dt><dd className="mono">없음</dd></>}</dl>
      </section>
      <section className="goal-score-block" aria-label="기록만 한 지표"><span className="goal-concept-eyebrow">기록만 한 지표</span>
        <dl className="goal-score-kv">{references.map(metric => <React.Fragment key={metric.id}><dt>{metric.name}</dt><dd className="mono">{measurementLabel(metric)}</dd></React.Fragment>)}{!references.length && <><dt>없음</dt><dd /></>}</dl>
      </section>
    </div>

    <section className="goal-score-block" aria-label="회고">
      <TextAreaField label={brokenPromise ? '회고 한 단락 · 필수 — 무엇을 만들었고 왜 팔기보다 급했나' : '회고 한 단락 · 선택'} value={draft.retro} maxLength={4000} rows={4} placeholder="무엇이 통했고, 무엇이 결과까지 가지 못했나" onChange={event => update({ retro: event.target.value })} hint="메모(결정)로 저장하고 이 목표에 연결합니다. 저장 전까지 이 창에 남습니다." />
    </section>

    {message && <p className={saving === 'error' ? 'goal-error' : 'goal-muted'} role={saving === 'error' ? 'alert' : 'status'}>{message}</p>}
    {confirming && <div className="goal-feedback"><p>채점을 저장하면 회고를 메모로 남기고 이 목표를 보관합니다. 점수와 관측 이력은 그대로 남습니다.</p><div className="goal-actions"><Button variant="primary" disabled={saving === 'saving'} onClick={save}>{saving === 'saving' ? '저장하는 중…' : '보관하고 저장'}</Button><Button disabled={saving === 'saving'} onClick={() => setConfirming(false)}>취소</Button></div></div>}
    <footer className="goal-card-footer">
      <span>{saving === 'saved' ? '채점을 저장했습니다.' : '채점 저장 = 회고 메모 + 목표 보관'}</span>
      <div className="goal-actions"><Button variant="outline" onClick={() => onContinue?.(objective, { change: draft.change, verdict: verdict.key })}>다음 기간으로 이어가기 →</Button><Button variant="primary" disabled={saving === 'saving' || confirming} onClick={() => { if (retroRequired) { setMessage('지키는 약속을 어긴 달은 회고를 먼저 적어야 합니다.'); return; } setConfirming(true); }}>채점 저장</Button></div>
    </footer>
  </article>;
}

function VerdictCell({ id, current }) {
  const on = id === current;
  return <div className={`goal-verdict__cell${on ? ' goal-verdict__cell--on' : ''}`} aria-current={on ? 'true' : undefined}><b>{VERDICTS[id].title}{on ? ' · 이번 기간' : ''}</b><span>{VERDICTS[id].text}</span></div>;
}

// 다음 기간으로 이어가기 — 같은 KR·KPI 정의로 새 목표 초안을 만들고 운영자가 확인한 뒤 만든다.
// 목표 1개 + 지표 n개를 순서대로 만든다. 중간에 실패하면 만든 것은 두고 남은 지표만 다시 시도한다.
export function GoalContinueDrawer({ objective, metrics, change, onClose, onCreated }) {
  const draft = nextPeriodDraft(objective) || { title: objective.title, periodStart: '', periodEnd: '' };
  const [title, setTitle] = React.useState(draft.title);
  const [periodStart, setPeriodStart] = React.useState(draft.periodStart);
  const [periodEnd, setPeriodEnd] = React.useState(draft.periodEnd);
  const [description, setDescription] = React.useState(() => [objective.description || '', change ? `다음 기간에 바꿀 하나: ${CHANGE_ONE_LABEL[change]}` : ''].filter(Boolean).join('\n'));
  const allowed = new Set(goalSourceKeysFor(objective.scope));
  const candidates = metrics.filter(metric => metric.objectiveId === objective.id && metric.status !== 'archived' && !metric.archivedAt && allowed.has(metric.sourceKey));
  const [picked, setPicked] = React.useState(() => new Set(candidates.map(metric => metric.id)));
  const [state, setState] = React.useState({ phase: 'idle', createdId: null, done: [], message: '' });
  const busy = state.phase === 'saving';

  async function submit() {
    if (!title.trim() || !periodStart || !periodEnd || periodStart > periodEnd) { setState(current => ({ ...current, phase: 'error', message: '제목과 올바른 기간을 입력하세요.' })); return; }
    setState(current => ({ ...current, phase: 'saving', message: '' }));
    let createdId = state.createdId;
    const done = [...state.done];
    try {
      if (!createdId) {
        const created = await command('create_objective', { title: title.trim(), description: description.trim(), scope: objective.scope, periodStart, periodEnd, timezone: objective.timezone || 'Asia/Seoul' });
        createdId = created.entity?.id;
        if (!createdId) throw Object.assign(new Error('entity'), { result: { state: 'unknown' } });
      }
      for (const metric of candidates.filter(item => picked.has(item.id) && !done.includes(item.id))) {
        await command('create_metric', { objectiveId: createdId, name: metric.name, unit: metric.unit, role: metric.role, direction: metric.direction, baseline: metric.baseline ?? null, target: metric.direction === 'range' ? null : metric.target ?? null, targetMin: metric.direction === 'range' ? metric.targetMin : null, targetMax: metric.direction === 'range' ? metric.targetMax : null, sourceKey: metric.sourceKey });
        done.push(metric.id);
        setState(current => ({ ...current, createdId, done: [...done] }));
      }
      setState({ phase: 'saved', createdId, done, message: '' });
      onCreated?.({ id: createdId });
    } catch (error) {
      setState({ phase: 'error', createdId, done, message: createdId ? `새 목표는 만들었고 지표 ${done.length}/${[...picked].length}개를 옮겼습니다. 남은 지표를 다시 시도하세요.` : error?.result?.state === 'unknown' ? '저장 여부를 확인하지 못했습니다. 목표 목록을 새로고침해 확인하세요.' : goalWriteErrorMessage(error?.result?.error) });
    }
  }

  return <Drawer title="다음 기간으로 이어가기" subtitle={`${objective.title}의 KR·KPI 정의를 그대로 옮깁니다`} presentation="compact" width="min(600px, 96vw)" onClose={() => { if (!busy) onClose(); }}>
    <div className="goal-form" aria-busy={busy}>
      <fieldset disabled={busy || Boolean(state.createdId)}>
        <TextField label="새 목표 이름" value={title} maxLength={240} onChange={event => setTitle(event.target.value)} />
        <div className="goal-fields-two"><TextField label="시작일" type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} /><TextField label="종료일" type="date" min={periodStart} value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></div>
        <TextAreaField label="설명" value={description} maxLength={4000} rows={4} onChange={event => setDescription(event.target.value)} />
      </fieldset>
      <div className="goal-continue-metrics" role="group" aria-label="옮길 지표">
        <span className="goal-muted">옮길 지표 · 바닥·범위·측정 방법 그대로 {candidates.length ? '' : '— 옮길 수 있는 지표가 없습니다'}</span>
        {candidates.map(metric => <CheckboxRow key={metric.id} checked={picked.has(metric.id)} disabled={busy || state.done.includes(metric.id)} text={`${state.done.includes(metric.id) ? '✓ ' : ''}${metric.name} · ${metric.direction === 'range' ? `${metric.targetMin}–${metric.targetMax} ${metric.unit}` : metric.target != null ? `${metric.target} ${metric.unit}` : '기록만'}`} onChange={value => setPicked(current => { const next = new Set(current); if (value) next.add(metric.id); else next.delete(metric.id); return next; })} />)}
      </div>
      {state.message && <p className={state.phase === 'error' ? 'goal-error' : 'goal-muted'} role={state.phase === 'error' ? 'alert' : 'status'}>{state.message}</p>}
      <div className="goal-actions"><Button variant="primary" disabled={busy || state.phase === 'saved'} onClick={submit}>{busy ? '만드는 중…' : state.createdId ? '남은 지표 다시 만들기' : '새 목표 만들기'}</Button><Button disabled={busy} onClick={onClose}>닫기</Button>{state.createdId && <Link className="hub-row" href="#" onClick={event => { event.preventDefault(); onCreated?.({ id: state.createdId }); }}>새 목표 열기 →</Link>}</div>
    </div>
  </Drawer>;
}
