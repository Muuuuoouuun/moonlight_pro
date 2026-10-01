"use client";

import React from "react";
import { Button, Drawer, Skeleton, EmptyState, TruthBadge } from "../hub-primitives";
import { readYouTubeConnectionFeedback } from "./youtube-connection-feedback";

const STATUS_LABELS = {
  connected: "저장된 접근 권한 유효",
  "refresh-required": "접근 권한 갱신 필요",
  "reauthorization-required": "Google 재승인 필요",
  disabled: "연결 해제됨",
};

function expiryText(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : '확인되지 않음';
}

/** Shares the authenticated Hub surface in desktop/mobile/remote browsers. */
export function YouTubeConnections() {
  const [data, setData] = React.useState({ status: 'loading', connections: [] });
  const [action, setAction] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const mounted = React.useRef(false);
  const busyRef = React.useRef(false);
  const load = React.useCallback(async () => {
    try {
      const response = await fetch('/api/social/youtube/status', { cache: 'no-store' });
      const result = await response.json();
      if (mounted.current) setData(response.ok && result && Array.isArray(result.connections)
        ? result : { status: 'storage-error', connections: [] });
    } catch {
      if (mounted.current) setData({ status: 'storage-error', connections: [] });
    }
  }, []);
  React.useEffect(() => {
    mounted.current = true;
    const feedback = readYouTubeConnectionFeedback(window.location.href);
    if (feedback) {
      setMessage(feedback.message);
      window.history.replaceState(window.history.state, '', feedback.returnPath);
    }
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const choose = (type, connection) => {
    setMessage('');
    setAction({ type, connection });
  };
  const execute = async () => {
    if (!action || busyRef.current) return;
    if (action.type === 'reconnect') {
      const params = new URLSearchParams({ channelId: action.connection.channelId });
      if (action.connection.brandKey) params.set('brandKey', action.connection.brandKey);
      window.location.assign(`/api/social/youtube/connect?${params.toString()}`);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/social/youtube/refresh', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: action.connection.channelId, confirmRefresh: true }),
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'saved') {
        setMessage(result.error || '갱신하지 못했습니다. 상태를 다시 확인하세요.');
      } else {
        setMessage(result.refreshed ? '접근 권한을 갱신했습니다. 갱신 권한 만료일도 확인하세요.' : '기존 접근 권한이 아직 유효합니다.');
        setAction(null);
      }
    } catch { setMessage('응답을 확인하지 못했습니다. 상태 확인 후 다시 시도하세요.'); }
    finally {
      await load();
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>YouTube 채널</div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={load}>상태 확인</Button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>저장된 메타데이터 기준 · 자동 갱신 없음 · 업로드 준비 중</div>
        {data.status === 'loading' ? <Skeleton lines={2} />
          : data.status === 'storage-error' ? <EmptyState title="채널 상태를 읽지 못했습니다" action={<Button variant="ghost" onClick={load}>다시 확인</Button>} />
            : data.connections.length === 0 ? <EmptyState title="연결된 YouTube 채널이 없습니다" description="Google 계정의 정확한 채널을 확인한 뒤 연결하세요." />
              : data.connections.map(connection => (
                <div key={connection.id} style={{ padding: '12px 0', borderTop: '1px solid var(--line-soft)', marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{connection.channelTitle || connection.channelId}</div>
                  <div className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{connection.channelId}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{STATUS_LABELS[connection.tokenStatus] || '연결 확인 필요'}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>접근 권한 만료: {expiryText(connection.expiresAt)}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>갱신 권한 만료: {expiryText(connection.refreshTokenExpiresAt)}</div>
                  {connection.reauthorizationDue && <div style={{ fontSize: 12, marginTop: 4 }}>갱신 권한이 곧 만료됩니다. Google에서 다시 승인할 시점을 확인하세요.</div>}
                  {!connection.brandKey && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>브랜드 미지정 · 업로드 전 대상 확인 필요</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    <Button variant="ghost" size="sm" disabled={busy || !data.configured || connection.tokenStatus !== 'refresh-required'} onClick={() => choose('refresh', connection)}>{connection.channelTitle || '채널'} 접근 권한 갱신</Button>
                    <Button variant="ghost" size="sm" disabled={busy || !data.configured || !data.hasOAuthStateSecret} onClick={() => choose('reconnect', connection)}>{connection.channelTitle || '채널'} 재연결</Button>
                  </div>
                </div>
              ))}
        {data.status === 'missing-config' && <TruthBadge state="preview" label="연결 설정 필요" />}
        {message && <div role="status" style={{ fontSize: 12, marginTop: 8 }}>{message}</div>}
      </div>
      {action && <Drawer onClose={() => { if (!busy) setAction(null); }} presentation="compact" title={action.type === 'refresh' ? 'YouTube 접근 권한 갱신' : 'YouTube 재연결'}>
        {action && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>{action.connection.channelTitle}</div>
          <div className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{action.connection.channelId}</div>
          <p style={{ margin: 0, fontSize: 13 }}>{action.type === 'refresh'
            ? '이 채널의 기존 권한으로 접근 토큰을 갱신하고 채널 ID를 확인한 뒤 Moonlight에 저장합니다. 갱신 권한 자체의 만료는 연장되지 않습니다.'
            : 'Google에서 같은 채널을 선택하고 읽기·업로드 권한을 확인합니다. 선택한 채널 ID가 다르면 연결을 저장하지 않습니다.'}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>이번 동작으로 영상이나 게시물을 발행하지 않습니다.</p>
          <Button disabled={busy} onClick={execute}>{busy ? '갱신 중…' : action.type === 'refresh' ? '확인하고 갱신' : 'Google에서 승인'}</Button>
          {message && <div role="status" style={{ fontSize: 12 }}>{message}</div>}
        </div>}
      </Drawer>}
    </>
  );
}
