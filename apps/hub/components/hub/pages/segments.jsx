"use client";

// Lead Segments — group the live lead ledger by an operator-picked dimension
// (유입경로 · 단계 · 스코어밴드 · 지역 · 규모). The follow-up scoring pipeline and the
// meta tags (region/scale) already exist on every lead projection; this page is the
// browsing surface the Sales OS audit flagged as missing. Read-only v1: click a
// segment to expand its member leads inline.

import React from 'react';

import { LEADS as FALLBACK_LEADS } from "../hub-data";
import { Iconed } from "../hub-icons";
import { Badge, Card, Dot, EmptyState, Input, SyncBadge, SegmentedControl } from "../hub-primitives";
import { filterLeadsByWorkspace, getWorkspace } from "../workspace-map";

// Same ledger endpoint the Revenue pages use; local copy so this page stays
// independent of revenue.jsx internals.
function useLeadsLedger() {
  const [state, setState] = React.useState({ syncState: 'loading', source: 'preview', leads: [] });
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/hub/revenue')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const live = data?.source === 'supabase';
        setState({
          syncState: live ? 'live' : 'mock',
          source: live ? 'supabase' : 'preview',
          // Sibling pages (Leads 등) show the mock fixtures under a 'mock' badge when the
          // ledger is preview — mirror that instead of an empty board.
          leads: live && Array.isArray(data?.leads) ? data.leads : FALLBACK_LEADS,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ syncState: 'mock', source: 'preview', leads: FALLBACK_LEADS });
      });
    return () => { cancelled = true; };
  }, []);
  return state;
}

const DIMENSIONS = [
  { key: 'source', label: '유입경로' },
  { key: 'stage', label: '단계' },
  { key: 'scoreBand', label: '스코어' },
  { key: 'region', label: '지역' },
  { key: 'scale', label: '규모' },
];

const SCORE_BANDS = [
  { key: 'hot', label: '핫 (70+)', tone: 'success', test: (s) => s >= 70 },
  { key: 'warm', label: '웜 (40–69)', tone: 'warning', test: (s) => s >= 40 && s < 70 },
  { key: 'cold', label: '콜드 (1–39)', tone: 'info', test: (s) => s >= 1 && s < 40 },
  { key: 'unscored', label: '미채점', tone: 'neutral', test: (s) => !s },
];

const STAGE_TONE = { New: 'info', Contact: 'moon', Qualified: 'success', Lost: 'danger' };

function segmentValueOf(lead, dimension) {
  if (dimension === 'scoreBand') {
    const band = SCORE_BANDS.find((b) => b.test(Number(lead.score) || 0));
    return band ? band.label : '미채점';
  }
  const raw = lead[dimension];
  if (!raw || raw === '—') return '(미지정)';
  return String(raw);
}

function groupLeads(leads, dimension) {
  const groups = new Map();
  leads.forEach((lead) => {
    const key = segmentValueOf(lead, dimension);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lead);
  });
  return [...groups.entries()]
    .map(([label, members]) => ({
      label,
      members,
      count: members.length,
      avgScore: Math.round(
        members.reduce((a, l) => a + (Number(l.score) || 0), 0) / Math.max(1, members.length),
      ),
      qualified: members.filter((l) => l.stage === 'Qualified').length,
    }))
    .sort((a, b) => b.count - a.count);
}

export function Segments({ workspace, onNavigate }) {
  const { syncState, source, leads: allLeads } = useLeadsLedger();
  const ws = getWorkspace(workspace);
  // Clicking a member row deep-links to that lead's drawer. Mirror the workspace path pick used by
  // the Revenue pages: classin scope opens the classin Leads surface, else the flat leads route.
  const openLead = (lead) => {
    if (!lead || lead.id == null) return;
    const base = workspace === 'classin' ? 'dashboard/classin/revenue' : 'dashboard/revenue/leads';
    onNavigate?.(`${base}?lead=${lead.id}`);
  };
  const leads = filterLeadsByWorkspace(allLeads, workspace);
  const [dimension, setDimension] = React.useState('source');
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState(null); // segment label

  const term = search.trim().toLowerCase();
  const searched = term
    ? leads.filter((l) => (l.name || '').toLowerCase().includes(term))
    : leads;
  const segments = groupLeads(searched, dimension);
  const dimLabel = DIMENSIONS.find((d) => d.key === dimension)?.label || dimension;

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>세그먼트</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {ws ? `${ws.label} · ` : ''}리드 {leads.length}건 · {dimLabel} 기준 {segments.length}개 세그먼트
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl
          className="hub-toolbar"
          options={DIMENSIONS.map((d) => ({ key: d.key, label: d.label }))}
          value={dimension}
          onChange={(key) => { setDimension(key); setExpanded(null); }}
        />
        <Input className="hub-toolbar" placeholder="리드 이름 검색…" icon="search" value={search} onChange={setSearch} />
      </div>

      {segments.length === 0 && (
        <Card>
          <EmptyState
            icon="filter"
            title="세그먼트가 없습니다"
            description={source === 'supabase'
              ? '리드가 없거나 검색 결과가 비어 있습니다.'
              : 'Supabase 연결 후 리드가 쌓이면 유입경로·지역·규모·스코어별로 자동 그룹핑됩니다.'}
            style={{ minHeight: 200, padding: '28px 12px' }}
          />
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--gap)' }}>
        {segments.map((seg) => {
          const isOpen = expanded === seg.label;
          return (
            <Card key={seg.label} interactive style={{ cursor: 'pointer' }} >
              <div onClick={() => setExpanded(isOpen ? null : seg.label)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {seg.label}
                  </div>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{seg.count}</span>
                  <Iconed name={isOpen ? 'chevronD' : 'chevronR'} size={12} style={{ color: 'var(--fg-faint)' }} />
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Avg score</div>
                    <div className="mono" style={{ fontSize: 12.5, marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Dot tone={seg.avgScore >= 70 ? 'success' : seg.avgScore >= 40 ? 'warning' : 'neutral'} />
                      {seg.avgScore || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Qualified</div>
                    <div className="mono" style={{ fontSize: 12.5, marginTop: 3 }}>{seg.qualified}</div>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}>
                    {seg.members.map((l, i) => (
                      <div key={l.id || i}
                        onClick={(e) => { e.stopPropagation(); openLead(l); }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', margin: '0 -8px',
                          borderRadius: 'var(--r-sm)', cursor: l.id != null ? 'pointer' : 'default',
                          borderBottom: i < seg.members.length - 1 ? '1px solid var(--line-soft)' : 'none',
                        }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                        <Badge tone={STAGE_TONE[l.stage] || 'neutral'} size="xs" variant="outline">{l.stage}</Badge>
                        {Number(l.score) > 0 && <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{l.score}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
