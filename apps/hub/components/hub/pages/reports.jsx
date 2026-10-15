"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CertaintyBadge, Drawer, EmptyState, Kbd, SegmentedControl, SelectField, Skeleton, TextAreaField, TextField, TruthBadge, useToast } from '../hub-primitives';
import { OfficeWorkflowPanel } from '../office-workflow-panel';
import { OfficeArtifact } from '../office-artifact';
import { usePageCreateHotkey } from '../use-crm-keyboard';
import { reportScopeForWorkspace } from '../workspace-map';
import { weeklyPeriods, weeklySourceLabels } from '../../../lib/weekly-report-fields';
import { REPORT_KINDS, REPORT_SCOPES, createReportWriter, filterReports, groupReportsByWeek, mergeReportPages, reportFiltersFromSearch, reportHref, reportKindLabel, reportScopeLabel, reportWeekOptions, reportsReadState, reportWriteMessage, safeReportLink, weeklyCaptureError, weeklyReportFacts } from './reports-model';
import './reports.css';

export function ReportsReadNotice({ state, onRetry }) {
  if (state.status === 'loading') return <Card><Skeleton lines={5} label="보고서 불러오는 중" /></Card>;
  if (state.status === 'error') return <Card><EmptyState icon="x" title="보고서를 불러오지 못했어요" description="연결 상태를 확인하고 다시 읽어 주세요." action={<Button variant="outline" onClick={onRetry}>다시 불러오기</Button>} /></Card>;
  if (state.status === 'preview') return <Card><EmptyState icon="link" title="보고서 저장소 연결 필요" description="보고서 원장과 연결하면 저장된 주간 실측·리서치·평가를 볼 수 있습니다." action={<Button variant="outline" onClick={onRetry}>연결 다시 확인</Button>} /></Card>;
  if (state.status === 'partial') return <div className="reports-notice" role="status"><TruthBadge state="partial" /><span>읽지 못한 자료: {(state.failedSources || []).join(' · ') || '최근 기록 일부'}</span><Button variant="ghost" size="xs" onClick={onRetry}>다시 불러오기</Button></div>;
  return null;
}

export function ReportFacts({ report }) {
  if (report.kind === 'weekly' && report.facts?.stats) return <><dl className="reports-stats">{weeklyReportFacts(report).map(row => <div key={row.key}><dt>{row.label}</dt><dd className="stat">{row.text === null ? '—' : row.text}<span>{row.text === null ? '미측정' : row.unit}</span></dd></div>)}</dl><p className="reports-muted">‘—’는 0이 아닌 미측정입니다. 이 기간에 저장한 실측입니다.</p>{!!report.facts.failedSources?.length && <p className="reports-muted">확인할 자료: {weeklySourceLabels(report.facts.failedSources).join(' · ')}</p>}</>;
  if (report.kind === 'research' && Array.isArray(report.facts?.facts)) return <>{report.facts.change && <p className="reports-body">{report.facts.change}</p>}<ul className="reports-facts">{report.facts.facts.map((fact, index) => <li key={index}>{fact}{Array.isArray(report.facts.factEvidence) && report.facts.factEvidence.filter(evidence => evidence.text === fact && evidence.quote).map((evidence, evidenceIndex) => <details className="reports-evidence" key={evidenceIndex}><summary>원문 근거 <span className="mono">{evidence.locator || '위치 미확인'}</span></summary><blockquote>{evidence.quote}</blockquote></details>)}</li>)}</ul>{report.facts.whyBrand && <p className="reports-muted">브랜드와의 관련성: {report.facts.whyBrand}</p>}</>;
  if (typeof report.facts?.body === 'string') return <div className="reports-body">{report.facts.body}</div>;
  return <p className="reports-muted">{report.source === 'office' ? '이 AI 초안의 근거는 같은 기간의 저장 실측과 원본 오피스 기록에서 확인해 주세요.' : '이 기록에는 별도 실측이 없습니다. 원본의 해석과 자료를 확인해 주세요.'}</p>;
}

export function ReportDetail({ report, onDecision, onBack, onNavigate }) {
  const canDecide = report.id?.startsWith('stored:') && Number.isInteger(report.revision);
  const refs = Array.isArray(report.sourceRefs) ? report.sourceRefs : [];
  const actions = Array.isArray(report.actions) ? report.actions : [];
  return <article className="reports-detail" aria-label="보고서 상세"><div className="reports-detail-scroll">
    <Button className="reports-back" variant="ghost" onClick={onBack}>← 목록</Button>
    <div className="reports-meta"><span>{reportKindLabel(report.kind)} · {reportScopeLabel(report.scope)}</span><TruthBadge state={['live', 'partial', 'preview', 'error'].includes(report.status) ? report.status : 'error'} /></div>
    <h3>{report.title}</h3><p className="reports-period mono">{report.periodStart && report.periodEnd ? `${report.periodStart} — ${report.periodEnd}` : report.createdAt ? new Date(report.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기간 미확인'}</p>
    {report.summary && <p className="reports-summary">{report.summary}</p>}
    <section><div className="reports-section-title"><h4>사실 · 저장한 근거</h4>{report.facts?.verificationLevel === 'unreviewed' && <CertaintyBadge state="unknown" label="운영자 검토 전" />}</div><ReportFacts report={report} /></section>
    <section><div className="reports-section-title"><h4>해석 · AI 초안</h4><CertaintyBadge state="recommended" label="검토용 해석" />{report.sourceCheck === 'untraced' && <CertaintyBadge state="unknown" label="근거 확인 안 됨" />}</div><OfficeArtifact className="reports-body" artifact={{ kind: report.artifactKind || 'text', body: typeof report.interpretation === 'string' && report.interpretation ? report.interpretation : '아직 저장된 해석이 없습니다.' }} />
      {report.kind === 'weekly' && ['personal', 'company'].includes(report.scope) && report.periodStart && report.periodEnd && <OfficeWorkflowPanel intent="weekly_report" scope={report.scope === 'company' ? 'classin' : 'personal'} originRef={{ periodStart: report.periodStart, periodEnd: report.periodEnd, timezone: 'Asia/Seoul' }} title="이 기간 주간 정리" onNavigate={onNavigate} />}
      {report.facts?.conditions && <p className="reports-body">적용 조건: {report.facts.conditions}</p>}{report.facts?.counterevidence && <p className="reports-body">반대 근거: {report.facts.counterevidence}</p>}{report.facts?.unknown && <p className="reports-body">아직 확인할 것: {report.facts.unknown}</p>}
      {report.facts?.draft && <details className="reports-disclosure"><summary>검토용 원고</summary><div className="reports-body">{report.facts.draft}</div></details>}
      {!!report.uncertainties?.length && <div><h4>확인 한계</h4><ul className="reports-facts">{report.uncertainties.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      {!!report.dissent?.length && <div><h4>다른 설명 · 남은 이견</h4><ul className="reports-facts">{report.dissent.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      {report.nextStep?.kind === 'create_task' && <div><h4>다음 행동 제안</h4><p className="reports-body">{report.nextStep.label || report.nextStep.fields?.title}</p>{report.nextStep.fields?.description && <p className="reports-muted">{report.nextStep.fields.description}</p>}<p className="reports-muted">실행 여부는 원본 오피스 기록에서 확인해 주세요.</p></div>}
    </section>
    <section><div className="reports-section-title"><h4>판단 · 운영자 기록</h4>{report.decision && <CertaintyBadge state="confirmed" label="운영자 기록" />}</div><div className="reports-body">{typeof report.decision === 'string' && report.decision ? report.decision : '아직 기록한 판단이 없습니다.'}</div>{canDecide && <Button variant="outline" size="sm" onClick={() => onDecision(report)}>{report.decision ? '판단 수정' : '판단 기록'}</Button>}</section>
    {!!refs.length && <section><h4>자료와 원본</h4><ul className="reports-sources">{refs.map((ref, index) => { const href = safeReportLink(ref.url || ref.href); return <li key={index}>{href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{ref.label || ref.title || ref.explanation || ref.type || '원본 자료'} ↗</a> : <span>{ref.label || ref.title || ref.explanation || ref.type || ref.id || '원본 자료'}</span>}{ref.accessLevel && <span className="reports-muted">{ref.accessLevel} {ref.locator || ''}</span>}</li>; })}</ul></section>}
    {!!actions.length && <div className="reports-footer-links">{actions.map((action, index) => { const href = safeReportLink(action.href || action.url || action.path); return href ? <a key={index} href={href}>{action.label || '원본 열기'} →</a> : null; })}</div>}
  </div></article>;
}

function completedPeriod(scope) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const period = weeklyPeriods({ scope, today, count: 1 }).find(entry => !entry.current);
  return { scope, periodStart: period?.periodStart || '', periodEnd: period?.periodEnd || '' };
}

export function Reports({ onNavigate }) {
  const router = useRouter(), searchParams = useSearchParams(), toast = useToast();
  const [state, setState] = React.useState({ status: 'loading', reports: [], failedSources: [] });
  const [filters, setFilters] = React.useState(() => reportFiltersFromSearch(searchParams));
  const [selectedId, setSelectedId] = React.useState(searchParams.get('report'));
  const [mobileDetail, setMobileDetail] = React.useState(Boolean(searchParams.get('report')));
  const [drawer, setDrawer] = React.useState(searchParams.get('new') === 'report' ? 'create' : null);
  const [createKind, setCreateKind] = React.useState('weekly');
  const [weekly, setWeekly] = React.useState(() => completedPeriod(reportScopeForWorkspace(searchParams.get('scope')) === 'company' ? 'company' : 'personal'));
  const [document, setDocument] = React.useState({ kind: 'evaluation', scope: 'personal', title: '', body: '', sourceUrls: '' });
  const [decisionForm, setDecisionForm] = React.useState(null), [decisionConflict, setDecisionConflict] = React.useState(false);
  const [detailState, setDetailState] = React.useState('idle');
  const [readGeneration, setReadGeneration] = React.useState(0);
  const [moreBusy, setMoreBusy] = React.useState(false), [moreError, setMoreError] = React.useState('');
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const writer = React.useRef(null), readVersion = React.useRef(0), fileInput = React.useRef(null);
  const lifecycle = React.useRef({ active: false, epoch: 0, list: null, more: null, detail: null, saving: false, fileVersion: 0 });
  if (!writer.current) writer.current = createReportWriter();
  const openCreate = React.useCallback(() => { if (!lifecycle.current.saving) { setError(''); setDrawer('create'); } }, []);
  usePageCreateHotkey(openCreate);
  const reload = React.useCallback(async () => {
    const life = lifecycle.current;
    if (!life.active) return;
    const version = ++readVersion.current;
    setReadGeneration(version);
    for (const key of ['list', 'more', 'detail']) { life[key]?.abort(); life[key] = null; }
    const controller = new AbortController();
    life.list = controller;
    const current = () => life.active && version === readVersion.current && life.list === controller;
    setMoreBusy(false); setMoreError(''); setDetailState('idle');
    setState(previous => ({ ...previous, status: 'loading' }));
    try {
      // Let Strict Mode cleanup invalidate its first setup before dispatching transport.
      await Promise.resolve();
      if (!current()) return;
      const response = await fetch('/api/hub/reports', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const data = await response.json();
      if (current()) setState(reportsReadState(response.ok ? data : null));
    } catch { if (current()) setState(reportsReadState(null)); }
    finally { if (current()) life.list = null; }
  }, []);
  React.useEffect(() => {
    const life = lifecycle.current;
    life.active = true; life.epoch++;
    reload();
    return () => {
      life.active = false; life.epoch++; life.fileVersion++; readVersion.current++;
      for (const key of ['list', 'more', 'detail']) { life[key]?.abort(); life[key] = null; }
    };
  }, [reload]);
  React.useEffect(() => { lifecycle.current.fileVersion++; }, [drawer, createKind]);
  React.useEffect(() => {
    const nextFilters = reportFiltersFromSearch(searchParams), id = searchParams.get('report');
    setFilters(nextFilters); setSelectedId(id); setMobileDetail(Boolean(id));
    if (searchParams.get('new') === 'report') { openCreate(); router.replace(reportHref(id, nextFilters), { scroll: false }); }
  }, [searchParams, router, openCreate]);
  const visible = React.useMemo(() => filterReports(state.reports, filters), [state.reports, filters]);
  const selected = selectedId ? state.reports.find(report => report.id === selectedId) : visible[0];
  const latestDecision = decisionForm ? state.reports.find(report => report.id === `stored:${decisionForm.reportId}`) : null;
  const weeks = React.useMemo(() => reportWeekOptions(state.reports), [state.reports]);
  const groups = React.useMemo(() => groupReportsByWeek(visible), [visible]);
  React.useEffect(() => {
    if (!selectedId || selected || !['live', 'partial'].includes(state.status)) return;
    const life = lifecycle.current, version = readVersion.current, controller = new AbortController();
    life.detail = controller;
    const current = () => life.active && version === readVersion.current && life.detail === controller;
    setDetailState('loading');
    (async () => {
      try {
        await Promise.resolve();
        if (!current()) return;
        const response = await fetch(`/api/hub/reports?report=${encodeURIComponent(selectedId)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const data = await response.json();
        if (!current()) return;
        const detail = reportsReadState(response.ok ? data : null);
        const record = detail.reports.find(report => report.id === selectedId);
        if (record) { setState(previous => ({ ...previous, reports: mergeReportPages(previous.reports, [record]) })); setDetailState('idle'); }
        else setDetailState(detail.status === 'error' ? 'error' : 'missing');
      } catch { if (current()) setDetailState('error'); }
    })();
    return () => { controller.abort(); if (life.detail === controller) life.detail = null; };
  }, [selectedId, selected, state.status, readGeneration]);
  async function loadMore() {
    const life = lifecycle.current;
    if (!life.active || life.list || life.more || !state.nextCursor || !['live', 'partial'].includes(state.status)) return;
    const version = readVersion.current, controller = new AbortController();
    life.more = controller;
    const current = () => life.active && version === readVersion.current && life.more === controller;
    setMoreBusy(true); setMoreError('');
    try {
      const response = await fetch(`/api/hub/reports?cursor=${encodeURIComponent(state.nextCursor)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const next = reportsReadState(response.ok ? await response.json() : null);
      if (!current()) return;
      if (!['live', 'partial'].includes(next.status)) setMoreError('이전 보고서를 읽지 못했습니다. 다시 시도해 주세요.');
      else setState(previous => ({ ...previous, status: previous.status === 'partial' || next.status === 'partial' ? 'partial' : 'live', reports: mergeReportPages(previous.reports, next.reports), nextCursor: next.nextCursor || null, failedSources: [...new Set([...previous.failedSources, ...next.failedSources])] }));
    } catch { if (current()) setMoreError('이전 보고서를 읽지 못했습니다. 다시 시도해 주세요.'); }
    finally { if (current()) { life.more = null; setMoreBusy(false); } }
  }
  function changeFilter(key, value) { const next = { ...filters, [key]: value }; setFilters(next); setSelectedId(null); setMobileDetail(false); router.replace(reportHref(null, next), { scroll: false }); }
  function openReport(report) { setSelectedId(report.id); setMobileDetail(true); router.replace(reportHref(report.id, filters), { scroll: false }); }
  function back() { setMobileDetail(false); setSelectedId(null); router.replace(reportHref(null, filters), { scroll: false }); }
  function openDecision(report) { if (lifecycle.current.saving) return; setDecisionConflict(false); setDecisionForm({ reportId: report.id.slice(7), expectedRevision: report.revision, decision: report.decision || '' }); setError(''); setDrawer('decision'); }
  async function save(event) {
    event.preventDefault();
    const life = lifecycle.current, epoch = life.epoch;
    if (!life.active || life.saving || !drawer) return;
    if (drawer === 'create' && createKind === 'weekly') { const periodError = weeklyCaptureError(weekly); if (periodError) { setError(periodError); return; } }
    life.saving = true; life.fileVersion++;
    const current = () => life.active && life.epoch === epoch;
    setBusy(true); setError('');
    const command = drawer === 'decision' ? { action: 'record-decision', ...decisionForm } : createKind === 'weekly' ? { action: 'capture-weekly', ...weekly } : { action: 'save-document', kind: document.kind, scope: document.scope, title: document.title, body: document.body, sourceRefs: document.sourceUrls.split('\n').map(url => url.trim()).filter(Boolean).map(url => ({ url, label: url.slice(0, 240) })) };
    try {
      const result = await writer.current(command);
      if (!current()) return;
      if (['saved', 'duplicate'].includes(result?.status)) {
        setDrawer(null);
        const id = result.report?.id || result.reportId;
        if (id) { const reportId = id.startsWith('stored:') ? id : `stored:${id}`; setSelectedId(reportId); setFilters({ kind: 'all', scope: 'all', week: 'all' }); setMobileDetail(true); router.replace(reportHref(reportId), { scroll: false }); }
        if (command.action === 'save-document') setDocument(previous => ({ ...previous, title: '', body: '', sourceUrls: '' }));
        await reload();
        if (current()) toast.success(command.action === 'record-decision' ? '판단을 저장했습니다.' : '보고서를 저장했습니다.');
      } else {
        setError(reportWriteMessage(result));
        if (result?.status === 'conflict') { setDecisionConflict(command.action === 'record-decision'); await reload(); }
      }
    } catch { if (current()) setError('저장 응답을 받지 못했습니다. 입력을 유지했으니 같은 내용으로 다시 시도해 주세요.'); }
    finally { if (current()) { life.saving = false; setBusy(false); } }
  }
  async function importFile(event) {
    const input = event.target, file = input.files?.[0], life = lifecycle.current;
    if (!file || !life.active || life.saving || drawer !== 'create' || createKind !== 'document') return;
    const version = ++life.fileVersion, draft = document;
    const current = () => life.active && life.fileVersion === version;
    // Clear immediately so choosing the same file again creates a fresh request.
    input.value = '';
    if (file.size > 100000) { setError('문서는 100KB 이내의 텍스트 파일을 선택해 주세요.'); return; }
    try {
      const body = await file.text();
      if (!current()) return;
      if (body.length > 40000) { setError('문서 본문은 40,000자 이내로 등록해 주세요.'); return; }
      setDocument(previous => previous === draft ? { ...previous, title: previous.title || file.name.replace(/\.(md|txt)$/i, ''), body } : previous);
      setError('');
    } catch { if (current()) setError('파일을 읽지 못했습니다. 본문을 붙여넣어 주세요.'); }
  }
  return <div className="hub-page reports-hub"><header className="reports-head"><div><h2>보고서</h2><p>저장한 사실과 해석을 읽고, 다음 판단을 남깁니다.</p></div><Button variant="primary" icon="plus" onClick={openCreate}>보고서 추가 <Kbd>N</Kbd></Button></header>
    <div className="reports-toolbar"><div className="reports-kind-scroll"><SegmentedControl label="보고서 장르" options={REPORT_KINDS} value={filters.kind} onChange={value => changeFilter('kind', value)} /></div><div className="reports-selects"><SelectField label="범위" options={REPORT_SCOPES} value={filters.scope} onChange={event => changeFilter('scope', event.target.value)} /><SelectField label="주차" options={[{ value: 'all', label: '모든 주차' }, ...weeks]} value={filters.week} onChange={event => changeFilter('week', event.target.value)} /></div></div>
    <ReportsReadNotice state={state} onRetry={reload} />
    {['live', 'partial'].includes(state.status) && <div className={`reports-workspace${mobileDetail ? ' reports-detail-open' : ''}`}><section className="reports-list" aria-label="보고서 목록"><div className="reports-list-head"><strong>보관함 <span className="num">{visible.length}</span></strong><Button variant="ghost" size="xs" onClick={reload}>새로고침</Button></div>
      {visible.length ? groups.map(group => <React.Fragment key={group.week || 'unknown'}><div className="reports-week-label mono">{group.week ? `${group.week} 주` : '기간 미확인'}</div>{group.reports.map(report => <button key={report.id} type="button" className={`reports-row hub-row${selected?.id === report.id ? ' reports-row--active' : ''}`} aria-current={selected?.id === report.id ? 'true' : undefined} onClick={() => openReport(report)}><span className="reports-meta">{reportKindLabel(report.kind)} · {reportScopeLabel(report.scope)}{report.status === 'partial' && <TruthBadge state="partial" />}</span><strong>{report.title}</strong><span className="reports-row-summary">{report.summary || '저장한 본문 보기'}</span><span className="reports-row-foot mono">{report.periodStart && report.periodEnd ? `${report.periodStart} — ${report.periodEnd}` : report.createdAt?.slice(0, 10) || '시각 미확인'}</span></button>)}</React.Fragment>) : <EmptyState icon="brief" title="조건에 맞는 보고서가 없어요" description="주간 실측을 저장하거나 평가·QA 문서를 등록해 주세요." action={<Button variant="outline" onClick={filters.kind !== 'all' || filters.scope !== 'all' || filters.week !== 'all' ? () => { setFilters({ kind: 'all', scope: 'all', week: 'all' }); router.replace('/dashboard/reports'); } : openCreate}>{filters.kind !== 'all' || filters.scope !== 'all' || filters.week !== 'all' ? '필터 지우기' : '보고서 추가'}</Button>} />}{state.nextCursor && <div className="reports-more"><Button variant="outline" disabled={moreBusy} onClick={loadMore}>{moreBusy ? '이전 보고서 확인 중…' : '이전 보고서 더 보기'}</Button>{moreError && <p role="alert" className="reports-error">{moreError}</p>}</div>}</section>
      {selected ? <ReportDetail key={selected.id} report={selected} onBack={back} onDecision={openDecision} onNavigate={onNavigate} /> : detailState === 'loading' ? <Card><Skeleton lines={6} label="이 보고서의 원본 불러오는 중" /></Card> : <Card><EmptyState icon="brief" title={selectedId ? detailState === 'error' ? '이 보고서를 읽지 못했어요' : '이 보고서를 현재 목록에서 찾지 못했어요' : '보고서를 선택해 주세요'} description={selectedId ? '최근 기록의 조회 범위 또는 원본 연결 상태를 확인해 주세요.' : '사실·해석·판단을 나누어 읽습니다.'} action={selectedId ? <Button variant="outline" onClick={back}>목록으로</Button> : undefined} /></Card>}
    </div>}
    {drawer && <Drawer title={drawer === 'decision' ? '운영자 판단' : '보고서 추가'} subtitle={drawer === 'decision' ? '이 보고서에 연결하여 따로 저장합니다.' : '주간 실측을 고정 기간으로 저장하거나 문서를 직접 등록합니다.'} width="min(560px, 94vw)" onClose={() => { if (!busy) setDrawer(null); }}><form className="reports-form" onSubmit={save}><fieldset disabled={busy}>
      {drawer === 'decision' ? <TextAreaField label="판단" maxLength={5000} rows={8} value={decisionForm.decision} onChange={event => setDecisionForm(current => ({ ...current, decision: event.target.value }))} /> : <><SegmentedControl label="보고서 등록 방식" options={[{ key: 'weekly', label: '주간 실측 저장' }, { key: 'document', label: '평가·QA 등록' }]} value={createKind} onChange={value => { setCreateKind(value); setError(''); }} />
        {createKind === 'weekly' ? <><SelectField label="범위" options={REPORT_SCOPES.filter(row => ['personal', 'company'].includes(row.value))} value={weekly.scope} onChange={event => setWeekly(completedPeriod(event.target.value))} /><div className="reports-date-fields"><TextField label="시작일" type="date" required value={weekly.periodStart} onChange={event => setWeekly(current => ({ ...current, periodStart: event.target.value }))} /><TextField label="종료일" type="date" required min={weekly.periodStart} value={weekly.periodEnd} onChange={event => setWeekly(current => ({ ...current, periodEnd: event.target.value }))} /></div><p className="reports-muted">개인은 월–일, 회사는 목–수의 완료된 주간이 기본입니다. 완료된 7일 기간으로 선택해 주세요. AI 정리는 보고서 상세에서 요청합니다.</p></> : <><div className="reports-date-fields"><SelectField label="장르" options={[{ value: 'evaluation', label: '평가' }, { value: 'qa', label: 'QA' }]} value={document.kind} onChange={event => setDocument(current => ({ ...current, kind: event.target.value }))} /><SelectField label="범위" options={REPORT_SCOPES.filter(row => row.value !== 'all')} value={document.scope} onChange={event => setDocument(current => ({ ...current, scope: event.target.value }))} /></div><TextField label="제목" required maxLength={180} value={document.title} onChange={event => setDocument(current => ({ ...current, title: event.target.value }))} /><input ref={fileInput} type="file" accept=".md,.txt,text/plain,text/markdown" className="reports-file-input" tabIndex={-1} onChange={importFile} /><Button variant="outline" onClick={() => fileInput.current?.click()}>문서 파일 불러오기</Button><TextAreaField label="문서 본문" hint="등록할 문서만 붙여넣거나 .md·.txt 파일을 선택해 주세요." required maxLength={40000} rows={12} value={document.body} onChange={event => setDocument(current => ({ ...current, body: event.target.value }))} /><TextAreaField label="출처 URL" hint="선택 사항 · 한 줄에 하나씩" rows={2} maxLength={12000} value={document.sourceUrls} onChange={event => setDocument(current => ({ ...current, sourceUrls: event.target.value }))} /></>}
      </>}
    </fieldset>{decisionConflict && latestDecision && <div className="reports-conflict"><h4>현재 저장된 판단</h4><div className="reports-body">{latestDecision.decision || '아직 판단이 없습니다.'}</div><Button variant="outline" disabled={busy} onClick={() => { setDecisionForm(current => ({ ...current, expectedRevision: latestDecision.revision })); setDecisionConflict(false); setError(''); }}>현재 판단 확인 · 내 입력 유지</Button></div>}{error && <p className="reports-error" role="alert">{error}</p>}<div className="reports-form-actions"><Button variant="outline" disabled={busy} onClick={() => setDrawer(null)}>취소</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? '저장 확인 중…' : drawer === 'decision' ? '판단 저장' : '보고서 저장'}</Button></div></form></Drawer>}
  </div>;
}
