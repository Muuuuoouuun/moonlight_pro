"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Drawer, EmptyState, SelectField, Skeleton, TextAreaField, TextField, TruthBadge, useToast } from '../hub-primitives';
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

export function ResearchInbox() {
  const router = useRouter(), searchParams = useSearchParams(), toast = useToast();
  const [state, setState] = React.useState({ status: 'loading', briefs: [] });
  const [catalog, setCatalog] = React.useState({ status: 'loading', brands: [] });
  const [statusFilter, setStatusFilter] = React.useState(searchParams.get('brief') ? 'all' : 'new');
  const [brandFilter, setBrandFilter] = React.useState(searchParams.get('brief') ? 'all' : searchParams.get('brand') || 'all');
  const [selectedId, setSelectedId] = React.useState(searchParams.get('brief') || null);
  const [mobileDetail, setMobileDetail] = React.useState(Boolean(searchParams.get('brief')));
  const [drawer, setDrawer] = React.useState(false), [form, setForm] = React.useState(emptyForm);
  const [busy, setBusy] = React.useState(false), [formError, setFormError] = React.useState('');
  const pending = React.useRef(new Map());

  const reload = React.useCallback(async () => {
    setState(current => ({ ...current, status: 'loading' }));
    try {
      const data = await readJson('/api/hub/research/briefs');
      setState(data.status === 'error' ? { status: 'error', briefs: [] } : data);
    } catch { setState({ status: 'error', briefs: [] }); }
  }, []);
  React.useEffect(() => { reload(); }, [reload]);
  React.useEffect(() => {
    readJson('/api/hub/content/catalog').then(data => setCatalog(data)).catch(() => setCatalog({ status: 'error', brands: [] }));
  }, []);

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
  const field = key => ({ value: form[key], onChange: event => setForm(current => ({ ...current, [key]: event.target.value })) });

  return <div className="hub-page research-inbox">
    <header className="research-head"><div><h2>리서치함</h2><p>근거와 검토용 원고를 확인한 뒤 콘텐츠로 옮깁니다.</p></div>
      <Button variant="primary" icon="plus" onClick={() => { setFormError(''); setDrawer(true); }}>리서치 추가</Button></header>
    <div className="research-note">현재는 운영자가 원문을 확인해 직접 등록하는 흐름입니다. 자동 수집·AI 원고 생성은 실행되지 않습니다.</div>
    <div className="research-filters"><div className="research-status" role="group" aria-label="검토 상태">
      {STATUS.map(entry => <button type="button" key={entry.value} className={`research-status-btn${statusFilter === entry.value ? ' active' : ''}`}
        aria-pressed={statusFilter === entry.value} onClick={() => setStatusFilter(entry.value)}>{entry.label}</button>)}
    </div><SelectField label="브랜드" value={brandFilter} options={[{ value: 'all', label: '모든 브랜드' },
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
            <h3>{selected.title}</h3><p className="research-lead">{selected.whyBrand}</p>
            <section><h4>이번에 실제로 바뀐 점</h4><p>{selected.change}</p></section>
            <section><h4>확인한 사실</h4><ul>{selected.facts?.map((fact, index) => <li key={index}>{fact}</li>)}</ul></section>
            {(selected.interpretation || selected.counterevidence || selected.unknown) && <div className="research-columns">
              {selected.interpretation && <section><h4>해석·적용 조건</h4><p>{selected.interpretation}</p></section>}
              {selected.counterevidence && <section><h4>반대 근거</h4><p>{selected.counterevidence}</p></section>}
              {selected.unknown && <section><h4>아직 확인할 것</h4><p>{selected.unknown}</p></section>}
            </div>}
            <section><h4>검토용 원고</h4><div className="research-draft">{selected.draft}</div></section>
            <section><h4>자료와 확인 범위</h4><div className="research-sources">{selected.sources?.map((source, index) =>
              <a key={index} href={source.url} target="_blank" rel="noopener noreferrer"><strong>{source.title} ↗</strong>
                <span>{ACCESS.find(level => level.value === source.accessLevel)?.label || '확인 범위 미정'}{source.locator ? ` · ${source.locator}` : ''}</span></a>)}</div></section>
          </div><div className="research-actions">
            {selected.promotion ? <><span>콘텐츠로 전환됨</span><Button variant="primary" onClick={() => router.push(`/dashboard/content/studio?item=${selected.promotion.content_id}`)}>저장된 콘텐츠 열기</Button></> : <>
              <div className="research-secondary"><Button variant="outline" disabled={busy} onClick={() => decide(selected.state === 'discarded' || selected.state === 'deferred' ? 'restore' : 'defer')}>{selected.state === 'discarded' || selected.state === 'deferred' ? '다시 검토' : '나중에'}</Button>
                {selected.state !== 'discarded' && <Button variant="ghost" disabled={busy} onClick={() => decide('discard')}>버리기</Button>}</div>
              {selected.state !== 'discarded' && <div className="research-promote"><Button variant="outline" disabled={busy} onClick={() => decide('promote-idea')}>콘텐츠 후보로 담기</Button><Button variant="primary" disabled={busy} onClick={() => decide('promote-draft')}>Studio 초안으로 보내기</Button></div>}
            </>}
          </div></> : <EmptyState icon="inbox" title="리서치를 선택해 주세요" description="근거와 원고를 보고 다음 결정을 할 수 있습니다." />}
        </article>
      </div>}
    {drawer && <Drawer title="리서치 추가" subtitle="확인한 원문과 검토용 원고를 저장합니다. 검색 발췌만으로는 등록하지 마세요." width="min(560px, 94vw)" onClose={() => setDrawer(false)}>
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
        <div className="research-form-actions"><Button variant="outline" onClick={() => setDrawer(false)}>취소</Button><Button variant="primary" type="submit" disabled={busy || catalog.status !== 'live'}>{busy ? '저장 중…' : '리서치 저장'}</Button></div>
      </form>
    </Drawer>}
  </div>;
}
