"use client";

import React from 'react';
import { Button, Card, IconButton, TruthBadge } from './hub-primitives';
import { inquiryReadState, inquiryTime } from './inquiry-view-state';

export function useInquiryNotifications() {
  const [state, setState] = React.useState({ status: 'loading', rows: [], unreadCount: null });
  React.useEffect(() => {
    let controller;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const r = await fetch('/api/hub/inquiries?filter=unread&pageSize=3', { cache: 'no-store', signal });
        const data = await r.json();
        if (!signal.aborted) setState(inquiryReadState(r.ok ? data : null));
      } catch { if (!signal.aborted) setState(inquiryReadState(null)); }
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    window.addEventListener('focus', load);
    window.addEventListener('moonlight:inquiries-changed', load);
    return () => { controller?.abort(); clearInterval(timer); window.removeEventListener('focus', load); window.removeEventListener('moonlight:inquiries-changed', load); };
  }, []);
  return state;
}

export function InquiryBell({ state, onNavigate, className, size = 28 }) {
  const count = state?.unreadCount;
  const title = state?.status === 'error' ? '문의 알림 확인 실패 · 오늘 열기'
    : count != null ? `새 문의 ${count}건 · 오늘 열기` : '오늘 알림 열기';
  return <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
    <IconButton icon="bell" size={size} tooltip={title} onClick={() => onNavigate?.('dashboard/daily-brief')} />
    {(count > 0 || state?.status === 'error') && <span aria-hidden="true" className="num" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{state?.status === 'error' ? '!' : count > 99 ? '99+' : count}</span>}
  </span>;
}

export function InquirySummary({ state, onNavigate }) {
  const count = state?.unreadCount;
  return <Card>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>문의 알림</strong>
        {count != null && <span className="num" style={{ fontSize: 12 }}>미확인 {count}건</span>}
        <TruthBadge state={state?.status || 'loading'} label={state?.status === 'live' ? '조회됨' : undefined} />
      </div>
      <Button size="sm" onClick={() => onNavigate?.('dashboard/revenue/inquiries?filter=unread')}>문의 내역 열기 →</Button>
    </div>
    {state?.status === 'error' ? <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>문의 알림을 확인하지 못했습니다. 문의 내역에서 다시 확인해 주세요.</p>
      : state?.status === 'preview' ? <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>문의 저장소 연결 후 메일·랜딩페이지 문의가 표시됩니다.</p>
        : state?.status === 'live' && count === 0 ? <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>미확인 문의가 없습니다.</p> : null}
    {(state?.rows || []).map(row => <button key={row.id} className="hub-row" onClick={() => onNavigate?.(`dashboard/revenue/inquiries?inquiry=${row.id}`)} style={{ display: 'flex', width: '100%', gap: 12, padding: '10px 0', textAlign: 'left', borderTop: '1px solid var(--line-soft)' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.subject}</span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{inquiryTime(row.received_at)}</span>
    </button>)}
  </Card>;
}
