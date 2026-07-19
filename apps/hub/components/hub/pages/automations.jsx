"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Progress, SectionTitle, Kbd, EmptyState, SyncBadge } from "../hub-primitives";

const EMPTY_AUTOMATION_SUMMARY = {
  runsToday: 0,
  failuresToday: 0,
  activeAutomations: 0,
  webhookEventsToday: 0,
  integrationsConnected: 0,
};

function useAutomationsLedger() {
  const [state, setState] = React.useState({
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
    async function load() {
      setState(s => ({ ...s, syncState: 'loading' }));
      try {
        const response = await fetch('/api/hub/automations', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data || data.status === 'error') {
          if (active) setState(s => ({ ...s, syncState: 'preview' }));
          return;
        }
        if (data.source === 'supabase') {
          setState({
            source: 'supabase',
            syncState: 'live',
            automations: Array.isArray(data.automations) ? data.automations : [],
            runs: Array.isArray(data.runs) ? data.runs : [],
            webhookEvents: Array.isArray(data.webhookEvents) ? data.webhookEvents : [],
            errors: Array.isArray(data.errors) ? data.errors : [],
            integrations: Array.isArray(data.integrations) ? data.integrations : [],
            summary: { ...EMPTY_AUTOMATION_SUMMARY, ...(data.summary || {}) },
          });
        } else {
          setState(s => ({ ...s, source: 'preview', syncState: 'preview', automations: [], runs: [], webhookEvents: [], summary: EMPTY_AUTOMATION_SUMMARY }));
        }
      } catch {
        if (active) setState(s => ({ ...s, source: 'preview', syncState: 'preview', automations: [], runs: [], webhookEvents: [], summary: EMPTY_AUTOMATION_SUMMARY }));
      }
    }
    load();
    return () => { active = false; };
  }, []);

  return state;
}

export function AutomationsIndex({ onNavigate }) {
  const sTone = { Active: 'success', Paused: 'warning', Error: 'danger' };
  const { automations, summary, syncState } = useAutomationsLedger();
  const [statusOverrides, setStatusOverrides] = React.useState({});
  const rows = automations.map(a => statusOverrides[a.id] ? { ...a, status: statusOverrides[a.id] } : a);
  const activeCount = rows.filter(a => a.status === 'Active').length || summary?.activeAutomations || 0;
  const runsTodayCount = summary?.runsToday ?? 0;
  const toggleAutomation = (automation) => {
    setStatusOverrides(prev => ({
      ...prev,
      [automation.id]: automation.status === 'Active' ? 'Paused' : 'Active',
    }));
  };
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
        <Button variant="primary" size="sm" icon="plus" onClick={() => onNavigate('dashboard/automations/flows?new=flow')}>Flow</Button>
      </div>

      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 110px 130px 140px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>Flow</span><span>Trigger</span><span>Status</span><span>Last run</span><span>Success (24h)</span><span style={{ textAlign: 'right' }} />
        </div>
        {automations.length === 0 && (
          <EmptyState
            icon="automations"
            title="자동화 기록이 비어 있습니다"
            description={syncState === 'live' ? 'Supabase automations 테이블에 표시할 flow가 없습니다.' : 'flow를 만들면 실행 상태와 성공률이 여기에 표시됩니다.'}
            action={<Button variant="primary" size="sm" icon="plus" onClick={() => onNavigate('dashboard/automations/flows?new=flow')}>Flow</Button>}
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
            <Badge tone={sTone[a.status]} size="xs">{a.status}</Badge>
            <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{a.lastRun}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 12, color: a.success === a.runs24 ? 'var(--success)' : 'var(--warning)' }}>
                {a.success}/{a.runs24}
              </span>
              <div style={{ flex: 1 }}><Progress value={a.runs24 ? (a.success / a.runs24) * 100 : 0} tone={a.success === a.runs24 ? 'success' : 'warning'} /></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <IconButton
                icon={a.status === 'Active' ? 'pause' : 'play'}
                tooltip={a.status === 'Active' ? 'Pause flow' : 'Resume flow'}
                onClick={() => toggleAutomation(a)}
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
  if (status === 'connected') return { tone: 'success', label: 'Connected' };
  if (status === 'ready') return { tone: 'info', label: 'OAuth ready' };
  if (status === 'disabled') return { tone: 'neutral', label: 'Disabled' };
  if (status === 'degraded') return { tone: 'warning', label: 'Status unknown' };
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

      <SectionTitle>Tag rules</SectionTitle>
      <Card pad={false} className="hub-table-card">
        {[
          { cond: 'from:@* AND subject 한정', then: 'tag: Lead · create CRM', tone: 'moon' },
          { cond: 'subject contains "invoice"', then: 'tag: Finance · archive 30d', tone: 'info' },
          { cond: 'from: jihoon@*, jaemin@*', then: 'tag: Personal', tone: 'personal' },
          { cond: 'has Stripe link', then: 'tag: Revenue · notify', tone: 'success' },
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

function aggregateWebhookEndpoints(events) {
  if (!events?.length) return [];
  const byKey = new Map();
  events.forEach(ev => {
    const key = `${ev.source}·${ev.eventType}`;
    const entry = byKey.get(key) || {
      name: `${ev.source} — ${ev.eventType}`,
      url: `https://moonlight.pro/hooks/${ev.source}`,
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
  const sTone = { ok: 'success', warn: 'warning', err: 'danger' };
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
        entry = { tone: 'warning', label: 'preview' };
      } else if (response.ok && (data.status === 'sent' || data.sent)) {
        entry = { tone: 'success', label: '✓ sent' };
      } else if (response.ok) {
        entry = { tone: 'warning', label: 'preview' };
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
            title="수신된 webhook 이벤트가 없습니다"
            description="Project webhook smoke test나 Telegram webhook이 들어오면 endpoint별 활동이 집계됩니다."
            action={<Button variant="primary" size="sm" icon="play" onClick={() => runHookTest(0, { name: 'Project smoke test', url: '/api/webhooks/project-test' })}>Send test</Button>}
          />
        )}
        {hooks.map((h, i) => {
          const state = testState[i];
          return (
          <div key={i} style={{
            padding: '14px 16px',
            borderBottom: i < hooks.length - 1 ? '1px solid var(--line-soft)' : 'none',
            background: state && state.label
              ? (state.tone === 'success' ? 'var(--success-bg)' : state.tone === 'warning' ? 'var(--warning-bg)' : state.tone === 'danger' ? 'var(--danger-bg)' : 'transparent')
              : 'transparent',
            transition: 'background-color .4s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Dot tone={sTone[h.status]} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</span>
              <div style={{ flex: 1 }} />
              {state && state.label && (
                <Badge tone={state.tone} size="xs">{state.label}</Badge>
              )}
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{h.count24}/24h · {h.lastHit}</span>
              <IconButton icon="play" tooltip="Send test" onClick={() => runHookTest(i, h)} />
              <IconButton icon="moreV" tooltip="Manage endpoint" onClick={() => onNavigate?.('dashboard/settings')} />
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 6, paddingLeft: 16 }}>{h.url}</div>
          </div>
          );
        })}
      </Card>
    </div>
  );
}

export function Runs() {
  const sIcon = { ok: { c: 'var(--success)', t: '●' }, warn: { c: 'var(--warning)', t: '▲' }, err: { c: 'var(--danger)', t: '✕' } };
  const { runs, syncState } = useAutomationsLedger();
  const rows = Array.isArray(runs) ? runs : [];
  const liveLabel = syncState === 'live' ? 'Live' : syncState === 'loading' ? 'Syncing' : 'Preview';
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Run log</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            Real-time automation execution log
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--success)' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--success)', animation: 'mlMoonPulse 1.5s infinite' }} />
          {liveLabel}
        </span>
      </div>
      <Card pad={false} className="hub-table-card" style={{ background: 'var(--bg)' }}>
        <div className="mono" style={{ padding: '12px 14px', fontSize: 12 }}>
          {rows.length === 0 && (
            <EmptyState
              icon="runs"
              title="실행 로그가 없습니다"
              description="Engine이 automation_runs에 기록을 남기면 이 로그가 채워집니다."
              style={{ minHeight: 220 }}
            />
          )}
          {rows.map((r, i) => (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: '90px 24px 180px 70px 1fr',
              padding: '5px 0', borderBottom: i < rows.length - 1 ? '1px dashed var(--line-soft)' : 'none',
              alignItems: 'center', gap: 10,
            }}>
              <span style={{ color: 'var(--fg-faint)' }}>{r.at}</span>
              <span style={{ color: sIcon[r.status].c, textAlign: 'center' }}>{sIcon[r.status].t}</span>
              <span style={{ color: 'var(--fg)' }}>{r.flow}</span>
              <span style={{ color: 'var(--fg-faint)', textAlign: 'right' }}>{r.ms}ms</span>
              <span style={{ color: 'var(--fg-muted)' }}>{r.detail}</span>
            </div>
          ))}
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
