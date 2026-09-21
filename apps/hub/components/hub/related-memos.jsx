"use client";
import React from 'react';
import Link from 'next/link';
import { Button, Skeleton, TruthBadge } from './hub-primitives';
import { isCanonicalUuid } from '@/lib/uuid';
import { memoDocumentHref, memoListHref } from '@/lib/journal-search-client';
import { useMemoSearch } from './pages/use-memo-search';

export function RelatedMemos({ type, id, onOpen }) {
  if (!['project', 'lead', 'account', 'brand'].includes(type) || !isCanonicalUuid(id)) return null;
  return <RelatedMemoList key={`${type}:${id}`} type={type} id={id.toLowerCase()} onOpen={onOpen} />;
}
function RelatedMemoList({ type, id, onOpen }) {
  const params = new URLSearchParams({ contextType: type, contextId: id });
  const search = useMemoSearch(params.toString() + '&limit=3');
  const label = ({ project: '프로젝트', lead: '고객', account: '고객', brand: '브랜드' })[type];
  const linkStyle = { display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minHeight: 44, padding: '10px 0', color: 'var(--fg)', fontSize: 12, textDecoration: 'none', overflowWrap: 'anywhere' };
  return <section aria-label="연결된 메모" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>연결된 메모</h3>
      <Link className="hub-row" href={memoListHref(params)} style={linkStyle}>전체 보기 →</Link>
    </div>
    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--fg-muted)' }}>이 {label}에 직접 연결한 최근 메모</p>
    {search.status === 'loading' && <Skeleton lines={2} height={14} label="연결 메모 불러오는 중" />}
    {search.error && <div role="alert"><p style={{ fontSize: 12 }}>{search.error}</p><Button onClick={search.refresh}>다시 불러오기</Button></div>}
    {search.status === 'preview' && <><TruthBadge state="preview" /><p style={{ fontSize: 12 }}>메모 저장소 연결이 필요해요.</p></>}
    {search.status === 'live' && (search.entries.length === 0 ? <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>연결한 메모가 아직 없어요.</p> : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {search.entries.map((entry) => {
        const content = <>
          <strong style={{ fontWeight: 500 }}>{entry.title || '제목 없는 메모'}</strong>
          <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{entry.excerpt}</span>
          <span className="mono" style={{ color: 'var(--fg-muted)' }}>{new Date(entry.occurredAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
        </>;
        return <li key={entry.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
          {onOpen ? <button type="button" className="hub-row" onClick={() => onOpen(entry.id)} style={{ ...linkStyle, width: '100%', textAlign: 'left', alignItems: 'flex-start' }}>{content}</button>
            : <Link className="hub-row" href={memoDocumentHref(params, { note: entry.id })} style={linkStyle}>{content}</Link>}
        </li>;
      })}
    </ul>)}
  </section>;
}
