"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Progress, SectionTitle, Kbd, EmptyState } from "../hub-primitives";
import { AUTOMATIONS as FALLBACK_AUTOMATIONS, RUN_LOG as FALLBACK_RUN_LOG } from "../hub-data";

const EMPTY_AUTOMATION_SUMMARY = {
  runsToday: 0,
  failuresToday: 0,
  activeAutomations: 0,
  webhookEventsToday: 0,
  integrationsConnected: 0,
};

function useAutomationsLedger() {
  const [state, setState] = React.useState({
    source: 'mock',
    syncState: 'mock',
    automations: FALLBACK_AUTOMATIONS,
    runs: FALLBACK_RUN_LOG,
    webhookEvents: [],
    errors: [],
    integrations: [],
    summary: {
      runsToday: 23,
      failuresToday: 0,
      activeAutomations: FALLBACK_AUTOMATIONS.filter(a => a.status === 'Active').length,
      webhookEventsToday: 0,
      integrationsConnected: 0,
    },
  });

  React.useEffect(() => {
    let active = true;
    async function load() {
      setState(s => ({ ...s, syncState: 'loading' }));
      try {
        const response = await fetch('/api/hub/automations', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active || !response.ok || !data || data.status === 'error') {
          if (active) setState(s => ({ ...s, syncState: 'mock' }));
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
          setState(s => ({ ...s, syncState: 'mock' }));
        }
      } catch {
        if (active) setState(s => ({ ...s, syncState: 'mock' }));
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
  const activeCount = summary?.activeAutomations ?? automations.filter(a => a.status === 'Active').length;
  const runsTodayCount = summary?.runsToday ?? 23;
  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Automations</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {activeCount} active flows · {runsTodayCount} runs in last 24h
            <span className="mono" style={{ marginLeft: 8, color: syncState === 'live' ? 'var(--success)' : syncState === 'loading' ? 'var(--warning)' : 'var(--fg-faint)' }}>
              {syncState === 'live' ? 'live' : syncState === 'loading' ? 'syncing' : 'mock'}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" icon="runs" onClick={() => onNavigate('dashboard/automations/runs')}>Run log</Button>
        <div style={{ width: 8 }} />
        <Button variant="primary" size="sm" icon="plus">Flow</Button>
      </div>

      <Card pad={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 110px 130px 140px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>Flow</span><span>Trigger</span><span>Status</span><span>Last run</span><span>Success (24h)</span><span style={{ textAlign: 'right' }} />
        </div>
        {automations.length === 0 && (
          <EmptyState
            icon="automations"
            title="자동화 원장이 비어 있습니다"
            description={syncState === 'live' ? 'Supabase automations 테이블에 표시할 flow가 없습니다.' : 'flow를 만들면 실행 상태와 성공률이 여기에 표시됩니다.'}
            action={<Button variant="primary" size="sm" icon="plus">Flow</Button>}
          />
        )}
        {automations.map((a, i) => (
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
              <IconButton icon={a.status === 'Active' ? 'pause' : 'play'} />
              <IconButton icon="moreV" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function EmailAutomation() {
  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', maxWidth: 1100 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Email automations</h2>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>Gmail 수신 · Resend 발송</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Iconed name="inbox" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Gmail</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>hyeon@moonlight.pro · connected</div>
            </div>
            <Badge tone="success" size="xs">Active</Badge>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            수신 메일을 Leads · Support · Personal로 자동 태깅. 신규 리드는 CRM에 자동 추가.
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <Button variant="outline" size="xs">Rules</Button>
            <Button variant="ghost" size="xs">Logs</Button>
          </div>
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Iconed name="send" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Resend</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>newsletter@moonlight.pro</div>
            </div>
            <Badge tone="success" size="xs">Active</Badge>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            뉴스레터, 트랜잭션 메일, 리마인더 발송. 스케줄된 발송은 Queue에서 관리.
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <Button variant="outline" size="xs">Templates</Button>
            <Button variant="ghost" size="xs">Deliverability</Button>
          </div>
        </Card>
      </div>

      <SectionTitle>Tag rules</SectionTitle>
      <Card pad={false}>
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
            <div style={{ textAlign: 'right' }}><IconButton icon="moreV" size={22} iconSize={12} /></div>
          </div>
        ))}
      </Card>
    </div>
  );
}

const FALLBACK_HOOKS = [
  { name: 'Stripe — payment_succeeded', url: 'https://moonlight.pro/hooks/stripe', status: 'ok', lastHit: '1h ago', count24: 4 },
  { name: 'Calendly — invite.created', url: 'https://moonlight.pro/hooks/calendly', status: 'ok', lastHit: '3h ago', count24: 2 },
  { name: 'Notion — page.updated', url: 'https://moonlight.pro/hooks/notion', status: 'warn', lastHit: '5h ago', count24: 11 },
  { name: 'Custom — Form submission', url: 'https://moonlight.pro/hooks/form', status: 'ok', lastHit: 'Today', count24: 6 },
];

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

export function Webhooks() {
  const { webhookEvents, syncState } = useAutomationsLedger();
  const liveHooks = aggregateWebhookEndpoints(webhookEvents);
  const hooks = syncState === 'live' ? liveHooks : (liveHooks.length ? liveHooks : FALLBACK_HOOKS);
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
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Webhooks</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {hooks.length} endpoints
            <span className="mono" style={{ marginLeft: 8, color: syncState === 'live' ? 'var(--success)' : syncState === 'loading' ? 'var(--warning)' : 'var(--fg-faint)' }}>
              {syncState === 'live' ? 'live' : syncState === 'loading' ? 'syncing' : 'mock'}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus">Endpoint</Button>
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
              <IconButton icon="moreV" />
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
  const rows = syncState === 'live'
    ? (Array.isArray(runs) ? runs : [])
    : (runs?.length ? runs : FALLBACK_RUN_LOG);
  const liveLabel = syncState === 'live' ? 'Live' : syncState === 'loading' ? 'Syncing' : 'Mock';
  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Run log</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            Real-time automation execution log
            <span className="mono" style={{ marginLeft: 8, color: syncState === 'live' ? 'var(--success)' : syncState === 'loading' ? 'var(--warning)' : 'var(--fg-faint)' }}>
              {syncState === 'live' ? 'live' : syncState === 'loading' ? 'syncing' : 'mock'}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--success)' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--success)', animation: 'mlMoonPulse 1.5s infinite' }} />
          {liveLabel}
        </span>
      </div>
      <Card pad={false} style={{ background: 'oklch(0.17 0.005 250)' }}>
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

const FLOW_LIBRARY = [
  { id: 'f1', name: 'Gmail → CRM 리드 태깅', status: 'Active', nodes: 6, runs24: 17, success: 15 },
  { id: 'f2', name: '뉴스레터 발행 → Resend', status: 'Active', nodes: 8, runs24: 1, success: 1 },
  { id: 'f3', name: 'Stripe → Slack 알림', status: 'Active', nodes: 4, runs24: 4, success: 4 },
  { id: 'f4', name: 'Calendly → 노션 페이지 생성', status: 'Paused', nodes: 5, runs24: 0, success: 0 },
  { id: 'f5', name: '리드 무응답 3일 → 리마인더', status: 'Active', nodes: 7, runs24: 2, success: 2 },
];

const FLOW_GRAPHS = {
  f1: {
    title: 'Gmail → CRM 리드 태깅',
    description: '수신 메일을 분석해 Leads/Support/Personal로 태깅하고, 신규 리드는 CRM에 자동 생성합니다.',
    trigger: { type: 'Gmail', event: 'email.received' },
    nodes: [
      { id: 'n1', kind: 'trigger', app: 'gmail', title: 'Gmail · 수신', sub: 'label:INBOX', col: 0, row: 1 },
      { id: 'n2', kind: 'logic', app: 'filter', title: 'Filter', sub: 'subject ≠ notice', col: 1, row: 1 },
      { id: 'n3', kind: 'ai', app: 'claude', title: 'AI 분류', sub: 'haiku · 3 태그', col: 2, row: 1 },
      { id: 'n4', kind: 'logic', app: 'router', title: 'Router', sub: '3개 브랜치', col: 3, row: 1 },
      { id: 'n5', kind: 'action', app: 'crm', title: 'CRM · 리드 생성', sub: '신규일 때만', col: 4, row: 0 },
      { id: 'n6', kind: 'action', app: 'slack', title: 'Slack · #leads 알림', sub: 'MRR ≥ $500', col: 4, row: 1 },
      { id: 'n7', kind: 'action', app: 'gmail', title: 'Gmail · 라벨 지정', sub: 'Support', col: 4, row: 2 },
    ],
    edges: [
      { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' },
      { from: 'n4', to: 'n5', label: 'Lead' }, { from: 'n4', to: 'n6', label: 'Revenue' }, { from: 'n4', to: 'n7', label: 'Support' },
    ],
  },
  f2: {
    title: '뉴스레터 발행 → Resend',
    description: 'Content Studio 발행 버튼 → 렌더링 → Resend 발송 → 메트릭 수집.',
    trigger: { type: 'Schedule', event: '매일 18:00' },
    nodes: [
      { id: 'n1', kind: 'trigger', app: 'clock', title: 'Schedule', sub: '매일 18:00', col: 0, row: 1 },
      { id: 'n2', kind: 'logic', app: 'filter', title: 'Queue에 draft 있음?', sub: 'status=ready', col: 1, row: 1 },
      { id: 'n3', kind: 'ai', app: 'claude', title: 'AI 교정', sub: '맞춤법·톤', col: 2, row: 1 },
      { id: 'n4', kind: 'action', app: 'render', title: 'Render MJML', sub: '2 layouts', col: 3, row: 1 },
      { id: 'n5', kind: 'action', app: 'resend', title: 'Resend · 발송', sub: '2,143 subs', col: 4, row: 1 },
      { id: 'n6', kind: 'action', app: 'db', title: 'DB · 로그 기록', sub: 'campaign_id', col: 5, row: 0 },
      { id: 'n7', kind: 'action', app: 'slack', title: 'Slack · 발송 완료', sub: '#newsletter', col: 5, row: 2 },
    ],
    edges: [
      { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' },
      { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' }, { from: 'n5', to: 'n7' },
    ],
  },
  f3: {
    title: 'Stripe → Slack 알림',
    description: '결제 성공 이벤트를 Slack 채널로 보내고, MRR 집계에 반영.',
    trigger: { type: 'Webhook', event: 'stripe.payment_succeeded' },
    nodes: [
      { id: 'n1', kind: 'trigger', app: 'webhook', title: 'Webhook', sub: 'stripe.payment', col: 0, row: 1 },
      { id: 'n2', kind: 'ai', app: 'claude', title: '요약 생성', sub: 'haiku', col: 1, row: 1 },
      { id: 'n3', kind: 'action', app: 'slack', title: 'Slack · #revenue', sub: 'happy sound 🎉', col: 2, row: 1 },
      { id: 'n4', kind: 'action', app: 'db', title: 'DB · MRR 업데이트', sub: 'monthly_rev', col: 2, row: 2 },
    ],
    edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n2', to: 'n4' }],
  },
  f4: {
    title: 'Calendly → 노션 페이지 생성',
    description: '미팅 초대가 생성되면 노션에 준비 페이지를 자동 생성.',
    trigger: { type: 'Webhook', event: 'calendly.invite.created' },
    nodes: [
      { id: 'n1', kind: 'trigger', app: 'webhook', title: 'Calendly', sub: 'invite.created', col: 0, row: 1 },
      { id: 'n2', kind: 'logic', app: 'filter', title: 'Type: 신규', sub: 'new meeting', col: 1, row: 1 },
      { id: 'n3', kind: 'ai', app: 'claude', title: '의제 초안', sub: '과거 미팅 참조', col: 2, row: 1 },
      { id: 'n4', kind: 'action', app: 'notion', title: 'Notion · 페이지 생성', sub: 'Meetings DB', col: 3, row: 1 },
      { id: 'n5', kind: 'action', app: 'gmail', title: 'Gmail · 준비 이메일', sub: 'to:me', col: 3, row: 2 },
    ],
    edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }, { from: 'n3', to: 'n5' }],
  },
  f5: {
    title: '리드 무응답 3일 → 리마인더',
    description: '리드 상태가 Contact에 3일 이상 머무르면 자동 팔로업 초안.',
    trigger: { type: 'Schedule', event: '매일 09:00' },
    nodes: [
      { id: 'n1', kind: 'trigger', app: 'clock', title: 'Schedule', sub: '매일 09:00', col: 0, row: 1 },
      { id: 'n2', kind: 'action', app: 'crm', title: 'CRM 쿼리', sub: 'stage=Contact ≥3d', col: 1, row: 1 },
      { id: 'n3', kind: 'logic', app: 'loop', title: 'Loop', sub: '각 리드마다', col: 2, row: 1 },
      { id: 'n4', kind: 'ai', app: 'claude', title: '팔로업 초안', sub: '톤:정중', col: 3, row: 0 },
      { id: 'n5', kind: 'action', app: 'gmail', title: 'Gmail · 초안 생성', sub: 'draft only', col: 4, row: 0 },
      { id: 'n6', kind: 'action', app: 'slack', title: 'Slack · 내 DM', sub: '검토 요청', col: 3, row: 2 },
    ],
    edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }, { from: 'n4', to: 'n5' }, { from: 'n3', to: 'n6' }],
  },
};

const NODE_KIND = {
  trigger: { bg: 'oklch(0.62 0.17 30)', label: 'Trigger' },
  logic: { bg: 'oklch(0.58 0.12 250)', label: 'Logic' },
  ai: { bg: 'oklch(0.55 0.14 290)', label: 'AI' },
  action: { bg: 'oklch(0.58 0.14 200)', label: 'Action' },
};

const APP_GLYPH = {
  gmail: '✉', clock: '🕘', webhook: '⚡', filter: '⑂', router: '⇒',
  claude: '✦', crm: '◎', slack: '#', resend: '📤', render: '▦', db: '▤',
  notion: '◇', loop: '↻',
};

function FlowField({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginBottom: 3 }}>{label}</div>
      <div style={{
        padding: '6px 9px',
        background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
        fontSize: 12, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', color: 'var(--fg)',
      }}>{value}</div>
    </div>
  );
}

export function Flows() {
  const [sel, setSel] = React.useState('f1');
  const [selNode, setSelNode] = React.useState('n1');
  const graph = FLOW_GRAPHS[sel];
  const flowMeta = FLOW_LIBRARY.find(f => f.id === sel);

  const canvasRef = React.useRef(null);
  const panState = React.useRef({ dragging: false, moved: false, x: 0, y: 0, sl: 0, st: 0 });
  const [grabbing, setGrabbing] = React.useState(false);

  const onPanDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;
    const el = canvasRef.current;
    if (!el) return;
    panState.current = { dragging: true, moved: false, x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    setGrabbing(true);
    e.preventDefault();
  };
  const onPanMove = (e) => {
    const p = panState.current;
    if (!p.dragging) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) p.moved = true;
    const el = canvasRef.current;
    if (el) { el.scrollLeft = p.sl - dx; el.scrollTop = p.st - dy; }
  };
  const onPanUp = () => { panState.current.dragging = false; setGrabbing(false); };

  const COL_W = 200, ROW_H = 110, NODE_W = 164, NODE_H = 74;
  const maxCol = Math.max(...graph.nodes.map(n => n.col));
  const maxRow = Math.max(...graph.nodes.map(n => n.row));
  const canvasW = (maxCol + 1) * COL_W + 80;
  const canvasH = (maxRow + 1) * ROW_H + 80;
  const nodePos = (n) => ({ x: 40 + n.col * COL_W, y: 40 + n.row * ROW_H });
  const selectedNode = graph.nodes.find(n => n.id === selNode) || graph.nodes[0];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 300px', height: '100%', overflow: 'hidden' }}>
      <aside style={{ borderRight: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>Flows</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>{FLOW_LIBRARY.filter(f => f.status === 'Active').length} active</div>
          </div>
          <IconButton icon="plus" size={24} iconSize={13} />
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {FLOW_LIBRARY.map(f => {
            const active = sel === f.id;
            return (
              <button key={f.id} onClick={() => { setSel(f.id); setSelNode(FLOW_GRAPHS[f.id].nodes[0].id); }} style={{
                width: '100%', padding: '9px 10px', marginBottom: 2, textAlign: 'left',
                background: active ? 'var(--surface-3)' : 'transparent',
                border: active ? '1px solid var(--line)' : '1px solid transparent',
                borderRadius: 'var(--r-sm)',
                color: active ? 'var(--fg)' : 'var(--fg-muted)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: f.status === 'Active' ? 'var(--success)' : 'var(--fg-faint)' }} />
                  <span style={{ fontSize: 12.5, fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{f.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--fg-faint)' }}>
                  <span className="mono">{f.nodes} nodes</span>
                  <span>·</span>
                  <span className="mono">{f.success}/{f.runs24} · 24h</span>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--line-soft)', fontSize: 10.5, color: 'var(--fg-faint)' }}>
          <div style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Templates</div>
          {['Lead nurture · 7d', 'Abandoned checkout', 'Weekly digest'].map(t => (
            <div key={t} style={{ padding: '4px 6px', fontSize: 11.5, color: 'var(--fg-muted)' }}>{t}</div>
          ))}
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{graph.title}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>
              <span className="mono">{flowMeta.id.toUpperCase()}</span> · {graph.trigger.type} · {graph.trigger.event}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Badge tone={flowMeta.status === 'Active' ? 'success' : 'warning'} size="xs">{flowMeta.status}</Badge>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{flowMeta.success}/{flowMeta.runs24} · 24h</span>
          <IconButton icon="eye" tooltip="Test run" />
          <IconButton icon={flowMeta.status === 'Active' ? 'pause' : 'play'} />
          <Button variant="outline" size="sm" icon="runs">Runs</Button>
        </div>

        <div ref={canvasRef}
          onMouseDown={onPanDown} onMouseMove={onPanMove} onMouseUp={onPanUp} onMouseLeave={onPanUp}
          style={{
            flex: 1, overflow: 'auto', position: 'relative',
            cursor: grabbing ? 'grabbing' : 'grab',
            userSelect: grabbing ? 'none' : 'auto',
            background: `
              radial-gradient(circle at 10px 10px, var(--line-soft) 1px, transparent 1px) 0 0 / 20px 20px,
              var(--surface-2)
            `,
          }}>
          <div style={{ position: 'relative', width: canvasW, height: canvasH, minWidth: '100%', minHeight: '100%' }}>
            <svg style={{ position: 'absolute', inset: 0, width: canvasW, height: canvasH, pointerEvents: 'none' }}>
              <defs>
                <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L10,5 L0,10 Z" fill="var(--fg-faint)" />
                </marker>
              </defs>
              {graph.edges.map((e, i) => {
                const from = graph.nodes.find(n => n.id === e.from);
                const to = graph.nodes.find(n => n.id === e.to);
                const a = nodePos(from), b = nodePos(to);
                const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2;
                const x2 = b.x, y2 = b.y + NODE_H / 2;
                const cx = (x1 + x2) / 2;
                const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                const isHot = selNode === e.from || selNode === e.to;
                return (
                  <g key={i}>
                    <path d={d} stroke={isHot ? 'var(--moon-300)' : 'var(--line-strong)'} strokeWidth={isHot ? 2 : 1.5} fill="none" markerEnd="url(#flow-arrow)" />
                    {e.label && (
                      <g>
                        <rect x={cx - 26} y={(y1 + y2) / 2 - 9} width={52} height={18} rx={9} fill="var(--surface)" stroke="var(--line-soft)" />
                        <text x={cx} y={(y1 + y2) / 2 + 3.5} textAnchor="middle" fontSize="10" fill="var(--fg-muted)" fontFamily="var(--font-mono)">{e.label}</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
            {graph.nodes.map(n => {
              const p = nodePos(n);
              const kind = NODE_KIND[n.kind];
              const isSel = selNode === n.id;
              return (
                <button key={n.id} onClick={() => setSelNode(n.id)} style={{
                  position: 'absolute', left: p.x, top: p.y,
                  width: NODE_W, height: NODE_H, padding: 0,
                  background: 'var(--surface)',
                  border: isSel ? '2px solid var(--moon-300)' : '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  boxShadow: isSel ? '0 8px 20px -8px oklch(0.78 0.04 280 / 0.35)' : '0 2px 6px -2px oklch(0 0 0 / 0.3)',
                  cursor: 'pointer', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column', textAlign: 'left',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px',
                    background: kind.bg, color: '#fff',
                    fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}>
                    <span style={{ fontSize: 11, lineHeight: 1 }}>{APP_GLYPH[n.app] || '◇'}</span>
                    <span>{kind.label}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ opacity: 0.7, fontFamily: 'var(--font-mono)', textTransform: 'none', letterSpacing: 0 }}>{n.id}</span>
                  </div>
                  <div style={{ padding: '7px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</div>
                  </div>
                  {n.kind !== 'trigger' && (
                    <div style={{ position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)', width: 9, height: 9, borderRadius: 999, background: 'var(--surface-3)', border: '1.5px solid var(--line-strong)' }} />
                  )}
                  <div style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 9, height: 9, borderRadius: 999, background: 'var(--moon-400)', border: '1.5px solid var(--bg)' }} />
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--fg-faint)' }}>
          <Kbd>drag</Kbd><span>이동</span>
          <Kbd>Space</Kbd><span>pan</span>
          <Kbd>⌘D</Kbd><span>복제</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
            <button style={{ width: 22, height: 20, color: 'var(--fg-muted)' }}>−</button>
            <span className="mono" style={{ fontSize: 11, padding: '0 6px' }}>100%</span>
            <button style={{ width: 22, height: 20, color: 'var(--fg-muted)' }}>+</button>
          </div>
          <span className="mono">last run {flowMeta.status === 'Active' ? '2분 전' : 'paused'}</span>
        </div>
      </div>

      <aside style={{ borderLeft: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>Inspector</div>
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: NODE_KIND[selectedNode.kind].bg }} />
            {selectedNode.title}
          </div>
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', rowGap: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--fg-faint)' }}>Kind</span>
            <span>{NODE_KIND[selectedNode.kind].label}</span>
            <span style={{ color: 'var(--fg-faint)' }}>App</span>
            <span className="mono">{selectedNode.app}</span>
            <span style={{ color: 'var(--fg-faint)' }}>Node</span>
            <span className="mono">{selectedNode.id}</span>
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 6 }}>Configuration</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedNode.kind === 'trigger' && (<>
                <FlowField label="Event" value={graph.trigger.event} mono />
                <FlowField label="Source" value={graph.trigger.type} />
                <FlowField label="Polling" value="realtime · push" />
              </>)}
              {selectedNode.kind === 'logic' && (<>
                <FlowField label="Condition" value={selectedNode.sub} mono />
                <FlowField label="On false" value="skip branch" />
              </>)}
              {selectedNode.kind === 'ai' && (<>
                <FlowField label="Model" value="Claude Haiku 4.5" mono />
                <FlowField label="Prompt" value={selectedNode.sub} />
                <FlowField label="Max tokens" value="512" mono />
              </>)}
              {selectedNode.kind === 'action' && (<>
                <FlowField label="App" value={selectedNode.app} mono />
                <FlowField label="Operation" value={selectedNode.title.split('·')[1]?.trim() || selectedNode.title} />
                <FlowField label="Args" value={selectedNode.sub} mono />
              </>)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 6 }}>Sample output</div>
            <pre className="mono" style={{
              margin: 0, padding: 10,
              background: 'oklch(0.17 0.005 250)', color: 'oklch(0.82 0.01 250)',
              border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
              fontSize: 10.5, lineHeight: 1.55, overflow: 'auto', maxHeight: 180,
            }}>{`{\n  "node": "${selectedNode.id}",\n  "ok": true,\n  "ms": 140,\n  "output": {\n    "kind": "${selectedNode.kind}",\n    "summary": "${selectedNode.title}"\n  }\n}`}</pre>
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 6 }}>Recent runs</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: 20 }).map((_, i) => {
                const ok = (i + selectedNode.id.charCodeAt(1)) % 9 !== 3;
                return <div key={i} style={{ width: 10, height: 20, borderRadius: 2, background: ok ? 'var(--success)' : 'var(--danger)', opacity: 0.75 }} />;
              })}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 6 }}>최근 20회 · 오류 1건</div>
          </div>
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 6 }}>
          <Button variant="outline" size="sm" icon="play" style={{ flex: 1 }}>Test node</Button>
          <IconButton icon="moreV" />
        </div>
      </aside>
    </div>
  );
}
