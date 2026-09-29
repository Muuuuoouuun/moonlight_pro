"use client";

import React from 'react';
import Link from 'next/link';
import { Button, Skeleton, TruthBadge } from './hub-primitives';
import { ProjectStatusBadge } from './pages/project-pms-components';
import { projectCustomerRef } from '@/lib/project-customer-context';
import { deadlineDayKey } from '@/lib/deadline-alert-reset';
import { useCustomerContext } from './use-customer-context';

// 기록 status → PMS 표시 라벨(operating-ledger·project-ledger-context의 normalizeProjectStatus와 같은 표).
// 라벨과 lifecycle(DESIGN §8.2)은 ProjectStatusBadge가 정본이다 — 막힘만 danger, 나머지는 중립.
const PMS_STATUS = { draft: 'Planning', blocked: 'Blocked', completed: 'Done', archived: 'Backlog' };
const TERMINAL = new Set(['completed', 'archived']);

// 기한은 서울 날짜로 읽는다. 올해면 MM.DD, 다른 해면 YYYY.MM.DD. '기한 지남'(danger)은 열린 일에만 붙는다 —
// 끝난 일(완료·보관)은 아니고, 막힘은 배지가 이미 위험을 말한다(PMS처럼 막힘 우선, 빨강 하나). 운영자가 해제한
// 이전 기한 알림은 '알림 해제'로 두고, 해제 여부를 읽지 못했으면(alertsKnown=false) 색 없이 날짜만 둔다.
export function customerProjectDue(project, today = deadlineDayKey(new Date()), alertsKnown = true) {
  const day = deadlineDayKey(project?.dueAt);
  if (!day) return null;
  const late = !TERMINAL.has(project.status) && project.status !== 'blocked' && day < today;
  return { text: (day.slice(0, 4) === today.slice(0, 4) ? day.slice(5) : day).replaceAll('-', '.'),
    overdue: late && alertsKnown && !project.deadlineAlertSuppressed, dismissed: late && Boolean(project.deadlineAlertSuppressed) };
}

export function RelatedCustomerProjects({ type, id }) {
  const data = useCustomerContext(projectCustomerRef({ type, id }), true);
  const [expanded, setExpanded] = React.useState(false);
  const rows = data.projects || [];
  const today = deadlineDayKey(new Date());
  // 제품 읽기가 실패하면 "제품 없음"으로 보이지 않게 제품이 붙은 행에만 확인 실패를 적는다.
  const productsFailed = Boolean(data.failedSources?.includes('products'));
  const alertsFailed = Boolean(data.failedSources?.includes('deadline_alerts'));
  // §5.3 partial: 빠진 출처를 이름으로 말하고 같은 '다시 확인'을 준다(목록 아래 한 줄, 실패일 때만).
  const missing = [productsFailed && '제품 이름', alertsFailed && '기한 알림 해제 여부'].filter(Boolean);
  return <section aria-label="연결 프로젝트" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <h3 style={{ margin: 0, fontSize: 14 }}>연결 프로젝트</h3>
    {data.status === 'loading' ? <Skeleton lines={2} height={14} label="연결 프로젝트 불러오는 중" />
      : data.status === 'error' || data.failedSources?.includes('projects') ? <div role="alert"><p>연결 프로젝트를 확인하지 못했어요.</p><Button onClick={data.reload}>다시 확인</Button></div>
      : data.status === 'preview' ? <TruthBadge state="preview" />
      : rows.length ? <>{(expanded ? rows : rows.slice(0, 3)).map(project => {
        const due = customerProjectDue(project, today, !alertsFailed), terminal = TERMINAL.has(project.status);
        const product = project.productName || (project.productId && productsFailed ? '제품 확인 못 함' : null);
        // 한 행 = 링크 하나. 첫 줄 이름, 둘째 줄 상태 · 기한 · 제품(390px에서 줄바꿈). 끝난 일은 이름 명도를 한 단계 낮춘다.
        return <Link key={project.id} className="hub-row" href={project.href} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, minHeight: 44, padding: '6px 0', fontSize: 12, color: terminal ? 'var(--fg-muted)' : 'var(--fg)' }}>
          <span>{project.name} →</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 6px', color: 'var(--fg-muted)' }}>
            <ProjectStatusBadge status={PMS_STATUS[project.status] || 'In progress'} />
            {due ? <span>{due.overdue ? <span style={{ color: 'var(--danger)', fontWeight: 500 }}>기한 지남</span> : '기한'} <span className="mono">{due.text}</span>{due.dismissed && <span style={{ color: 'var(--fg-dim)' }}> · 알림 해제</span>}</span>
              : <span style={{ color: 'var(--fg-dim)' }}>기한 없음</span>}
            {product && <span style={project.productName ? undefined : { color: 'var(--fg-dim)' }}>· {product}</span>}
          </span>
        </Link>;
      })}
        {/* 열린 일이 먼저 오므로 접은 3개는 '최근 3개'가 아니다. */}
        {rows.length > 3 && <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '3개만 보기' : '연결 프로젝트 더 보기'}</Button>}
        {data.hasMore && <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>최근 프로젝트 20개를 표시했어요.</p>}
        {missing.length > 0 && <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <TruthBadge state="partial" reason={`${missing.join('·')} 확인 못 함`} /><Button size="sm" variant="ghost" onClick={data.reload}>다시 확인</Button></div>}</>
        : <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>연결된 프로젝트가 없어요.</p>}
  </section>;
}
