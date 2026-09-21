"use client";
import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Drawer, EmptyState, Kbd, SegmentedControl, SelectField, Skeleton, TextField, TruthBadge } from '../hub-primitives';
import { goalHref, goalScope, goalSectionState, goalLinkedEntityHref, measurementLabel } from '@/lib/goal-client';
import { goalCheckRows } from '@/lib/goal-input-ux';
import { useGoals, useGoalCommand } from '../use-goals';
import { GoalCommandFeedback, GoalMetricCard, GoalMetricForm, GoalMetricSummary, GoalObjectiveForm, GoalObservationForm, GoalReadFeedback, goalScopeLabel } from '../goal-components';

const entityLabels = { projects: '프로젝트', tasks: '할 일', campaigns: '캠페인', brands: '브랜드', content_items: '콘텐츠', deals: '딜', leads: '리드', customer_accounts: '고객', memos: '메모', journal_entries: '기록' };
function GoalLinkedWork({ link, objective, onRefresh }) {
  const [confirming, setConfirming] = React.useState(false);
  const command = useGoalCommand(`unlink:${objective.id}:${link.entityType}:${link.entityId}`, () => { setConfirming(false); onRefresh(); });
  const href = goalLinkedEntityHref(link);
  const title = link.entityTitle || entityLabels[link.entityType] || '업무';
  const stale = link.stale || ['scope-mismatch', 'unavailable'].includes(link.linkStatus);
  return <div className="goal-linked-work" aria-busy={command.state === 'saving'}>
    <div className="goal-link-row">{href ? <Link className="hub-row" href={href}><span>{title} 열기 →</span><span className="mono goal-muted">{link.entityId}</span></Link> : <div className="goal-linked-work__identity"><span>{title}</span><span className="mono goal-muted">{link.entityId}</span></div>}<Button disabled={command.locked} onClick={() => setConfirming(true)} aria-label={`${title} 목표 연결 해제`}>해제</Button></div>
    {stale && <p className="goal-muted" role="status">{link.linkStatus === 'scope-mismatch' ? '업무의 소속이 바뀌었습니다. 기존 연결을 해제한 뒤 현재 소속의 목표를 연결하세요.' : '업무 원장을 확인할 수 없습니다. 다시 불러오거나 이 연결을 해제할 수 있습니다.'}</p>}
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
  return <Drawer title={objective?.title || '목표 상세'} subtitle="목표 · 측정 근거 · 연결된 실행" width="min(660px, 96vw)" onClose={close}>
    <div className="goal-detail" ref={root}>
      {model.status === 'loading' ? <Skeleton lines={5} height={18} label="목표 상세 불러오는 중" /> : model.status === 'error' || model.status === 'preview' ? <GoalReadFeedback model={model} /> : !objective ? <EmptyState title="이 목표를 찾지 못했습니다" description="목표 주소와 저장소 연결을 확인하세요." action={<Button onClick={model.refresh}>다시 불러오기</Button>} /> : <>
        <div className="goal-actions"><TruthBadge state={model.status} /><span className="goal-muted">{goalScopeLabel(objective.scope)} · {objective.periodStart}–{objective.periodEnd} · {objective.timezone}</span></div>
        {objective.description && <p>{objective.description}</p>}
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

function GoalCheckList({ rows, onRecord, hrefFor, model }) {
  const metricState = goalSectionState(model, 'operating_metrics');
  if (!rows.length && metricState !== 'live') return <EmptyState title="측정 지표를 모두 확인하지 못했습니다" description="읽기 실패나 조회 한도 때문에 목록을 확인할 수 없습니다." action={<Button onClick={model.refresh}>다시 불러오기</Button>} />;
  if (!rows.length) return <EmptyState title="이 조건의 측정 지표가 없습니다" description="목표별 보기에서 지표를 추가하거나 확인 조건을 바꾸세요." />;
  return <ul className="goal-check-list" aria-label="지표 빠른 체크">{rows.map(({ objective, metric, manual, needsEvidence }) => <li key={metric.id} className="goal-check-row">
    <div className="goal-check-identity"><Link className="hub-row" href={hrefFor(objective)}>{metric.name}</Link><span className="goal-muted">{objective.title} · {goalScopeLabel(objective.scope)}</span><span className="mono goal-muted">{objective.periodStart}–{objective.periodEnd}</span></div>
    <div className="goal-check-value"><strong className="stat">{measurementLabel(metric)}</strong><span className="goal-muted">{metric.direction === 'range' ? `기준 ${metric.targetMin ?? '—'}–${metric.targetMax ?? '—'}` : `목표 ${metric.target ?? '—'}`} {metric.unit}</span><span className="goal-muted">{needsEvidence ? '근거 확인 필요' : metric.progress?.achieved ? '기준 달성' : '관측값 확인됨'} · {manual ? '직접 기록' : '자동 집계'}</span></div>
    <div className="goal-check-action">{manual && objective.status !== 'archived' ? <Button variant="outline" data-record-metric={metric.id} onClick={event => onRecord(event, objective, metric)} aria-label={`${metric.name} 실제값 기록`}>기록</Button> : <Link className="hub-row goal-check-evidence" href={hrefFor(objective)}>근거 보기 →</Link>}</div>
  </li>)}</ul>;
}

export function Goals() {
  const router = useRouter(), params = useSearchParams();
  const scope = goalScope(params.get('scope'));
  const query = scope ? new URLSearchParams({ scope }).toString() : '';
  const model = useGoals(query);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('active');
  const [checkFilter, setCheckFilter] = React.useState('all');
  const [notice, setNotice] = React.useState('');
  const checking = params.get('check') === '1';
  const recordId = params.get('record');
  const rows = goalCheckRows(model, { status, search, filter: checkFilter });
  const [creatingBusy, setCreatingBusy] = React.useState(false);
  const createButton = React.useRef(null);
  const opener = React.useRef(null);
  const focusAfterClose = React.useRef(null);
  const creating = params.get('new') === 'goal';
  const selectedId = params.get('goal');
  const filtered = model.objectives.filter(item => (status === 'all' || item.status === status) && `${item.title} ${item.description || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const base = goalHref(null, scope) + (checking ? '&check=1' : '');
  const hrefFor = objective => goalHref(objective.id, objective.scope) + (checking ? '&check=1' : '');
  const openRecord = (event, objective, metric) => { opener.current = event.currentTarget; setNotice(''); router.push(`${hrefFor(objective)}&record=${metric.id}`, {scroll:false}); };
  const create = React.useCallback(event => {
    opener.current = event?.currentTarget || createButton.current;
    router.push(`${base}&new=goal`, { scroll: false });
  }, [router, base]);
  React.useEffect(() => {
    const key = event => {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey || creating || selectedId || document.querySelector('[role="dialog"]') || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (model.status === 'live' || model.status === 'partial') { event.preventDefault(); create(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [create, creating, selectedId, model.status]);
  const close = () => { focusAfterClose.current = { id: selectedId, metricId: recordId }; router.replace(base, { scroll: false }); };
  React.useEffect(() => {
    if (creating || selectedId || !focusAfterClose.current) return;
    const targetId = focusAfterClose.current.id;
    const metricId = focusAfterClose.current.metricId;
    focusAfterClose.current = null;
    // The input's autoFocus runs before Drawer captures activeElement. Restore
    // the explicit route opener after the dialog's own unmount cleanup.
    const frame = requestAnimationFrame(() => {
      const recordButton = metricId && [...document.querySelectorAll('[data-record-metric]')].find(node => node.dataset.recordMetric === metricId);
      const item = targetId && [...document.querySelectorAll('[data-goal-id]')].find(node => node.dataset.goalId === targetId);
      const target = opener.current?.isConnected && !opener.current.closest('[role="dialog"]') ? opener.current : recordButton || item || createButton.current;
      target?.focus({ preventScroll: true });
      opener.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [creating, selectedId]);
  return <div className="goals-page fade-up">
    <header className="goal-header"><div><h2>목표·성과</h2><p className="goal-muted">실행과 결과를 연결하고, 날짜가 있는 근거로 변화를 확인합니다.</p><div className="goal-actions"><TruthBadge state={model.status} /><span className="goal-muted">{scope ? goalScopeLabel(scope) : '전체 소속'}{model.refreshing ? ' · 갱신 중' : ''}</span></div></div><div className="goal-actions"><Button disabled={model.refreshing} onClick={model.refresh}>새로고침</Button><Button ref={createButton} variant="primary" icon="plus" disabled={!['live', 'partial'].includes(model.status)} onClick={create}>목표 만들기 <Kbd>N</Kbd></Button></div></header>
    <div className="goal-toolbar"><SegmentedControl label="목표 화면 보기" value={checking ? 'check' : 'goals'} options={[{key:'goals',label:'목표별 보기'},{key:'check',label:'빠른 체크'}]} onChange={value => router.replace(goalHref(null,scope) + (value === 'check' ? '&check=1' : ''), {scroll:false})} /><span className="goal-muted">{checking ? '숫자와 근거를 훑고 바로 기록하세요.' : '목표의 방향과 진행 상황을 확인하세요.'}</span></div>
    <div className="goal-filters"><TextField label={checking ? '목표·지표 검색' : '목표 검색'} type="search" placeholder={checking ? '목표 또는 지표 이름' : '목표 이름'} value={search} onChange={event => setSearch(event.target.value)} /><SelectField label="목표 상태" value={status} options={[{ value: 'active', label: '진행 중' }, { value: 'archived', label: '보관한 목표' }, { value: 'all', label: '전체 상태' }]} onChange={event => setStatus(event.target.value)} />{checking && <SelectField label="확인할 지표" value={checkFilter} options={[{value:'all',label:'모든 지표'},{value:'manual',label:'직접 기록 지표'},{value:'unmeasured',label:'근거 확인 필요'}]} onChange={event => setCheckFilter(event.target.value)} />}</div>
    {notice && <p role="status" className="goal-muted">{notice}</p>}
    {checking && <p className="goal-muted">자동 값은 각 목표의 개인·회사 전체 기간 기록입니다. 실제값 0과 미측정을 구분하며, 연결만으로 실적이 늘지 않습니다.</p>}
    {model.status === 'partial' && <p className="goal-muted" role="status">일부 원장을 확인하지 못했습니다. 읽힌 값만 표시하며 부족한 근거로 달성을 확정하지 않습니다.</p>}
    {!['live', 'partial'].includes(model.status) || !model.objectives.length ? <GoalReadFeedback model={model} onCreate={create} /> : checking ? <GoalCheckList rows={rows} onRecord={openRecord} hrefFor={hrefFor} model={model} /> : !filtered.length ? <EmptyState title="조건에 맞는 목표가 없습니다" action={<Button onClick={() => { setSearch(''); setStatus('all'); }}>검색·필터 지우기</Button>} /> : <ul className="goal-list">{filtered.map(objective => {
      const metrics = model.metrics.filter(item => item.objectiveId === objective.id && item.status !== 'archived');
      const metricState = goalSectionState(model, 'operating_metrics');
      return <li key={objective.id}><Card pad={false}><Link className="goal-list-link hub-row" data-goal-id={objective.id} onClick={event => { opener.current = event.currentTarget; }} href={goalHref(objective.id, objective.scope)}><div className="goal-actions"><strong>{objective.title}</strong><span className="goal-muted">{goalScopeLabel(objective.scope)}{objective.status === 'archived' ? ' · 보관됨' : ''}</span></div>{objective.description && <span className="goal-muted">{objective.description}</span>}<span className="mono goal-muted">{objective.periodStart}–{objective.periodEnd}</span><span className="goal-muted">측정 지표 {metricState === 'error' ? '확인 필요' : `${metrics.length}개${metricState === 'partial' ? ' 이상' : ''}`} · 상세와 근거 보기 →</span></Link>{metrics.slice(0, 2).map(metric => <div key={metric.id} style={{ padding: '12px 16px', borderTop: '1px solid var(--line-soft)' }}><h3 style={{ marginBottom: 8 }}>{metric.name}</h3><GoalMetricSummary metric={metric} scope={objective.scope} /></div>)}</Card></li>;
    })}</ul>}
    {creating && <Drawer title="목표 만들기" subtitle="원하는 변화와 실제 계획 기간부터 정하세요." presentation="compact" width="min(560px, 96vw)" onClose={() => { if (!creatingBusy) close(); }}><GoalObjectiveForm key={`new:${scope || 'personal'}`} scope={scope || 'personal'} onBusyChange={setCreatingBusy} onCancel={close} onSaved={result => { const entity = result.entity; model.refresh(); router.replace(entity?.id ? goalHref(entity.id, entity.scope || scope || 'personal') : base, { scroll: false }); }} /></Drawer>}
    {selectedId && recordId && !creating && <GoalQuickRecord objectiveId={selectedId} metricId={recordId} onClose={close} onSaved={() => { setNotice('관측을 저장했습니다. 다음 지표를 이어서 확인하세요.'); model.refresh(); close(); }} />}
    {selectedId && !recordId && !creating && <GoalDetail key={selectedId} id={selectedId} onClose={close} />}
  </div>;
}
