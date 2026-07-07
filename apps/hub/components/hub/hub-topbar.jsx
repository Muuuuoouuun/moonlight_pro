"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { IconButton, Button } from "./hub-primitives";

const LABELS = {
  'dashboard': 'Moonlight',
  'daily-brief': 'Daily Brief',
  // real_v1 workspaces
  'classin': '클래스인', 'cohorts': '코호트', 'pipeline': '업무·파이프라인',
  'intake': '리드 인박스', 'segments': '세그먼트', 'followups': 'Follow-ups', 'eeocrm': 'eeoCRM',
  'company': '회사 Legacy',
  'brand': '브랜드',
  'work': 'Work', 'calendar': 'Calendar', 'projects': 'Projects', 'decisions': 'Decisions', 'roadmap': 'Roadmap', 'rhythm': 'Rhythm',
  'content': 'Content', 'studio': '스튜디오', 'queue': '발행 큐', 'campaigns': '캠페인',
  'revenue': 'Revenue', 'overview': 'Overview', 'leads': 'Leads', 'deals': 'Deals', 'cases': 'Cases', 'accounts': '고객·계정',
  'automations': 'Automations', 'flows': 'Flows', 'email': 'Email', 'webhooks': 'Webhooks', 'runs': 'Runs', 'sheets': 'Sheets',
  'agents': 'Agents', 'chat': 'Chat', 'council': 'Council', 'orders': 'Orders', 'office': 'VR Office',
  'evolution': 'Evolution', 'settings': 'Settings',
  'operations': 'Operations', 'pms': 'PMS', 'playbooks': 'Playbooks', 'command-center': 'Command Center',
  'card-news': 'Card News', 'logs': 'Logs', 'routine': 'Routine',
  'management': 'Manage', 'plan': 'Plan', 'releases': 'Releases', 'assets': 'Assets', 'publish': 'Publish',
  'integrations': 'Integrations', 'activity': 'Activity', 'issues': 'Issues',
};

function operatorStatusMessage(session) {
  if (!session.configured) return 'Server session secret is missing.';
  if (session.status === 'authenticated') return 'Browser writes are enabled for this Hub only.';
  if (session.reason === 'expired') return 'Session expired. Unlock again.';
  if (session.reason === 'invalid-signature' || session.reason === 'invalid-payload') return 'Session invalid. Clear and unlock again.';
  return 'Enter the Hub write secret once to enable browser writes.';
}

function OperatorSessionControl() {
  const [operatorSession, setOperatorSession] = React.useState({
    status: 'checking',
    reason: 'loading',
    configured: false,
  });
  const [operatorPanelOpen, setOperatorPanelOpen] = React.useState(false);
  const [operatorSecret, setOperatorSecret] = React.useState('');
  const [operatorBusy, setOperatorBusy] = React.useState(false);
  const [operatorMessage, setOperatorMessage] = React.useState(null);
  const panelRef = React.useRef(null);
  const secretInputRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);
  const panelId = React.useId();
  const titleId = React.useId();
  const descriptionId = React.useId();

  const closeOperatorPanel = React.useCallback(() => {
    setOperatorPanelOpen(false);
    setTimeout(() => previousFocusRef.current?.focus?.(), 0);
  }, []);

  const refreshOperatorSession = React.useCallback(async () => {
    setOperatorBusy(true);
    try {
      const response = await fetch('/api/operator/session', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setOperatorSession({ status: 'anonymous', reason: 'check-failed', configured: false });
        setOperatorMessage({ tone: 'danger', text: 'Session check failed.' });
        return;
      }
      setOperatorSession(data);
      setOperatorMessage({
        tone: data.status === 'authenticated' ? 'success' : 'neutral',
        text: data.status === 'authenticated'
          ? 'Session active. Write routes still require same-origin Hub requests.'
          : data.reason === 'expired'
          ? 'Session expired. Unlock again.'
          : data.reason === 'missing'
          ? 'No active operator session.'
          : data.reason === 'invalid-signature' || data.reason === 'invalid-payload'
          ? 'Session invalid. Clear and unlock again.'
          : 'No active operator session.',
      });
    } catch (error) {
      setOperatorSession({ status: 'anonymous', reason: 'check-failed', configured: false });
      setOperatorMessage({ tone: 'danger', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setOperatorBusy(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch('/api/operator/session', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (active && response.ok && data) setOperatorSession(data);
      } catch {
        if (active) setOperatorSession({ status: 'anonymous', reason: 'check-failed', configured: false });
      }
    }

    load();
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!operatorPanelOpen) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => {
      if (operatorSession.status !== 'authenticated' && operatorSession.configured !== false) {
        secretInputRef.current?.focus();
      } else {
        panelRef.current?.focus();
      }
    }, 0);
    const onKey = (event) => {
      if (event.key === 'Escape') closeOperatorPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOperatorPanel, operatorPanelOpen, operatorSession.configured, operatorSession.status]);

  async function loginOperatorSession() {
    setOperatorBusy(true);
    setOperatorMessage(null);
    try {
      const response = await fetch('/api/operator/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'login', secret: operatorSecret }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status !== 'authenticated') {
        setOperatorMessage({ tone: 'danger', text: response.status === 401 ? 'Secret rejected.' : data?.error || 'Unlock failed.' });
        return;
      }
      setOperatorSecret('');
      setOperatorSession({ status: 'authenticated', reason: 'ok', configured: true });
      setOperatorMessage({ tone: 'success', text: 'Session active. Write routes still require same-origin Hub requests.' });
    } catch (error) {
      setOperatorMessage({ tone: 'danger', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setOperatorBusy(false);
    }
  }

  async function clearOperatorSession() {
    setOperatorBusy(true);
    setOperatorMessage(null);
    try {
      await fetch('/api/operator/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      setOperatorSecret('');
      setOperatorSession((prev) => ({ ...prev, status: 'anonymous', reason: 'missing' }));
      setOperatorMessage({ tone: 'neutral', text: 'No active operator session.' });
    } catch (error) {
      setOperatorMessage({ tone: 'danger', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setOperatorBusy(false);
    }
  }

  const active = operatorSession.status === 'authenticated';
  const configured = operatorSession.configured !== false;
  const tooltip = !configured
    ? 'Operator session not configured'
    : active
    ? 'Operator session active'
    : 'Operator session locked';
  const toneColor = !configured ? 'var(--danger)' : active ? 'var(--success)' : 'var(--fg-muted)';
  const messageColor = operatorMessage?.tone === 'danger'
    ? 'var(--danger)'
    : operatorMessage?.tone === 'success'
    ? 'var(--success)'
    : 'var(--fg-muted)';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <IconButton
        icon={active ? 'check' : 'lock'}
        tooltip={tooltip}
        aria-haspopup="dialog"
        aria-expanded={operatorPanelOpen}
        aria-controls={operatorPanelOpen ? panelId : undefined}
        onClick={() => setOperatorPanelOpen((open) => !open)}
        style={{
          color: toneColor,
          borderColor: active ? 'oklch(0.5 0.08 155 / 0.25)' : 'transparent',
          background: active ? 'var(--success-bg)' : 'transparent',
        }}
      />
      {operatorPanelOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          style={{
          position: 'absolute',
          top: 36,
          right: 0,
          width: 310,
          zIndex: 80,
          padding: 12,
          background: 'var(--surface)',
          border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Iconed name={active ? 'check' : 'lock'} size={14} style={{ color: toneColor }} />
            <div id={titleId} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)' }}>Operator session</div>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 10.5, color: toneColor }}>{active ? 'active' : configured ? 'locked' : 'missing'}</span>
          </div>
          <div id={descriptionId} style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
            {operatorStatusMessage(operatorSession)}
          </div>
          {!active && configured && (
            <input
              ref={secretInputRef}
              type="password"
              aria-label="Hub write secret"
              autoComplete="off"
              spellCheck={false}
              value={operatorSecret}
              onChange={(event) => setOperatorSecret(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && operatorSecret.trim()) {
                  event.preventDefault();
                  void loginOperatorSession();
                }
              }}
              placeholder="Hub write secret"
              style={{
                width: '100%',
                height: 32,
                marginTop: 10,
                padding: '0 9px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--line-soft)',
                background: 'var(--surface-2)',
                color: 'var(--fg)',
                fontSize: 12,
              }}
            />
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            {!active && configured && (
              <Button variant="primary" size="xs" disabled={operatorBusy || !operatorSecret.trim()} onClick={() => void loginOperatorSession()}>Unlock</Button>
            )}
            <Button variant="ghost" size="xs" disabled={operatorBusy} onClick={() => void refreshOperatorSession()}>Check</Button>
            <Button variant="ghost" size="xs" disabled={operatorBusy} onClick={() => void clearOperatorSession()}>Clear</Button>
          </div>
          {operatorMessage && (
            <div style={{ marginTop: 9, fontSize: 11, lineHeight: 1.45, color: messageColor }}>
              {operatorMessage.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar({ path, onNavigate, density, onDensity, theme, onTheme, onTweaksToggle, onSidebarOpen, onNew }) {
  const segments = path.split('/').filter(Boolean);
  const now = new Date();
  const weekday = ['일','월','화','수','목','금','토'][now.getDay()];
  const m = now.getMonth() + 1, d = now.getDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  return (
    <header className="hub-topbar" style={{
      height: 48, flexShrink: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line-soft)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px',
      gap: 14,
    }}>
      <IconButton className="hub-mobile-only" icon="menu" tooltip="Open navigation" onClick={onSidebarOpen} />

      <div className="hub-topbar__crumbs" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {segments.map((s, i) => {
          const isLast = i === segments.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 && <Iconed name="chevronR" size={11} style={{ color: 'var(--fg-faint)' }} />}
              <button onClick={() => {
                if (!isLast) onNavigate(segments.slice(0, i + 1).join('/'));
              }} style={{
                fontSize: 12.5, fontWeight: isLast ? 500 : 400,
                color: isLast ? 'var(--fg)' : 'var(--fg-dim)',
                padding: '3px 6px', borderRadius: 4,
                cursor: isLast ? 'default' : 'pointer',
              }}>
                {LABELS[s] || s}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div className="hub-topbar__meta" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
        background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
        borderRadius: 999, fontSize: 11.5, color: 'var(--fg-muted)',
      }}>
        <Iconed name="clock" size={12} style={{ color: 'var(--moon-300)' }} />
        <span className="mono" style={{ color: 'var(--fg)' }}>{weekday} · {m}/{d} · {hh}:{mm}</span>
      </div>

      <div className="hub-topbar__density" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
        {['compact','default','relaxed'].map(d => (
          <button key={d} onClick={() => onDensity(d)} style={{
            padding: '4px 9px', fontSize: 11, fontWeight: 500, borderRadius: 4,
            color: density === d ? 'var(--fg)' : 'var(--fg-faint)',
            background: density === d ? 'var(--surface-3)' : 'transparent',
            textTransform: 'capitalize',
          }}>{d}</button>
        ))}
      </div>

      <IconButton className="hub-topbar__secondary" icon="sparkle" tooltip="Ask Agents" onClick={() => onNavigate('dashboard/agents/chat')} />
      <OperatorSessionControl />
      <button onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        style={{
          width: 28, height: 28, borderRadius: 'var(--r-sm)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--fg-muted)',
          border: '1px solid var(--line-soft)', background: 'var(--surface-2)',
        }}>
        <Iconed name={theme === 'dark' ? 'moon' : 'sun'} size={13} />
      </button>
      <IconButton icon="settings" tooltip="Tweaks" onClick={onTweaksToggle} />
      <IconButton className="hub-topbar__secondary" icon="bell" tooltip="Open Daily Brief" onClick={() => onNavigate('dashboard/daily-brief')} />
      <Button className="hub-topbar__primary-action" variant="primary" size="sm" icon="plus" onClick={onNew}>New</Button>
    </header>
  );
}
