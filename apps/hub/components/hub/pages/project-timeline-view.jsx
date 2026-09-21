"use client";

import React from "react";
import { Button, Card, EmptyState } from "../hub-primitives";
import { buildTimelineItemAriaLabel, mergeTimelineProjectQuery } from "@/lib/pms-ui";
import { BrandMark, ProjectProgressGauge, ProjectStatusBadge } from "./project-pms-components";
import { EMPTY_ALL_BRAND, STATUS_LINE_TOKEN } from "./project-view-constants";

// projects.jsx의 `{view === 'timeline' && (() => {…})()}` 블록을 그대로 옮긴 것.
// 훅 없음 · 로컬 상태 없음 — 렌더 출력은 동일하고 래퍼 DOM도 추가하지 않는다.
// 상태 스트라이프는 DESIGN.md §15 2026-08-05대로 §8.1 inset 1px 인라인을 유지한다
// (AttentionRail 미채택 — 6개 상태를 통째로 danger로 칠하면 §5.3 red-budget 위반).
export function ProjectTimelineView({
  projects,
  timeline,
  searchParams,
  pathname,
  selectedProjectId,
  brands,
  brandByKey,
  onCreateProject,
}) {
  if (projects.length === 0) {
    return (
      <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <Card>
            <EmptyState
              icon="projects"
              title="타임라인에 표시할 프로젝트가 없습니다"
              description="실제 시작일이 있는 프로젝트는 기간으로, 마감일만 있으면 마감 지점으로 표시됩니다."
              action={<Button variant="primary" size="sm" icon="plus" onClick={onCreateProject}>Project</Button>}
            />
          </Card>
        </div>
      </div>
    );
  }
  const timelineProjectHref = (projectId) => {
    const params = mergeTimelineProjectQuery(searchParams, projectId);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  const weekTicks = [];
  for (let d = 0; timeline.totalDays > 0 && d <= timeline.totalDays; d += 7) {
    const tickDate = new Date(timeline.windowStart.getTime() + d * 86_400_000);
    weekTicks.push({
      offsetPct: (d / timeline.totalDays) * 100,
      label: new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(tickDate),
    });
  }
  return (
    <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
        {selectedProjectId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
            <a
              href={`/dashboard/work/projects?project=${encodeURIComponent(selectedProjectId)}`}
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'var(--moon-300)', fontSize: 12.5, textUnderlineOffset: 3 }}
            >
              프로젝트 상세로 돌아가기
            </a>
            <span className="mono" style={{ color: 'var(--fg-faint)', fontSize: 10.5 }}>
              {projects.find(project => project.id === selectedProjectId)?.name || '선택한 프로젝트'}
            </span>
          </div>
        )}
        <Card pad={false} className="hub-table-card">
          {timeline.items.length === 0 ? (
            <div style={{ padding: '18px 14px', fontSize: 11.5, color: 'var(--fg-faint)' }}>기한이 지정된 프로젝트가 없습니다. 프로젝트를 편집해 기한을 지정하면 여기 축 위에 표시됩니다.</div>
          ) : (
            // Fixed inner min-width + horizontal scroll (same pattern as the board
            // view's hub-scroll-x) so the ruler and bars never get squeezed unreadable
            // on narrow viewports — the label column alone would eat a phone's width.
            <div className="hub-scroll-x" style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 640 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ padding: '8px 14px', fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>프로젝트</div>
                  <div style={{ position: 'relative', padding: '8px 0', background: 'var(--surface-2)' }}>
                    {weekTicks.map((tick, i) => (
                      <span key={i} className="mono" style={{ position: 'absolute', left: `${tick.offsetPct}%`, fontSize: 10.5, color: 'var(--fg-faint)', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{tick.label}</span>
                    ))}
                    <span className="mono" style={{ position: 'absolute', left: `${timeline.todayPct}%`, top: 0, fontSize: 10.5, color: 'var(--moon-300)', transform: 'translateX(-50%)', fontWeight: 600, whiteSpace: 'nowrap' }}>오늘</span>
                  </div>
                </div>
                {timeline.items.map((item, i) => {
                  const p = item.project;
                  const pBrand = brandByKey.get(p.brand) || brands[0] || EMPTY_ALL_BRAND;
                  const lineToken = item.overdue ? 'var(--danger-line)' : (STATUS_LINE_TOKEN[p.status] || 'var(--line-strong)');
                  return (
                    <div key={p.id} className="hub-row"
                      data-selected={selectedProjectId === p.id ? 'true' : 'false'}
                      data-kind={item.kind}
                      style={{
                        display: 'grid', gridTemplateColumns: '260px 1fr', alignItems: 'center', minHeight: 44,
                        borderBottom: i < timeline.items.length - 1 ? '1px solid var(--line-soft)' : 'none',
                        background: selectedProjectId === p.id ? 'var(--surface-2)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', minWidth: 0 }}>
                        <BrandMark brand={pBrand} size={16} style={{ marginTop: 2 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <a
                            href={timelineProjectHref(p.id)}
                            aria-current={selectedProjectId === p.id ? 'page' : undefined}
                            aria-label={buildTimelineItemAriaLabel(item)}
                            style={{ minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'inherit', textDecoration: 'none' }}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                            <span className="mono" style={{ fontSize: 10.5, color: item.overdue ? 'var(--danger)' : 'var(--fg-faint)', marginTop: 2 }}>{p.due}{item.overdue ? ' · 지남' : ''}</span>
                          </a>
                          <div style={{ marginTop: 7 }}>
                            <ProjectProgressGauge progress={p.displayProgress} compact ariaLabel={`${p.name} 진척`} />
                          </div>
                        </div>
                      </div>
                      <div style={{ position: 'relative', minHeight: 54 }}>
                        {item.kind === 'range' ? (
                          <div style={{
                            position: 'absolute', left: `${item.startPct}%`, width: `${item.widthPct}%`,
                            top: 18, height: 18, borderRadius: 999,
                            background: 'var(--surface-3)', border: '1px solid var(--line)',
                            boxShadow: `inset 1px 0 0 ${lineToken}`,
                          }} />
                        ) : (
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute', left: `${item.markerPct}%`, top: 18,
                              width: 16, height: 16, borderRadius: 999,
                              background: 'var(--surface-3)', border: `1px solid ${lineToken}`,
                              boxShadow: `inset 0 0 0 3px var(--surface-3), inset 0 0 0 8px ${lineToken}`,
                              transform: 'translateX(-50%)',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {timeline.undated.length > 0 && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 8 }}>기한 미정 · {timeline.undated.length}</div>
            <Card pad={false}>
              {timeline.undated.map((p, i) => {
                const pBrand = brandByKey.get(p.brand) || brands[0] || EMPTY_ALL_BRAND;
                return (
                  <a key={p.id} className="hub-row"
                    href={timelineProjectHref(p.id)}
                    aria-current={selectedProjectId === p.id ? 'page' : undefined}
                    data-selected={selectedProjectId === p.id ? 'true' : 'false'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', minHeight: 44,
                      borderBottom: i < timeline.undated.length - 1 ? '1px solid var(--line-soft)' : 'none',
                      color: 'inherit', textDecoration: 'none',
                      background: selectedProjectId === p.id ? 'var(--surface-2)' : 'transparent',
                    }}
                  >
                    <BrandMark brand={pBrand} size={16} />
                    <span style={{ flex: 1, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                    <ProjectStatusBadge status={p.status} />
                  </a>
                );
              })}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
