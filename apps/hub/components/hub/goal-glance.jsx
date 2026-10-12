"use client";
import React from 'react';
import Link from 'next/link';
import { Button, CertaintyBadge, TextAreaField } from './hub-primitives';
import { readGoalLocal, writeGoalLocal } from '@/lib/goal-client';
import { KPI_HEALTH_LABEL, PACE_TONE_LABEL, bulletScale, kpiBulletReading, metricFreshnessLabel, formatPaceNumber, isHealthIndicator, isZeroKeep, kpiHealth, kpiThresholdLabel, kpiTrend, periodWeeks, sortKpis, zeroKeepWeeks } from '@/lib/goal-concepts';
import { createWeeklyMemoSaver, readWeeklyMemoSave, weeklyMemoSaveMessage, writeWeeklyMemoSave } from '@/lib/weekly-memo-save';

// OKR·KPI 한눈에 보기 — A안 스코어보드(2026-10-05 운영자 선택).
// KPI 줄이 맨 위, 목표 블록과 "이번 주 챙길 것"이 나란히. 페이스 색(--okr-*)은 이 화면 전용이고
// 언제나 글리프 + 글과 함께 쓴다. 빨강은 선 밖 KPI와 기한 지난 마일스톤뿐(1px 레일).

const KPI_HEALTH_TONE = { inside: 'ahead', outside: 'out', partial: 'wait', unmeasured: 'wait', unset: 'wait' };
const KPI_HEALTH_GLYPH = { inside: '✓', outside: '▲', partial: '◐', unmeasured: '○', unset: '○' };
const number = value => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value);

export function TonePill({ tone, children, small = false }) {
  return <span className={`goal-pill goal-pill--${tone}${small ? ' goal-pill--sm' : ''}`}>{children ?? PACE_TONE_LABEL[tone]}</span>;
}

// 두꺼운 둥근 트랙 + 페이스 색 채움 + 진한 기대선(기간 경과). value가 null이면 채우지 않는다.
export function GaugeBar({ value, marker = null, tone = 'wait', size = 'md', label, markerLabel }) {
  const known = Number.isFinite(value);
  const text = [known ? `${Math.round(value)}%` : '측정 전', Number.isFinite(marker) ? `기대 ${Math.round(marker)}%` : null].filter(Boolean).join(' · ');
  return <div className={`goal-gauge goal-gauge--${size}${markerLabel ? ' goal-gauge--labeled' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? Math.round(value) : undefined} aria-valuetext={text}>
    <div className="goal-gauge__track"><span className={`goal-gauge__fill goal-gauge__fill--${tone}`} style={{ width: `${known ? value : 0}%` }} /></div>
    {Number.isFinite(marker) && <i className="goal-gauge__marker" style={{ left: `${marker}%` }} aria-hidden="true" />}
    {Number.isFinite(marker) && markerLabel && <em className="goal-gauge__marker-label mono" style={{ left: `${Math.min(92, Math.max(8, marker))}%` }} aria-hidden="true">{markerLabel}</em>}
  </div>;
}

// KPI 보기와 같은 행 — 보관하지 않은 guardrail 지표, 선 밖이 먼저.
export function kpiRowsFor(model, objectives, today) {
  const objectiveById = new Map(objectives.map(objective => [objective.id, objective]));
  return sortKpis(model.metrics.filter(metric => objectiveById.has(metric.objectiveId) && isHealthIndicator(metric) && metric.status !== 'archived' && !metric.archivedAt).map(metric => {
    const observations = model.observations.filter(item => item.metricId === metric.id);
    return { metric, objective: objectiveById.get(metric.objectiveId), observations, health: kpiHealth(metric), trend: kpiTrend(observations), freshness: metricFreshnessLabel(metric, new Intl.DateTimeFormat('en-CA', { timeZone: objectiveById.get(metric.objectiveId).timezone || 'Asia/Seoul' }).format(new Date()), objectiveById.get(metric.objectiveId).timezone) };
  }));
}

function KpiValue({ metric }) {
  const measured = metric.measurement?.coverage !== 'unmeasured' && Number.isFinite(metric.measurement?.value);
  if (!measured) return <span className="stat goal-kpi-tile__value goal-kpi-tile__value--empty">—</span>;
  return <span className="stat goal-kpi-tile__value">{number(metric.measurement.value)}{metric.unit && <small>{metric.unit}</small>}</span>;
}

function KpiMeter({ row, today }) {
  const { metric, objective, observations, trend, health } = row;
  if (isZeroKeep(metric)) {
    const { cells } = zeroKeepWeeks(metric, objective, observations, today);
    const glyph = { kept: '✓', broken: '▲' };
    return <ol className="goal-kpi-tile__weeks" aria-label={`${metric.name} 주별 유지`}>{cells.map(cell => <li key={cell.start} className={`goal-kpi-tile__week goal-kpi-tile__week--${cell.state}${cell.phase === 'now' ? ' goal-kpi-tile__week--now' : ''}`} aria-label={`${cell.label} 주 ${cell.state === 'kept' ? '지킴' : cell.state === 'broken' ? '어김' : cell.state === 'future' ? '앞으로' : '확인 전'}`}>{glyph[cell.state] || ''}</li>)}</ol>;
  }
  const { now, previous, partial } = kpiBulletReading(metric, observations);
  const scale = bulletScale(metric, [now, previous]);
  if (!scale) return <span className="goal-muted">선 미설정</span>;
  const [lo, hi] = scale.band;
  const fmt = value => formatPaceNumber(Math.round(value * 10) / 10);
  return <div className="goal-kpi-meter" role="img" aria-label={`${metric.name}: 허용 ${kpiThresholdLabel(metric)}, 이번 ${now === null ? '기록 없음' : fmt(now)}${partial ? ' · 일부 근거 · 선 안/밖 판단 보류' : ''}${previous !== null ? `, 이전 확정 ${fmt(previous)}` : ''}`}>
    <div className="goal-kpi-meter__track">
      <span className="goal-kpi-meter__band" style={{ left: `${Math.min(lo, hi)}%`, width: `${Math.abs(hi - lo)}%` }} />
      {now !== null && <span className={`goal-kpi-meter__fill goal-kpi-meter__fill--${KPI_HEALTH_TONE[health]}`} style={{ width: `${scale.at(now)}%` }} />}
    </div>
    {previous !== null && <i className="goal-kpi-meter__last" style={{ left: `${scale.at(previous)}%` }} />}
    <div className="goal-kpi-meter__scale mono" aria-hidden="true"><span style={{ left: 0 }}>{fmt(scale.min)}</span><span style={{ right: 0 }}>{fmt(scale.max)}</span></div>
  </div>;
}

export function KpiStrip({ rows, today, kpiHref, railBudget, readState = 'live' }) {
  const outside = rows.filter(row => row.health === 'outside').length;
  const railed = outside > 0 && outside <= railBudget;
  return <section className="goal-kpi-strip" aria-label="지킬 선 · KPI">
    <div className="goal-section-head"><h3 className="goal-section-title">지킬 선 · KPI</h3><Link className="goal-section-link hub-row" href={kpiHref}>KPI 자세히 →</Link></div>
    {rows.length ? <ul className="goal-kpi-tiles">{rows.map(row => {
      const { metric, objective, health, freshness } = row;
      const zero = isZeroKeep(metric);
      const { previous } = kpiBulletReading(metric, row.observations);
      const meta = zero ? '0건 유지' : kpiThresholdLabel(metric);
      const when = freshness;
      return <li key={metric.id} className={`goal-kpi-tile${health === 'outside' && railed ? ' goal-kpi-tile--outside' : ''}`}>
        <div className="goal-kpi-tile__head"><span className="goal-kpi-tile__name">{metric.name}</span><TonePill tone={KPI_HEALTH_TONE[health]} small>{KPI_HEALTH_GLYPH[health]} {KPI_HEALTH_LABEL[health]}</TonePill></div>
        <KpiValue metric={metric} />
        <KpiMeter row={row} today={new Intl.DateTimeFormat('en-CA', { timeZone: objective.timezone || 'Asia/Seoul' }).format(new Date())} />
        <span className="goal-muted">{objective.title} · {objective.periodStart}–{objective.periodEnd}</span>
        <div className="goal-kpi-tile__meta mono"><span>{meta}</span><span>{previous !== null ? `지난 ${number(previous)} · ` : ''}{when}</span></div>
      </li>;
    })}</ul> : readState !== 'live' ? <p role="status" className="goal-muted">KPI 목록을 모두 확인하지 못했습니다. 다시 불러온 뒤 지킬 선을 확인하세요.</p> : <p className="goal-muted">지킬 선(KPI)이 아직 없습니다. 목표를 이루면서도 무너지면 안 되는 선을 <Link className="hub-row" href={kpiHref}>KPI 보기</Link>에서 정하세요.</p>}
  </section>;
}

// 이번 주 챙길 것 — 선 밖 KPI · 늦은 KR · 일주일 안 마일스톤 · 기록 공백. 새 데이터 없이 카드에 흩어진 신호를 모은다.
export function GlanceAttention({ items, suggestion, unknown = false }) {
  return <section className="goal-panel goal-attention" aria-label="이번 주 챙길 것">
    <div className="goal-section-head"><h3 className="goal-panel__title">이번 주 챙길 것</h3><span className="num">{items.length}</span></div>
    {items.length ? <ul className="goal-attention__list">{items.map(item => <li key={item.key} className={`goal-attention__item goal-attention__item--${item.tone}`}>
      <span className="goal-attention__glyph" aria-hidden="true">{item.glyph}</span>
      <div><b>{item.title}</b><span>{item.detail}</span></div>
    </li>)}</ul> : <p className="goal-muted">{unknown ? '측정이나 읽기 근거를 먼저 확인하세요. 아직 이번 주 상태를 확정할 수 없습니다.' : '이번 주 챙길 것이 없습니다. 모든 KR이 페이스 안이고 KPI도 선 안입니다.'}</p>}
    {suggestion && <div className="goal-attention__suggestion"><CertaintyBadge state="recommended" label="제안" /><span>{suggestion.text}</span>{suggestion.href && <Link className="hub-row goal-section-link" href={suggestion.href}>{suggestion.cta} →</Link>}</div>}
  </section>;
}

// 이번 주 메모 — 메모(learning)로 저장하고 개인 목표에 연결한다. 마이그레이션 없음.
export function WeeklyMemo({ objective, today, onSaved }) {
  const week = periodWeeks(objective, today).find(item => item.phase === 'now');
  const draftKey = `weekly-memo:${objective.id}:${week?.start || today}`;
  const [recovery] = React.useState(() => {
    try { return { value: readWeeklyMemoSave(objective, week?.start || today), error: false }; }
    catch { return { value: null, error: true }; }
  });
  const [text, setText] = React.useState(() => recovery.value ? recovery.value.state === 'saved' ? '' : recovery.value.requests.journal.body : readGoalLocal(draftKey, ''));
  const [state, setState] = React.useState(recovery.error ? 'error' : recovery.value?.state === 'saved' ? 'saved' : recovery.value ? 'unknown' : 'idle');
  const [message, setMessage] = React.useState(recovery.error ? '복구 기록을 읽지 못했습니다. 입력을 복사하고 브라우저 저장 공간을 확인하세요.' : recovery.value ? weeklyMemoSaveMessage({ ...recovery.value, state: recovery.value.state === 'saved' ? 'saved' : 'unknown' }) : '');
  const pending = React.useRef(recovery.value);
  const active = React.useRef(true);
  React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [saver] = React.useState(() => createWeeklyMemoSaver({
    get: () => { if (recovery.error) throw new Error('recovery-unavailable'); return pending.current; },
    persist: value => { writeWeeklyMemoSave(objective, week?.start || today, value); pending.current = value; },
    isCurrent: () => active.current,
    update: value => { setState(value.state); setMessage(weeklyMemoSaveMessage(value)); },
  }));
  const frozen = recovery.error || Boolean(pending.current && pending.current.state !== 'saved');
  const change = event => {
    if (frozen || state === 'saving') return;
    try { if (pending.current?.state === 'saved') { writeWeeklyMemoSave(objective, week?.start || today, null); pending.current = null; } }
    catch { setMessage('복구 기록을 정리하지 못했습니다. 브라우저 저장 공간을 확인하세요.'); return; }
    setText(event.target.value); writeGoalLocal(draftKey, event.target.value || null); setState('idle'); setMessage('');
  };
  async function save() {
    if (!text.trim() || state === 'saving' || recovery.error) return;
    const result = await saver.run({ objective, week: week?.start || today, weekLabel: week ? `${week.label} 주` : '', body: text });
    if (active.current && result.state === 'saved') {
      writeGoalLocal(draftKey, null); setText(''); onSaved?.();
    }
  }

  return <section className="goal-panel goal-weekly-memo" aria-label="이번 주 메모" aria-busy={state === 'saving'}>
    <div className="goal-section-head"><h3 className="goal-panel__title">이번 주 메모</h3>{week && <span className="mono goal-muted">{week.label} 주</span>}</div>
    <TextAreaField label="잘된 것 · 막힌 것 · 다음 주에 하나만" rows={4} value={text} readOnly={frozen} disabled={state === 'saving'} onChange={change} onCmdEnter={save} />
    <div className="goal-weekly-memo__foot"><span className="goal-muted">{objective.title}에 연결</span><Button size="xs" variant="outline" disabled={!text.trim() || state === 'saving' || recovery.error} onClick={save}>{state === 'saving' ? '저장 중…' : frozen ? '같은 요청 다시 확인' : '저장'}</Button></div>
    {message && <p role="status" className={['error', 'unknown', 'conflict'].includes(state) ? 'goal-error' : 'goal-muted'}>{message}</p>}
  </section>;
}
