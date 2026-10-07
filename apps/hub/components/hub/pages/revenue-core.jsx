"use client";

// 영업·매출의 여러 화면(고객·현금 흐름·세그먼트·히트맵)이 함께 쓰는 작은 조각.
// 이 파일이 따로 있는 이유: 이 조각들을 4천 줄짜리 revenue.jsx에서 가져오면 그 화면들의
// 지연 로딩 청크가 Deals·Leads·Accounts·Cases 전체(와 그 의존성)를 같이 받는다.
import React from "react";
import { Badge, Divider } from "../hub-primitives";
import { revenueLedgerCache } from "../revenue-shared-cache";
import { buildLeadTagSummary } from "@/lib/sales-os/lead-view";

// Revenue 탭과 ⌘K가 같은 상태·요청을 구독한다. 탭 전환은 최근 스냅샷을
// 즉시 보여주고 배경 재검증하며, 저장 후 reload는 모든 소비자를 갱신한다.
export function useRevenueLedger() {
  const getSnapshot = React.useMemo(() => {
    // 신규 mount는 만료/실패 기록으로 딥링크를 먼저 소비하면 안 된다. 이 판정은
    // mount 때만 고정하고, 이미 열린 화면은 시간 경과만으로 loading에 빠뜨리지 않는다.
    const beforeRead = revenueLedgerCache.getSnapshot();
    const initial = revenueLedgerCache.getServableSnapshot() || revenueLedgerCache.getServerSnapshot();
    return () => {
      const current = revenueLedgerCache.getSnapshot();
      return current === beforeRead ? initial : current;
    };
  }, []);
  const { ledger, syncState } = React.useSyncExternalStore(
    revenueLedgerCache.subscribe, getSnapshot, revenueLedgerCache.getServerSnapshot,
  );
  React.useEffect(() => { void revenueLedgerCache.refresh(); }, []);
  return { ledger, syncState, reload: revenueLedgerCache.invalidate };
}

// 3단 정렬 헤더(§8.1) — 컴포넌트 안에서 정의하면 렌더마다 함수 identity가 바뀌어
// React가 헤더 버튼을 매번 unmount/remount한다(re-audit 속도 #5). 모듈 스코프 1개를
// Leads·Cases·Accounts가 공유한다. 캐럿은 비활성일 때도 폭 예약.
export function SortHead({ k, sort, onToggle, children, align, className }) {
  // aria-sort는 columnheader 롤 전용이라 버튼엔 무효 — 동적 aria-label로 현재 방향을 AT에 노출.
  const dirLabel = sort.key === k ? (sort.dir === 'desc' ? '내림차순' : '오름차순') : '정렬 안 함';
  return (
    <button type="button" className={className} onClick={() => onToggle(k)} title={`${children} 기준 정렬`}
      aria-label={`${children} 기준 정렬 — 현재 ${dirLabel}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, width: '100%',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: sort.key === k ? 'var(--fg-muted)' : 'var(--fg-faint)',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      }}>
      {children}
      <span style={{ fontSize: 10.5, opacity: sort.key === k ? 1 : 0 }}>{sort.dir === 'desc' && sort.key === k ? '▼' : '▲'}</span>
    </button>
  );
}

// Persist a Revenue drawer edit to the Supabase-backed write route. `kind` is
// 'lead' | 'deal' | 'case', `op` is 'create' | 'update' | 'delete'. Returns
// { ok, status, id } — `ok` is true only when the row actually saved; 'preview' means the
// backend isn't configured (or the DB refused the write) and the optimistic local row stands.
export async function saveRevenueRecord(kind, op, record) {
  try {
    const resp = await fetch(`/api/hub/revenue/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, ...record }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok && data.status === 'saved', status: data.status || 'error', id: data.id, data };
  } catch (err) {
    return { ok: false, status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

export function LeadEnrichmentPanel({ lead }) {
  if (!lead) return null;
  const summary = buildLeadTagSummary(lead.enrichmentTags || []);
  const calendar = lead.activityEvidence?.calendar || {};
  const directTouchCount = ['meeting', 'call', 'infoSession', 'other']
    .reduce((sum, key) => sum + (Number(calendar[key]) || 0), 0);
  const rows = [
    ['과목', summary.subjects],
    ['지역', summary.regions],
    ['직접 접점', summary.directActivities],
    ['접점 소스', summary.activitySources],
    ['공개 신호', summary.publicSignals],
    ['프로그램', summary.programs],
    ['공개 채널', summary.channels],
  ].filter(([, values]) => values.length > 0);
  const hasRelationship = Boolean(lead.companyName || lead.contactName || lead.contactEmail || lead.contactPhone);
  const hasEnrichment = rows.length > 0 || lead.engagementState === 'present' || lead.publicEvidenceCount > 0;

  if (!hasRelationship && !hasEnrichment && !lead.nextAction) return null;

  return (
    <div style={{ padding: 12, border: '1px solid var(--line-soft)', borderRadius: 'var(--r)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {hasRelationship && (
        <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: 8, alignItems: 'start' }}>
          <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>고객 문맥</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--fg)' }}>
              {[lead.companyName, lead.contactName, lead.contactTitle].filter(Boolean).join(' · ')}
            </div>
            {(lead.contactPhone || lead.contactEmail) && (
              <div className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 3, fontSize: 10.5, color: 'var(--fg-muted)' }}>
                {lead.contactPhone && <span>{lead.contactPhone}</span>}
                {lead.contactEmail && <span>{lead.contactEmail}</span>}
              </div>
            )}
          </div>
        </div>
      )}
      {lead.nextAction && (
        <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: 8, alignItems: 'start' }}>
          <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>다음 행동</span>
          <div style={{ fontSize: 12, color: 'var(--moon-200)', lineHeight: 1.45 }}>
            {lead.nextAction}
            {lead.nextActionAt && <span className="mono" style={{ marginLeft: 7, fontSize: 10.5, color: 'var(--fg-muted)' }}>{String(lead.nextActionAt).slice(0, 10)}</span>}
          </div>
        </div>
      )}
      {hasEnrichment && (
        <>
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>분류 · 증거</span>
            <Badge tone="neutral" size="xs">
              {lead.engagementState === 'present' ? `접점 ${directTouchCount || '확인'}` : '접점 미확인'}
            </Badge>
            {lead.publicEvidenceCount > 0 && <Badge tone="neutral" size="xs">공개 근거 {lead.publicEvidenceCount}</Badge>}
          </div>
          {rows.map(([label, values]) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: 8, alignItems: 'start' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{label}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {values.map(value => <Badge key={value} tone="neutral" size="xs" variant="outline">{value}</Badge>)}
              </div>
            </div>
          ))}
          {lead.engagementState !== 'present' && (
            <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', lineHeight: 1.45 }}>
              확인된 콜·미팅 로그가 없습니다. 공개 설명회·채널 신호는 직접 접점 점수와 분리합니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
