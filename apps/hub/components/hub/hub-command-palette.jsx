"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { Button, Kbd, Skeleton, TruthBadge } from "./hub-primitives";
import { NAV_TREE, LEGACY_TREE, navPathForScope } from "./hub-data";
import { isTopEscLayer, popEscLayer, pushEscLayer } from "./esc-layers";
import { loadPaletteRecords, matchingPaletteRecords, paletteItemKey } from './command-palette-records';

const RECORD_RESULT_CAP = 8;

export function CommandPalette({ open, onClose, onNavigate, onQuickMemo, onQuickCapture, scope = 'all' }) {
  const [q, setQ] = React.useState('');
  const [selectedKey, setSelectedKey] = React.useState(null);
  const [recordState, setRecordState] = React.useState({ items: [], sources: { revenue: 'loading', tasks: 'loading' } });
  const [reload, setReload] = React.useState(0);
  const inputRef = React.useRef(null);

  // 열릴 때 레코드 인덱스를 예열(캐시 60s) — 검색어를 치는 시점엔 이미 로컬 필터만 남는다.
  React.useEffect(() => {
    if (!open) return undefined;
    return loadPaletteRecords(setRecordState);
  }, [open, reload]);

  const items = React.useMemo(() => {
    // 생성 액션은 팔레트의 발견 경로다 — 단축키(C·⌘K)를 모르는 상태에서도 도달해야 한다.
    const flat = [
      { kind: 'Action', label: '빠른 입력 — 할 일·정리 전', action: 'quick-capture', icon: 'plus', keywords: ['할 일', '할일', '태스크', '작업', '추가', '생성', '캡처', 'task', 'todo', 'capture', 'add', 'new'] },
      { kind: 'Action', label: '빠른 메모', action: 'quick-memo', icon: 'edit', keywords: ['메모', '생각', '아이디어', '기록', 'quick note', 'memo', 'idea'] },
    ];
    for (const n of NAV_TREE) {
      if (n.path) flat.push({ kind: 'Navigate', label: n.label, path: navPathForScope(n, scope), icon: n.icon, keywords: n.keywords });
      if (n.children) for (const c of n.children) flat.push({ kind: 'Navigate', label: `${n.label} › ${c.label}`, path: navPathForScope(c, scope), icon: c.icon, keywords: c.keywords });
    }
    for (const c of LEGACY_TREE) flat.push({ kind: 'Archive', label: `기타 › ${c.label}`, path: c.path, icon: c.icon, keywords: c.keywords });
    flat.push({ kind: 'Action', label: 'New Decision 기록', path: 'dashboard/work/decisions?new=decision', icon: 'decisions' });
    flat.push({ kind: 'Action', label: 'New Project', path: 'dashboard/work/projects?new=project', icon: 'projects' });
    flat.push({ kind: 'Action', label: 'New Content draft', path: 'dashboard/content/studio?new=draft', icon: 'studio' });
    // Revenue 생성 딥링크(22차) — TopBar New와 같은 ?new= 착지를 팔레트에서도 잇는다.
    flat.push({ kind: 'Action', label: 'New Lead', path: 'dashboard/revenue/leads?new=lead', icon: 'leads', keywords: ['리드', '고객'] });
    flat.push({ kind: 'Action', label: 'New Deal', path: 'dashboard/revenue/deals?new=deal', icon: 'deals', keywords: ['딜', '영업'] });
    flat.push({ kind: 'Action', label: 'New Account', path: 'dashboard/revenue/accounts?new=account', icon: 'accounts', keywords: ['계정'] });
    flat.push({ kind: 'Action', label: 'New Case', path: 'dashboard/revenue/cases?new=case', icon: 'cases', keywords: ['케이스', '이슈'] });
    // 하루 리뷰 팝업 직행(2026-09-23 지속 루프 설계 §4.2) — 셸 Provider가 ?review=를 1회 소비한다.
    flat.push({ kind: 'Action', label: '하루 리뷰 쓰기', path: 'dashboard/work/daily-review?review=today', icon: 'brief', keywords: ['하루', '리뷰', '회고', '에너지', '마무리', 'daily review'] });
    flat.push({ kind: 'Action', label: 'Start 15m focus timer', path: 'dashboard/work/calendar?focus=15', icon: 'clock' });
    // AI Council & Guru Actions — both open the 코칭·대화 chat (dashboard/agents/chat), which runs the chosen
    // mode on arrival. The retired 5-persona roster (order·content·review …) has no palette entry (2026-09-26).
    flat.push({ kind: 'Action', label: 'AI Council: 3자 토의 & 주간 회고', path: 'dashboard/agents/chat?agent=council&mode=sparring', icon: 'sparkle', keywords: ['council', '카운슬', '자문', '토의', '스파링', 'ai', '회고'] });
    flat.push({ kind: 'Action', label: 'AI Guru: 세일즈 딜 코칭', path: 'dashboard/agents/chat?agent=guru&mode=pipeline-triage', icon: 'sparkle', keywords: ['guru', '구루', '영업', '세일즈', '딜 코칭', 'ai'] });
    return flat;
  }, [scope]);

  const filtered = React.useMemo(() => {
    if (!q) return items; // 빈 검색 = 내비 목록 (레코드는 검색어가 있을 때만 섞인다)
    const lc = q.toLowerCase();
    const match = (i) => (i.label + ' ' + (i.keywords || []).join(' ')).toLowerCase().includes(lc);
    const recordHits = matchingPaletteRecords(recordState.items, match, selectedKey, RECORD_RESULT_CAP);
    return [...recordHits, ...items.filter(match)];
  }, [q, items, recordState.items, selectedKey]);

  // Keep an explicit keyboard selection attached to its destination when an
  // independently loaded source inserts record hits above it.
  const idx = Math.max(0, filtered.findIndex((item) => paletteItemKey(item) === selectedKey));
  const loadingRecords = Object.values(recordState.sources).includes('loading');
  const incompleteRecords = Object.values(recordState.sources).some((state) => state !== 'live');

  React.useEffect(() => {
    if (!open) return undefined;
    setQ(''); setSelectedKey(null);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

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
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedKey(paletteItemKey(filtered[Math.min(filtered.length - 1, idx + 1)])); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedKey(paletteItemKey(filtered[Math.max(0, idx - 1)])); }
    if (e.key === 'Enter') {
      const it = filtered[idx];
      e.preventDefault();
      activate(it);
    }
  };

  function activate(item) {
    if (!item) return;
    onClose();
    if (item?.action === 'quick-memo') onQuickMemo?.();
    else if (item?.action === 'quick-capture') onQuickCapture?.();
    else if (item?.path) onNavigate(item.path);
  }

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
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSelectedKey(null); }} onKeyDown={handleKey}
            placeholder="페이지·액션·고객·딜·할 일 검색…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 14 }} />
          <Kbd>esc</Kbd>
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {q && incompleteRecords && (
            <div aria-live="polite" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(recordState.sources).map(([source, state]) => state === 'live' ? null : (
                <div key={source} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  {state === 'loading'
                    ? <Skeleton lines={1} width="100%" height={24} style={{ width: '100%' }} label={`${source === 'revenue' ? '고객·딜' : '할 일'} 검색 불러오는 중`} />
                    : <TruthBadge state={state} reason={`${source === 'revenue' ? '고객·딜' : '할 일'} 검색`} />}
                  {(state === 'error' || state === 'partial') && <Button variant="ghost" size="sm" onClick={() => setReload((value) => value + 1)}>다시 시도</Button>}
                </div>
              ))}
            </div>
          )}
          {filtered.length === 0 && !loadingRecords && (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span>{incompleteRecords ? `현재 확인한 결과에는 ‘${q}’이 없습니다` : `‘${q}’에 해당하는 결과가 없습니다`}</span>
              {/* §8.1 검색 0건 CTA — 빈 검색은 항상 내비 목록이 있으므로 이 분기는 q 존재를 전제 */}
              <Button variant="outline" size="sm" onClick={() => { setQ(''); setSelectedKey(null); inputRef.current?.focus(); }}>검색 지우기</Button>
            </div>
          )}
          {filtered.map((it, i) => (
            <button key={paletteItemKey(it)} data-palette-selected={idx === i} onClick={() => activate(it)} onMouseEnter={() => setSelectedKey(paletteItemKey(it))} style={{
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
