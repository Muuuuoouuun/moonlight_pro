"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Progress, SectionTitle, Kbd, EmptyState, SyncBadge, LifecycleBadge } from "../hub-primitives";

const EMPTY_AUTOMATION_SUMMARY = {
  runsToday: 0,
  failuresToday: 0,
  activeAutomations: 0,
  webhookEventsToday: 0,
  integrationsConnected: 0,
};

// 모듈 스코프 stale-while-revalidate — 개요↔Flows↔Webhooks↔Runs 탭 전환마다 원장을 다시
// 기다리며 스켈레톤을 보이던 것을 제거(8차 잔여 M). 재검증 실패는 partial(위장 금지).
const AUTOMATIONS_CACHE_SERVABLE_MS = 5 * 60 * 1000;
let automationsLedgerCache = null; // { at, state }

function useAutomationsLedger() {
  const servable = automationsLedgerCache
    && Date.now() - automationsLedgerCache.at < AUTOMATIONS_CACHE_SERVABLE_MS;
  const [state, setState] = React.useState(servable ? automationsLedgerCache.state : {
    source: 'preview',
    syncState: 'preview',
    automations: [],
    runs: [],
    webhookEvents: [],
    errors: [],
    integrations: [],
    summary: EMPTY_AUTOMATION_SUMMARY,
  });

  React.useEffect(() => {
    let active = true;
    const hasServableCache = Boolean(
      automationsLedgerCache && Date.now() - automationsLedgerCache.at < AUTOMATIONS_CACHE_SERVABLE_MS
    );
    async function load() {
      if (!hasServableCache) setState(s => ({ ...s, syncState: 'loading' })); // 캐시 서빙 중엔 조용히 재검증
      try {
        const response = await fetch('/api/hub/automations', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data || data.status === 'error') {
          // 라이브 read 실패는 error — preview("미구성")로 뭉개면 실행 로그가
          // "기록이 없습니다"로 위장된다(4차 재감사 M — Engine 실행 피드백은 §1 코어).
          if (active) setState(s => ({ ...s, syncState: hasServableCache ? 'partial' : 'error' }));
          return;
        }
        if (data.source === 'supabase') {
          const nextState = {
            source: 'supabase',
            syncState: 'live',
            automations: Array.isArray(data.automations) ? data.automations : [],
            runs: Array.isArray(data.runs) ? data.runs : [],
            webhookEvents: Array.isArray(data.webhookEvents) ? data.webhookEvents : [],
            errors: Array.isArray(data.errors) ? data.errors : [],
            integrations: Array.isArray(data.integrations) ? data.integrations : [],
            summary: { ...EMPTY_AUTOMATION_SUMMARY, ...(data.summary || {}) },
          };
          automationsLedgerCache = { at: Date.now(), state: nextState };
          setState(nextState);
        } else {
          setState(s => ({ ...s, source: 'preview', syncState: 'preview', automations: [], runs: [], webhookEvents: [], summary: EMPTY_AUTOMATION_SUMMARY }));
        }
      } catch {
        if (active) setState(s => ({ ...s, syncState: hasServableCache ? 'partial' : 'error' }));
      }
    }
    load();
    return () => { active = false; };
  }, []);

  return state;
}

export function AutomationsIndex({ onNavigate }) {
  const automationLifecycle = (status) => ({ Active: 'active', Paused: 'waiting', Error: 'blocked' }[status] || 'queued');
  const { automations, summary, syncState } = useAutomationsLedger();
  const rows = automations;
  const activeCount = rows.filter(a => a.status === 'Active').length || summary?.activeAutomations || 0;
  const runsTodayCount = summary?.runsToday ?? 0;
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Automations</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {activeCount} active flows · {runsTodayCount} runs in last 24h
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon="runs" onClick={() => onNavigate('dashboard/automations/runs')}>Run log</Button>
        <div style={{ width: 8 }} />
        {/* Flow 생성 경로는 미구현 — ?new=flow는 아무도 소비하지 않는 죽은 약속이었다.
            생성을 약속하지 않는 정직한 내비게이션으로 교체(추가 기능이 아니라 정합). */}
        <Button variant="secondary" size="sm" icon="zap" onClick={() => onNavigate('dashboard/automations/flows')}>Flow 캔버스</Button>
      </div>

      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 110px 130px 140px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>Flow</span><span>Trigger</span><span>Status</span><span>Last run</span><span>Success (24h)</span><span style={{ textAlign: 'right' }} />
        </div>
        {automations.length === 0 && (
          <EmptyState
            icon="automations"
            title={syncState === 'error' ? '자동화 기록을 읽지 못했습니다' : '자동화 기록이 비어 있습니다'}
            description={syncState === 'error'
              ? '지금 화면은 비어 보여도 실제 flow가 있을 수 있습니다. 새로고침으로 재시도하세요.'
              : syncState === 'live' ? 'Supabase automations 테이블에 표시할 flow가 없습니다. Flow 등록은 Engine 배선으로 이뤄집니다.' : 'flow가 등록되면 실행 상태와 성공률이 여기에 표시됩니다.'}
            action={<Button variant="secondary" size="sm" icon="runs" onClick={() => onNavigate('dashboard/automations/runs')}>실행 로그 보기</Button>}
          />
        )}
        {rows.map((a, i) => (
          <div key={a.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 200px 110px 130px 140px 80px',
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < automations.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Iconed name="zap" size={13} style={{ color: 'var(--moon-300)' }} />
              <span style={{ fontSize: 13 }}>{a.name}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{a.trigger}</span>
            <LifecycleBadge state={automationLifecycle(a.status)} label={a.status} />
            <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{a.lastRun}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 성공률은 일상 지표 — 신호등 색 금지(§5.2), 수치 자체가 정보를 전달한다. */}
              <span className="mono" style={{ fontSize: 12, color: 'var(--fg)' }}>
                {a.success}/{a.runs24}
              </span>
              <div style={{ flex: 1 }}><Progress value={a.runs24 ? (a.success / a.runs24) * 100 : 0} tone="moon" /></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {/* 상태 write 경로 미구현(automations API는 GET뿐) — 토글이 리로드에 조용히
                  원복되는 가짜 스위치였다. 배선 전까지 비활성 + 이유 노출이 정직하다. */}
              <IconButton
                icon={a.status === 'Active' ? 'pause' : 'play'}
                tooltip="상태 변경은 아직 원장에 연결되지 않았습니다"
                disabled
              />
              <IconButton icon="moreV" tooltip="Open flow canvas" onClick={() => onNavigate('dashboard/automations/flows')} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

const EMPTY_EMAIL_STATUS = { status: 'loading', configured: false };

function useEmailIntegrationStatus(url) {
  const [state, setState] = React.useState(EMPTY_EMAIL_STATUS);

  React.useEffect(() => {
    let active = true;

    fetch(url, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        setState(data || { status: 'missing-config', configured: false });
      })
      .catch(() => {
        if (active) setState({ status: 'degraded', configured: false });
      });

    return () => { active = false; };
  }, [url]);

  return state;
}

function emailStatusBadge(status) {
  // §5.3 truth 중립 — 라벨이 상태를 말한다. 실패만 danger인데 이 표면엔 실패 상태가 없다.
  if (status === 'connected') return { tone: 'neutral', label: 'Connected' };
  if (status === 'ready') return { tone: 'neutral', label: 'OAuth ready' };
  if (status === 'disabled') return { tone: 'neutral', label: 'Disabled' };
  if (status === 'degraded') return { tone: 'neutral', label: 'Status unknown' };
  if (status === 'loading') return { tone: 'neutral', label: 'Checking…' };
  return { tone: 'neutral', label: 'Not connected' };
}

export function EmailAutomation({ onNavigate }) {
  const gmail = useEmailIntegrationStatus('/api/email/gmail/status');
  const resend = useEmailIntegrationStatus('/api/email/resend/status');
  const gmailBadge = emailStatusBadge(gmail.status);
  const resendBadge = emailStatusBadge(resend.status);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', maxWidth: 1100 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Email automations</h2>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>Gmail OAuth · Resend 발송</div>
      </div>
      <div className="hub-grid--two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Iconed name="inbox" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Gmail</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                {gmail.connection?.email || gmail.connection?.mailbox || (gmail.status === 'disabled' ? 'OAuth provider 비활성' : gmail.configured ? 'OAuth 연결 대기' : '연동 미설정')}
              </div>
            </div>
            <Badge tone={gmailBadge.tone} size="xs">{gmailBadge.label}</Badge>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            현재 범위는 Gmail 발송 OAuth 준비 단계입니다. Inbox 읽기·자동 태깅은 별도 scope 검증 전까지 비활성입니다.
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            {gmailBadge.label === 'Not connected' || gmailBadge.label === 'OAuth ready' ? (
              <Button variant="outline" size="xs" onClick={() => onNavigate?.('dashboard/settings')}>Connect</Button>
            ) : (
              <Button variant="outline" size="xs" onClick={() => onNavigate?.('dashboard/automations/flows')}>Rules</Button>
            )}
            <Button variant="ghost" size="xs" onClick={() => onNavigate?.('dashboard/automations/runs')}>Logs</Button>
          </div>
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Iconed name="send" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Resend</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                {resend.fromEmail || (resend.configured ? '발신 주소 확인 중' : 'RESEND_API_KEY 미설정')}
              </div>
            </div>
            <Badge tone={resendBadge.tone} size="xs">{resendBadge.label}</Badge>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            뉴스레터, 트랜잭션 메일, 리마인더 발송. 스케줄된 발송은 Queue에서 관리.
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <Button variant="outline" size="xs" onClick={() => onNavigate?.('dashboard/content/studio?new=draft')}>Templates</Button>
            <Button variant="ghost" size="xs" onClick={() => onNavigate?.('dashboard/automations/runs')}>Deliverability</Button>
          </div>
        </Card>
      </div>

      <SectionTitle right={<Badge tone="neutral" size="xs">샘플 · 미배선</Badge>}>Tag rules</SectionTitle>
      <Card pad={false} className="hub-table-card">
        {[
          { cond: 'from:@* AND subject 한정', then: 'tag: Lead · create CRM', tone: 'neutral' },
          { cond: 'subject contains "invoice"', then: 'tag: Finance · archive 30d', tone: 'neutral' },
          { cond: 'from: jihoon@*, jaemin@*', then: 'tag: Personal', tone: 'neutral' },
          { cond: 'has Stripe link', then: 'tag: Revenue · notify', tone: 'neutral' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 20px 1fr 60px', alignItems: 'center', padding: '12px 16px', borderBottom: i < 3 ? '1px solid var(--line-soft)' : 'none', gap: 10 }}>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{r.cond}</span>
            <Iconed name="arrowRight" size={13} style={{ color: 'var(--fg-faint)' }} />
            <div><Badge tone={r.tone} size="xs">{r.then}</Badge></div>
            <div style={{ textAlign: 'right' }}>
              <IconButton icon="moreV" size={22} iconSize={12} tooltip="Open flow rules" onClick={() => onNavigate?.('dashboard/automations/flows')} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// 실제 Engine 수신 라우트만 경로로 표시한다 — 예전엔 `https://moonlight.pro/hooks/…`라는
// 존재하지 않는 URL을 지어내 렌더했다(8차 잔여 S: 가짜 endpoint). 매핑에 없는 소스는
// 경로를 생략한다(이름 줄이 이미 source·eventType을 전달).
const ENGINE_INGEST_PATHS = {
  telegram: 'engine /api/webhook/telegram',
  moltbot: 'engine /api/webhook/project/moltbot',
  project: 'engine /api/webhook/project',
};

function aggregateWebhookEndpoints(events) {
  if (!events?.length) return [];
  const byKey = new Map();
  events.forEach(ev => {
    const key = `${ev.source}·${ev.eventType}`;
    const entry = byKey.get(key) || {
      name: `${ev.source} — ${ev.eventType}`,
      url: ENGINE_INGEST_PATHS[ev.source] || null,
      status: 'ok',
      lastHit: ev.lastHit,
      count24: 0,
    };
    entry.count24 += 1;
    if (ev.status === 'err') entry.status = 'err';
    else if (ev.status === 'warn' && entry.status !== 'err') entry.status = 'warn';
    byKey.set(key, entry);
  });
  return Array.from(byKey.values());
}

export function Webhooks({ onNavigate }) {
  const { webhookEvents, syncState } = useAutomationsLedger();
  const liveHooks = aggregateWebhookEndpoints(webhookEvents);
  const hooks = liveHooks;
  const sTone = { ok: 'neutral', warn: 'neutral', err: 'danger' };
  const [testState, setTestState] = React.useState({}); // { [idx]: { tone: 'success'|'warning'|'danger', label, pending } }

  async function runHookTest(idx, hook) {
    setTestState(s => ({ ...s, [idx]: { pending: true } }));
    try {
      const response = await fetch('/api/webhooks/project-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: hook.name, source: hook.url }),
      });
      const data = await response.json().catch(() => ({}));

      let entry;
      if (data && data.preview === true) {
        entry = { tone: 'neutral', label: 'preview' };
      } else if (response.ok && (data.status === 'sent' || data.sent)) {
        entry = { tone: 'neutral', label: '✓ sent' };
      } else if (response.ok) {
        entry = { tone: 'neutral', label: 'preview' };
      } else {
        entry = { tone: 'danger', label: 'failed' };
      }
      setTestState(s => ({ ...s, [idx]: entry }));
      setTimeout(() => {
        setTestState(s => {
          const next = { ...s };
          if (next[idx] && next[idx].label === entry.label) delete next[idx];
          return next;
        });
      }, 4000);
    } catch (error) {
      setTestState(s => ({ ...s, [idx]: { tone: 'danger', label: 'failed' } }));
    }
  }

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Webhooks</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {hooks.length} endpoints
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={() => onNavigate?.('dashboard/settings')}>Endpoint</Button>
      </div>
      <Card pad={false}>
        {hooks.length === 0 && (
          <EmptyState
            icon="webhook"
            title={syncState === 'error' ? 'webhook 기록을 읽지 못했습니다' : '수신된 webhook 이벤트가 없습니다'}
            description={syncState === 'error'
              ? '지금 화면은 비어 보여도 실제 이벤트가 있을 수 있습니다. 새로고침으로 재시도하세요.'
              : 'Project webhook smoke test나 Telegram webhook이 들어오면 endpoint별 활동이 집계됩니다.'}
            action={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Button variant="primary" size="sm" icon="play" onClick={() => runHookTest(0, { name: 'Project smoke test', url: '/api/webhooks/project-test' })}>
                  {testState[0]?.pending ? '전송 중…' : 'Send test'}
                </Button>
                {/* 목록이 비어 hooks.map이 결과를 못 그린다 — 여기서 직접 표시(무언 no-op 방지, 5차 재감사 S) */}
                {testState[0] && !testState[0].pending && (
                  <span role="status" aria-live="polite" style={{ fontSize: 11.5, color: testState[0].tone === 'danger' ? 'var(--danger)' : 'var(--fg-muted)' }}>
                    {testState[0].label}
                  </span>
                )}
              </span>
            }
          />
        )}
        {hooks.map((h, i) => {
          const state = testState[i];
          return (
          <div key={i} style={{
            padding: '14px 16px',
            borderBottom: i < hooks.length - 1 ? '1px solid var(--line-soft)' : 'none',
            // 행 전체 semantic fill 금지(§13) — 실패만 1px danger 레일, 성공/경고는 뱃지 라벨이 전달.
            boxShadow: state?.label && state.tone === 'danger' ? 'inset 1px 0 0 var(--danger-line)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Dot tone={sTone[h.status]} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</span>
              {h.status === 'err' && <span style={{ fontSize: 10.5, color: 'var(--danger)' }}>실패</span>}
              <div style={{ flex: 1 }} />
              {state && state.label && (
                <Badge tone={state.tone} size="xs">{state.label}</Badge>
              )}
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{h.count24}/24h · {h.lastHit}</span>
              <IconButton icon="play" tooltip="Send test" onClick={() => runHookTest(i, h)} />
              <IconButton icon="moreV" tooltip="Manage endpoint" onClick={() => onNavigate?.('dashboard/settings')} />
            </div>
            {h.url && <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 6, paddingLeft: 16 }}>{h.url}</div>}
          </div>
          );
        })}
      </Card>
    </div>
  );
}

function isHeartbeatRun(r) {
  const detail = String(r?.detail || '');
  return r?.flow === 'System' && (
    detail.includes('Engine is alive') ||
    detail.includes('Webhook surface is ready') ||
    detail.startsWith('openTasks:') ||
    detail.startsWith('Engine alive')
  );
}

export function Runs({ onNavigate } = {}) {
  const sIcon = { ok: { c: 'var(--fg-muted)', t: '●' }, warn: { c: 'var(--fg)', t: '▲' }, err: { c: 'var(--danger)', t: '✕' } };
  const { runs, summary, syncState } = useAutomationsLedger();
  const rows = Array.isArray(runs) ? runs : [];

  const [filter, setFilter] = React.useState('events');
  const [selectedRunId, setSelectedRunId] = React.useState(null);

  const heartbeatRuns = rows.filter(isHeartbeatRun);
  const businessRuns = rows.filter((r) => !isHeartbeatRun(r));
  const failureRuns = rows.filter((r) => r.status === 'err' || r.statusKey === 'failure');

  const latestHeartbeat = heartbeatRuns[0] || null;
  const avgLatency = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + (Number(r.ms) || 0), 0) / rows.length)
    : 0;

  let displayRows = rows;
  if (filter === 'events') {
    displayRows = businessRuns;
  } else if (filter === 'errors') {
    displayRows = failureRuns;
  }

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Run log</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Real-time automation execution log</span>
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onNavigate && (
            <>
              <Button variant="secondary" size="sm" icon="zap" onClick={() => onNavigate('dashboard/automations')}>자동화 개요</Button>
              <Button variant="secondary" size="sm" icon="bolt" onClick={() => onNavigate('dashboard/automations/webhooks')}>Webhooks 관리</Button>
            </>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'var(--gap)',
      }}>
        <Card pad style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>오늘 실행</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 4 }}>
            {summary?.runsToday ?? rows.length}
            <span style={{ fontSize: 11, color: 'var(--fg-faint)', marginLeft: 6, fontWeight: 400 }}>건</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
            비즈니스 {businessRuns.length}건 · 핑 {heartbeatRuns.length}건
          </div>
        </Card>

        <Card pad style={{
          padding: '12px 16px',
          borderLeft: failureRuns.length > 0 ? '2px solid var(--danger)' : undefined,
        }}>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>오류 / 실패</div>
          <div className="mono" style={{
            fontSize: 22,
            fontWeight: 600,
            color: failureRuns.length > 0 ? 'var(--danger)' : 'var(--fg)',
            marginTop: 4,
          }}>
            {summary?.failuresToday ?? failureRuns.length}
            <span style={{ fontSize: 11, color: 'var(--fg-faint)', marginLeft: 6, fontWeight: 400 }}>건</span>
          </div>
          <div style={{ fontSize: 11, color: failureRuns.length > 0 ? 'var(--danger)' : 'var(--fg-faint)', marginTop: 4 }}>
            {failureRuns.length > 0 ? '실패 원인 확인 필요' : '모든 프로세스 정상'}
          </div>
        </Card>

        <Card pad style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>엔진 헬스 상태</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Dot tone={syncState === 'error' ? 'danger' : 'neutral'} />
            <span className="mono" style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)' }}>
              {syncState === 'error' ? 'Degraded' : 'Live'}
            </span>
            {latestHeartbeat && (
              <Badge tone="neutral" size="xs" numeric>{latestHeartbeat.ms}ms</Badge>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
            {latestHeartbeat ? `최근 핑: ${latestHeartbeat.at}` : '헬스체크 대기 중'}
          </div>
        </Card>

        <Card pad style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>평균 응답 속도</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--moon-200)', marginTop: 4 }}>
            {avgLatency}
            <span style={{ fontSize: 11, color: 'var(--fg-faint)', marginLeft: 4, fontWeight: 400 }}>ms</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
            최근 실행 지연시간 평균
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button
            size="xs"
            variant={filter === 'events' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('events')}
          >
            비즈니스 이벤트 ({businessRuns.length})
          </Button>
          <Button
            size="xs"
            variant={filter === 'errors' ? (failureRuns.length > 0 ? 'danger' : 'secondary') : 'ghost'}
            onClick={() => setFilter('errors')}
          >
            오류만 ({failureRuns.length})
          </Button>
          <Button
            size="xs"
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('all')}
          >
            전체 로그 (핑 포함 {rows.length})
          </Button>
        </div>

        {filter === 'events' && heartbeatRuns.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>단순 시스템 핑 {heartbeatRuns.length}건 숨김</span>
            <button
              type="button"
              onClick={() => setFilter('all')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--moon-300)',
                cursor: 'pointer',
                fontSize: 11,
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              로그 보기
            </button>
          </div>
        )}
      </div>

      <Card pad={false} className="hub-table-card" style={{ background: 'var(--bg)' }}>
        <div className="mono" style={{ padding: '12px 14px', fontSize: 12 }}>
          {displayRows.length === 0 && (
            <EmptyState
              icon={filter === 'errors' ? 'shield' : 'runs'}
              title={
                filter === 'errors'
                  ? '발생한 실행 오류가 없습니다'
                  : filter === 'events' && heartbeatRuns.length > 0
                    ? '기록된 비즈니스 실행 이벤트가 없습니다'
                    : syncState === 'error'
                      ? '실행 로그를 읽지 못했습니다'
                      : '실행 로그가 없습니다'
              }
              description={
                filter === 'errors'
                  ? '모든 자동화 및 엔진 프로세스가 정상 작동하고 있습니다.'
                  : filter === 'events' && heartbeatRuns.length > 0
                    ? `엔진 헬스체크는 정상 작동 중입니다 (최근 핑: ${latestHeartbeat?.at || '방금'} · ${latestHeartbeat?.ms || 0}ms). 고객 연동이나 웹훅이 실행되면 여기에 나타납니다.`
                    : syncState === 'error'
                      ? '화면을 새로고침하여 원장 연결을 다시 시도하세요.'
                      : 'Engine이 automation_runs에 기록을 남기면 이 로그가 채워집니다.'
              }
              action={
                filter === 'events' && heartbeatRuns.length > 0 ? (
                  <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                    전체 시스템 핑 로그 확인 ({rows.length}건)
                  </Button>
                ) : undefined
              }
              style={{ minHeight: 180 }}
            />
          )}
          {displayRows.map((r, i) => {
            const isSelected = selectedRunId === r.id;
            return (
              <React.Fragment key={r.id}>
                <div
                  onClick={() => setSelectedRunId(isSelected ? null : r.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 24px 170px 65px 1fr 20px',
                    padding: '6px 8px',
                    borderRadius: 'var(--r-sm)',
                    borderBottom: i < displayRows.length - 1 && !isSelected ? '1px dashed var(--line-soft)' : 'none',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    background: isSelected ? 'var(--surface-2)' : 'transparent',
                    transition: 'background var(--dur-hover) ease',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--surface)'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ color: 'var(--fg-faint)' }}>{r.at}</span>
                  <span style={{ color: sIcon[r.status].c, textAlign: 'center' }}>{sIcon[r.status].t}</span>
                  <span style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.flow}</span>
                  <span style={{ color: 'var(--fg-faint)', textAlign: 'right' }}>{r.ms}ms</span>
                  <span style={{ color: r.status === 'err' ? 'var(--danger)' : 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.detail}
                  </span>
                  <span style={{ color: 'var(--fg-faint)', textAlign: 'center', fontSize: 10 }}>
                    <Iconed name={isSelected ? 'chevronD' : 'chevronR'} size={11} />
                  </span>
                </div>
                {isSelected && (
                  <div style={{
                    padding: '10px 14px',
                    margin: '2px 8px 8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--line-soft)',
                    borderRadius: 'var(--r-sm)',
                    fontSize: 11.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', color: 'var(--fg-faint)' }}>
                      <span>Run ID: <code className="mono" style={{ color: 'var(--fg)' }}>{r.id}</code></span>
                      {r.correlationId && <span>Correlation: <code className="mono" style={{ color: 'var(--fg)' }}>{r.correlationId}</code></span>}
                      {r.providerEventId && <span>Event ID: <code className="mono" style={{ color: 'var(--fg)' }}>{r.providerEventId}</code></span>}
                      <span>소요시간: <span className="mono" style={{ color: 'var(--fg)' }}>{r.ms}ms</span></span>
                    </div>
                    <div style={{ color: r.status === 'err' ? 'var(--danger)' : 'var(--fg)', wordBreak: 'break-all', lineHeight: 1.5 }}>
                      <strong>상세 내용:</strong> {r.detail}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function Flows({ onNavigate }) {
  const { syncState } = useAutomationsLedger();
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Flows</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            자동화 정의 기록
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="outline" size="sm" icon="runs" onClick={() => onNavigate?.('dashboard/automations/runs')}>Runs</Button>
      </div>
      <Card>
        <EmptyState
          icon="zap"
          title="등록된 Flow가 없습니다"
          description="실제 자동화 정의를 읽는 기록이 연결되면 이 화면에 표시됩니다."
        />
      </Card>
    </div>
  );
}
