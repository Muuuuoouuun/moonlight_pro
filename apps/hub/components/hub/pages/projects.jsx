"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Avatar } from "../hub-primitives";
import { BRANDS, BRAND_PROJECTS, BRAND_TODOS, KANBAN_COLUMNS } from "../hub-data";

export function Projects() {
  const [brand, setBrand] = React.useState('all');
  const [view, setView] = React.useState('tree');
  const [todos, setTodos] = React.useState(BRAND_TODOS);
  const [drag, setDrag] = React.useState(null);
  const [cols, setCols] = React.useState(KANBAN_COLUMNS);
  const [expanded, setExpanded] = React.useState(() => new Set(['pm-1', 'bm-1']));
  const [openDetail, setOpenDetail] = React.useState(null);
  const [brandMenuOpen, setBrandMenuOpen] = React.useState(false);
  const [sidebarHidden, setSidebarHidden] = React.useState(false);
  const brandMenuRef = React.useRef(null);

  const projects = brand === 'all' ? BRAND_PROJECTS : BRAND_PROJECTS.filter(p => p.brand === brand);
  const brandTodos = brand === 'all' ? todos : todos.filter(t => t.brand === brand);
  const currentBrand = BRANDS.find(b => b.key === brand);

  const toggleTodo = (id) => setTodos(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const moveCard = (cardId, toCol) => {
    setCols(cs => {
      let card;
      const next = cs.map(c => ({ ...c, cards: c.cards.filter(x => { if (x.id === cardId) { card = x; return false; } return true; }) }));
      if (card) { const t = next.find(c => c.key === toCol); if (t) t.cards = [card, ...t.cards]; }
      return next;
    });
  };

  const statusTone = { 'In progress': 'info', 'Review': 'warning', 'Planning': 'moon', 'Backlog': 'neutral' };
  const prioTone = { high: 'danger', med: 'warning', low: 'neutral' };

  React.useEffect(() => {
    const close = (e) => { if (brandMenuRef.current && !brandMenuRef.current.contains(e.target)) setBrandMenuOpen(false); };
    if (brandMenuOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [brandMenuOpen]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: sidebarHidden ? '1fr' : '240px 1fr', height: '100%', overflow: 'hidden' }}>
      {!sidebarHidden && (
      <aside style={{ borderRight: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-faint)' }}>Brands</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>브랜드 포맷 · {BRANDS.length - 1}개</div>
          </div>
          <IconButton icon="chevronL" size={24} iconSize={13} onClick={() => setSidebarHidden(true)} tooltip="접기" />
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {BRANDS.map(b => {
            const active = brand === b.key;
            const count = b.key === 'all' ? BRAND_PROJECTS.length : (b.projects || 0);
            const changes = b.key === 'all'
              ? BRANDS.filter(x => x.key !== 'all').reduce((s, x) => s + (x.changes || 0), 0)
              : (b.changes || 0);
            return (
              <button key={b.key} onClick={() => setBrand(b.key)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', marginBottom: 1,
                background: active ? 'var(--surface-3)' : 'transparent',
                border: active ? '1px solid var(--line)' : '1px solid transparent',
                borderRadius: 'var(--r-sm)', textAlign: 'left',
                color: active ? 'var(--fg)' : 'var(--fg-muted)',
                position: 'relative',
              }}>
                <span style={{ fontSize: 15, width: 20, textAlign: 'center', position: 'relative' }}>
                  {b.glyph}
                  {changes > 0 && (
                    <span style={{
                      position: 'absolute', top: -3, right: -3,
                      width: 7, height: 7, borderRadius: 999,
                      background: 'var(--danger)',
                      boxShadow: '0 0 0 2px ' + (active ? 'var(--surface-3)' : 'var(--surface)'),
                    }} />
                  )}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                {changes > 0 && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                    minWidth: 16, height: 14, padding: '0 5px',
                    borderRadius: 999, background: 'var(--danger)', color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    letterSpacing: '-0.02em',
                  }}>{changes > 99 ? '99+' : changes}</span>
                )}
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', background: active ? 'var(--surface)' : 'transparent', padding: '1px 5px', borderRadius: 4 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </aside>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {sidebarHidden && (
            <IconButton icon="chevronR" size={28} iconSize={14} onClick={() => setSidebarHidden(false)} tooltip="브랜드 사이드바 펼치기" />
          )}
          <div ref={brandMenuRef} style={{ position: 'relative' }}>
            <button onClick={() => setBrandMenuOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px 6px 8px',
              background: brandMenuOpen ? 'var(--surface-3)' : 'var(--surface-2)',
              border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
              color: 'var(--fg)', cursor: 'pointer', position: 'relative',
            }}>
              <span style={{ fontSize: 16, position: 'relative' }}>
                {currentBrand.glyph}
                {(() => {
                  const totalChanges = BRANDS.filter(b => b.key !== 'all').reduce((s, b) => s + (b.changes || 0), 0);
                  if (brand === 'all' && totalChanges > 0) {
                    return (
                      <span style={{
                        position: 'absolute', top: -4, right: -6,
                        minWidth: 14, height: 14, padding: '0 4px',
                        borderRadius: 999, background: 'var(--danger)', color: '#fff',
                        fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-mono)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 0 2px var(--surface-2)',
                      }}>{totalChanges}</span>
                    );
                  }
                  if (brand !== 'all' && currentBrand.changes > 0) {
                    return (
                      <span style={{
                        position: 'absolute', top: -4, right: -6,
                        minWidth: 14, height: 14, padding: '0 4px',
                        borderRadius: 999, background: 'var(--danger)', color: '#fff',
                        fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-mono)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 0 2px var(--surface-2)',
                      }}>{currentBrand.changes}</span>
                    );
                  }
                  return null;
                })()}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em' }}>{currentBrand.name}</span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--line-soft)' }}>
                {brand === 'all' ? BRAND_PROJECTS.length : (currentBrand.projects || 0)}
              </span>
              <span style={{ fontSize: 9, color: 'var(--fg-faint)', marginLeft: 2, transform: brandMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
            </button>
            {brandMenuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                minWidth: 260,
                background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: 'var(--r)', boxShadow: '0 12px 40px -12px oklch(0 0 0 / 0.5)',
                padding: 4, display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ padding: '6px 10px 4px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>브랜드 몰아보기</div>
                {BRANDS.map(b => {
                  const active = brand === b.key;
                  const count = b.key === 'all' ? BRAND_PROJECTS.length : (b.projects || 0);
                  const bTodos = todos.filter(t => b.key === 'all' || t.brand === b.key).filter(t => !t.done).length;
                  const changes = b.key === 'all'
                    ? BRANDS.filter(x => x.key !== 'all').reduce((s, x) => s + (x.changes || 0), 0)
                    : (b.changes || 0);
                  return (
                    <button key={b.key} onClick={() => { setBrand(b.key); setBrandMenuOpen(false); }} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 'var(--r-sm)',
                      background: active ? 'var(--surface-3)' : 'transparent',
                      textAlign: 'left', color: active ? 'var(--fg)' : 'var(--fg-muted)',
                      cursor: 'pointer', position: 'relative',
                    }}>
                      <span style={{ fontSize: 16, width: 22, textAlign: 'center', position: 'relative' }}>
                        {b.glyph}
                        {changes > 0 && (
                          <span style={{
                            position: 'absolute', top: -3, right: -2,
                            width: 8, height: 8, borderRadius: 999,
                            background: 'var(--danger)',
                            boxShadow: '0 0 0 2px var(--surface)',
                          }} />
                        )}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12.5, fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                          {changes > 0 && (
                            <span style={{
                              fontSize: 9.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                              minWidth: 16, height: 14, padding: '0 5px',
                              borderRadius: 999, background: 'var(--danger)', color: '#fff',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              letterSpacing: '-0.02em',
                            }}>{changes > 99 ? '99+' : changes}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {changes > 0 ? `${changes}개 새 변동 · ${b.desc || '전체 브랜드 포맷'}` : (b.desc || '전체 브랜드 포맷')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{count}p</span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{bTodos}t</span>
                      </div>
                      {active && <span style={{ fontSize: 11, color: 'var(--moon-300)' }}>✓</span>}
                    </button>
                  );
                })}
                <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 4, padding: '6px 10px', fontSize: 10.5, color: 'var(--fg-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>사이드바로 전환</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { setSidebarHidden(false); setBrandMenuOpen(false); }}
                    style={{ fontSize: 10.5, color: 'var(--moon-300)', padding: '2px 6px', borderRadius: 4 }}>펼치기</button>
                </div>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
              {projects.length} projects · {brandTodos.filter(t => !t.done).length} open todos · {currentBrand.desc}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
            {[{k:'tree',l:'List'},{k:'board',l:'Board'},{k:'todos',l:'To-dos'}].map(t => (
              <button key={t.k} onClick={() => setView(t.k)} style={{
                padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
                color: view === t.k ? 'var(--fg)' : 'var(--fg-faint)',
                background: view === t.k ? 'var(--surface-3)' : 'transparent',
              }}>{t.l}</button>
            ))}
          </div>
          <Button variant="primary" size="sm" icon="plus">{view === 'todos' ? 'To-do' : 'Project'}</Button>
        </div>

        {view === 'tree' && (
          <div style={{ display: 'grid', gridTemplateColumns: openDetail ? '1fr 360px' : '1fr', flex: 1, overflow: 'hidden' }}>
            <div className="scroll-y" style={{ padding: 'var(--section-gap)' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
                {[
                  { key: 'In progress', label: '진행중', tone: 'var(--info)' },
                  { key: 'Review',      label: '검토',   tone: 'var(--warning)' },
                  { key: 'Planning',    label: '계획',   tone: 'var(--moon-400)' },
                  { key: 'Backlog',     label: '백로그', tone: 'var(--fg-faint)' },
                ].map(group => {
                  const groupProjects = projects.filter(p => p.status === group.key);
                  if (!groupProjects.length) return null;
                  return (
                    <div key={group.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 3, height: 14, background: group.tone, borderRadius: 2 }} />
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{group.label}</div>
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{groupProjects.length}</span>
                      </div>
                      <Card pad={false}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                          padding: '8px 14px', background: 'var(--surface-2)',
                          borderBottom: '1px solid var(--line-soft)',
                          fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em',
                          alignItems: 'center', gap: 8,
                        }}>
                          <span /><span />
                          <span>프로젝트 / 하위 아이템</span>
                          <span style={{ textAlign: 'center' }}>Own</span>
                          <span>기한</span>
                          <span>작업 상태</span>
                        </div>
                        {groupProjects.map((p, pi) => {
                          const isOpen = expanded.has(p.id);
                          const pTodos = todos.filter(t => t.project === p.id);
                          const pBrand = BRANDS.find(b => b.key === p.brand);
                          const isSel = openDetail === p.id;
                          return (
                            <React.Fragment key={p.id}>
                              <div style={{
                                display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                padding: '10px 14px', alignItems: 'center', gap: 8,
                                borderBottom: (isOpen || pi < groupProjects.length - 1) ? '1px solid var(--line-soft)' : 'none',
                                background: isSel ? 'var(--surface-3)' : 'transparent',
                                cursor: 'pointer',
                              }}
                                onClick={() => setOpenDetail(p.id === openDetail ? null : p.id)}
                              >
                                <button onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }} style={{
                                  width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: 'var(--fg-muted)', borderRadius: 4,
                                }}>
                                  <span style={{ display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10 }}>▶</span>
                                </button>
                                <input type="checkbox" style={{ margin: 0, accentColor: 'var(--moon-400)' }} onClick={e => e.stopPropagation()} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <span style={{ fontSize: 14 }}>{pBrand.glyph}</span>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                  </div>
                                  <span className="mono" style={{
                                    fontSize: 10, color: 'var(--fg-faint)',
                                    background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4,
                                    border: '1px solid var(--line-soft)',
                                  }}>{pTodos.length}</span>
                                  <div style={{ width: 60, height: 4, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                                    <div style={{ width: p.progress + '%', height: '100%', background: statusTone[p.status] === 'warning' ? 'var(--warning)' : 'var(--moon-400)' }} />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <Avatar name={p.owner} size={22} tone={p.owner === 'Me' ? 'moon' : p.owner === 'Council' ? 'info' : 'neutral'} />
                                </div>
                                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{p.due}</span>
                                <div><Badge tone={statusTone[p.status]} size="xs">{p.status === 'In progress' ? '작업 중' : p.status === 'Review' ? '검토' : p.status === 'Planning' ? '계획' : p.status}</Badge></div>
                              </div>

                              {isOpen && (
                                <div style={{ background: 'var(--surface-2)', borderBottom: pi < groupProjects.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                                  <div style={{
                                    display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                    padding: '6px 14px 6px 44px', gap: 8, alignItems: 'center',
                                    fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em',
                                    borderBottom: '1px solid var(--line-soft)',
                                  }}>
                                    <span /><span /><span>하위 아이템</span><span style={{ textAlign: 'center' }}>Own</span><span>기한</span><span>상태</span>
                                  </div>
                                  {pTodos.length === 0 && (
                                    <div style={{ padding: '10px 14px 10px 66px', fontSize: 11.5, color: 'var(--fg-faint)' }}>하위 아이템이 없습니다.</div>
                                  )}
                                  {pTodos.map((t, ti) => (
                                    <div key={t.id} style={{
                                      display: 'grid', gridTemplateColumns: '22px 18px 1fr 36px 100px 120px',
                                      padding: '8px 14px 8px 44px', alignItems: 'center', gap: 8,
                                      borderBottom: ti < pTodos.length - 1 ? '1px solid var(--line-soft)' : 'none',
                                      opacity: t.done ? 0.55 : 1,
                                    }}>
                                      <span />
                                      <button onClick={() => toggleTodo(t.id)} style={{
                                        width: 14, height: 14, borderRadius: 3,
                                        border: '1.5px solid ' + (t.done ? 'var(--success)' : 'var(--line-strong)'),
                                        background: t.done ? 'var(--success)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}>
                                        {t.done && <span style={{ fontSize: 9, color: 'var(--bg)' }}>✓</span>}
                                      </button>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Dot tone={prioTone[t.priority]} size={4} />
                                        <span style={{ fontSize: 12.5, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <Avatar name={t.assignee} size={18} tone={t.assignee === 'Me' ? 'moon' : t.assignee === 'Council' ? 'info' : 'neutral'} />
                                      </div>
                                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{t.due}</span>
                                      <Badge tone={t.done ? 'success' : 'neutral'} size="xs">{t.done ? '완료' : '열림'}</Badge>
                                    </div>
                                  ))}
                                  <button style={{
                                    width: '100%', padding: '8px 14px 10px 66px', textAlign: 'left',
                                    fontSize: 11.5, color: 'var(--fg-faint)',
                                    borderTop: pTodos.length ? '1px solid var(--line-soft)' : 'none',
                                  }}>＋ 하위 아이템 추가</button>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                        <button style={{
                          width: '100%', padding: '10px 14px', textAlign: 'left',
                          fontSize: 11.5, color: 'var(--fg-faint)',
                          borderTop: '1px solid var(--line-soft)',
                        }}>＋ {group.label} 프로젝트 추가</button>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>

            {openDetail && (() => {
              const p = BRAND_PROJECTS.find(x => x.id === openDetail);
              if (!p) return null;
              const pBrand = BRANDS.find(b => b.key === p.brand);
              const pTodos = todos.filter(t => t.project === p.id);
              const doneCount = pTodos.filter(t => t.done).length;
              return (
                <aside style={{ borderLeft: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{pBrand.glyph}</span>
                    <div style={{ fontSize: 11, color: 'var(--fg-faint)', flex: 1 }}>{pBrand.name}</div>
                    <IconButton icon="x" size={22} iconSize={12} onClick={() => setOpenDetail(null)} />
                  </div>
                  <div className="scroll-y" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em' }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <Badge tone={statusTone[p.status]} size="xs">{p.status}</Badge>
                        {p.tag === 'company' && <Badge tone="company" size="xs">Company</Badge>}
                        {p.tag === 'personal' && <Badge tone="personal" size="xs">Personal</Badge>}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 9, fontSize: 12 }}>
                      <span style={{ color: 'var(--fg-faint)' }}>Owner</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={p.owner} size={18} tone={p.owner === 'Me' ? 'moon' : 'neutral'} />
                        {p.owner}
                      </span>
                      <span style={{ color: 'var(--fg-faint)' }}>기한</span>
                      <span className="mono" style={{ color: 'var(--fg)' }}>{p.due}</span>
                      <span style={{ color: 'var(--fg-faint)' }}>진행률</span>
                      <span className="mono">{p.progress}% · {p.done}/{p.tasks}</span>
                      <span style={{ color: 'var(--fg-faint)' }}>생성</span>
                      <span className="mono" style={{ color: 'var(--fg-muted)' }}>2026·03·14</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 6 }}>설명</div>
                      <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
                        {pBrand.desc}. 이 프로젝트는 {p.status === 'In progress' ? '활발히 진행 중' : p.status === 'Review' ? '최종 검토 단계' : '초기 계획 단계'}이며, {pTodos.length}개의 하위 아이템으로 구성됩니다.
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
                        <span style={{ flex: 1 }}>체크리스트 · {doneCount}/{pTodos.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {pTodos.map(t => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-soft)' }}>
                            <button onClick={() => toggleTodo(t.id)} style={{
                              width: 14, height: 14, borderRadius: 3,
                              border: '1.5px solid ' + (t.done ? 'var(--success)' : 'var(--line-strong)'),
                              background: t.done ? 'var(--success)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>{t.done && <span style={{ fontSize: 9, color: 'var(--bg)' }}>✓</span>}</button>
                            <span style={{ flex: 1, fontSize: 12, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--fg-faint)' : 'var(--fg)' }}>{t.title}</span>
                            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{t.due}</span>
                          </div>
                        ))}
                        <button style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11.5, color: 'var(--fg-faint)' }}>＋ 항목 추가</button>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 6 }}>참고 자료 · 사진</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[{ hue: 280, label: 'ref-1.png' },{ hue: 220, label: 'ref-2.png' },{ hue: 160, label: 'moodboard.jpg' }].map((r, i) => (
                          <div key={i} style={{
                            aspectRatio: '1 / 1', borderRadius: 'var(--r-sm)', overflow: 'hidden',
                            background: `linear-gradient(135deg, oklch(0.35 0.08 ${r.hue}), oklch(0.22 0.04 ${r.hue}))`,
                            border: '1px solid var(--line-soft)',
                            position: 'relative', cursor: 'zoom-in',
                          }}>
                            <div style={{
                              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                              fontSize: 20, opacity: 0.45,
                            }}>🖼</div>
                            <div className="mono" style={{ position: 'absolute', left: 5, bottom: 4, fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>{r.label}</div>
                          </div>
                        ))}
                        <button style={{
                          aspectRatio: '1 / 1', borderRadius: 'var(--r-sm)',
                          background: 'var(--surface-2)', border: '1px dashed var(--line)',
                          color: 'var(--fg-faint)', fontSize: 20,
                        }}>＋</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 12, borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 6 }}>
                    <Button variant="primary" size="sm" icon="chat" style={{ flex: 1 }}>열기</Button>
                    <Button variant="outline" size="sm" icon="orders">주문 보내기</Button>
                  </div>
                </aside>
              );
            })()}
          </div>
        )}

        {view === 'todos' && (
          <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
            <div style={{ maxWidth: 880, margin: '0 auto' }}>
              {['오늘','내일','이번주','다음주'].map(bucket => {
                const items = brandTodos.filter(t => t.due === bucket || (bucket === '이번주' && ['이번주','4/20','4/21','4/22','4/23'].includes(t.due)));
                if (!items.length) return null;
                return (
                  <div key={bucket} style={{ marginBottom: 'var(--section-gap)' }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 8 }}>{bucket} · {items.length}</div>
                    <Card pad={false}>
                      {items.map((t, i) => {
                        const proj = BRAND_PROJECTS.find(p => p.id === t.project);
                        const pBrand = BRANDS.find(b => b.key === t.brand);
                        return (
                          <div key={t.id} style={{
                            display: 'grid', gridTemplateColumns: '22px 1fr 140px 100px 80px',
                            padding: '10px 14px', alignItems: 'center', gap: 10,
                            borderBottom: i < items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                            opacity: t.done ? 0.5 : 1,
                          }}>
                            <button onClick={() => toggleTodo(t.id)} style={{
                              width: 16, height: 16, borderRadius: 4,
                              border: '1.5px solid ' + (t.done ? 'var(--success)' : 'var(--line-strong)'),
                              background: t.done ? 'var(--success)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {t.done && <span style={{ fontSize: 10, color: 'var(--bg)' }}>✓</span>}
                            </button>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3 }}>
                                {pBrand.glyph} {pBrand.name} · {proj?.name}
                              </div>
                            </div>
                            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{t.assignee}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Dot tone={prioTone[t.priority]} />{t.priority}
                            </span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', textAlign: 'right' }}>{t.due}</span>
                          </div>
                        );
                      })}
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'board' && (
          <div style={{ display: 'flex', gap: 'var(--gap)', overflowX: 'auto', flex: 1, padding: 'var(--section-gap)' }}>
            {cols.map(col => (
              <div key={col.key}
                onDragOver={e => e.preventDefault()}
                onDrop={() => drag && moveCard(drag, col.key)}
                style={{
                  width: 280, flexShrink: 0,
                  background: 'var(--surface)', border: '1px solid var(--line-soft)',
                  borderRadius: 'var(--r-lg)',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', padding: '1px 6px', background: 'var(--surface-3)', borderRadius: 4 }}>{col.cards.length}</span>
                  <div style={{ flex: 1 }} />
                  <IconButton icon="plus" size={22} iconSize={12} />
                </div>
                <div className="scroll-y" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {col.cards.map(c => (
                    <div key={c.id} draggable onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag(null)}
                      style={{
                        background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                        borderRadius: 'var(--r-sm)', padding: '10px 11px', cursor: 'grab',
                        opacity: drag === c.id ? 0.4 : 1,
                      }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 }}>
                        <Dot tone={prioTone[c.priority]} size={5} />
                        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{c.project}</span>
                        <div style={{ flex: 1 }} />
                        {c.tag === 'personal' && <Badge tone="personal" size="xs">P</Badge>}
                        {c.tag === 'company' && <Badge tone="company" size="xs">C</Badge>}
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{c.title}</div>
                      {c.due && <div className="mono" style={{ fontSize: 10, color: 'var(--warning)', marginTop: 6 }}>⏱ {c.due}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
