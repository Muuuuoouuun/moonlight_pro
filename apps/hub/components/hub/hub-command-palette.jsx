"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { Button, Kbd } from "./hub-primitives";
import { NAV_TREE, LEGACY_TREE } from "./hub-data";
import { isTopEscLayer, popEscLayer, pushEscLayer } from "./esc-layers";
import { readRevenueLedgerCache } from "./revenue-ledger-cache";

// 레코드 검색(2026-08-05) — 팔레트가 페이지 내비만 하던 것을 "이름을 치면 그 레코드"로.
// 이미 존재하는 딥링크(?customer= ?deal= ?task=)에 얹는 팔레트측 배선이라 새 API가 없다.
// 60초 모듈 캐시: 1인용 도구에서 팔레트를 여닫을 때마다 원장을 다시 읽지 않는다.
let RECORDS_CACHE = { at: 0, items: [] };
async function loadRecordItems() {
  if (Date.now() - RECORDS_CACHE.at < 60_000) return RECORDS_CACHE.items;
  // 매출 표면이 이미 받아둔 스냅샷이 신선하면 그대로 쓴다 — 팔레트가 따로 읽으면
  // 방금 렌더한 목록과 다른 스냅샷을 검색하게 되고 원장 호출도 두 배가 된다.
  const cachedRevenue = readRevenueLedgerCache(60_000);
  const [rev, tasks] = await Promise.all([
    cachedRevenue
      ? Promise.resolve(cachedRevenue.ledger)
      : fetch('/api/hub/revenue', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/hub/tasks', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const items = [];
  (Array.isArray(rev?.leads) ? rev.leads : []).forEach((l) => {
    if (!l?.id || !l?.name) return;
    items.push({
      kind: '고객', label: l.name, icon: 'leads',
      path: `dashboard/revenue/customers?customer=${encodeURIComponent(`lead:${l.id}`)}`,
      keywords: [l.companyName || '', l.stage || ''],
    });
  });
  (Array.isArray(rev?.deals) ? rev.deals : []).forEach((d) => {
    if (!d?.id || !d?.name) return;
    items.push({ kind: '딜', label: d.name, icon: 'deals', path: `dashboard/revenue/deals?deal=${encodeURIComponent(d.id)}` });
  });
  (Array.isArray(tasks?.tasks) ? tasks.tasks : []).forEach((t) => {
    if (!t?.id || !t?.title || t.done) return;
    items.push({ kind: '할 일', label: t.title, icon: 'inbox', path: `dashboard/work/my?task=${encodeURIComponent(t.id)}` });
  });
  RECORDS_CACHE = { at: Date.now(), items };
  return items;
}

const RECORD_RESULT_CAP = 8;

export function CommandPalette({ open, onClose, onNavigate }) {
  const [q, setQ] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  const [records, setRecords] = React.useState([]);
  const inputRef = React.useRef(null);

  // 열릴 때 레코드 인덱스를 예열(캐시 60s) — 검색어를 치는 시점엔 이미 로컬 필터만 남는다.
  React.useEffect(() => {
    if (!open) return undefined;
    let active = true;
    loadRecordItems().then((items) => { if (active) setRecords(items); });
    return () => { active = false; };
  }, [open]);

  const items = React.useMemo(() => {
    const flat = [];
    for (const n of NAV_TREE) {
      if (n.path) flat.push({ kind: 'Navigate', label: n.label, path: n.path, icon: n.icon, keywords: n.keywords });
      if (n.children) for (const c of n.children) flat.push({ kind: 'Navigate', label: `${n.label} › ${c.label}`, path: c.path, icon: c.icon, keywords: c.keywords });
    }
    for (const c of LEGACY_TREE) flat.push({ kind: 'Archive', label: `기타 › ${c.label}`, path: c.path, icon: c.icon, keywords: c.keywords });
    flat.push({ kind: 'Action', label: 'New Decision 기록', path: 'dashboard/work/decisions?new=decision', icon: 'decisions' });
    flat.push({ kind: 'Action', label: 'New Project', path: 'dashboard/work/projects?new=project', icon: 'projects' });
    flat.push({ kind: 'Action', label: 'New Content draft', path: 'dashboard/content/studio?new=draft', icon: 'studio' });
    flat.push({ kind: 'Action', label: 'Start 15m focus timer', path: 'dashboard/work/calendar?focus=15', icon: 'clock' });
    // 'Ask Council — next week plan' 제거(4차 재감사 S): prompt=next-week-plan 소비자가 없어 보류 표면의 빈 채팅에 착지했다.
    return flat;
  }, []);

  const filtered = React.useMemo(() => {
    if (!q) return items; // 빈 검색 = 내비 목록 (레코드는 검색어가 있을 때만 섞인다)
    const lc = q.toLowerCase();
    const match = (i) => (i.label + ' ' + (i.keywords || []).join(' ')).toLowerCase().includes(lc);
    const recordHits = records.filter(match).slice(0, RECORD_RESULT_CAP);
    return [...recordHits, ...items.filter(match)];
  }, [q, items, records]);

  React.useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);
  React.useEffect(() => { setIdx(0); }, [q]);

  // Global ESC — close even when focus has left the search input (list hover, etc.).
  // 팔레트는 열릴 때 ESC 레이어 스택에 올라간다: 드로어 위에서 열렸으면 ESC가 팔레트만 닫고
  // 드로어(와 dirty confirm)는 건드리지 않는다.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!open) return;
    const layer = pushEscLayer();
    const onKey = (e) => { if (e.key === 'Escape' && isTopEscLayer(layer)) onCloseRef.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); popEscLayer(layer); };
  }, [open]);

  if (!open) return null;

  const handleKey = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter') {
      const it = filtered[idx];
      if (it?.path) { onNavigate(it.path); onClose(); }
      else onClose();
    }
  };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="명령 팔레트" style={{
      position: 'fixed', inset: 0, zIndex: 'var(--z-palette)',
      background: 'oklch(0 0 0 / 0.6)',
      backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', paddingTop: '12vh',
      animation: 'hubFadeIn var(--dur-overlay) ease-out',
    }}>
      {/* 오버레이는 페이드만, 패널이 §9 다이얼로그 윈도(160–200ms)로 상승 */}
      <div onClick={e => e.stopPropagation()} style={{
        width: 580, maxWidth: '90vw', maxHeight: '70vh',
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'mlFadeUp var(--dur-panel) var(--ease-hub)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <Iconed name="search" size={15} style={{ color: 'var(--fg-faint)' }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
            placeholder="페이지·액션·고객·딜·할 일 검색…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 14 }} />
          <Kbd>esc</Kbd>
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span>‘{q}’에 해당하는 결과가 없습니다</span>
              {/* §8.1 검색 0건 CTA — 빈 검색은 항상 내비 목록이 있으므로 이 분기는 q 존재를 전제 */}
              <Button variant="outline" size="sm" onClick={() => { setQ(''); inputRef.current?.focus(); }}>검색 지우기</Button>
            </div>
          )}
          {filtered.map((it, i) => (
            <button key={i} onClick={() => { if (it.path) onNavigate(it.path); onClose(); }} onMouseEnter={() => setIdx(i)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 'var(--r-sm)',
              background: idx === i ? 'var(--surface-3)' : 'transparent',
              textAlign: 'left',
            }}>
              <Iconed name={it.icon} size={14} style={{ color: idx === i ? 'var(--fg)' : 'var(--fg-muted)' }} />
              <span style={{ flex: 1, fontSize: 13, color: idx === i ? 'var(--fg)' : 'var(--fg-muted)' }}>{it.label}</span>
              <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{it.kind}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--fg-faint)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Kbd>↑↓</Kbd> navigate</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Kbd>↵</Kbd> open</span>
          <div style={{ flex: 1 }} />
          <span>Moonlight Hub</span>
        </div>
      </div>
    </div>
  );
}
