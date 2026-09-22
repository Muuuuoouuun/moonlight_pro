"use client";
import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Drawer, EmptyState, SegmentedControl, SelectField, Skeleton, TextField, TruthBadge } from '../hub-primitives';
import { performancePeriods, seoulDate, summarizePublications } from '@/lib/content-performance';
import { parsePerformanceMetrics, performanceRows } from '@/lib/content-performance-client';
import './content-performance.css';

const VIEWS = [{ key: 'summary', label: '요약' }, { key: 'week', label: '이번 주' }, { key: 'monthly', label: '월별' }];
const METRICS = [{ key: 'views', label: '조회수' }, { key: 'shares', label: '공유' }, { key: 'replies', label: '답글' }];
const number = value => value == null ? '미기록' : value.toLocaleString('ko-KR');
const time = value => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음';
const empty = { status: 'loading', publications: [], brands: [], channels: [] };

function MetricEditor({ entry, onClose, onSaved }) {
  const [draft, setDraft] = React.useState(() => Object.fromEntries(METRICS.map(({ key }) => [key, entry.metrics[key] ?? ''])));
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [conflict, setConflict] = React.useState(null);
  const [expected, setExpected] = React.useState(entry.updatedAt);
  const first = React.useRef(null), running = React.useRef(false), active = React.useRef(true);
  React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function save(version = expected) {
    if (running.current) return;
    let metrics;
    try { metrics = parsePerformanceMetrics(draft); } catch (failure) { setError(failure.message); return; }
    running.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/hub/content/performance', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: entry.id, expectedUpdatedAt: version, ...metrics }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!active.current) return;
      if (result.status === 'conflict') { setConflict(result.entry || {}); setError(result.message || '다른 곳에서 원고나 수치가 변경됐습니다. 최신 기록을 확인하고 입력을 비교해 주세요.'); return; }
      if (!response.ok || result.status !== 'saved') throw Error(result.message || '저장 결과를 확인하지 못했습니다. 입력은 유지됩니다.');
      onSaved();
    } catch (failure) { if (active.current) { setConflict({}); setError('저장 결과를 확인하지 못했습니다. 최신 수치를 확인한 뒤 다시 기록해 주세요.'); } }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  async function readLatest() {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/hub/content/performance?year=${seoulDate(entry.publishedAt).slice(0, 4)}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok || result.status !== 'live') throw Error('최신 수치를 불러오지 못했습니다. 다시 시도해 주세요.');
      const latest = result.publications.find(row => row.id === entry.id);
      if (!latest?.updatedAt) throw Error('현재 발행 원고를 찾을 수 없습니다. 입력을 복사해 보관해 주세요.');
      if (active.current) setConflict(latest);
    } catch (failure) { if (active.current) setError(failure.message); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  return <Drawer title="성과 기록" subtitle={entry.title} initialFocusRef={first} presentation="compact" width="min(480px, 96vw)" onClose={() => { if (!busy) onClose(); }}
    footer={<Button variant="primary" disabled={busy || Boolean(conflict)} onClick={() => save()}>{busy ? '처리 중…' : '수치 기록'}</Button>}>
    <div className="content-performance-editor">
      <p>채널에서 확인한 현재 누적 수치를 입력하세요. 모르는 값은 비워두고, 실제 0회인 경우에만 0을 입력합니다.</p>
      {METRICS.map(({ key, label }, index) => <TextField key={key} ref={index === 0 ? first : undefined} label={label} type="text" inputMode="numeric" value={draft[key]} disabled={busy} onChange={event => setDraft(prior => ({ ...prior, [key]: event.target.value }))} placeholder="미기록" />)}
      <p className="performance-muted">직접 기록 · 마지막 확인 {time(entry.metrics.capturedAt)}</p>
      {error && <p role="alert">{error}</p>}
      {conflict && !conflict.updatedAt && <Button variant="outline" disabled={busy} onClick={readLatest}>최신 수치 확인</Button>}
      {conflict?.updatedAt && <div className="performance-conflict"><p>최신 기록: {METRICS.map(({ key, label }) => `${label} ${number(conflict.metrics?.[key])}`).join(' · ')}</p>
        <Button disabled={busy} onClick={() => { setDraft(Object.fromEntries(METRICS.map(({ key }) => [key, conflict.metrics?.[key] ?? '']))); setExpected(conflict.updatedAt); setConflict(null); setError(''); }}>현재 값 불러오기</Button>
        <Button variant="outline" disabled={busy} onClick={() => save(conflict.updatedAt)}>내 입력으로 다시 기록</Button>
      </div>}
    </div>
  </Drawer>;
}

export function ContentPerformance() {
  const params = useSearchParams(), router = useRouter();
  const currentYear = performancePeriods(new Date()).year;
  const view = VIEWS.some(item => item.key === params.get('view')) ? params.get('view') : 'summary';
  const rawYear = params.get('year') || String(currentYear), year = /^\d{4}$/.test(rawYear) && Number(rawYear) >= 1970 && Number(rawYear) <= 2100 ? Number(rawYear) : currentYear;
  const brand = params.get('brand') || '', channel = params.get('channel') || '', month = /^(0[1-9]|1[0-2])$/.test(params.get('month') || '') ? params.get('month') : '';
  const [data, setData] = React.useState(empty), [reload, setReload] = React.useState(0), [editing, setEditing] = React.useState(null);
  const [count, setCount] = React.useState(40), [notice, setNotice] = React.useState('');
  const queryYear = view === 'monthly' ? year : currentYear;
  const refresh = React.useCallback(() => setReload(value => value + 1), []);
  React.useEffect(() => {
    const controller = new AbortController(); let active = true;
    setData(previous => ({ ...previous, status: 'loading' }));
    async function read() {
      try {
        const response = await fetch(`/api/hub/content/performance?year=${queryYear}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const result = await response.json();
        if (!response.ok || result.status === 'error' || result.source === 'error' || !['live', 'preview'].includes(result.status)) throw Error(result.message || '성과 집계를 불러오지 못했습니다.');
        if (active) setData(result);
      } catch (failure) { if (active) setData({ ...empty, status: 'error', message: failure.message }); }
    }
    read(); return () => { active = false; controller.abort(); };
  }, [queryYear, reload]);
  React.useEffect(() => {
    window.addEventListener('moonlight:content-saved', refresh);
    return () => window.removeEventListener('moonlight:content-saved', refresh);
  }, [refresh]);
  React.useEffect(() => setCount(40), [view, year, month, brand, channel]);
  function navigate(patch) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) value ? next.set(key, value) : next.delete(key);
    router.replace(`/dashboard/content/performance${next.size ? '?' + next : ''}`, { scroll: false });
  }
  const now = new Date(data.generatedAt || Date.now()), periods = performancePeriods(now);
  const all = data.publications || [];
  const selected = performanceRows(all, { view, year, month, brand, channel }, now);
  const totals = summarizePublications(selected);
  const monthRows = Array.from({ length: 12 }, (_, index) => {
    const key = String(index + 1).padStart(2, '0');
    return { key, ...summarizePublications(performanceRows(all, { view: 'monthly', year, month: key, brand, channel }, now)) };
  });
  const weekRows = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(periods.weekStart + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { key, label: ['월', '화', '수', '목', '금', '토', '일'][index], count: selected.filter(row => seoulDate(row.publishedAt) === key).length };
  });
  const title = view === 'week' ? `${periods.weekStart}부터 오늘까지` : view === 'monthly' ? `${year}년 ${month ? Number(month) + '월' : '전체'}` : `${periods.month.replace('-', '년 ')}월`;
  const channelLabel = value => data.channels?.find(item => item.value === value)?.label || value;
  return <div className="hub-page content-performance fade-up">
    <header className="performance-header"><div><h2>콘텐츠 성과</h2><p>얼마나 발행했고, 어떤 반응이 쌓였는지 확인하세요.</p></div><Button variant="outline" onClick={refresh} disabled={data.status === 'loading'}>새로고침</Button></header>
    <div className="performance-toolbar"><SegmentedControl label="집계 보기" options={VIEWS} value={view} onChange={value => navigate({ view: value, month: '' })} />
      <TruthBadge state={data.status} /></div>
    <div className="performance-filters">
      {view === 'monthly' && <div className="performance-year"><Button aria-label="이전 연도" disabled={year <= 1970} onClick={() => navigate({ year: String(year - 1), month: '' })}>←</Button><span className="mono">{year}년</span><Button aria-label="다음 연도" disabled={year >= currentYear} onClick={() => navigate({ year: String(year + 1), month: '' })}>→</Button>{year !== currentYear && <Button onClick={() => navigate({ year: String(currentYear), month: '' })}>올해</Button>}</div>}
      <SelectField label="브랜드" value={brand} options={[{ value: '', label: '모든 브랜드' }, ...(data.brands || []).map(item => ({ value: item.id, label: item.name }))]} onChange={event => navigate({ brand: event.target.value })} />
      <SelectField label="채널" value={channel} options={[{ value: '', label: '모든 채널' }, ...(data.channels || [])]} onChange={event => navigate({ channel: event.target.value })} />
      {(brand || channel || month) && <Button onClick={() => navigate({ brand: '', channel: '', month: '' })}>필터 해제</Button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {data.status === 'loading' ? <Card><Skeleton lines={6} height={24} label="콘텐츠 성과 집계 중" /></Card>
      : data.status === 'error' ? <EmptyState icon="signal" title="집계를 확인하지 못했습니다" description={data.message} action={<Button onClick={refresh}>다시 불러오기</Button>} />
      : data.status === 'preview' ? <EmptyState icon="content" title="콘텐츠 저장소 연결이 필요합니다" description="연결되면 저장된 발행 기록과 직접 입력한 성과를 집계합니다." action={<Link href="/dashboard/content/queue">소재·제작으로</Link>} />
      : <>
        <div className="performance-period"><h3>{title}</h3>{view === 'summary' && <p className="performance-muted">이번 주 {performanceRows(all, { view: 'week', brand, channel }, now).length}건 · 올해 {performanceRows(all, { view: 'monthly', year: currentYear, brand, channel }, now).length}건 발행</p>}</div>
        <div className="performance-stats"><Card><span>발행량</span><strong className="stat">{number(totals.published)}<small>건</small></strong><p>채널별 원고 기준</p></Card>
          {METRICS.map(({ key, label }) => <Card key={key}><span>누적 {label}</span><strong className="stat">{number(totals[key])}</strong><p>{totals.coverage[key]}/{totals.published}건 기록</p></Card>)}
        </div>
        <p className="performance-muted">이 기간에 발행한 원고의 최신 누적 수치입니다. 기간 중 증가량은 아닙니다. 마지막 기록 {time(totals.lastCapturedAt)} · 한국 시간 기준</p>
        {data.excludedUndated > 0 && <p className="performance-muted">발행 시각이 없는 원고 {data.excludedUndated}건은 기간 집계에서 제외했습니다.</p>}
        {view === 'week' && <Card><h3>요일별 발행</h3><div className="performance-days">{weekRows.map(day => <div key={day.key}><span>{day.label}</span><strong className="stat">{day.key > periods.today ? '—' : day.count}</strong><small>{day.key.slice(5).replace('-', '/')}</small></div>)}</div></Card>}
        {view === 'monthly' && <Card pad={false}><div className="performance-months"><table><caption>월별 발행량과 해당 원고의 누적 조회수</caption><thead><tr><th>월</th><th>발행량</th><th>누적 조회수</th><th>기록</th></tr></thead><tbody>{monthRows.map(row => <tr key={row.key} className="hub-row" data-selected={month === row.key || undefined}>
          <th><Button active={month === row.key} aria-pressed={month === row.key} onClick={() => navigate({ month: month === row.key ? '' : row.key })}>{Number(row.key)}월</Button></th>
          <td><div className="performance-bar"><span aria-hidden="true" style={{ width: `${row.published / Math.max(1, ...monthRows.map(item => item.published)) * 100}%` }} /><b className="num">{row.published}건</b></div></td><td className="mono">{number(row.views)}</td><td className="mono">{row.coverage.views}/{row.published}</td>
        </tr>)}</tbody></table></div></Card>}
        <section><div className="performance-list-header"><h3>발행 원고 <span className="num">{selected.length}</span></h3><Link href="/dashboard/content/queue">소재·제작으로 →</Link></div>
          {!selected.length ? <EmptyState icon="content" title="이 기간에 발행한 원고가 없습니다" description="원고 작성에서 실제 발행을 기록하면 여기에 집계됩니다." action={<Link href="/dashboard/content/studio">원고 작성으로</Link>} />
            : <Card pad={false}><ul className="performance-list">{selected.slice(0, count).map(entry => <li key={entry.id}>
              <div><Link className="hub-row performance-title" href={entry.href}>{entry.title}</Link><p className="performance-muted">{seoulDate(entry.publishedAt)} · {entry.brandName || '브랜드 미지정'} · {channelLabel(entry.channel)}</p>
                <p className="performance-values">{METRICS.map(({ key, label }) => <span key={key}>{label} <b className="num">{number(entry.metrics[key])}</b></span>)}</p>
                {entry.metrics.capturedAt && <p className="performance-muted">{entry.metrics.source === 'manual' ? '직접 기록' : '수집 기록'} · {time(entry.metrics.capturedAt)}</p>}</div>
              <Button variant="outline" onClick={() => setEditing(entry)}>{entry.metrics.capturedAt ? '수치 수정' : '수치 기록'}</Button>
            </li>)}</ul>{selected.length > count && <div className="performance-more"><Button onClick={() => setCount(value => value + 40)}>원고 더 보기</Button></div>}</Card>}
        </section>
      </>}
    {editing && <MetricEditor key={editing.id} entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice('수치를 기록했습니다.'); window.dispatchEvent(new Event('moonlight:content-saved')); }} />}
  </div>;
}
