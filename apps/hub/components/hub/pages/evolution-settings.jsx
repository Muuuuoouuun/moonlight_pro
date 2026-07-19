"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Avatar, Tabs, SectionTitle, Kbd, EmptyState } from "../hub-primitives";

const EVOLUTION_EVENTS = [];

const PLAYBOOK_FAMILIES = [];
const PLAYBOOK_CATALOG = [];

const QUICK_COMMANDS = [
  { slash: '/brief',     label: '아침 브리프 열기',    dest: 'dashboard/daily-brief',        tone: 'moon' },
  { slash: '/work',      label: 'Work OS 집중 모드',   dest: 'dashboard/work/projects',      tone: 'info' },
  { slash: '/pipeline',  label: 'Revenue 파이프라인',  dest: 'dashboard/revenue/overview',   tone: 'warning' },
  { slash: '/queue',     label: '발행 큐 점검',        dest: 'dashboard/content/queue',      tone: 'success' },
  { slash: '/studio',    label: 'Studio 드래프트',     dest: 'dashboard/content/studio',     tone: 'success' },
  { slash: '/runs',      label: '자동화 Run log',      dest: 'dashboard/automations/runs',   tone: 'danger' },
  { slash: '/flows',     label: 'Flow 캔버스 열기',    dest: 'dashboard/automations/flows',  tone: 'moon' },
  { slash: '/orders',    label: '에이전트 작업 큐',    dest: 'dashboard/agents/orders',      tone: 'info' },
  { slash: '/council',   label: 'Council 소집',        dest: 'dashboard/agents/council',     tone: 'info' },
];

const EMPTY_META_THREADS_STATUS = {
  status: 'loading',
  provider: 'meta_threads',
  brandHandle: 'moon.classin',
  configured: false,
  connection: null,
  setup: null,
};

const EMPTY_INSTAGRAM_STATUS = {
  status: 'loading',
  provider: 'instagram_api',
  brandHandle: 'moon.classin',
  configured: false,
  connection: null,
  setup: null,
};

function maskFingerprint(fingerprint) {
  return `•••• •••• •••• ${fingerprint}`;
}

function formatShortDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function buildMetaThreadsIntegration(status) {
  const brandHandle = status?.brandHandle || 'moon.classin';
  const profileHandle = status?.connection?.profileHandle || `@${brandHandle}`;
  const expiresAt = formatShortDate(status?.connection?.expiresAt);

  if (status?.status === 'connected') {
    return {
      n: 'Meta Threads',
      s: 'Connected',
      t: 'success',
      i: 'globe',
      provider: 'meta_threads',
      detail: `${profileHandle}${expiresAt ? ` · token ${expiresAt}` : ''}`,
      action: 'Reconnect',
    };
  }

  if (status?.status === 'ready') {
    return {
      n: 'Meta Threads',
      s: 'Ready',
      t: 'moon',
      i: 'globe',
      provider: 'meta_threads',
      detail: `@${brandHandle} · OAuth ready`,
      action: 'Connect',
    };
  }

  if (status?.status === 'loading') {
    return {
      n: 'Meta Threads',
      s: 'Checking',
      t: 'neutral',
      i: 'globe',
      provider: 'meta_threads',
      detail: `@${brandHandle}`,
      action: 'Connect',
      disabled: true,
    };
  }

  return {
    n: 'Meta Threads',
    s: 'Needs config',
    t: 'warning',
    i: 'globe',
    provider: 'meta_threads',
    detail: `@${brandHandle} · env`,
    action: 'Connect',
    disabled: true,
  };
}

function buildInstagramIntegration(status) {
  const brandHandle = status?.brandHandle || 'moon.classin';
  const profileHandle = status?.connection?.profileHandle || `@${brandHandle}`;
  const expiresAt = formatShortDate(status?.connection?.expiresAt);
  const accountType = status?.connection?.accountType;

  if (status?.status === 'connected') {
    return {
      n: 'Instagram API',
      s: 'Connected',
      t: 'success',
      i: 'globe',
      provider: 'instagram_api',
      detail: `${profileHandle}${accountType ? ` · ${accountType}` : ''}${expiresAt ? ` · token ${expiresAt}` : ''}`,
      action: 'Reconnect',
    };
  }

  if (status?.status === 'ready') {
    return {
      n: 'Instagram API',
      s: 'Ready',
      t: 'moon',
      i: 'globe',
      provider: 'instagram_api',
      detail: `@${brandHandle} · OAuth ready`,
      action: 'Connect',
    };
  }

  if (status?.status === 'loading') {
    return {
      n: 'Instagram API',
      s: 'Checking',
      t: 'neutral',
      i: 'globe',
      provider: 'instagram_api',
      detail: `@${brandHandle}`,
      action: 'Connect',
      disabled: true,
    };
  }

  return {
    n: 'Instagram API',
    s: 'Needs config',
    t: 'warning',
    i: 'globe',
    provider: 'instagram_api',
    detail: `@${brandHandle} · env`,
    action: 'Connect',
    disabled: true,
  };
}

export function Evolution({ onNavigate }) {
  const [tab, setTab] = React.useState('all');
  const [lastRun, setLastRun] = React.useState(null);
  const tagTone = { upgrade: 'moon', bug: 'danger', insight: 'info', note: 'neutral' };
  const playbookTarget = (family) => ({
    delivery: 'dashboard/agents/orders?new=delivery',
    recovery: 'dashboard/automations/runs',
    planning: 'dashboard/work/rhythm',
    content: 'dashboard/content/queue',
    revenue: 'dashboard/revenue/deals',
  }[family] || 'dashboard/evolution');
  const tabs = [
    { key: 'all', label: 'All', count: EVOLUTION_EVENTS.length },
    { key: 'up', label: 'Upgrades', count: EVOLUTION_EVENTS.filter(e => e.tag === 'upgrade').length },
    { key: 'issue', label: 'Issues', count: EVOLUTION_EVENTS.filter(e => e.type === 'issue' || e.tag === 'bug').length },
    { key: 'insight', label: 'Insights', count: EVOLUTION_EVENTS.filter(e => e.tag === 'insight').length },
  ];
  const filteredLog = EVOLUTION_EVENTS.filter(e => {
    if (tab === 'up') return e.tag === 'upgrade';
    if (tab === 'issue') return e.type === 'issue' || e.tag === 'bug';
    if (tab === 'insight') return e.tag === 'insight';
    return true;
  });
  const activeLabel = tabs.find(t => t.key === tab)?.label || 'All';
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', maxWidth: 1100, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Evolution</h2>
            <Badge tone="neutral" size="xs">Preview · 기록 미연결</Badge>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch', lineHeight: 1.5 }}>시스템이 어떻게 변하고 있는지 · 바꾸는 법(Playbooks) · 실행하는 법(Commands) · 기록(Log)</div>
        </div>
        <div style={{ flex: 1 }} />
        <Tabs className="hub-toolbar" tabs={tabs} active={tab} onChange={setTab} ariaLabel="Evolution log filters" style={{ borderBottom: 'none' }} />
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>
        아래 지표와 로그는 아직 실시간 기록에 연결되지 않았습니다. 연결 전에는 빈 상태로 표시됩니다.
      </div>

      <div className="hub-grid--three" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>System version</div>
          <div className="stat" style={{ fontSize: 22, fontWeight: 500, marginTop: 8, color: 'var(--fg-faint)' }}>—</div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>버전 기록 준비 중</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Open issues</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <div className="stat" style={{ fontSize: 22, fontWeight: 500, color: 'var(--fg-faint)' }}>—</div>
            <Badge tone="neutral" size="xs">error_logs 미연결</Badge>
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Uptime · 30d</div>
          <div className="stat" style={{ fontSize: 22, fontWeight: 500, marginTop: 8, color: 'var(--fg-faint)' }}>—</div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>모니터링 연동 전</div>
        </Card>
      </div>

      {/* Playbooks — how the system changes */}
      <div>
        <SectionTitle subtitle="운영 절차 · 시스템을 바꾸는 방법" right={<Button variant="outline" size="xs" icon="plus" onClick={() => onNavigate?.('dashboard/agents/orders?new=playbook')}>Playbook</Button>}>
          Playbooks
        </SectionTitle>
        {lastRun && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--success)', marginBottom: 8 }}>
            queued · {lastRun}
          </div>
        )}
        <div className="hub-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
          {PLAYBOOK_FAMILIES.map(f => (
            <Card key={f.key} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Dot tone={f.tone} size={8} />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{f.label}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{f.count}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{f.detail}</div>
            </Card>
          ))}
        </div>
        <Card pad={false} className="hub-table-card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 1fr 100px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <span>Playbook</span><span>Family</span><span>Cadence</span><span>Trigger</span><span>Owner</span><span style={{ textAlign: 'right' }} />
          </div>
          {PLAYBOOK_CATALOG.length === 0 && (
            <EmptyState icon="folder" title="플레이북이 없습니다" description="플레이북 기록이 연결되면 운영 절차가 여기에 표시됩니다." />
          )}
          {PLAYBOOK_CATALOG.map((p, i) => {
            const fam = PLAYBOOK_FAMILIES.find(f => f.key === p.family);
            return (
              <div key={p.name} style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 110px 1fr 100px 80px',
                padding: '12px 16px', alignItems: 'center', gap: 10,
                borderBottom: i < PLAYBOOK_CATALOG.length - 1 ? '1px solid var(--line-soft)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Iconed name="folder" size={13} style={{ color: 'var(--fg-faint)' }} />
                  <span style={{ fontSize: 13 }}>{p.name}</span>
                </div>
                <Badge tone={fam.tone} size="xs">{fam.label}</Badge>
                <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{p.cadence}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.trigger}</span>
                <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{p.owner}</span>
                <div style={{ textAlign: 'right' }}>
                  <Button
                    variant="ghost"
                    size="xs"
                    iconRight="arrowRight"
                    onClick={() => {
                      setLastRun(p.name);
                      onNavigate?.(playbookTarget(p.family));
                    }}
                  >
                    Run
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Commands — how the system is operated */}
      <div>
        <SectionTitle
          subtitle="빠른 이동 + 슬래시 커맨드 · 시스템을 실행하는 방법"
          right={<span style={{ fontSize: 10.5, color: 'var(--fg-faint)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Kbd>⌘</Kbd><Kbd>K</Kbd> palette</span>}
        >
          Commands
        </SectionTitle>
        <div className="hub-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--gap)' }}>
          {QUICK_COMMANDS.map(c => (
            <button key={c.slash} className="hub-card-link" onClick={() => onNavigate?.(c.dest)} style={{
              textAlign: 'left', padding: 'var(--card-pad)',
              background: 'var(--surface)',
              borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)',
              display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer',
            }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dot tone={c.tone} />
                <span className="mono" style={{ fontSize: 12, color: 'var(--moon-300)' }}>{c.slash}</span>
                <div style={{ flex: 1 }} />
                <Iconed name="arrowRight" size={12} style={{ color: 'var(--fg-faint)' }} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--fg)' }}>{c.label}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>→ /{c.dest}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Log — what's actually changing */}
      <div>
        <SectionTitle
          right={<span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{filteredLog.length} / {EVOLUTION_EVENTS.length}</span>}
        >
          {activeLabel} Log
        </SectionTitle>
        <Card pad={false}>
          {filteredLog.length === 0 && (
            <EmptyState
              icon="evolution"
              title={`${activeLabel} 기록이 없습니다`}
              description="해당 카테고리의 변경 기록이 생기면 여기에 표시됩니다."
            />
          )}
          {filteredLog.map((e, i) => (
            <div key={`${e.at}-${e.tag}-${i}`} style={{ padding: '14px 18px', borderBottom: i < filteredLog.length - 1 ? '1px solid var(--line-soft)' : 'none', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', width: 100, flexShrink: 0, paddingTop: 2 }}>{e.at}</span>
              <Badge tone={tagTone[e.tag]} size="xs" style={{ flexShrink: 0 }}>{e.tag}</Badge>
              <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55, flex: 1 }}>{e.msg}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function CopyRow({ value, mono }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
      padding: '5px 6px 5px 10px',
    }}>
      <span className={mono ? 'mono' : ''} style={{ flex: 1, fontSize: 12, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
      <button onClick={copy} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 24, padding: '0 8px',
        background: copied ? 'var(--success)' : 'var(--surface)',
        color: copied ? 'var(--bg)' : 'var(--fg-muted)',
        border: '1px solid var(--line)', borderRadius: 4,
        fontSize: 11, fontFamily: 'var(--font-sans)',
        transition: 'background .15s, color .15s',
      }}>
        <Iconed name={copied ? 'check' : 'copy'} size={11} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function KeyRow({ item, last, kind }) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const displayValue = (() => {
    if (kind === 'key') {
      return revealed
        ? `Fingerprint ${item.fingerprint} · full key hidden after creation`
        : maskFingerprint(item.fingerprint);
    }
    if (kind === 'webhook') return `${SAFE_INCOMING_BASE_URL}/${item.slug}`;
    if (kind === 'outgoing') return `${item.source} endpoint · ${maskFingerprint(item.fingerprint)}`;
    return '';
  })();
  const copyValue = kind === 'key' ? item.ref : displayValue;

  const copy = () => {
    navigator.clipboard?.writeText(copyValue).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div style={{
      padding: '12px 18px',
      borderBottom: last ? 'none' : '1px solid var(--line-soft)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6,
          background: kind === 'key' ? 'var(--elevated)' : kind === 'outgoing' ? 'var(--success-bg)' : 'var(--surface-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: kind === 'key' ? 'var(--moon-300)' : kind === 'outgoing' ? 'var(--success)' : 'var(--fg-muted)',
        }}>
          <Iconed name={kind === 'key' ? 'lock' : kind === 'outgoing' ? 'send' : 'webhook'} size={12} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            {kind === 'key' ? item.name : (
              <>
                <span className="mono" style={{ fontSize: 12.5 }}>/{item.slug}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontWeight: 400 }}>· {item.source}</span>
              </>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
            {kind === 'key' && (<>
              <span>scope: <span className="mono">{item.scopes}</span></span>
              <span>·</span>
              <span className="mono">{item.created}</span>
              <span>·</span>
              <span>last used {item.lastUsed}</span>
            </>)}
            {kind !== 'key' && (<>
              <span className="mono">{item.events}</span>
              <span>·</span>
              <span>{item.hits24} hits / 24h</span>
              <span>·</span>
              <span>{item.last}</span>
            </>)}
          </div>
        </div>
        {kind !== 'key' && <Badge tone={item.active ? 'success' : 'neutral'} size="xs">{item.active ? 'active' : 'paused'}</Badge>}
        {kind === 'key' && (
          <button onClick={() => setRevealed(r => !r)} title={revealed ? 'Hide details' : 'Show details'} style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
            color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Iconed name="eye" size={12} />
          </button>
        )}
        <button onClick={copy} title="Copy" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 26, padding: '0 10px',
          background: copied ? 'var(--success)' : 'var(--surface-2)',
          color: copied ? 'var(--bg)' : 'var(--fg-muted)',
          border: '1px solid var(--line-soft)', borderRadius: 6,
          fontSize: 11, transition: 'background .15s, color .15s',
        }}>
          <Iconed name={copied ? 'check' : 'copy'} size={11} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mono" style={{
        fontSize: 11.5, color: 'var(--fg-muted)',
        background: 'var(--surface-2)', border: '1px dashed var(--line-soft)', borderRadius: 'var(--r-sm)',
        padding: '6px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{displayValue}</div>
    </div>
  );
}

export function Settings({ onNavigate }) {
  const apiKeys = [];
  const incomingWebhooks = [];
  const [metaThreadsStatus, setMetaThreadsStatus] = React.useState(EMPTY_META_THREADS_STATUS);
  const [instagramStatus, setInstagramStatus] = React.useState(EMPTY_INSTAGRAM_STATUS);
  React.useEffect(() => {
    let active = true;

    async function loadSocialStatus(path, emptyStatus, setter) {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!active) return;

        if (response.ok && data) {
          setter({ ...emptyStatus, ...data });
        } else {
          setter(s => ({ ...s, status: 'missing-config' }));
        }
      } catch {
        if (active) setter(s => ({ ...s, status: 'missing-config' }));
      }
    }

    loadSocialStatus('/api/social/meta/threads/status', EMPTY_META_THREADS_STATUS, setMetaThreadsStatus);
    loadSocialStatus('/api/social/instagram/status', EMPTY_INSTAGRAM_STATUS, setInstagramStatus);
    return () => { active = false; };
  }, []);
  const integrationRows = React.useMemo(() => {
    const metaRow = buildMetaThreadsIntegration(metaThreadsStatus);
    const instagramRow = buildInstagramIntegration(instagramStatus);
    return [instagramRow, metaRow];
  }, [instagramStatus, metaThreadsStatus]);
  const connectMetaThreads = () => {
    if (metaThreadsStatus.status !== 'ready' && metaThreadsStatus.status !== 'connected') return;
    const brand = encodeURIComponent(metaThreadsStatus.brandHandle || 'moon.classin');
    window.location.href = `/api/social/meta/threads/connect?brand=${brand}&returnPath=/dashboard/settings`;
  };
  const connectInstagram = () => {
    if (instagramStatus.status !== 'ready' && instagramStatus.status !== 'connected') return;
    const brand = encodeURIComponent(instagramStatus.brandHandle || 'moon.classin');
    window.location.href = `/api/social/instagram/connect?brand=${brand}&returnPath=/dashboard/settings`;
  };
  const socialSetupRows = React.useMemo(() => {
    const fallbackSetup = instagramStatus.setup || metaThreadsStatus.setup;
    const rows = [];

    if (instagramStatus.setup?.oauthRedirectUri) {
      rows.push(['Instagram OAuth callback', instagramStatus.setup.oauthRedirectUri]);
    }
    if (metaThreadsStatus.setup?.oauthRedirectUri) {
      rows.push(['Threads OAuth callback', metaThreadsStatus.setup.oauthRedirectUri]);
    }
    if (metaThreadsStatus.setup?.deauthorizeCallbackUrl) {
      rows.push(['Threads remove callback', metaThreadsStatus.setup.deauthorizeCallbackUrl]);
    }
    if (metaThreadsStatus.setup?.dataDeletionCallbackUrl) {
      rows.push(['Threads deletion callback', metaThreadsStatus.setup.dataDeletionCallbackUrl]);
    }
    if (fallbackSetup?.privacyUrl) rows.push(['Privacy', fallbackSetup.privacyUrl]);
    if (fallbackSetup?.termsUrl) rows.push(['Terms', fallbackSetup.termsUrl]);
    if (fallbackSetup?.dataDeletionUrl) rows.push(['Data deletion instructions', fallbackSetup.dataDeletionUrl]);

    return rows;
  }, [instagramStatus.setup, metaThreadsStatus.setup]);
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', maxWidth: 900, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Settings</h2>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>Workspace · integrations · profile</div>
      </div>

      <div>
        <SectionTitle>Profile</SectionTitle>
        <Card>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Avatar name="Hyeon Park" size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>Hyeon Park</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>hyeon@moonlight.pro · Founder · KST</div>
            </div>
            <Badge tone="neutral" size="xs">local profile</Badge>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Integrations</SectionTitle>
        <Card pad={false}>
          {integrationRows.map((it, i, arr) => (
            <div key={it.n} style={{ padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
                <Iconed name={it.i} size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{it.n}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>{it.detail || it.s}</div>
              </div>
              <Badge tone={it.t} size="xs">{it.s}</Badge>
              <Button
                variant="ghost"
                size="sm"
                style={it.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                onClick={() => {
                  if (it.disabled) return;
                  if (it.provider === 'meta_threads') {
                    connectMetaThreads();
                    return;
                  }
                  if (it.provider === 'instagram_api') {
                    connectInstagram();
                    return;
                  }
                  onNavigate?.(it.dest);
                }}
              >
                {it.action || (it.s === 'Not connected' ? 'Connect' : 'Manage')}
              </Button>
            </div>
          ))}
        </Card>
        {socialSetupRows.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Card pad={false}>
              {socialSetupRows.map(([label, value], i, arr) => (
                <div key={label} style={{ padding: '12px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)', marginBottom: 6 }}>{label}</div>
                  <CopyRow value={value} mono />
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>

      <div>
        <SectionTitle>API keys</SectionTitle>
        <Card pad={false}>
          {apiKeys.length === 0 && (
            <EmptyState icon="key" title="API 키 기록이 연결되지 않았습니다" description="실제 키 메타데이터를 읽는 API가 준비되면 이 목록이 표시됩니다." />
          )}
          {apiKeys.map((k, i, arr) => (
            <KeyRow key={k.ref} item={k} last={i === arr.length - 1} kind="key" />
          ))}
          <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)' }}>
            <Iconed name="plus" size={12} style={{ color: 'var(--fg-faint)' }} />
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>새 API 키 발급</span>
            <div style={{ flex: 1 }} />
            <Button variant="outline" size="sm" icon="plus" disabled>Create key</Button>
          </div>
        </Card>
        <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Iconed name="eye" size={11} /> 키는 발급 직후 한 번만 전체 노출됩니다. 이후에는 마지막 4자리만 표시돼요.
        </div>
      </div>

      <div>
        <SectionTitle>Webhooks</SectionTitle>
        <Card pad={false}>
          {incomingWebhooks.length === 0 && (
            <EmptyState icon="webhook" title="등록된 incoming webhook이 없습니다" description="실제 endpoint 기록이 연결되면 URL과 최근 수신 이력이 표시됩니다." />
          )}
          {incomingWebhooks.map((w, i, arr) => (
            <KeyRow key={w.slug} item={w} last={i === arr.length - 1} kind="webhook" />
          ))}
          <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)' }}>
            <Iconed name="webhook" size={12} style={{ color: 'var(--fg-faint)' }} />
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Outgoing webhooks · 발생 이벤트를 외부로 푸시</span>
            <div style={{ flex: 1 }} />
            <Button variant="outline" size="sm" icon="plus" disabled>Add endpoint</Button>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Outgoing webhooks</SectionTitle>
        <Card pad={false}>
          <EmptyState icon="webhook" title="등록된 outgoing webhook이 없습니다" description="실제 endpoint 기록이 연결되면 전송 대상과 최근 실행 이력이 표시됩니다." />
        </Card>
      </div>

      <div>
        <SectionTitle>Labels</SectionTitle>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            리드 · 딜 · 계정에서 사용하는 구분 라벨. Personal은 개인 단위, Company는 법인/팀 단위.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge tone="personal"><Iconed name="user" size={10} /> Personal</Badge>
            <Badge tone="company"><Iconed name="building" size={10} /> Company</Badge>
          </div>
        </Card>
      </div>

    </div>
  );
}
