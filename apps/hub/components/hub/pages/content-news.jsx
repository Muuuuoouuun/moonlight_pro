"use client";

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Card, EmptyState, SelectField, Skeleton, TruthBadge } from '../hub-primitives';
import { NEWS_SEARCH_TOPICS } from '@/lib/research-news-topics';
import './content-news.css';

const BRANDS = [
  { value: 'politicofficer', label: 'Politic_Officer' },
  { value: 'classmoon', label: 'Class.Moon' },
  { value: '22nomad', label: '22th Nomad' },
];
const FRESHNESS = [
  { value: 'pd', label: '최근 24시간' },
  { value: 'pw', label: '최근 7일' },
];
const ERROR_COPY = {
  'missing-api-key': 'Brave Search API 키가 Hub 서버에 설정되지 않았습니다.',
  'brave-rate-limited': 'Brave 호출 한도에 도달했습니다. 잠시 뒤 다시 확인해 주세요.',
  'brave-auth-failed': 'Brave 키 또는 요금제 권한을 확인해 주세요.',
  'brave-request-failed': 'Brave에 연결하지 못했습니다. 연결 상태를 확인하고 다시 검색해 주세요.',
  'brave-upstream-failed': 'Brave가 검색을 완료하지 못했습니다. 나중에 다시 시도해 주세요.',
  'brave-invalid-response': 'Brave 응답 형식을 확인할 수 없습니다. 나중에 다시 시도해 주세요.',
};

function initialBrand(value) {
  return Object.hasOwn(NEWS_SEARCH_TOPICS, value) ? value : 'classmoon';
}

function formatTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
}

export function ContentNews() {
  const searchParams = useSearchParams();
  const [brand, setBrand] = React.useState(() => initialBrand(searchParams.get('brand')));
  const [topic, setTopic] = React.useState(() => NEWS_SEARCH_TOPICS[initialBrand(searchParams.get('brand'))][0].id);
  const [freshness, setFreshness] = React.useState('pd');
  const [state, setState] = React.useState({ status: 'idle', results: [] });
  const busy = React.useRef(false);

  React.useEffect(() => {
    const next = initialBrand(searchParams.get('brand'));
    setBrand(next);
    setTopic(NEWS_SEARCH_TOPICS[next][0].id);
    setState({ status: 'idle', results: [] });
  }, [searchParams]);

  function changeBrand(next) {
    setBrand(next);
    setTopic(NEWS_SEARCH_TOPICS[next][0].id);
    setState({ status: 'idle', results: [] });
  }

  async function search(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'loading', results: [] });
    try {
      const response = await fetch('/api/hub/research/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, topic, freshness }),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      });
      const data = await response.json().catch(() => null);
      if (!data || data.status === 'error' || !response.ok) {
        setState({ status: 'error', reason: data?.reason || 'brave-request-failed', results: [] });
      } else if (data.status === 'preview') {
        setState({ status: 'preview', reason: data.reason, results: [] });
      } else if (data.status === 'ok' && Array.isArray(data.results)) {
        setState({ status: 'live', results: data.results, query: data.query, searchedAt: data.searchedAt, calls: data.calls });
      } else {
        setState({ status: 'error', reason: 'brave-invalid-response', results: [] });
      }
    } catch {
      setState({ status: 'error', reason: 'brave-request-failed', results: [] });
    } finally {
      busy.current = false;
    }
  }

  const topics = NEWS_SEARCH_TOPICS[brand].map((entry) => ({ value: entry.id, label: entry.label }));
  const status = state.status;
  return (
    <div className="hub-page content-news">
      <header className="content-news-header">
        <div>
          <h2>뉴스 탐색</h2>
          <p>브랜드별 새 소식을 찾아 원문 검토 대상으로 고릅니다.</p>
        </div>
        {status !== 'idle' && <TruthBadge state={status} />}
      </header>

      <Card>
        <form className="content-news-form" onSubmit={search}>
          <SelectField label="브랜드" value={brand} options={BRANDS} disabled={status === 'loading'} onChange={(event) => changeBrand(event.target.value)} />
          <SelectField label="주제" value={topic} options={topics} disabled={status === 'loading'} onChange={(event) => { setTopic(event.target.value); setState({ status: 'idle', results: [] }); }} />
          <SelectField label="기간" value={freshness} options={FRESHNESS} disabled={status === 'loading'} onChange={(event) => { setFreshness(event.target.value); setState({ status: 'idle', results: [] }); }} />
          <Button variant="primary" type="submit" disabled={status === 'loading'}>{status === 'loading' ? '검색 중…' : '뉴스 검색'}</Button>
        </form>
        <p className="content-news-hint">검색 버튼 한 번에 Brave News API 1회 호출 · 최대 10건 · 검색 결과는 저장되지 않습니다.</p>
      </Card>

      {status === 'loading' && <Card aria-label="뉴스 검색 중"><Skeleton lines={4} /></Card>}
      {status === 'preview' && <Card><EmptyState icon="link" title="Brave 연결 필요" description={ERROR_COPY[state.reason]} /></Card>}
      {status === 'error' && <Card><EmptyState icon="x" title="뉴스 검색 실패" description={ERROR_COPY[state.reason] || '검색을 완료하지 못했습니다.'} action={<Button variant="outline" onClick={search}>다시 검색</Button>} /></Card>}
      {status === 'idle' && <Card><EmptyState icon="globe" title="찾을 주제를 고르세요" description="검색은 직접 시작합니다. 결과의 제목과 발췌는 사실 확인 전 탐색 신호입니다." /></Card>}
      {status === 'live' && <section aria-label="뉴스 탐색 결과" aria-live="polite">
        <div className="content-news-results-head">
          <div><h3>{state.query?.label} · {state.results.length}건</h3><p>Brave 검색 결과 · 원문 확인 전 · {formatTime(state.searchedAt)} 조회</p></div>
          <span className="mono">API {state.calls}회</span>
        </div>
        {state.results.length === 0 ? <Card><EmptyState icon="globe" title="이번 기간에 찾은 뉴스가 없습니다" description="기간을 7일로 넓히거나 다른 주제로 다시 검색해 보세요." /></Card> :
          <Card pad={false}><ol className="content-news-list">{state.results.map((entry) => <li key={entry.url} className="hub-row">
            <div className="content-news-meta"><span>{entry.source}</span>{entry.publishedAt && <span className="mono">{formatTime(entry.publishedAt)} · Brave 제공 시각</span>}{entry.breaking && <span>Brave 속보 표시</span>}</div>
            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="content-news-title">{entry.title} <span aria-hidden="true">↗</span></a>
            {entry.snippet && <p className="content-news-snippet">검색 발췌 · {entry.snippet}</p>}
          </li>)}</ol></Card>}
        <p className="content-news-footer">콘텐츠 후보로 쓰기 전 원문·발표 시각·적용 대상을 확인하세요. 원문 확인 뒤 소재·제작에서 기록할 수 있습니다.</p>
      </section>}
    </div>
  );
}
