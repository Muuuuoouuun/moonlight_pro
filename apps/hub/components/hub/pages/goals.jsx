"use client";
import React from 'react';
import { recordFirstRows } from './workflow-reading';
import './workflow-pages.css';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Iconed } from '../hub-icons';
import { Badge, Button, Drawer, EmptyState, Kbd, SegmentedControl, SelectField, Skeleton, TextField, TruthBadge } from '../hub-primitives';
import { GOAL_WORK_BASE, goalHref, goalScope, goalSectionState, goalLinkedEntityHref, goalView, measurementLabel } from '@/lib/goal-client';
import { goalCheckRows, goalKpiRows } from '@/lib/goal-input-ux';
import { GOAL_CONCEPT_BY_ROLE, KPI_HEALTH_LABEL, bulletScale, daysSinceObservation, floorPaceScore, formatPaceNumber, isZeroKeep, milestoneSummary, zeroKeepWeeks, keyResultPace, keyResultProgress, keyResultTone, paceSuggestion, isHealthIndicator, keyResultScore, kpiBulletReading, kpiHealth, kpiSummary, kpiThresholdLabel, metricFreshnessLabel, objectivePaceState, objectivePeriod, objectiveProgress, objectiveScore, objectiveSuggestion, sortKpis, splitObjectiveMetrics } from '@/lib/goal-concepts';
import { useGoals, useGoalCommand } from '../use-goals';
import { GOAL_SOURCE_OPTIONS, GoalCommandFeedback, GoalMetricCard, GoalMetricForm, GoalObjectiveForm, GoalObservationForm, GoalReadFeedback, goalScopeLabel } from '../goal-components';
import { GoalWeeklyActuals } from '../goal-weekly-actuals';
import { GoalContinueDrawer, GoalScorecard } from '../goal-scorecard';
import { GaugeBar, GlanceAttention, KpiStrip, TonePill, WeeklyMemo, kpiRowsFor } from '../goal-glance';
import { goalDashboardSnapshot } from '@/lib/goal-dashboard';
import '../goal-dashboard.css';

const percent = value => value === null ? '—' : `${Math.round(value)}%`;
const dayLabel = key => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
const recordDate = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(new Date(value));
const scopeLabel = objective => objective.scope === 'company' ? 'ClassIn' : '개인';

function SummaryGauge({ snapshot }) {
  const { progress, expected, measured, unmeasured } = snapshot;
  const length = Math.PI * 78;
  return <div className="goal-dash-gauge">
    <h3>OKR 종합 진행</h3>
    <div className="goal-dash-gauge__dial" role="meter" aria-label="조회 목표의 측정된 KR 평균 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined} aria-valuetext={progress === null ? '측정 전' : `${percent(progress)} · 측정 ${measured}개 · 미측정 ${unmeasured}개 제외`}>
      <svg viewBox="0 0 184 104" aria-hidden="true"><path className="goal-dash-gauge__track" d="M14 92 A78 78 0 0 1 170 92" />{progress !== null && <path className="goal-dash-gauge__fill" d="M14 92 A78 78 0 0 1 170 92" strokeDasharray={`${length * progress / 100} ${length}`} />}{expected !== null && <line className="goal-dash-gauge__marker" x1="92" y1="5" x2="92" y2="23" transform={`rotate(${expected * 1.8 - 90} 92 92)`} />}</svg>
      <div className="goal-dash-gauge__number"><strong className="stat">{percent(progress)}</strong><span>{expected === null ? '기대선은 진행 중인 기간만 표시' : `기간 경과 기준 ${percent(expected)}`}</span></div>
    </div>
    <p>측정 KR <b className="num">{measured}</b>개 평균 · 미측정 <b className="num">{unmeasured}</b>개 제외</p>
    <span className="goal-dash-note">바닥(약속)까지의 진행률 · 점수와 별도</span>
  </div>;
}

function ObjectiveTile({ objective, reading, index, hrefFor, onOpen }) {
  return <article className={`goal-dash-objective goal-dash-color-${index % 4}`}>
    <div className="goal-dash-objective__head"><span className="mono">O{String(index + 1).padStart(2, '0')} · {scopeLabel(objective)}</span><strong className="stat">{percent(reading.progress)}</strong></div>
    <Link className="goal-dash-objective__title hub-row" data-goal-id={objective.id} href={hrefFor(objective)} onClick={onOpen}>{objective.title}</Link>
    <span className="goal-dash-note">{dayLabel(objective.periodStart)}–{dayLabel(objective.periodEnd)} · <TonePill tone={reading.tone} small /></span>
    <ul className="goal-dash-mini-krs">{reading.keyResults.slice(0, 3).map(metric => {
      const row = reading.paceRows.find(item => item.metric.id === metric.id);
      const progress = keyResultProgress(metric);
      return <li key={metric.id}><div><span>{metric.name}</span><span className="num">{percent(progress)}</span></div><GaugeBar value={progress} marker={reading.period.phase === 'running' ? reading.period.elapsed * 100 : null} tone={reading.period.phase === 'running' ? keyResultTone(metric, row?.pace, reading.period) : 'wait'} label={`${metric.name} 바닥까지 진행률`} size="sm" /></li>;
    })}</ul>
    <span className="goal-dash-note">KR {reading.keyResults.length}개 · 측정 {reading.scored}개{reading.unscored ? ` · 미측정 ${reading.unscored}개` : ''}{reading.keyResults.length > 3 ? ' · 전체는 목표 열기' : ''}</span>
  </article>;
}

function ProgressComparison({ rows, hrefFor, onOpen }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? rows : rows.slice(0, 6);
  return <section className="goal-dash-panel goal-dash-comparison" aria-label="KR 진행률 비교">
    <div className="goal-section-head"><h3>핵심 결과 비교</h3><span className="goal-dash-note">각 KR의 바닥 = 100%</span></div>
    <p className="goal-dash-note">단위가 다른 실제값을 합치지 않고, 각 약속까지의 진행률을 비교합니다.</p>
    {rows.length ? <><ul className="goal-dash-columns">{visible.map(({ metric, objective, progress, tone }) => <li key={metric.id}>
      <TonePill tone={tone} small />
      <strong className="stat">{percent(progress)}</strong>
      <Link className="goal-dash-column hub-card-link" data-goal-id={objective.id} href={hrefFor(objective)} onClick={onOpen} aria-label={`${metric.name} · ${percent(progress)} · ${objective.title} 열기`}><span className={`goal-dash-column__fill goal-dash-column__fill--${tone}`} style={{ height: `${progress ?? 0}%` }} /><span className="goal-dash-column__middle" aria-hidden="true" /></Link>
      <span className="goal-dash-column__name">{metric.name}</span><span className="goal-dash-note goal-dash-column__context" title={objective.title}>{scopeLabel(objective)} · {objective.title}</span><span className="goal-dash-note">{measurementLabel(metric)}</span>
    </li>)}</ul>{rows.length > 6 && <Button size="xs" variant="ghost" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? '6개만 보기' : `KR ${rows.length}개 모두 보기`}</Button>}</> : <p className="goal-dash-empty">목표 상세에서 KR을 추가하면 비교할 수 있습니다.</p>}
  </section>;
}

function WeeklyRecords({ snapshot, weeklyHref }) {
  const max = Math.max(1, ...snapshot.weeks.map(week => week.complete + week.pending));
  const failed = snapshot.observationState === 'error';
  const partial = snapshot.observationState === 'partial';
  return <section className="goal-dash-panel goal-dash-weekly" aria-label="주간 관측 기록">
    <div className="goal-section-head"><h3>주간 기록</h3><span className="goal-dash-note">최근 7주 · 서울 시간</span></div>
    <p className="goal-dash-note">기록 건수 · 성과값의 합계와 별도{partial ? ' · 일부 기록만 조회' : ''}</p>
    {failed ? <p className="goal-dash-empty" role="status">관측 기록을 읽지 못했습니다. 새로고침 후 확인하세요.</p> : <><ul className="goal-dash-weeks">{snapshot.weeks.map(week => <li key={week.start} className={week.current ? 'goal-dash-week--current' : ''}>
      <span className="num">{week.known ? `${partial ? '≥' : ''}${week.complete + week.pending}` : '—'}</span>
      <div className="goal-dash-week__track" role="img" aria-label={`${dayLabel(week.start)} 주: ${week.known ? `${partial ? '최소 ' : ''}확정 ${week.complete}건, 확인 전 ${week.pending}건` : '조회 부족'}${week.current ? ', 이번 주 진행 중' : ''}`}><span className="goal-dash-week__complete" style={{ height: `${week.complete / max * 100}%` }} /><span className="goal-dash-week__pending" style={{ height: `${week.pending / max * 100}%` }} /></div>
      <span className="goal-dash-note">{week.current ? '이번 주' : dayLabel(week.start)}</span>
    </li>)}</ul><div className="goal-dash-weekly__legend"><span>● 확정값 기록</span><span>▧ 확인 전 기록</span></div></>}
    <Link className="goal-section-link hub-row" href={weeklyHref}>업무별 주간 실측 보기 →</Link>
  </section>;
}

function GoalDashboard({ model, objectives, readings, today, hrefFor, weeklyHref, onOpen, kpis, attention, children }) {
  const snapshot = goalDashboardSnapshot(model, objectives, today, new Date().toISOString());
  const [allObjectives, setAllObjectives] = React.useState(false);
  const cards = objectives.map(objective => ({ objective, reading: readings.find(item => item.objective.id === objective.id)?.reading })).filter(item => item.reading);
  return <div className="goal-dashboard">
    <section className="goal-dash-overview" aria-label="OKR 종합 진행과 목표">
      <SummaryGauge snapshot={snapshot} />
      <div className="goal-dash-objectives">{(allObjectives ? cards : cards.slice(0, 3)).map(({ objective, reading }, index) => <ObjectiveTile key={objective.id} objective={objective} reading={reading} index={index} hrefFor={hrefFor} onOpen={onOpen} />)}{!cards.length && <p className="goal-dash-empty">조회 조건에 맞는 목표가 없습니다.</p>}{cards.length > 3 && <Button size="xs" variant="ghost" aria-expanded={allObjectives} onClick={() => setAllObjectives(value => !value)}>{allObjectives ? '3개만 보기' : `목표 ${cards.length}개 모두 보기`}</Button>}</div>
    </section>
    {kpis}
    <div className="goal-dash-analytics"><ProgressComparison rows={snapshot.keyResults} hrefFor={hrefFor} onOpen={onOpen} /><WeeklyRecords snapshot={snapshot} weeklyHref={weeklyHref} /></div>
    <section className="goal-dash-recent" aria-label="최근 지표 기록"><div className="goal-section-head"><h3>최근 기록</h3><span className="goal-dash-note">조회 목표의 최근 관측 5건</span></div>
      {snapshot.observationState === 'error' ? <p className="goal-dash-empty" role="status">최근 기록을 읽지 못했습니다. 새로고침 후 확인하세요.</p> : snapshot.recent.length ? <ul className="goal-dash-recent__list">{snapshot.recent.map(({ observation, metric, objective }) => <li key={observation.id}><Link className="goal-dash-recent-card hub-card-link" data-goal-id={objective.id} href={hrefFor(objective)} onClick={onOpen}><span className="goal-dash-note">{scopeLabel(objective)} · {recordDate(observation.observedAt)}</span><b>{metric.name}</b><strong className="stat">{observation.coverage === 'complete' && Number.isFinite(observation.value) ? `${new Intl.NumberFormat('ko-KR').format(observation.value)} ${metric.unit || ''}` : '확인 전'}</strong><span className="goal-dash-note">{objective.title}</span></Link></li>)}</ul> : <p className="goal-dash-empty">{snapshot.observationState === 'partial' ? '최근 기록을 모두 확인하지 못했습니다.' : '아직 기록이 없습니다. 체크인에서 실제값을 기록하세요.'}</p>}
    </section>
    <div className="goal-dash-bottom">{attention}</div>
    <section className="goal-dash-details" aria-label="목표 상세와 채점">{children}</section>
  </div>;
}

const entityLabels = { projects: '프로젝트', tasks: '할 일', campaigns: '캠페인', brands: '브랜드', content_items: '콘텐츠', deals: '딜', leads: '리드', customer_accounts: '고객', memos: '메모', journal_entries: '기록' };

function GoalLinkedWork({ link, objective, onRefresh }) {
  const [confirming, setConfirming] = React.useState(false);
  const command = useGoalCommand(`unlink:${objective.id}:${link.entityType}:${link.entityId}`, () => { setConfirming(false); onRefresh(); });
  const href = goalLinkedEntityHref(link);
  const title = link.entityTitle || entityLabels[link.entityType] || '업무';
  const stale = link.stale || ['scope-mismatch', 'unavailable'].includes(link.linkStatus);
  return <div className="goal-linked-work" aria-busy={command.state === 'saving'}>
    <div className="goal-link-row">{href ? <Link className="hub-row" href={href}><span>{title} 열기 →</span><span className="mono goal-muted">{link.entityId}</span></Link> : <div className="goal-linked-work__identity"><span>{title}</span><span className="mono goal-muted">{link.entityId}</span></div>}<Button disabled={command.locked} onClick={() => setConfirming(true)} aria-label={`${title} 목표 연결 해제`}>해제</Button></div>
    {stale && <p className="goal-muted" role="status">{link.linkStatus === 'scope-mismatch' ? '업무의 소속이 바뀌었습니다. 기존 연결을 해제한 뒤 현재 소속의 목표를 연결하세요.' : '업무 기록을 확인할 수 없습니다. 다시 불러오거나 이 연결을 해제할 수 있습니다.'}</p>}
    {confirming && <div className="goal-feedback"><p>목표와 업무 기록은 유지하고 이 연결만 해제합니다.</p><div className="goal-actions"><Button disabled={command.locked} onClick={() => command.submit('unlink_entity', { objectiveId: objective.id, entityType: link.entityType, entityId: link.entityId }, objective.revision)}>연결 해제</Button><Button disabled={command.state === 'saving'} onClick={() => setConfirming(false)}>취소</Button></div></div>}
    <GoalCommandFeedback command={command} />
    {command.state === 'conflict' && <Button onClick={() => { command.reset(); onRefresh(); }}>최신 목표 다시 확인</Button>}
  </div>;
}

function GoalDetail({ id, onClose }) {
  const model = useGoals(new URLSearchParams({ objectiveId: id }).toString());
  const objective = model.objectives.find(item => item.id === id);
  const [mode, setMode] = React.useState('');
  const root = React.useRef(null);
  const close = () => { if (!root.current?.querySelector('[aria-busy="true"]')) onClose(); };
  const chooseMode = value => { if (!root.current?.querySelector('[aria-busy="true"]')) setMode(mode === value ? '' : value); };
  const metrics = model.metrics.filter(metric => metric.objectiveId === id);
  const links = model.links.filter(link => link.objectiveId === id);
  const metricState = goalSectionState(model, 'operating_metrics');
  const linkState = goalSectionState(model, 'operating_goal_links');
  const isPersonal = objective?.scope === 'personal';

  return <Drawer title={objective?.title || '목표 상세'} subtitle="목표 · 측정 근거 · 연결된 실행" width="min(660px, 96vw)" onClose={close}>
    <div className="goal-detail" ref={root}>
      {model.status === 'loading' ? <Skeleton lines={5} height={18} label="목표 상세 불러오는 중" /> : model.status === 'error' || model.status === 'preview' ? <GoalReadFeedback model={model} /> : !objective ? <EmptyState title="이 목표를 찾지 못했습니다" description="목표 주소와 저장소 연결을 확인하세요." action={<Button onClick={model.refresh}>다시 불러오기</Button>} /> : <>
        <div className="goal-detail-meta">
          <Badge tone={isPersonal ? 'personal' : 'company'}>
            {goalScopeLabel(objective.scope)}
          </Badge>
          <TruthBadge state={model.status} />
          <span className="mono goal-muted">{objective.periodStart}–{objective.periodEnd} · {objective.timezone}</span>
          {objective.status === 'archived' && <Badge tone="neutral" size="xs">보관됨</Badge>}
        </div>
        {objective.description && <p className="goal-detail-desc">{objective.description}</p>}
        <div className="goal-actions"><Button variant="outline" onClick={() => chooseMode('edit')}>목표 정보 수정</Button>{objective.status !== 'archived' && <Button variant="outline" onClick={() => chooseMode('metric')}>지표 추가</Button>}<Button disabled={model.refreshing} onClick={model.refresh}>새로고침</Button></div>
        {objective.status === 'archived' && <p className="goal-muted">보관한 목표입니다. 관측 이력과 업무 연결을 유지합니다.</p>}
        {mode === 'edit' && <GoalObjectiveForm key={`edit:${id}`} objective={objective} onSaved={() => { setMode(''); model.refresh(); }} onCancel={() => setMode('')} />}
        {mode === 'metric' && <GoalMetricForm key={`metric:${id}`} objective={objective} onSaved={() => { setMode(''); model.refresh(); }} onCancel={() => setMode('')} />}
        {metricState !== 'live' && <div className="goal-feedback" role="status"><TruthBadge state={metricState} /><p>{metricState === 'error' ? '측정 지표를 읽지 못했습니다. 지표가 없는 상태로 판단하지 않습니다.' : '측정 지표의 일부만 읽었습니다.'}</p><Button onClick={model.refresh}>다시 불러오기</Button></div>}
        {metrics.length ? metrics.map(metric => <GoalMetricCard key={metric.id} metric={metric} objective={objective} observations={model.observations.filter(item => item.metricId === metric.id)} onRefresh={model.refresh} />) : metricState === 'live' ? <EmptyState title="측정 지표를 정해 주세요" description="결과·선행 활동·유지 기준을 구분하면 실제 변화를 확인할 수 있습니다." action={objective.status !== 'archived' ? <Button onClick={() => setMode('metric')}>지표 추가</Button> : undefined} /> : null}
        <section className="goal-links"><h3>연결된 실행 {linkState === 'error' ? '확인 필요' : `${links.length}개${linkState === 'partial' ? ' 이상' : ''}`}</h3><p className="goal-muted">업무 상세에서 연결을 추가하고, 여기에서 연결을 확인하거나 해제할 수 있습니다.</p>{linkState !== 'live' && <div className="goal-actions"><TruthBadge state={linkState} /><span>업무 연결을 모두 확인하지 못했습니다.</span><Button onClick={model.refresh}>다시 불러오기</Button></div>}{links.length ? links.map(link => <GoalLinkedWork key={`${link.entityType}:${link.entityId}`} link={link} objective={objective} onRefresh={model.refresh} />) : linkState === 'live' ? <p className="goal-muted">아직 연결된 업무가 없습니다.</p> : null}</section>
      </>}
    </div>
  </Drawer>;
}

function GoalQuickRecord({ objectiveId, metricId, onClose, onSaved }) {
  const model = useGoals(new URLSearchParams({ objectiveId }).toString());
  const objective = model.objectives.find(item => item.id === objectiveId);
  const metric = model.metrics.find(item => item.id === metricId && item.objectiveId === objectiveId);
  const root = React.useRef(null);
  const metricState = goalSectionState(model, 'operating_metrics');
  const valid = objective?.status === 'active' && metric?.sourceKey === 'manual' && metric.status !== 'archived' && !metric.archivedAt;
  return <Drawer title={metric?.name || '실제값 기록'} subtitle={objective?.title || '저장된 지표 확인'} presentation="compact" width="min(560px, 96vw)" onClose={() => { if (!root.current?.querySelector('[aria-busy="true"]')) onClose(); }}>
    <div ref={root}>{!['live','partial'].includes(model.status) ? <GoalReadFeedback model={model} /> : !metric && metricState !== 'live' ? <EmptyState title="측정 지표를 모두 확인하지 못했습니다" description="읽기 상태를 확인한 뒤 다시 기록하세요." action={<Button onClick={model.refresh}>다시 불러오기</Button>} /> : valid ? <GoalObservationForm key={metric.id} metric={metric} objective={objective} onCancel={onClose} onSaved={onSaved} /> : <EmptyState title="이 지표는 직접 기록할 수 없습니다" description="보관 여부와 측정 방법을 확인하세요." action={<Button onClick={onClose}>목록으로</Button>} />}</div>
  </Drawer>;
}

const objectiveToday = objective => new Intl.DateTimeFormat('en-CA', { timeZone: objective.timezone || 'Asia/Seoul' }).format(new Date());
const seoulToday = () => objectiveToday({ timezone: 'Asia/Seoul' });
const formatScore = score => score === null ? '—' : score.toFixed(2);
const activeManual = (metric, objective) => metric.sourceKey === 'manual' && objective?.status !== 'archived';
const sourceName = metric => GOAL_SOURCE_OPTIONS.find(item => item.value === metric.sourceKey)?.label?.split(' · ')[0] || metric.sourceKey;
const KPI_GLYPH = { inside: '✓', outside: '▲', partial: '◐', unmeasured: '○', unset: '○' };
// 붉은 줄은 한 화면에 세 곳까지만. 넘으면 머리말 집계와 행마다 ▲ 기호로만 알린다(DESIGN.md §5.3 red budget).
const OUTSIDE_RAIL_BUDGET = 3;

// 점수 트랙(0~1.0). 0.7 눈금이 바닥(약속)이다. `Progress`는 100%에서 축하 연출이 붙어 KR 점수에는 쓰지 않는다.
// paceAt을 주면 "지금쯤"(바닥 페이스) 눈금을 하나 더 그린다 — 주 1건 미만 KR의 눈금 한 줄.
function ScoreBar({ value, label, paceAt = null }) {
  const known = Number.isFinite(value);
  return <div className={`goal-score-bar${known ? '' : ' goal-score-bar--empty'}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={known ? value : undefined} aria-valuetext={known ? `점수 ${formatScore(value)} · 바닥 0.7 · 천장 미등록` : '점수 없음'}><span style={{ width: `${known ? Math.max(0, Math.min(1, value)) * 100 : 0}%` }} /><i className="goal-score-bar__floor" aria-hidden="true" />{Number.isFinite(paceAt) && <i className="goal-score-bar__pace" style={{ left: `${paceAt * 100}%` }} aria-hidden="true" />}</div>;
}
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const weekRange = key => { const day = Date.parse(`${key}T12:00:00Z`); const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * 86400000; const fmt = ms => { const d = new Date(ms); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }; return `${fmt(monday)}–${fmt(monday + 6 * 86400000)}`; };
const shortDate = key => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}(${WEEKDAY[new Date(`${key}T12:00:00Z`).getUTCDay()]})`;

function periodLabel(period) {
  if (period.phase === 'running') return period.daysLeft === 0 ? '오늘 마감' : `D-${period.daysLeft}`;
  return period.phase === 'ended' ? '기간 종료' : period.phase === 'upcoming' ? '시작 전' : '';
}

function KpiHealthMark({ health }) {
  return <span className={`goal-kpi-row__health goal-kpi-row__health--${health}`}><span aria-hidden="true">{KPI_GLYPH[health]}</span><span>{KPI_HEALTH_LABEL[health]}</span></span>;
}

const PACE_STATE_LABEL = { behind: '기준선보다 늦음', on: '기준선과 비슷함', ahead: '기준선보다 앞섬' };

// 월 KR을 주 단위로 쪼갠 한 줄 — 저장하지 않고 기간 경과율로 계산한다(lib/goal-concepts.js).
function paceLine(pace, unit) {
  if (!pace) return null;
  const u = unit ? unit : '';
  const weekly = pace.weeklyPace ? `주 ≈${formatPaceNumber(pace.weeklyPace)}${u}` : `기간 목표 ${formatPaceNumber(pace.target)}${u}`;
  if (pace.phase === 'upcoming') return `시작 전 · ${weekly}`;
  if (!pace.weeklyPace) return pace.state === 'unknown' ? `${weekly} · 마지막 주 판정` : `${weekly} · ${PACE_STATE_LABEL[pace.state]}`;
  const parts = [`기대 ${formatPaceNumber(pace.expected)}${u}`];
  if (pace.weeklyPace && pace.weekDone !== null) parts.push(`이번 주 ${formatPaceNumber(pace.weekDone)}/${formatPaceNumber(pace.weekQuota)}${u}`);
  return parts.join(' · ');
}

const elapsedPercent = period => period.phase === 'running' ? Math.round(period.elapsed * 100) : null;

function compactTargetLabel(metric) {
  const unit = metric.unit ? metric.unit : '';
  if (metric.direction === 'range') return `${metric.targetMin ?? '—'}–${metric.targetMax ?? '—'}${unit}`;
  return `${metric.target ?? '—'}${unit}`;
}

// KR 한 줄 (1a 컴팩트 스코어보드) — 이름 · 현재/목표 · 진행바+기대선 · % · 상태 알약 · 기록.
function KeyResultRow({ metric, objective, period, pace, hrefFor, onOpen, onRecord }) {
  const progress = keyResultProgress(metric);
  const tone = keyResultTone(metric, pace, period);
  const needsEvidence = metric.sourceKey === 'manual' && (metric.measurement?.coverage !== 'complete' || !Number.isFinite(metric.measurement?.value));
  const line = paceLine(pace, metric.unit);
  const subParts = [line, needsEvidence ? '미기록' : null, metric.progress?.state === 'partial' ? '일부 근거' : null].filter(Boolean);
  return <div className="goal-kr-row">
    <div className="goal-kr-row__identity">
      <span className="goal-kr-row__name">{metric.name}</span>
      {subParts.length > 0 && <span className="mono goal-kr-row__pace">{subParts.join(' · ')}</span>}
    </div>
    <div className="goal-kr-row__value" title={metric.direction === 'range' ? `기준 ${metric.targetMin ?? '—'}–${metric.targetMax ?? '—'}` : `바닥 ${metric.target ?? '—'} · 천장 미등록`}>
      <strong className="stat goal-kr-row__now">{measurementLabel(metric)}</strong>
      <span className="mono goal-kr-row__target">/ {compactTargetLabel(metric)}</span>
    </div>
    <div className="goal-kr-row__reading">
      <GaugeBar value={progress} marker={elapsedPercent(period)} tone={tone} label={`${metric.name} 바닥까지 진행률`} />
    </div>
    <div className={`goal-kr-row__pct${progress === null ? ' goal-kr-row__pct--empty' : ''}`}><span className="stat">{progress === null ? '—' : Math.round(progress)}</span>{progress !== null && <small>%</small>}</div>
    <div className="goal-kr-row__tone"><TonePill tone={tone} small /></div>
    <div className="goal-kr-row__action">{activeManual(metric, objective) ? <Button size="xs" variant="ghost" data-record-metric={metric.id} onClick={event => onRecord(event, objective, metric)} aria-label={`${metric.name} 실제값 기록`}>기록</Button> : <Link className="goal-kr-row__evidence hub-row" onClick={onOpen} href={hrefFor(objective)} aria-label={`${metric.name} 근거 보기`}>근거</Link>}</div>
  </div>;
}

const ZERO_KEEP_MARK = { kept: '✓ 지키는 중', broken: '▲ 어김', unknown: '○ 확인 전', pending: '○ 확인 전' };

// 목표 하나의 읽기 — 카드와 "이번 주 챙길 것"이 같은 계산을 쓴다.
function objectiveReading(objective, model, today = objectiveToday(objective)) {
  const { keyResults, references, healthIndicators } = splitObjectiveMetrics(model.metrics, objective.id);
  const period = objectivePeriod(objective, today);
  const { score, scored, unscored } = objectiveScore(keyResults);
  const observationsOf = metric => model.observations.filter(item => item.metricId === metric.id);
  const paceRows = keyResults.map(metric => ({ metric, objective, pace: keyResultPace(metric, objective, observationsOf(metric), today) }));
  const ownMetricIds = new Set(model.metrics.filter(metric => metric.objectiveId === objective.id).map(metric => metric.id));
  return {
    keyResults, references, healthIndicators, period, score, scored, unscored, paceRows,
    progress: objectiveProgress(keyResults),
    tone: objectivePaceState(score, period) || 'wait',
    paceOf: metric => paceRows.find(row => row.metric.id === metric.id)?.pace || null,
    lastAggregate: [...keyResults, ...references, ...healthIndicators].filter(metric => metric.sourceKey !== 'manual' && Number.isFinite(Date.parse(metric.measurement?.observedAt))).sort((a, b) => Date.parse(b.measurement.observedAt) - Date.parse(a.measurement.observedAt))[0],
    lastRecord: daysSinceObservation(model.observations.filter(item => ownMetricIds.has(item.metricId)), today),
    milestones: milestoneSummary(model.links.filter(link => link.objectiveId === objective.id), today),
  };
}

function GoalObjectiveCard({ objective, model, hrefFor, onOpen, onRecord, onAddMetric, onContinue }) {
  const today = objectiveToday(objective);
  const period = objectivePeriod(objective, today);
  if (period.phase === 'ended' && objective.status === 'active') return <li><GoalScorecard objective={objective} model={model} hrefFor={hrefFor} onOpen={onOpen} onRecord={onRecord} onRefresh={model.refresh} onContinue={onContinue} /></li>;
  const reading = objectiveReading(objective, model, today);
  const { keyResults, references, score, scored, unscored, progress, tone, milestones } = reading;
  const metricState = goalSectionState(model, 'operating_metrics');
  const expected = floorPaceScore(period);
  const orderedKrs = [...keyResults.filter(metric => metric.role === 'outcome'), ...keyResults.filter(metric => metric.role !== 'outcome')];
  const archived = objective.status === 'archived';
  const scoreHint = `점수 ${formatScore(score)}${expected !== null ? ` / 기대 ${formatScore(expected)}` : ''} · 바닥 0.7 · 천장 미등록${keyResults.length ? ` · KR ${scored}/${keyResults.length}${unscored ? ` (미측정 ${unscored})` : ''}` : ''}`;
  return <li>
    <article className="goal-card goal-oblk" aria-label={`${objective.title} 목표`}>
      <header className="goal-oblk__head">
        <div className="goal-oblk__title-line">
          <span className="goal-scope-tag">{goalScopeLabel(objective.scope)}</span>
          {archived && <Badge tone="neutral" size="xs">보관됨</Badge>}
          <Link className="goal-card-title hub-row" data-goal-id={objective.id} onClick={onOpen} href={hrefFor(objective)}>{objective.title}</Link>
          {periodLabel(period) && <span className="mono goal-oblk__dday">{periodLabel(period)}</span>}
        </div>
        <div className="goal-oblk__score" title={scoreHint}>
          <TonePill tone={tone} small />
          {progress === null ? <span className="goal-oblk__pct goal-oblk__pct--empty">측정 전</span> : <span className="stat goal-oblk__pct" aria-label={`바닥까지 ${Math.round(progress)}%`}>{Math.round(progress)}<small>%</small></span>}
        </div>
      </header>
      {orderedKrs.length ? <div className="goal-kr-list">
        {orderedKrs.map(metric => <KeyResultRow key={metric.id} metric={metric} objective={objective} period={period} pace={reading.paceOf(metric)} hrefFor={hrefFor} onOpen={onOpen} onRecord={onRecord} />)}
      </div> : <p className="goal-card-empty">{metricState === 'error' ? '지표를 읽지 못했습니다.' : '이 목표에는 아직 KR이 없습니다.'}</p>}
      {references.length > 0 && <details className="goal-card-refs"><summary>기록만 하는 지표 <span className="num">{references.length}</span>개 · 약속선 없음 — {references.map(metric => metric.name).join(' · ')}</summary>
        <ul>{references.map(metric => <li key={metric.id}><span className="goal-kr-row__name">{metric.name}</span><span className="mono goal-muted">{sourceName(metric)}</span><strong className="stat goal-kr-row__now">{measurementLabel(metric)}</strong>{activeManual(metric, objective) ? <Button size="xs" variant="outline" data-record-metric={metric.id} onClick={event => onRecord(event, objective, metric)} aria-label={`${metric.name} 실제값 기록`}>기록</Button> : null}</li>)}</ul>
        <p className="goal-muted">목표가 없는 값은 점수를 내지 않습니다. 약속선을 정하면 KR이 됩니다.</p></details>}
      <footer className="goal-oblk__foot">
        {milestones.total > 0 ? <div className="goal-milestones" aria-label="마일스톤">
          <span className="goal-milestones__label">마일스톤</span>
          {milestones.done.map(row => <MilestoneItem key={row.entityId} row={row} />)}
          {milestones.next && <MilestoneItem row={milestones.next} />}
          {milestones.openCount > 1 && <span className="goal-muted">+{milestones.openCount - 1}</span>}
        </div> : <span className="mono goal-muted goal-oblk__period-meta">{objective.periodStart}–{objective.periodEnd}</span>}
        <div className="goal-oblk__actions">
          {!archived && <Button size="xs" variant="ghost" icon="plus" onClick={() => onAddMetric(objective)}>KR 추가</Button>}
          <Link className="hub-row goal-section-link" onClick={onOpen} href={hrefFor(objective)}>상세 →</Link>
        </div>
      </footer>
    </article>
  </li>;
}

function MilestoneItem({ row }) {
  const href = goalLinkedEntityHref(row);
  const date = shortDate(row.dueKey);
  const when = row.done ? null : row.daysLeft < 0 ? <span className="goal-milestone__late">기한 지남 {-row.daysLeft}일</span> : <span className="mono goal-dday">{row.daysLeft === 0 ? '오늘' : `D-${row.daysLeft}`}</span>;
  const body = <><span aria-hidden="true">{row.done ? '✓' : '◔'}</span> <span className="mono">{date}</span> {row.entityTitle || '할 일'}</>;
  return <span className={`goal-milestone${row.done ? ' goal-milestone--done' : ''}`}>{href ? <Link className="hub-row" href={href}>{body}</Link> : body}{when && <> {when}</>}</span>;
}

// 이번 주 챙길 것 — 선 밖 KPI → 늦은 KR → 일주일 안 마일스톤 → 기록 공백. 최대 5개.
function attentionItems(readings, kpiRows, { hrefFor, checkHref } = {}) {
  const items = [];
  for (const row of kpiRows.filter(item => item.health === 'outside')) {
    const previous = row.trend.length >= 2 ? row.trend[row.trend.length - 2] : null;
    items.push({ key: `kpi:${row.metric.id}`, tone: 'out', glyph: '▲', title: `${row.metric.name} ${measurementLabel(row.metric)}`, detail: isZeroKeep(row.metric) ? `0${row.metric.unit || '건'} 유지 약속을 어김 · ${row.objective.title}` : `선 ${kpiThresholdLabel(row.metric)} 밖${previous !== null ? ` · 지난 ${formatPaceNumber(previous)}` : ''}`, href: hrefFor ? hrefFor(row.objective) : null, goalId: row.objective.id, cta: '목표 상세' });
  }
  for (const { objective, reading } of readings) {
    for (const { metric, pace } of reading.paceRows) {
      if (keyResultTone(metric, pace, reading.period) !== 'late') continue;
      const unit = metric.unit || '';
      const pct = keyResultProgress(metric);
      const elapsed = elapsedPercent(reading.period);
      const detail = pct !== null && elapsed !== null ? `진행 ${Math.round(pct)}% · 기대 ${elapsed}%` : pace ? `기대 ${formatPaceNumber(pace.expected)}${unit}` : '기준선보다 늦음';
      items.push({ key: `kr:${metric.id}`, tone: 'late', glyph: '↘', title: `${metric.name} (${measurementLabel(metric)})`, detail: `${detail} · ${objective.title}`, href: hrefFor ? hrefFor(objective) : null, goalId: objective.id, cta: activeManual(metric, objective) ? '기록·상세' : '근거 보기' });
    }
  }
  for (const { objective, reading } of readings) {
    const next = reading.milestones.next;
    if (next && next.daysLeft <= 7) {
      const entityHref = goalLinkedEntityHref(next);
      items.push({ key: `ms:${next.entityId}`, tone: next.daysLeft < 0 ? 'out' : 'wait', glyph: next.daysLeft < 0 ? '!' : '◔', title: `${next.entityTitle || '마일스톤'} ${shortDate(next.dueKey)}`, detail: `${next.daysLeft < 0 ? `기한 지남 ${-next.daysLeft}일` : next.daysLeft === 0 ? '오늘 마감' : `D-${next.daysLeft}`} · ${objective.title}`, href: entityHref || (hrefFor ? hrefFor(objective) : null), goalId: entityHref ? null : objective.id, cta: entityHref ? `${entityLabels[next.entityType] || '할 일'} 열기` : '목표 상세' });
    }
  }
  for (const { objective, reading } of readings) {
    if (reading.period.phase === 'running' && reading.keyResults.some(metric => metric.sourceKey === 'manual') && (reading.lastRecord === null || reading.lastRecord >= 3)) items.push({ key: `rec:${objective.id}`, tone: 'wait', glyph: '○', title: reading.lastRecord === null ? '아직 기록 없음' : `${reading.lastRecord}일째 기록 없음`, detail: `${objective.title} · 체크인에서 기록`, href: checkHref || (hrefFor ? hrefFor(objective) : null), goalId: checkHref ? null : objective.id, cta: '체크인' });
  }
  return items.slice(0, 5);
}

function GlanceView({ model, objectives, hrefFor, checkHref, kpiHref, weeklyHref, dashboard = false, onOpen, onRecord, onAddMetric, onContinue, onMemoSaved }) {
  const today = seoulToday();
  const readings = objectives.filter(objective => objective.status === 'active').map(objective => ({ objective, reading: objectiveReading(objective, model, objectiveToday(objective)) })).filter(item => item.reading.period.phase !== 'ended');
  const kpiRows = kpiRowsFor(model, objectives, today);
  const krCount = objectives.reduce((sum, objective) => sum + splitObjectiveMetrics(model.metrics, objective.id).keyResults.length, 0);
  const runningElapsed = readings.find(item => item.reading.period.phase === 'running')?.reading.period;
  const elapsedPct = runningElapsed ? elapsedPercent(runningElapsed) : null;
  const paceRows = readings.flatMap(item => item.reading.paceRows);
  const paceText = paceSuggestion(paceRows);
  const suggestedRow = paceRows.filter(row => row.pace?.state === 'behind').sort((a, b) => a.pace.gap / a.pace.target - b.pace.gap / b.pace.target)[0];
  const shapeText = readings.map(item => objectiveSuggestion(item.reading.keyResults, item.reading.healthIndicators)).find(Boolean);
  const suggestion = paceText ? { text: paceText, href: hrefFor(suggestedRow.objective), cta: 'KR 근거' } : shapeText ? { text: shapeText } : null;
  const memoTarget = readings.find(item => item.objective.scope === 'personal' && item.reading.period.phase === 'running')?.objective;
  const metricState = goalSectionState(model, 'operating_metrics');
  const objectiveState = goalSectionState(model, 'operating_objectives');
  const recordsReadable = [metricState, objectiveState].every(state => ['live', 'partial'].includes(state));
  const recordsComplete = metricState === 'live' && objectiveState === 'live';
  const recordRows = recordsReadable ? recordFirstRows(goalCheckRows({ ...model, objectives }, { status: 'active' })) : [];
  if (dashboard) return <GoalDashboard model={model} objectives={objectives} readings={objectives.map(objective => ({ objective, reading: objectiveReading(objective, model, objectiveToday(objective)) }))} today={today} hrefFor={hrefFor} weeklyHref={weeklyHref} onOpen={onOpen}
    kpis={<KpiStrip rows={kpiRows} today={today} kpiHref={kpiHref} hrefFor={hrefFor} onOpen={onOpen} railBudget={OUTSIDE_RAIL_BUDGET} readState={goalSectionState(model, 'operating_metrics')} onRecord={onRecord} limit={4} />}
    attention={<><GlanceAttention onOpen={onOpen} items={attentionItems(readings, kpiRows, { hrefFor, checkHref })} suggestion={suggestion} unknown={model.status !== 'live' || readings.some(item => item.reading.unscored > 0) || kpiRows.some(row => !['inside', 'outside'].includes(row.health))} />{memoTarget && <WeeklyMemo key={`${memoTarget.scope}:${memoTarget.id}:${objectiveToday(memoTarget)}`} objective={memoTarget} today={objectiveToday(memoTarget)} hrefFor={hrefFor} onOpen={onOpen} onSaved={onMemoSaved} />}</>}>
    <details open={objectives.some(objective => objective.status === 'active' && objectivePeriod(objective, objectiveToday(objective)).phase === 'ended')}><summary>목표별 상세 · 월말 채점 <span className="num">{objectives.length}</span></summary><ul className="goal-list stagger-up">{objectives.map(objective => <GoalObjectiveCard key={objective.id} objective={objective} model={model} hrefFor={hrefFor} onOpen={onOpen} onRecord={onRecord} onAddMetric={onAddMetric} onContinue={onContinue} />)}</ul></details>
  </GoalDashboard>;
  return <>
    <div className="workflow-goal-priority">
      <section className="workflow-records" aria-label="먼저 기록할 지표">
        <div className="goal-section-head"><h3 className="goal-section-title">먼저 기록</h3><Link className="hub-row goal-section-link" href={checkHref}>체크인 전체 →</Link></div>
        <p className="goal-muted">직접 기록 지표 · 근거가 비어 있는 항목부터</p>
        {metricState !== 'live' && <p className="goal-muted" role="status"><TruthBadge state={metricState} /> 읽힌 지표만 표시합니다.</p>}
        {objectiveState !== 'live' && <p className="goal-muted" role="status"><TruthBadge state={objectiveState} /> 읽힌 목표만 표시합니다.</p>}
        {recordRows.length ? <ul className="workflow-records__list">{recordRows.map(({ objective, metric, needsEvidence }) => <li className="workflow-records__row" key={metric.id}>
          <div className="workflow-records__identity"><strong>{metric.name}</strong><span>{objective.title}</span><span>{measurementLabel(metric)} · {needsEvidence ? '근거 확인 필요' : '직접 기록'}</span></div>
          <Button variant="outline" size="sm" data-record-metric={metric.id} onClick={event => onRecord(event, objective, metric)} aria-label={`${metric.name} 실제값 기록`}>기록</Button>
        </li>)}</ul> : <p className="goal-muted">{recordsComplete ? '이 조건의 직접 기록 지표가 없습니다. 체크인에서 자동 집계의 근거를 확인하세요.' : '직접 기록 지표를 모두 확인하지 못했습니다.'}</p>}
      </section>
      <GlanceAttention onOpen={onOpen} items={attentionItems(readings, kpiRows, { hrefFor, checkHref })} suggestion={suggestion} unknown={model.status !== 'live' || readings.some(item => item.reading.unscored > 0) || kpiRows.some(row => !['inside', 'outside'].includes(row.health))} />
    </div>
    <KpiStrip rows={kpiRows} today={today} kpiHref={kpiHref} hrefFor={hrefFor} onOpen={onOpen} railBudget={OUTSIDE_RAIL_BUDGET} readState={metricState} />
    <section className="goal-glance__main" aria-label="목표 · OKR">
      <div className="goal-section-head"><h3 className="goal-section-title">목표 · OKR</h3><span className="goal-muted">목표 <span className="num">{objectives.length}</span> · KR <span className="num">{krCount}</span></span></div>
      <ul className="goal-list stagger-up">{objectives.map(objective => <GoalObjectiveCard key={objective.id} objective={objective} model={model} today={today} hrefFor={hrefFor} onOpen={onOpen} onRecord={onRecord} onAddMetric={onAddMetric} onContinue={onContinue} />)}</ul>
    </section>
    {memoTarget && <details className="workflow-disclosure"><summary>이번 주 메모</summary><div className="workflow-disclosure__body"><WeeklyMemo key={`${memoTarget.scope}:${memoTarget.id}:${objectiveToday(memoTarget)}`} objective={memoTarget} today={objectiveToday(memoTarget)} hrefFor={hrefFor} onOpen={onOpen} onSaved={onMemoSaved} /></div></details>}
  </>;

}

function BulletChart({ metric, observations, timezone = 'Asia/Seoul' }) {
  const { now, previous, previousAt, partial } = kpiBulletReading(metric, observations);
  const scale = bulletScale(metric, [now, previous]);
  if (!scale) return <span className="goal-muted">선 미설정</span>;
  const [lo, hi] = scale.band;
  const fmt = value => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(value);
  const previousDate = previousAt ? new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(previousAt)) : null;
  return <div className="goal-bullet-wrap">
    <div className="goal-bullet" role="img" aria-label={`${metric.name}: 허용 ${kpiThresholdLabel(metric)}, 이번 ${now === null ? '미측정' : fmt(now)}${partial ? ' · 일부 근거 · 선 안/밖 판단 보류' : ''}${previous !== null ? `, 이전 확정 ${fmt(previous)} · ${previousDate}` : ''}`}>
      <span className="goal-bullet__band" style={{ left: `${Math.min(lo, hi)}%`, width: `${Math.abs(hi - lo)}%` }} />
      {now !== null && <span className="goal-bullet__bar" style={{ width: `${scale.at(now)}%` }} />}
      {previous !== null && <i className="goal-bullet__last" style={{ left: `${scale.at(previous)}%` }} />}
    </div>
    <div className="goal-otrack__scale mono" aria-hidden="true"><span style={{ left: 0 }}>{fmt(scale.min)}</span>{previous !== null && <span style={{ left: `${scale.at(previous)}%` }}>확정 {fmt(previous)}</span>}<span style={{ right: 0 }}>{fmt(scale.max)}</span></div>
  </div>;
}

function ZeroKeepCells({ metric, objective, observations, today }) {
  const { cells, streak } = zeroKeepWeeks(metric, objective, observations, today);
  const glyph = { kept: '✓', broken: '▲', unknown: '·', pending: '·', future: '·' };
  return <div className="goal-zero-weeks-wrap">
    <ol className="goal-zero-weeks" aria-label={`${metric.name} 주별 유지`}>{cells.map(cell => <li key={cell.start} className={`goal-zero-weeks__cell goal-zero-weeks__cell--${cell.state}${cell.phase === 'now' ? ' goal-zero-weeks__cell--now' : ''}`} aria-label={`${cell.label} 주 ${ZERO_KEEP_MARK[cell.state] || '앞으로'}`}>{glyph[cell.state]}</li>)}</ol>
    <span className="mono goal-muted">{streak ? `${streak}주째 유지` : '유지 기록 없음'}{cells.some(cell => cell.phase === 'now' && cell.state === 'pending') ? ' · 이번 주 확인 전' : ''}</span>
  </div>;
}

function KpiRow({ metric, objective, health, railed, observations, hrefFor, onOpen, onRecord }) {
  const today = objectiveToday(objective);
  const zero = isZeroKeep(metric);
  return <li className={`goal-kpi-row${health === 'outside' && railed ? ' goal-kpi-row--outside' : ''}`}>
    <div className="goal-kpi-row__identity">
      <Link className="hub-row goal-kpi-row__name" data-goal-id={objective.id} onClick={onOpen} href={hrefFor(objective)}>{metric.name}</Link>
      <span className="goal-muted goal-kpi-row__meta">{goalScopeLabel(objective.scope)} · {objective.title} · <span className="mono">{sourceName(metric)} · {objective.periodStart}–{objective.periodEnd}</span> · {metricFreshnessLabel(metric, today, objective.timezone)}</span>
    </div>
    <div className="goal-kpi-row__reading"><strong className="stat goal-kpi-row__now">{measurementLabel(metric)}</strong><span className="mono goal-kpi-row__line">{kpiThresholdLabel(metric)}</span></div>
    <div className="goal-kpi-row__chart">{zero ? <ZeroKeepCells metric={metric} objective={objective} observations={observations} today={today} /> : <BulletChart metric={metric} observations={observations} timezone={objective.timezone} />}</div>
    <KpiHealthMark health={health} />
    <div className="goal-kpi-row__action">{activeManual(metric, objective) ? <Button size="xs" variant="outline" data-record-metric={metric.id} onClick={event => onRecord(event, objective, metric)} aria-label={`${metric.name} 실제값 기록`}>기록</Button> : <span className="goal-muted">자동</span>}</div>
  </li>;
}

function KpiView({ model, objectives, search, onClearSearch, hrefFor, onOpen, onRecord, onAdd }) {
  const scopedModel = { ...model, objectives };
  const available = goalKpiRows(scopedModel, { status: 'all' });
  const rows = sortKpis(goalKpiRows(scopedModel, { status: 'all', search }).map(({ metric, objective }) => {
    const observations = model.observations.filter(item => item.metricId === metric.id);
    return { metric, objective, observations, health: kpiHealth(metric) };
  }));
  const metricState = goalSectionState(model, 'operating_metrics');
  const objectiveState = goalSectionState(model, 'operating_objectives');
  const summary = kpiSummary(rows);
  const railed = summary.outside > 0 && summary.outside <= OUTSIDE_RAIL_BUDGET;
  // 묶음은 선의 모양으로 나눈다 — 범위·문턱형은 불릿 차트, 0 유지형은 주별 ✓ 칸. 읽는 주기(매주·월말) 칸은 0053 뒤.
  const groups = [
    { key: 'line', title: '지킬 범위', hint: '허용 범위 · 이번 값 · 지난 관측', rows: rows.filter(row => !isZeroKeep(row.metric)) },
    { key: 'zero', title: '0 유지', hint: '하지 않을 것 · 주마다 확인', rows: rows.filter(row => isZeroKeep(row.metric)) },
  ].filter(group => group.rows.length);
  return <>
    <div className="goal-view-head">
      <p className="goal-view-summary">{rows.length ? <>지킬 선 <span className="num">{summary.total}</span> · ✓ 선 안 <span className="num">{summary.inside}</span> · <span className={summary.outside ? 'goal-outside-count' : undefined}>▲ 선 밖 <span className="num">{summary.outside}</span></span> · ○ 확인 전 <span className="num">{summary.unmeasured}</span></> : 'KPI는 지킬 건강 지표이며, 현재는 목표 기간 단위로 집계합니다.'}</p>
      <Button size="xs" variant="outline" icon="plus" onClick={onAdd}>KPI 추가</Button>
    </div>
    {!rows.length ? metricState !== 'live' || objectiveState !== 'live' ? <EmptyState title="KPI 목록을 모두 확인하지 못했습니다" description="읽기 상태를 확인한 뒤 검색하거나 지표를 추가하세요." action={<Button onClick={model.refresh}>다시 불러오기</Button>} /> : available.length ? <EmptyState title="검색에 맞는 KPI가 없습니다" description="목표 또는 지표 이름으로 다시 검색하세요." action={<Button onClick={onClearSearch}>검색 지우기</Button>} /> : <EmptyState title="이 조건에 등록된 KPI가 없습니다" description="목표 상태를 바꾸거나 지킬 선을 추가하세요. KPI는 점수 대신 선 안·밖으로 봅니다." action={<Button variant="outline" onClick={onAdd}>KPI 추가</Button>} /> : <div className="goal-kpi-card">{groups.map(group => <section key={group.key} className="goal-kpi-group" aria-label={group.title}>
      <h4 className="goal-kr-group__title"><span>{group.title}</span><span className="goal-muted">{group.hint}</span></h4>
      <ul className="goal-kpi-list stagger-up">{group.rows.map(row => <KpiRow key={row.metric.id} {...row} railed={railed} hrefFor={hrefFor} onOpen={onOpen} onRecord={onRecord} />)}</ul>
    </section>)}</div>}
  </>;
}

function GoalCheckList({ rows, onRecord, onOpen, hrefFor, model }) {
  const metricState = goalSectionState(model, 'operating_metrics');
  if (!rows.length && metricState !== 'live') return <EmptyState title="측정 지표를 모두 확인하지 못했습니다" description="읽기 실패나 조회 한도 때문에 목록을 확인할 수 없습니다." action={<Button onClick={model.refresh}>다시 불러오기</Button>} />;
  if (!rows.length) return <EmptyState title="이 조건의 측정 지표가 없습니다" description="OKR·KPI 보기에서 지표를 추가하거나 확인 조건을 바꾸세요." />;

  return <ul className="goal-check-list stagger-up" aria-label="지표 체크인">{rows.map(({ objective, metric, manual, needsEvidence }) => {
    const kpi = isHealthIndicator(metric);
    const score = keyResultScore(metric);
    const targetStr = kpi ? kpiThresholdLabel(metric) : metric.direction === 'range' ? `기준 ${metric.targetMin ?? '—'}–${metric.targetMax ?? '—'} ${metric.unit}` : `약속선 ${metric.target ?? '—'} ${metric.unit}`;

    return <li key={metric.id} className="goal-check-row">
      <div className="goal-check-identity">
        <Link className="hub-row" data-goal-id={objective.id} onClick={onOpen} href={hrefFor(objective)}>
          {metric.name}
        </Link>
        <div className="goal-check-meta-row">
          <Badge tone="neutral" variant="outline" size="xs">{GOAL_CONCEPT_BY_ROLE[metric.role]?.label || '결과 KR'}</Badge>
          <span className="goal-muted">{goalScopeLabel(objective.scope)} · {objective.title}</span>
          <span className="mono goal-muted">{objective.periodStart}–{objective.periodEnd}</span>
        </div>
      </div>

      <div className="goal-check-value">
        <strong className="stat">{measurementLabel(metric)}</strong>
        <span className="goal-muted mono">{targetStr}</span>
        {kpi ? <KpiHealthMark health={kpiHealth(metric)} /> : <div className="goal-check-progress-wrap"><ScoreBar value={score} label={`${metric.name} 점수`} /><span className="num mono goal-muted">{score === null ? '점수 전' : `${formatScore(score)} · 바닥 0.7`}</span></div>}
        <span className="goal-muted">{needsEvidence ? '○ 근거 확인 필요' : manual ? '직접 기록 지표' : '자동 집계'}{metric.progress?.state === 'partial' ? ' · ◐ 일부 근거' : ''}</span>
      </div>

      <div className="goal-check-action">
        {manual && objective.status !== 'archived' ? (
          <Button variant="outline" data-record-metric={metric.id} onClick={event => onRecord(event, objective, metric)} aria-label={`${metric.name} 실제값 기록`}>
            기록
          </Button>
        ) : (
          <Link className="hub-row goal-check-evidence" onClick={onOpen} href={hrefFor(objective)}>
            근거 보기 →
          </Link>
        )}
      </div>
    </li>;
  })}</ul>;
}

function KpiAddDrawer({ objectives, onClose, onSaved }) {
  const [objectiveId, setObjectiveId] = React.useState(objectives[0]?.id || '');
  const objective = objectives.find(item => item.id === objectiveId);
  return <Drawer title="KPI 추가" subtitle="현재 목표 기간의 지킬 선 — 점수 대신 선 안·밖으로 봅니다." presentation="compact" width="min(560px, 96vw)" onClose={onClose}>
    {!objectives.length ? <EmptyState title="먼저 목표를 만드세요" description="KPI는 진행 중인 목표에 붙습니다. 목표를 만든 뒤 지킬 선을 추가할 수 있습니다." action={<Button onClick={onClose}>닫기</Button>} /> : <>
      <SelectField label="붙일 목표" value={objectiveId} options={objectives.map(item => ({ value: item.id, label: `${goalScopeLabel(item.scope)} · ${item.title}` }))} onChange={event => setObjectiveId(event.target.value)} />
      {objective && <GoalMetricForm key={objective.id} objective={objective} defaultRole="guardrail" onSaved={onSaved} onCancel={onClose} />}
    </>}
  </Drawer>;
}

export function Goals() {
  const router = useRouter(), params = useSearchParams();
  // Work 탭(OKR·KPI)에서 열렸으면 목표 링크가 그 탭 안에 머문다. 현황의 목표·성과는 기본 경로.
  const onWorkTab = (usePathname() || '').startsWith(GOAL_WORK_BASE);
  const routeBase = onWorkTab ? GOAL_WORK_BASE : undefined;
  const scope = goalScope(params.get('scope'));
  const query = scope ? new URLSearchParams({ scope }).toString() : '';
  const model = useGoals(query);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('active');
  const [checkFilter, setCheckFilter] = React.useState('all');
  const [notice, setNotice] = React.useState('');
  const [metricModalObjective, setMetricModalObjective] = React.useState(null);
  const [kpiAdding, setKpiAdding] = React.useState(false);
  const [continueFrom, setContinueFrom] = React.useState(null);
  const view = goalView(params);
  const today = seoulToday();
  const checking = view === 'check';
  const weekly = view === 'weekly';
  const kpi = view === 'kpi';
  const recordId = params.get('record');
  const rows = goalCheckRows(model, { status, search, filter: checkFilter });
  const [creatingBusy, setCreatingBusy] = React.useState(false);
  const createButton = React.useRef(null);
  const opener = React.useRef(null);
  const focusAfterClose = React.useRef(null);
  const creating = params.get('new') === 'goal';
  const selectedId = params.get('goal');
  const statusObjectives = model.objectives.filter(item => status === 'all' || item.status === status);
  const filtered = statusObjectives.filter(item => `${item.title} ${item.description || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const base = goalHref(null, scope, { check: checking, weekly, kpi, base: routeBase });
  const hrefFor = objective => goalHref(objective.id, scope, { check: checking, weekly, kpi, base: routeBase });
  const openRecord = (event, objective, metric) => { opener.current = event.currentTarget; setNotice(''); router.push(`${hrefFor(objective)}&record=${metric.id}`, {scroll:false}); };
  const create = React.useCallback(event => {
    opener.current = event?.currentTarget || createButton.current;
    router.push(goalHref(null, scope, { check: checking, weekly, kpi, create: true, base: routeBase }), { scroll: false });
  }, [router, scope, checking, weekly, kpi, routeBase]);

  React.useEffect(() => {
    const key = event => {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey || creating || selectedId || metricModalObjective || kpiAdding || continueFrom || document.querySelector('[role="dialog"]') || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (model.status === 'live' || model.status === 'partial') { event.preventDefault(); create(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [create, creating, selectedId, metricModalObjective, kpiAdding, continueFrom, model.status]);

  const close = () => { focusAfterClose.current = { id: selectedId, metricId: recordId }; router.replace(base, { scroll: false }); };

  React.useEffect(() => {
    if (creating || selectedId || !focusAfterClose.current) return;
    const targetId = focusAfterClose.current.id;
    const metricId = focusAfterClose.current.metricId;
    focusAfterClose.current = null;
    const frame = requestAnimationFrame(() => {
      const recordButton = metricId && [...document.querySelectorAll('[data-record-metric]')].find(node => node.dataset.recordMetric === metricId);
      const item = targetId && [...document.querySelectorAll('[data-goal-id]')].find(node => node.dataset.goalId === targetId);
      const target = opener.current?.isConnected && !opener.current.closest('[role="dialog"]') ? opener.current : recordButton || item || createButton.current;
      target?.focus({ preventScroll: true });
      opener.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [creating, selectedId]);

  return <div className={`goals-page fade-up${onWorkTab ? ' goals-page--reference' : ''}`}>
    <header className="goal-header">
      <div>
        <span className="goal-eyebrow">{onWorkTab ? '내 작업 · 목표' : '현황 · 목표'}</span>
        <div className="goal-header__title-row">
          <h2 className="goal-page-title">{onWorkTab ? 'OKR·KPI' : '목표·성과'}</h2>
          {!weekly && <TruthBadge state={model.status} />}
          {model.refreshing && <span className="mono goal-muted">갱신 중…</span>}
        </div>
        <p className="goal-header-sub"><b>{shortDate(today)}</b><span className="mono">이번 주 {weekRange(today)}</span></p>
        {view !== 'okr' && <p className="goal-header-desc"><strong>OKR</strong>은 이 기간에 이루려는 변화와 그것을 재는 핵심 결과(KR)입니다. <strong>KPI</strong>는 지킬 건강 지표이며, 현재는 목표 기간 단위로 기록하고 집계합니다.</p>}
      </div>
      <div className="goal-actions">
        <Button disabled={model.refreshing} onClick={model.refresh} icon="refresh">새로고침</Button>
        <Button ref={createButton} variant="primary" icon="plus" disabled={!['live', 'partial'].includes(model.status)} onClick={create}>목표 만들기 <Kbd>N</Kbd></Button>
      </div>
    </header>

    <div className="goal-toolbar">
      <div className="goal-toolbar-controls">
        <SegmentedControl
          label="목표 화면 보기"
          value={view}
          options={[
            { key: 'okr', label: '기록·주의' },
            { key: 'kpi', label: 'KPI' },
            { key: 'check', label: '체크인' },
            { key: 'weekly', label: '주간 실측' },
          ]}
          onChange={value => router.replace(goalHref(null, scope, { check: value === 'check', weekly: value === 'weekly', kpi: value === 'kpi', base: routeBase }), { scroll: false })}
        />
        <SegmentedControl
          label="소속 선택"
          value={scope || 'all'}
          options={[
            { key: 'all', label: '전체 소속' },
            { key: 'personal', label: '개인' },
            { key: 'company', label: 'ClassIn' },
          ]}
          onChange={val => router.replace(goalHref(null, val === 'all' ? '' : val, { check: checking, weekly, kpi, base: routeBase }), { scroll: false })}
        />
      </div>
      <span className="goal-toolbar-caption">
        {weekly ? '지난 주들의 실제 기록을 같은 정의로 비교하세요.' : kpi ? '점수 없이 선 안·밖과 추이로 봅니다. 선 밖인 것부터 보입니다.' : checking ? '숫자와 근거를 훑고 바로 실제값을 기록하세요. KR과 KPI를 함께 봅니다.' : <><i className="goal-legend-marker" aria-hidden="true" />세로선 = 기대(기간 경과) · 막대 끝 = 바닥(약속) · 점수 = 0.7 × 진행률</>}
      </span>
    </div>

    {!weekly && (
      <div className="goal-filters">
        <TextField
          label={checking || kpi ? '목표·지표 검색' : '목표 검색'}
          type="search"
          placeholder={checking || kpi ? '목표 또는 지표 이름' : '목표 이름 또는 설명'}
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <SelectField
          label="목표 상태"
          value={status}
          options={[
            { value: 'active', label: '진행 중' },
            { value: 'archived', label: '보관한 목표' },
            { value: 'all', label: '전체 상태' },
          ]}
          onChange={event => setStatus(event.target.value)}
        />
        {checking && (
          <SelectField
            label="확인할 지표"
            value={checkFilter}
            options={[
              { value: 'all', label: '모든 지표' },
              { value: 'manual', label: '직접 기록 지표' },
              { value: 'unmeasured', label: '근거 확인 필요' },
            ]}
            onChange={event => setCheckFilter(event.target.value)}
          />
        )}
      </div>
    )}

    {notice && <p role="status" className="goal-muted">{notice}</p>}
    {checking && <p className="goal-muted">자동 값은 각 목표의 개인·회사 전체 기간 기록입니다. 실제값 0과 미측정을 구분하며, 연결만으로 실적이 늘지 않습니다.</p>}
    {!weekly && model.status === 'partial' && <p className="goal-muted" role="status">일부 기록을 확인하지 못했습니다. 읽힌 값만 표시하며 부족한 근거로 달성을 확정하지 않습니다.</p>}

    {weekly ? (
      <GoalWeeklyActuals scope={scope} onCreate={['live', 'partial'].includes(model.status) ? create : undefined} />
    ) : !['live', 'partial'].includes(model.status) || !model.objectives.length ? (
      <GoalReadFeedback model={model} onCreate={create} />
    ) : checking ? (
      <GoalCheckList rows={rows} onRecord={openRecord} onOpen={event => { opener.current = event.currentTarget; }} hrefFor={hrefFor} model={model} />
    ) : kpi ? (
      <KpiView model={model} objectives={statusObjectives} search={search} onClearSearch={() => setSearch('')} hrefFor={hrefFor} onOpen={event => { opener.current = event.currentTarget; }} onRecord={openRecord} onAdd={() => setKpiAdding(true)} />
    ) : !filtered.length ? (
      <EmptyState title="조건에 맞는 목표가 없습니다" action={<Button onClick={() => { setSearch(''); setStatus('all'); }}>검색·필터 지우기</Button>} />
    ) : (
      <GlanceView model={model} objectives={filtered} hrefFor={hrefFor} checkHref={goalHref(null, scope, { check: true, base: routeBase })} dashboard={onWorkTab} weeklyHref={goalHref(null, scope, { weekly: true, base: routeBase })} kpiHref={goalHref(null, scope, { kpi: true, base: routeBase })} onOpen={event => { opener.current = event.currentTarget; }} onRecord={openRecord} onAddMetric={obj => setMetricModalObjective(obj)} onContinue={(objective, extra) => setContinueFrom({ objective, change: extra?.change || '' })} onMemoSaved={model.refresh} />
    )}

    {creating && (
      <Drawer title="목표 만들기" subtitle="원하는 변화와 실제 계획 기간부터 정하세요." presentation="compact" width="min(560px, 96vw)" onClose={() => { if (!creatingBusy) close(); }}>
        <GoalObjectiveForm key={`new:${scope || 'personal'}`} scope={scope || 'personal'} onBusyChange={setCreatingBusy} onCancel={close} onSaved={result => { const entity = result.entity; model.refresh(); router.replace(entity?.id ? hrefFor(entity) : base, { scroll: false }); }} />
      </Drawer>
    )}

    {metricModalObjective && (
      <Drawer title="KR 추가" subtitle={metricModalObjective.title} presentation="compact" width="min(560px, 96vw)" onClose={() => setMetricModalObjective(null)}>
        <GoalMetricForm
          key={`metric:new:${metricModalObjective.id}`}
          objective={metricModalObjective}
          onSaved={() => { setMetricModalObjective(null); model.refresh(); }}
          onCancel={() => setMetricModalObjective(null)}
        />
      </Drawer>
    )}

    {continueFrom && (
      <GoalContinueDrawer objective={continueFrom.objective} metrics={model.metrics} change={continueFrom.change} onClose={() => setContinueFrom(null)} onCreated={entity => { setContinueFrom(null); model.refresh(); router.replace(hrefFor(entity), { scroll: false }); }} />
    )}

    {kpiAdding && (
      <KpiAddDrawer objectives={model.objectives.filter(item => item.status === 'active' && (!scope || item.scope === scope))} onClose={() => setKpiAdding(false)} onSaved={() => { setKpiAdding(false); model.refresh(); }} />
    )}

    {selectedId && recordId && !creating && (
      <GoalQuickRecord objectiveId={selectedId} metricId={recordId} onClose={close} onSaved={() => { setNotice('관측을 저장했습니다. 다음 지표를 이어서 확인하세요.'); model.refresh(); close(); }} />
    )}

    {selectedId && !recordId && !creating && (
      <GoalDetail key={selectedId} id={selectedId} onClose={close} />
    )}
  </div>;
}
