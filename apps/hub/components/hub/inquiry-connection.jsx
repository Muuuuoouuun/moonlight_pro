"use client";

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Card, TruthBadge } from './hub-primitives';
import { inquiryTime, notifyInquiriesChanged } from './inquiry-view-state';

export function InquiryConnection({ compact = false }) {
  const oauthOutcome = useSearchParams().get('gmail');
  const [state, setState] = React.useState({ status: 'loading', connections: [] });
  const [scanning, setScanning] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [gmail, setGmail] = React.useState(null);
  const [expanded, setExpanded] = React.useState(!compact);
  const detailsId = React.useId();
  const [revision, refresh] = React.useReducer(n => n + 1, 0);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/hub/email/scan', { cache: 'no-store', signal: controller.signal }).then(async r => {
      const data = await r.json();
      if (!controller.signal.aborted) setState(r.ok && data ? data : { status: 'error' });
    }).catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }); });
    fetch('/api/email/gmail/status', { cache: 'no-store', signal: controller.signal }).then(async r => {
      const data = await r.json();
      if (!controller.signal.aborted) setGmail(r.ok ? data : { status: 'error' });
    }).catch(() => { if (!controller.signal.aborted) setGmail({ status: 'error' }); });
    return () => controller.abort();
  }, [revision]);
  const scan = async () => {
    setScanning(true); setResult(null);
    try {
      const r = await fetch('/api/hub/email/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await r.json();
      setResult(r.ok || data?.status === 'busy' ? data : { ...data, status: 'error' });
      notifyInquiriesChanged(); refresh();
    } catch { setResult({ status: 'error' }); }
    finally { setScanning(false); }
  };
  return <Card>
    <div className="inquiry-toolbar" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <strong style={{ fontSize: 13 }}>메일 문의 감지</strong>
      <TruthBadge label={state.status === 'live' ? '수집 기록 확인' : undefined} state={state.status === 'live' ? 'live' : state.status === 'preview' ? 'preview' : state.status === 'loading' ? 'loading' : 'error'} />
      <Button disabled={scanning} onClick={scan}>{scanning ? '확인 중…' : result?.remaining || result?.status === 'partial' ? '남은 메일 이어서 확인' : '지금 메일 확인'}</Button>
      <Button disabled={!gmail?.setup?.connectUrl || scanning} onClick={() => window.location.assign('/api/email/gmail/connect?returnPath=%2Fdashboard%2Frevenue%2Finquiries')}>{gmail?.connection ? 'Gmail 재연결' : 'Gmail 연결'}</Button>
      {compact && <Button aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{expanded ? '설정 접기' : '연결·수집 상태'}</Button>}
    </div>
    {oauthOutcome && <p role="status" style={{ fontSize: 12, lineHeight: 1.6 }}>{oauthOutcome === 'connected' ? 'Gmail 연결이 저장됐습니다. 지금 메일 확인으로 수집을 시작해 주세요.' : oauthOutcome === 'oauth-denied' ? 'Gmail 연결이 취소됐습니다. 연결할 때 메일 읽기 권한을 허용해 주세요.' : 'Gmail 연결을 완료하지 못했습니다. 서버 설정을 확인한 뒤 다시 연결해 주세요.'}</p>}
    <div id={detailsId} hidden={!expanded}>
    <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '8px 0', lineHeight: 1.6 }}>연결된 Gmail에서 영업·지원·제휴 문의를 찾습니다. 처음 가져오는 최근 7일 내역은 알림 없이 저장합니다.</p>
    {gmail && !gmail.setup?.connectUrl && <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{gmail.status === 'error' ? '메일 연결 설정을 확인하지 못했습니다.' : 'Gmail 연결을 시작하려면 서버의 Google OAuth 설정이 필요합니다.'}</p>}
    {gmail?.connection && <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>연결 기록: {gmail.connection.email || gmail.connection.mailbox} · 읽기 권한은 수집할 때 확인합니다.</p>}
    {state.autoSyncEnabled != null && <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{state.autoSyncEnabled ? '자동 수집 사용 설정됨 · 최근 수집 시각으로 실행 여부를 확인하세요.' : '자동 수집 꺼짐 · 지금 메일 확인으로 수집할 수 있습니다.'}</p>}
    {state.status === 'error' && <p role="alert" style={{ fontSize: 12 }}>수집 상태를 확인하지 못했습니다. <Button onClick={refresh}>다시 확인</Button></p>}
    {state.status === 'preview' && <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>문의 저장소가 아직 연결되지 않았습니다.</p>}
    {state.status === 'live' && !state.connections?.length && <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>아직 메일을 수집하지 않았습니다.</p>}
    {(state.connections || []).map(connection => <div key={connection.account_key} style={{ fontSize: 12, marginTop: 6 }}>
      <span className="mono">{connection.account_key}</span> · 최근 수집 {inquiryTime(connection.last_success_at)}
      {connection.pending > 0 && <span className="num"> · 대기 {connection.pending}건</span>}
      {connection.last_error && <span role="alert">{/(reconnect|scope|access-token)/i.test(connection.last_error) ? ' · Gmail 재연결과 메일 읽기 권한 확인이 필요합니다.' : ' · 수집 중 오류가 발생했습니다. 이어서 확인해 주세요.'}</span>}
      {connection.recoveryNotice && <div>{connection.recoveryNotice}</div>}
    </div>)}
    </div>
    {!expanded && state.connections?.some(c => c.last_error) && <p role="alert" className="inquiry-error">최근 메일 수집에 실패했습니다. 연결·수집 상태를 확인해 주세요.</p>}
    {result && <p role="status" style={{ fontSize: 12, marginBottom: 0 }}>
      {result.status === 'saved' || result.status === 'partial' ? `${result.scanned || 0}개 확인 · 문의 ${result.staged || 0}건 · 중복 ${result.duplicates || 0}건${result.status === 'partial' ? ' · 남은 내역이 있습니다. 이어서 확인해 주세요.' : ''}`
        : result.status === 'busy' ? '이미 수집 중입니다. 잠시 후 다시 확인해 주세요.'
          : result.reason === 'gmail-read-scope-required' || result.reason === 'gmail-reconnect-required' ? 'Gmail을 다시 연결하고 메일 읽기 권한을 허용해 주세요.'
            : result.status === 'preview' ? 'Gmail 연결과 메일 읽기 권한을 설정한 뒤 다시 확인해 주세요.' : '수집을 완료하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.'}
    </p>}
  </Card>;
}
