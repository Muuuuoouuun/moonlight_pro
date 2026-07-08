"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { IconButton, Avatar, Kbd } from "./hub-primitives";
import { NAV_TREE, LEGACY_TREE } from "./hub-data";

// Best-effort nav count badges — fetched once on mount, never polled.
// Keyed by nav child `key` (not path) so callers can look up via item.key.
function useSidebarCounts() {
  const [counts, setCounts] = React.useState({});

  React.useEffect(() => {
    let active = true;

    fetch('/api/hub/intake', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        const rows = Array.isArray(d?.rows) ? d.rows : Array.isArray(d?.items) ? d.items : [];
        const pending = rows.filter(row => row?.status === 'pending' || row?.status === 'review').length;
        setCounts(c => ({ ...c, 'classin-intake': pending }));
      })
      .catch(() => {});

    fetch('/api/hub/followups', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        const items = Array.isArray(d?.items) ? d.items : [];
        // followups-ledger.js summary shape: { overdue, dueToday, total, shown }.
        const due = Number.isFinite(d?.summary?.dueToday) ? d.summary.dueToday : items.length;
        setCounts(c => ({ ...c, 'classin-followups': due }));
      })
      .catch(() => {});

    return () => { active = false; };
  }, []);

  return counts;
}

function CountBadge({ n }) {
  if (!n) return null;
  return (
    <span className="mono" style={{
      fontSize: 10, lineHeight: 1, flexShrink: 0,
      color: n > 0 ? 'var(--moon-300)' : 'var(--fg-faint)',
      padding: '2px 5px', borderRadius: 999,
      border: '1px solid var(--line-soft)',
    }}>
      {n}
    </span>
  );
}

export function Sidebar({ active, onNavigate, collapsed, onToggleCollapse, openPalette, className }) {
  const counts = useSidebarCounts();
  const [open, setOpen] = React.useState(() => {
    const o = {};
    // Lead with the three workspaces expanded; secondary groups (Agents / Work /
    // System) start collapsed so the operating workstreams own the first scan.
    for (const n of NAV_TREE) if (n.children) o[n.key] = Boolean(n.workspace) || n.children.some(c => c.path === active);
    o.__legacy = false;
    return o;
  });

  const isActive = (item) => {
    if (item.path) return active === item.path;
    if (item.children) return item.children.some(c => active === c.path);
    return false;
  };

  React.useEffect(() => {
    const activeGroup = NAV_TREE.find(item => item.children?.some(c => c.path === active));
    if (!activeGroup) return;
    setOpen(o => (o[activeGroup.key] ? o : { ...o, [activeGroup.key]: true }));
  }, [active]);

  if (collapsed) {
    return (
      <aside className={`${className || ''} hub-sidebar-root--collapsed`} style={{
        width: 56, flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--line-soft)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '14px 0', gap: 4,
      }}>
        <button onClick={onToggleCollapse} title="Expand" style={{
          width: 36, height: 36, borderRadius: 'var(--r-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--moon-200)', marginBottom: 8,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 999,
            background: 'radial-gradient(circle at 35% 30%, var(--moon-100), var(--moon-400) 60%, var(--moon-700))',
            boxShadow: '0 0 12px oklch(0.78 0.008 250 / 0.3)',
          }} />
        </button>
        {NAV_TREE.map(item => {
          const flat = item.children ? item.children[0] : item;
          const act = isActive(item);
          return (
            <button key={item.key} onClick={() => onNavigate(flat.path)} title={item.label} style={{
              width: 36, height: 36, borderRadius: 'var(--r-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: act ? 'var(--fg)' : 'var(--fg-faint)',
              background: act ? 'var(--surface-3)' : 'transparent',
            }}>
              {/* Keep the workstream accent in the collapsed rail so the three
                  workspaces still read as primary. */}
              <Iconed name={item.icon} size={16} style={item.workspace && !act ? { color: 'var(--moon-300)' } : undefined} />
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className={className} style={{
      width: 232, flexShrink: 0,
      background: 'var(--surface)',
      borderRight: '1px solid var(--line-soft)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 999,
            background: 'radial-gradient(circle at 35% 30%, var(--moon-100), var(--moon-400) 60%, var(--moon-700))',
            boxShadow: '0 0 12px oklch(0.78 0.008 250 / 0.3), inset 0 -1px 2px oklch(0 0 0 / 0.5)',
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Moonlight</div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)', letterSpacing: '0.05em', marginTop: -1 }}>HUB · PRO</div>
          </div>
        </div>
        <IconButton icon="chevronL" onClick={onToggleCollapse} size={24} iconSize={13} tooltip="Collapse" />
      </div>

      <div style={{ padding: '4px 12px 10px' }}>
        <button onClick={openPalette} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          height: 30, padding: '0 10px',
          background: 'var(--surface-2)',
          border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-sm)',
          color: 'var(--fg-faint)', fontSize: 12,
        }}>
          <Iconed name="search" size={13} />
          <span style={{ flex: 1, textAlign: 'left' }}>Search · jump to</span>
          <Kbd>⌘</Kbd><Kbd>K</Kbd>
        </button>
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: '4px 8px 10px' }}>
        {NAV_TREE.map(item => {
          if (!item.children) {
            const act = isActive(item);
            return (
              <button key={item.key} onClick={() => onNavigate(item.path)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                height: 30, padding: '0 8px', marginBottom: 1,
                fontSize: 12.5, fontWeight: 500,
                color: act ? 'var(--fg)' : 'var(--fg-muted)',
                background: act ? 'var(--surface-3)' : 'transparent',
                borderRadius: 'var(--r-sm)',
                borderLeft: act ? '2px solid var(--moon-200)' : '2px solid transparent',
                textAlign: 'left', transition: 'all .12s',
              }}
                onMouseEnter={e => { if (!act) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (!act) e.currentTarget.style.background = 'transparent'; }}
              >
                <Iconed name={item.icon} size={14} />
                <span>{item.label}</span>
              </button>
            );
          }
          const isOpen = open[item.key];
          const act = isActive(item);
          const ws = Boolean(item.workspace);
          return (
            <div key={item.key} style={{ marginBottom: ws ? 2 : 1, marginTop: ws ? 2 : 0 }}>
              <button onClick={() => setOpen(o => ({ ...o, [item.key]: !o[item.key] }))} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                height: 30, padding: '0 8px',
                fontSize: 12.5, fontWeight: ws ? 600 : 500,
                color: ws || act ? 'var(--fg)' : 'var(--fg-muted)',
                borderRadius: 'var(--r-sm)', textAlign: 'left',
              }}>
                <Iconed name={item.icon} size={14} style={ws ? { color: 'var(--moon-300)' } : undefined} />
                <span style={{ flex: 1 }}>{item.label}</span>
                <Iconed name="chevronD" size={12} style={{
                  color: 'var(--fg-faint)',
                  transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)',
                  transition: 'transform .15s',
                }} />
              </button>
              {isOpen && (
                <div style={{ paddingLeft: 12, marginTop: 1, marginBottom: 4, borderLeft: '1px solid var(--line-soft)', marginLeft: 15 }}>
                  {item.children.map(c => {
                    const cAct = active === c.path;
                    return (
                      <button key={c.key} onClick={() => onNavigate(c.path)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        height: 27, padding: '0 8px', marginBottom: 1,
                        fontSize: 12, fontWeight: cAct ? 500 : 400,
                        color: cAct ? 'var(--fg)' : 'var(--fg-dim)',
                        background: cAct ? 'var(--surface-3)' : 'transparent',
                        borderRadius: 'var(--r-sm)',
                        textAlign: 'left', transition: 'all .12s',
                      }}
                        onMouseEnter={e => { if (!cAct) { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--fg)'; } }}
                        onMouseLeave={e => { if (!cAct) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-dim)'; } }}
                      >
                        <Iconed name={c.icon} size={12} style={{ color: 'var(--fg-faint)' }} />
                        <span style={{ flex: 1 }}>{c.label}</span>
                        <CountBadge n={counts[c.key]} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* 기타 — legacy archive (hidden when empty) */}
        {LEGACY_TREE.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}>
          <button onClick={() => setOpen(o => ({ ...o, __legacy: !o.__legacy }))} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 9,
            height: 28, padding: '0 8px',
            fontSize: 11, fontWeight: 500,
            color: 'var(--fg-faint)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            borderRadius: 'var(--r-sm)', textAlign: 'left',
          }}>
            <Iconed name="archive" size={12} />
            <span style={{ flex: 1 }}>기타</span>
            <Iconed name="chevronD" size={11} style={{
              transform: open.__legacy ? 'rotate(0)' : 'rotate(-90deg)',
              transition: 'transform .15s',
            }} />
          </button>
          {open.__legacy && (
            <div style={{ paddingLeft: 12, marginLeft: 15, marginTop: 1, marginBottom: 4, borderLeft: '1px solid var(--line-soft)' }}>
              {LEGACY_TREE.map(c => {
                const cAct = active === c.path;
                return (
                  <button key={c.key} onClick={() => onNavigate(c.path)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    height: 26, padding: '0 8px', marginBottom: 1,
                    fontSize: 11.5, fontWeight: cAct ? 500 : 400,
                    color: cAct ? 'var(--fg)' : 'var(--fg-faint)',
                    background: cAct ? 'var(--surface-3)' : 'transparent',
                    borderRadius: 'var(--r-sm)', textAlign: 'left', transition: 'all .12s',
                  }}
                    onMouseEnter={e => { if (!cAct) { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--fg-muted)'; } }}
                    onMouseLeave={e => { if (!cAct) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-faint)'; } }}
                  >
                    <Iconed name={c.icon} size={11} style={{ color: 'var(--fg-faint)' }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      <div style={{
        padding: '10px 12px', borderTop: '1px solid var(--line-soft)',
        display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <Avatar name="Hyeon Park" size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Hyeon Park</div>
          <div style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>Founder · Pro</div>
        </div>
        <IconButton icon="bell" size={24} iconSize={13} tooltip="Open Daily Brief" onClick={() => onNavigate('dashboard/daily-brief')} />
      </div>
    </aside>
  );
}
