"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CertaintyBadge, Drawer, EmptyState, Kbd, SegmentedControl, SelectField, Skeleton, TextAreaField, TextField, TruthBadge, useToast } from '../hub-primitives';
import { usePageCreateHotkey } from '../use-crm-keyboard';
import { createResearchRunWriter, researchContentHref, researchRunSummary } from './research-run-ui';
import './research-inbox.css';

const STATUS = [
  { value: 'new', label: '새 후보' }, { value: 'deferred', label: '나중에' },
  { value: 'discarded', label: '버림' }, { value: 'promoted', label: '전환됨' },
  { value: 'all', label: '전체' },
];
const LABEL = { new: '검토 전', deferred: '나중에', discarded: '버림', promoted: '콘텐츠로 전환됨' };
const ACCESS = [
  { value: 'full-text', label: '원문 본문 확인' }, { value: 'official-document', label: '공식 문서 확인' },
  { value: 'attachment', label: '첨부 확인' }, { value: 'excerpt', label: '본문 일부 확인' },
];
const emptyForm = () => ({ brandId: '', title: '', change: '', whyBrand: '', facts: '', interpretation: '',
  counterevidence: '', unknown: '', draft: '', sourceUrl: '', sourceTitle: '', accessLevel: 'full-text', locator: '' });
const formattedTime = value => value ? new Date(value).toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '시각 미확인';
const commandMessage = result => ({
  'invalid-input': '입력 또는 리서치 버전을 확인해 주세요.',
  conflict: '다른 변경이 먼저 저장됐습니다. 목록을 새로 읽고 다시 결정해 주세요.',
  preview: '리서치 저장소 연결이 필요합니다.',
  error: '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.',
})[result?.status] || '저장 결과를 확인하지 못했습니다.';

async function readJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || !data || typeof data.status !== 'string') throw Error('read-failed');
  return data;
}

export function ResearchFacts({ brief }) {
  return <ul>{brief.facts?.map((fact, index) => <li key={index}>{fact}{Array.isArray(brief.factEvidence) && brief.factEvidence.filter(evidence => evidence.text === fact && evidence.quote).map((evidence, evidenceIndex) => <details className="research-evidence" key={evidenceIndex}><summary>원문 근거 <span className="mono">{evidence.locator || '위치 미확인'}</span></summary><blockquote>{evidence.quote}</blockquote></details>)}</li>)}</ul>;
}

export function ResearchInbox() {
  const router = useRouter(), searchParams = useSearchParams(), toast = useToast();
  const [state, setState] = React.useState({ status: 'loading', briefs: [] });
  const [catalog, setCatalog] = React.useState({ status: 'loading', brands: [] });
  const [statusFilter, setStatusFilter] = React.useState(searchParams.get('brief') ? 'all' : 'new');
  const [brandFilter, setBrandFilter] = React.useState(searchParams.get('brief') ? 'all' : searchParams.get('brand') || 'all');
  const [selectedId, setSelectedId] = React.useState(searchParams.get('brief') || null);
  const [mobileDetail, setMobileDetail] = React.useState(Boolean(searchParams.get('brief')));
  const [drawer, setDrawer] = React.useState(searchParams.get('intake') === '1');
  const [form, setForm] = React.useState(() => ({ ...emptyForm(),
    sourceUrl: (searchParams.get('sourceUrl') || '').slice(0, 2000),
    sourceTitle: (searchParams.get('sourceTitle') || '').slice(0, 240),
  }));
  const [busy, setBusy] = React.useState(false), [formError, setFormError] = React.useState('');
  const [runsState, setRunsState] = React.useState({ status: 'loading', runs: [], settings: null });
  const [runDrawer, setRunDrawer] = React.useState(false), [runBusy, setRunBusy] = React.useState(false), [runError, setRunError] = React.useState('');
  const [runForm, setRunForm] = React.useState({ brand: '', limit: 1 });
  const runWriter = React.useRef(null);
  if (!runWriter.current) runWriter.current = createResearchRunWriter();
  const openCreate = React.useCallback(() => { setFormError(''); setDrawer(true); }, []);
  usePageCreateHotkey(openCreate);
  const pending = React.useRef(new Map());
  const brandPrefillApplied = React.useRef(false);

  const reload = React.useCallback(async () => {
    setState(current => ({ ...current, status: 'loading' }));
    try {
      const data = await readJson('/api/hub/research/briefs');
      setState(data.status === 'error' ? { status: 'error', briefs: [] } : data);
    } catch { setState({ status: 'error', briefs: [] }); }
  }, []);
  const reloadRuns = React.useCallback(async () => {
    try { const data = await readJson('/api/hub/research/runs'); setRunsState(['live', 'partial'].includes(data.status) && Array.isArray(data.runs) ? data : { status: data.status === 'preview' ? 'preview' : 'error', runs: [], settings: null }); }
    catch { setRunsState({ status: 'error', runs: [], settings: null }); }
  }, []);
  React.useEffect(() => { reload(); reloadRuns(); }, [reload, reloadRuns]);
  React.useEffect(() => {
    const first = runsState.settings?.brands?.[0];
    if (first) setRunForm(current => current.brand ? current : { ...current, brand: first.slug, limit: first.maxPerRun || 1 });
  }, [runsState.settings]);
  React.useEffect(() => {
    if (!runDrawer || !runsState.runs.some(run => run.status === 'running')) return;
    const interval = setInterval(reloadRuns, 10000); return () => clearInterval(interval);
  }, [runDrawer, runsState.runs, reloadRuns]);
  React.useEffect(() => {
    readJson('/api/hub/content/catalog').then(data => setCatalog(data)).catch(() => setCatalog({ status: 'error', brands: [] }));
  }, []);
  React.useEffect(() => {
    const brand = (catalog.brands || []).find(entry => entry.key === searchParams.get('brandKey'));
    if (brand && !brandPrefillApplied.current) {
      brandPrefillApplied.current = true;
      setForm(current => ({ ...current, brandId: brand.id }));
    }
  }, [catalog, searchParams]);

  const all = state.briefs || [];
  const visible = all.filter(brief => (statusFilter === 'all' || brief.state === statusFilter)
    && (brandFilter === 'all' || brief.brandId === brandFilter));
  const selected = visible.find(brief => brief.id === selectedId) || visible[0] || null;
  const brands = catalog.brands || [];
  const brandName = id => brands.find(brand => brand.id === id)?.name || '브랜드';

  function open(brief) {
    setSelectedId(brief.id); setMobileDetail(true);
    router.replace(`/dashboard/content/research?brief=${brief.id}${brandFilter === 'all' ? '' : `&brand=${brandFilter}`}`, { scroll: false });
  }
  function back() {
    setMobileDetail(false);
    router.replace(`/dashboard/content/research${brandFilter === 'all' ? '' : `?brand=${brandFilter}`}`, { scroll: false });
  }
  async function post(command) {
    const key = JSON.stringify(command);
    if (!pending.current.has(key)) pending.current.set(key, crypto.randomUUID());
    const requestId = pending.current.get(key);
    const response = await fetch('/api/hub/research/briefs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...command, requestId }), cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => null);
    if (result?.status === 'saved' || result?.status === 'duplicate') pending.current.delete(key);
    return result || { status: 'error' };
  }
  async function decide(action) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await post({ action, briefId: selected.id, expectedRevision: selected.revision,
        expectedStateVersion: selected.stateVersion });
      if (['saved','duplicate'].includes(result.status)) {
        if (action.startsWith('promote-')) {
          setStatusFilter('promoted'); setSelectedId(selected.id);
          toast.success('콘텐츠 원장에 저장했습니다.');
        }
        else toast.success(action === 'discard' ? '버렸습니다. 버림 필터에서 되돌릴 수 있습니다.' : '검토 상태를 저장했습니다.');
        await reload();
      } else { toast.error(commandMessage(result)); if (result.status === 'conflict') await reload(); }
    } catch { toast.error('저장 확인에 실패했습니다. 같은 버튼으로 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  async function create(event) {
    event.preventDefault();
    if (busy) return;
    setFormError('');
    const brief = { brandId: form.brandId, title: form.title, change: form.change, whyBrand: form.whyBrand,
      facts: form.facts.split('\n').map(line => line.trim()).filter(Boolean), interpretation: form.interpretation,
      counterevidence: form.counterevidence, unknown: form.unknown, draft: form.draft,
      sources: [{ url: form.sourceUrl, title: form.sourceTitle, accessLevel: form.accessLevel, locator: form.locator }] };
    setBusy(true);
    try {
      const result = await post({ action: 'create', brief });
      if (['saved','duplicate'].includes(result.status)) {
        setDrawer(false); setForm(emptyForm()); setSelectedId(result.briefId); setStatusFilter('all'); setBrandFilter(brief.brandId);
        await reload(); toast.success('검토용 리서치를 저장했습니다.');
      } else setFormError(commandMessage(result));
    } catch { setFormError('저장 응답을 받지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  async function prepare(event) {
    event.preventDefault(); if (runBusy) return; setRunBusy(true); setRunError('');
    try { const result = await runWriter.current(runForm);
      if (['ok', 'partial', 'running'].includes(result?.status) && result.run?.id) {
        await Promise.all([reloadRuns(), reload()]);
        if (result.status === 'running') toast.info('같은 준비 요청이 처리 중입니다. 실행 기록에서 확인해 주세요.');
        else if (result.status === 'partial') toast.info('일부 자료를 준비했습니다. 실행 기록과 검토 대기 원고를 확인해 주세요.');
        else toast.success(`검토용 리서치 ${result.run.preparedCount ?? 0}개를 준비했습니다.`);
      } else { setRunError(researchRunSummary({ reason: result?.reason || result?.run?.reason }).reason || '준비 결과를 확인하지 못했습니다. 같은 입력으로 다시 시도해 주세요.'); await reloadRuns(); }
    } catch { setRunError('준비 응답을 받지 못했습니다. 같은 입력으로 실행 상태를 다시 확인할 수 있습니다.'); await reloadRuns(); }
    finally { setRunBusy(false); }
  }
  const latestRun = runsState.runs[0];
  const field = key => ({ value: form[key], onChange: event => setForm(current => ({ ...current, [key]: event.target.value })) });

  return <div className="hub-page research-inbox">
    <header className="research-head"><div><h2>리서치함</h2><p>근거와 검토용 원고를 확인한 뒤 콘텐츠로 옮깁니다.</p></div>
      <Button variant="primary" icon="plus" onClick={openCreate}>리서치 추가 <Kbd>N</Kbd></Button></header>
    <div className="research-note research-run-note"><div>{runsState.status === 'loading' ? <Skeleton lines={1} label="최근 준비 기록 확인 중" /> : runsState.status === 'error' ? <><TruthBadge state="error" /><span>준비 기록을 읽지 못했습니다.</span></> : runsState.status === 'preview' ? <><TruthBadge state="preview" /><span>자동 준비 저장소 연결 필요</span></> : latestRun ? <><span className="mono">{formattedTime(latestRun.startedAt)}</span><span>{researchRunSummary(latestRun).label} · {researchRunSummary(latestRun).prepared ?? '미확인'}개</span></> : <span>아직 자동 준비 기록이 없습니다. 원문과 AI 초안을 준비한 뒤 여기서 검토합니다.</span>}</div><Button variant="ghost" size="xs" onClick={() => setRunDrawer(true)}>자동 준비·실행 기록</Button></div>
    <div className="research-filters"><div className="research-status"><SegmentedControl label="검토 상태" options={STATUS.map(entry => ({ key: entry.value, label: entry.label }))} value={statusFilter} onChange={setStatusFilter} /></div><SelectField label="브랜드" value={brandFilter} options={[{ value: 'all', label: '모든 브랜드' },
      ...brands.map(brand => ({ value: brand.id, label: brand.name }))]} onChange={event => setBrandFilter(event.target.value)} /></div>
    {state.status === 'loading' ? <Card><Skeleton lines={5} label="리서치함 불러오는 중" /></Card> :
      state.status === 'error' ? <Card><EmptyState icon="x" title="리서치를 불러오지 못했어요" description="연결 상태를 확인한 뒤 다시 읽어 주세요." action={<Button variant="outline" onClick={reload}>다시 불러오기</Button>} /></Card> :
      state.status === 'preview' ? <Card><EmptyState icon="link" title="리서치 저장소 연결 필요" description="저장소와 마이그레이션을 연결한 뒤 사용합니다." /></Card> :
      <div className={`research-workspace${mobileDetail ? ' research-detail-open' : ''}`}>
        <section className="research-list" aria-label="리서치 후보"><div className="research-list-head"><strong>검토용 원고 <span className="num">{visible.length}</span></strong>
          {state.status === 'partial' && <TruthBadge state="partial" label="최근 100건만 표시" />}</div>
          {visible.length ? visible.map(brief => <button className={`research-row hub-row${selected?.id === brief.id ? ' research-row--active' : ''}`}
            type="button" key={brief.id} onClick={() => open(brief)} aria-current={selected?.id === brief.id ? 'true' : undefined}>
            <span className="research-row-meta"><span>{brandName(brief.brandId)}</span><span>{LABEL[brief.state]}</span><span className="mono">{formattedTime(brief.createdAt)}</span></span>
            <strong>{brief.title}</strong><span className="research-change">{brief.change}</span>
            <span className="research-row-foot">출처 {brief.sources?.length || 0}개 · 원고 확인 →</span></button>) :
            <EmptyState icon="inbox" title="조건에 맞는 리서치가 없어요" description="새 리서치를 직접 등록하거나 필터를 바꿔 주세요." />}
        </section>
        <article className="research-report" aria-label="리서치 상세">
          {selected ? <><div className="research-report-scroll"><Button className="research-back" onClick={back}>← 목록</Button>
            <div className="research-report-meta"><span>{brandName(selected.brandId)}</span><span>{LABEL[selected.state]}</span><span className="mono">{formattedTime(selected.createdAt)}</span></div>
            {selected.origin === 'research-ai' && <CertaintyBadge state="unknown" label="AI 준비 · 운영자 검토 전" />}
            <h3>{selected.title}</h3><p className="research-lead">{selected.whyBrand}</p>
            <section><h4>이번에 실제로 바뀐 점</h4><p>{selected.change}</p></section>
            <section><h4>{selected.origin === 'research-ai' ? '원문에서 준비한 사실 · 검토 전' : '확인한 사실'}</h4><ResearchFacts brief={selected} /></section>
            {(selected.interpretation || selected.conditions || selected.counterevidence || selected.unknown) && <div className="research-columns">
              {selected.interpretation && <section><h4>해석·적용 조건</h4><p>{selected.interpretation}</p></section>}
              {selected.conditions && <section><h4>적용 조건</h4><p>{selected.conditions}</p></section>}
              {selected.counterevidence && <section><h4>반대 근거</h4><p>{selected.counterevidence}</p></section>}
              {selected.unknown && <section><h4>아직 확인할 것</h4><p>{selected.unknown}</p></section>}
            </div>}
            <section><h4>검토용 원고</h4><div className="research-draft">{selected.draft}</div></section>
            <section><h4>자료와 확인 범위</h4><div className="research-sources">{selected.sources?.map((source, index) =>
              <a key={index} href={source.url} target="_blank" rel="noopener noreferrer"><strong>{source.title} ↗</strong>
                <span>{ACCESS.find(level => level.value === source.accessLevel)?.label || '확인 범위 미정'}{source.locator ? ` · ${source.locator}` : ''}</span></a>)}</div></section>
          </div><div className="research-actions">
            {selected.promotion ? <><span>콘텐츠로 전환됨</span><Button variant="primary" onClick={() => router.push(researchContentHref(selected))}>연결된 콘텐츠 열기</Button></> : <>
              <div className="research-secondary"><Button variant="outline" disabled={busy} onClick={() => decide(selected.state === 'discarded' || selected.state === 'deferred' ? 'restore' : 'defer')}>{selected.state === 'discarded' || selected.state === 'deferred' ? '다시 검토' : '나중에'}</Button>
                {selected.state !== 'discarded' && <Button variant="ghost" disabled={busy} onClick={() => decide('discard')}>버리기</Button>}</div>
              {selected.state !== 'discarded' && <div className="research-promote"><Button variant="outline" disabled={busy} onClick={() => decide('promote-idea')}>콘텐츠 후보로 담기</Button><Button variant="primary" disabled={busy} onClick={() => decide('promote-draft')}>Studio 초안으로 보내기</Button></div>}
            </>}
          </div></> : <EmptyState icon="inbox" title="리서치를 선택해 주세요" description="근거와 원고를 보고 다음 결정을 할 수 있습니다." />}
        </article>
      </div>}
    {runDrawer && <Drawer title="자동 준비·실행 기록" subtitle="공개 원문을 확보한 자료만 검토용 리서치로 저장합니다." width="min(560px, 94vw)" onClose={() => { if (!runBusy) setRunDrawer(false); }}>
      <form className="research-form" onSubmit={prepare}>
        <div className="research-run-setting"><TruthBadge state={runsState.status === 'loading' ? 'loading' : runsState.status} /><span>{runsState.settings ? runsState.settings.enabled ? '정기 준비 켜짐' : '정기 준비 꺼짐' : '설정 확인 필요'} · 비용 상한 없음</span><Button variant="ghost" size="xs" disabled={runBusy} onClick={reloadRuns}>기록 새로고침</Button></div>
        <fieldset disabled={runBusy || !['live', 'partial'].includes(runsState.status)} className="research-run-fields">
          <SelectField label="브랜드" required value={runForm.brand} options={[{ value: '', label: '브랜드 선택' }, ...(runsState.settings?.brands || []).map(brand => ({ value: brand.slug, label: brand.label }))]} onChange={event => { const brand = runsState.settings?.brands.find(row => row.slug === event.target.value); setRunForm(current => ({ ...current, brand: event.target.value, limit: brand?.maxPerRun || 1 })); }} />
          <TextField label="최대 준비 수" type="number" min={1} max={runsState.settings?.brands?.find(brand => brand.slug === runForm.brand)?.maxPerRun || 1} required value={runForm.limit} onChange={event => setRunForm(current => ({ ...current, limit: Number(event.target.value) }))} />
          <p className="research-note">근거가 확보된 자료만 준비하므로 실제 수량은 적을 수 있습니다. AI 원고는 검토 전으로 저장됩니다.</p>
          <Button type="submit" variant="primary" disabled={runBusy || !runForm.brand}>{runBusy ? '원문·검토용 원고 준비 중…' : '리서치 준비'}</Button>
        </fieldset>
        {runError && <p className="research-form-error" role="alert">{runError}</p>}
      </form>
      <section className="research-run-history" aria-label="최근 준비 실행"><h3>최근 실행</h3><p className="research-note">모델 추정 비용은 검색 요금을 포함하지 않습니다. 검색 호출은 따로 표시합니다.</p>{runsState.status === 'loading' ? <Skeleton lines={3} label="실행 기록 불러오는 중" /> : ['preview', 'error'].includes(runsState.status) ? <EmptyState icon="link" title={runsState.status === 'error' ? '실행 기록을 읽지 못했어요' : '준비 저장소 연결 필요'} description="연결 상태를 확인하고 다시 읽어 주세요." action={<Button variant="outline" onClick={reloadRuns}>다시 확인</Button>} /> : runsState.runs.length ? runsState.runs.slice(0, 10).map(run => <div className="research-run-record" key={run.id}><div className="research-report-meta"><strong>{runsState.settings?.brands?.find(brand => brand.slug === run.brand)?.label || run.brand}</strong><span>{researchRunSummary(run).label}</span><span className="mono">{formattedTime(run.startedAt)}</span></div>{run.topic && <p>{run.topic}</p>}<dl><div><dt>실제 준비</dt><dd className="mono">{run.preparedCount ?? '미확인'}개</dd></div><div><dt>원문</dt><dd className="mono">{run.sourceCount ?? '미확인'}개</dd></div><div><dt>검색 호출</dt><dd className="mono">{run.searchCalls ?? '미확인'}회</dd></div><div><dt>사용 토큰</dt><dd className="mono">{run.usage?.totalTokens ?? '미확인'}</dd></div><div><dt>모델 추정 비용</dt><dd className="mono">{researchRunSummary(run).cost === null ? '미확인' : `$${researchRunSummary(run).cost.toFixed(4)}`}</dd></div></dl>{researchRunSummary(run).reason && <p className={['error', 'failed'].includes(run.status) ? 'research-form-error' : 'research-note'}>{researchRunSummary(run).reason}</p>}{!!run.briefIds?.length && <div className="research-run-links">{run.briefIds.map((id, index) => <a key={id} href={`/dashboard/content/research?brief=${encodeURIComponent(id)}`}>검토용 원고 {index + 1} →</a>)}</div>}</div>) : <EmptyState icon="inbox" title="아직 준비 기록이 없어요" description="브랜드를 선택해 첫 리서치를 준비해 주세요." />}</section>
    </Drawer>}
    {drawer && <Drawer title="리서치 추가" subtitle="확인한 원문과 검토용 원고를 저장합니다. 검색 발췌만으로는 등록하지 마세요." width="min(560px, 94vw)" onClose={() => { if (!busy) setDrawer(false); }}>
      <form className="research-form" onSubmit={create}>
        {catalog.status !== 'live' && <p className="research-form-error" role="status">브랜드 목록을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 열어 주세요.</p>}
        <SelectField label="브랜드" required value={form.brandId} options={[{ value: '', label: '브랜드 선택' }, ...brands.map(brand => ({ value: brand.id, label: brand.name }))]} onChange={field('brandId').onChange} />
        <TextField label="제목" required maxLength={180} {...field('title')} />
        <TextAreaField label="이번에 실제로 바뀐 점" required maxLength={1000} {...field('change')} />
        <TextAreaField label="왜 이 브랜드인가" required maxLength={1000} {...field('whyBrand')} />
        <TextAreaField label="확인한 사실" hint="한 줄에 한 사실씩 적어 주세요." required maxLength={12000} rows={4} {...field('facts')} />
        <TextAreaField label="해석·적용 조건" maxLength={3000} {...field('interpretation')} />
        <TextAreaField label="반대 근거" maxLength={3000} {...field('counterevidence')} />
        <TextAreaField label="아직 확인할 것" maxLength={3000} {...field('unknown')} />
        <TextAreaField label="검토용 원고" required maxLength={12000} rows={7} {...field('draft')} />
        <TextField label="확인한 원문 URL" required type="url" maxLength={2000} {...field('sourceUrl')} />
        <TextField label="자료 제목" required maxLength={240} {...field('sourceTitle')} />
        <SelectField label="확인 범위" value={form.accessLevel} options={ACCESS} onChange={field('accessLevel').onChange} />
        <TextField label="본문 위치·쪽수" maxLength={500} {...field('locator')} />
        {formError && <p className="research-form-error" role="alert">{formError}</p>}
        <div className="research-form-actions"><Button variant="outline" disabled={busy} onClick={() => setDrawer(false)}>취소</Button><Button variant="primary" type="submit" disabled={busy || catalog.status !== 'live'}>{busy ? '저장 중…' : '리서치 저장'}</Button></div>
      </form>
    </Drawer>}
  </div>;
}
