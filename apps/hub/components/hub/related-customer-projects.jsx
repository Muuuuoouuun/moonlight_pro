"use client";

import React from 'react';
import Link from 'next/link';
import { Button, Skeleton, TruthBadge } from './hub-primitives';
import { projectCustomerRef } from '@/lib/project-customer-context';
import { useCustomerContext } from './use-customer-context';

export function RelatedCustomerProjects({ type, id }) {
  const data = useCustomerContext(projectCustomerRef({ type, id }), true);
  const [expanded, setExpanded] = React.useState(false);
  const rows = data.projects || [];
  return <section aria-label="연결 프로젝트" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <h3 style={{ margin: 0, fontSize: 14 }}>연결 프로젝트</h3>
    {data.status === 'loading' ? <Skeleton lines={2} height={14} label="연결 프로젝트 불러오는 중" />
      : data.status === 'error' || data.failedSources?.includes('projects') ? <div role="alert"><p>연결 프로젝트를 확인하지 못했어요.</p><Button onClick={data.reload}>다시 확인</Button></div>
      : data.status === 'preview' ? <TruthBadge state="preview" />
      : rows.length ? <>{(expanded ? rows : rows.slice(0, 3)).map(project => <Link key={project.id} className="hub-row" href={project.href} style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontSize: 12, color: 'var(--fg)' }}>{project.name} →</Link>)}
        {rows.length > 3 && <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '최근 3개만 보기' : '연결 프로젝트 더 보기'}</Button>}
        {data.hasMore && <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>최근 프로젝트 20개를 표시했어요.</p>}</>
        : <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>연결된 프로젝트가 없어요.</p>}
  </section>;
}
