"use client";

import React from "react";

import {
  Button,
  EmptyState,
  Input,
  Kbd,
  SegmentedControl,
  SyncBadge,
} from "../hub-primitives";
import { usePageCreateHotkey } from "../use-crm-keyboard";
import {
  buildContentLogEntries,
  contentLogChannelOptions,
  contentLogStatusColumns,
  filterContentLogEntries,
  resolveBrandLogColors,
  sortContentLogEntries,
} from "@/lib/brand-content-log";

import { useContentLedger } from "./content";

const VIEW_OPTIONS = [
  { key: "board", label: "보드" },
  { key: "list", label: "리스트" },
];

const SORT_OPTIONS = [
  { key: "latest", label: "최신순" },
  { key: "oldest", label: "오래된순" },
  { key: "metrics", label: "성과순" },
];

const STATUS_FILTER_OPTIONS = [
  { key: null, label: "전체" },
  { key: "plan", label: "기획" },
  { key: "making", label: "제작중" },
  { key: "published", label: "발행" },
];

// 상태 필 — 리스트 뷰 전용. 색만으로 상태를 전달하지 않는다: 텍스트 라벨이 항상 함께
// 있고, published만 moonstone(현재/완료의 명도 강조)을 쓰고 나머지는 중립이다(§5.3).
function statusPillStyle(status) {
  if (status === "published") {
    return { background: "var(--moon-200)", color: "var(--bg)", border: "1px solid transparent" };
  }
  if (status === "making") {
    return { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg-muted)" };
  }
  return { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg-dim)" };
}

function chipStyle(selected) {
  return {
    background: selected ? "var(--moon-200)" : "var(--surface)",
    color: selected ? "var(--bg)" : "var(--fg)",
    border: `1px solid ${selected ? "transparent" : "var(--line)"}`,
  };
}

function sortButtonStyle(selected) {
  return {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    fontSize: 12,
    fontWeight: selected ? 700 : 500,
    color: selected ? "var(--fg)" : "var(--fg-dim)",
    textDecoration: selected ? "underline" : "none",
    textUnderlineOffset: 4,
  };
}

export function BrandContentLog({ onNavigate }) {
  const ledger = useContentLedger();
  const brands = ledger.brands || [];
  const items = ledger.items || [];

  const entries = React.useMemo(() => buildContentLogEntries(items, brands), [items, brands]);
  const brandColors = React.useMemo(() => resolveBrandLogColors(brands), [brands]);
  const channelOptions = React.useMemo(() => contentLogChannelOptions(entries), [entries]);

  const [view, setView] = React.useState("board");
  const [brandFilter, setBrandFilter] = React.useState(null);
  const [channelFilter, setChannelFilter] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("latest");
  const [statusFilter, setStatusFilter] = React.useState(null);

  const createContent = React.useCallback(() => {
    const brandParam = brandFilter ? `&brand=${encodeURIComponent(brandFilter)}` : "";
    onNavigate?.(`dashboard/content/studio?new=1${brandParam}`);
  }, [brandFilter, onNavigate]);
  usePageCreateHotkey(createContent);

  const openStudio = React.useCallback((id) => {
    onNavigate?.(`dashboard/content/studio?item=${encodeURIComponent(id)}`);
  }, [onNavigate]);

  const resetFilters = React.useCallback(() => {
    setBrandFilter(null);
    setChannelFilter(null);
    setQuery("");
    setStatusFilter(null);
  }, []);

  // 필터 순서(디자인 로직 그대로): 브랜드+채널+검색은 두 뷰 모두에 적용, 상태 필터는
  // 리스트 뷰에만 적용. 정렬은 컬럼 분배 이전에 적용한다.
  const filtered = React.useMemo(() => filterContentLogEntries(entries, {
    brand: brandFilter,
    channel: channelFilter,
    query,
    status: view === "list" ? statusFilter : null,
  }), [entries, brandFilter, channelFilter, query, view, statusFilter]);

  const sorted = React.useMemo(() => sortContentLogEntries(filtered, sort), [filtered, sort]);
  const columns = React.useMemo(() => contentLogStatusColumns(sorted), [sorted]);

  const globalEmpty = entries.length === 0;
  const isFilteredEmpty = !globalEmpty && sorted.length === 0;

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Content Log</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            전 브랜드 콘텐츠 기록 · <span className="num">{entries.length}</span>건
            <SyncBadge state={ledger.syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl label="보기 전환" options={VIEW_OPTIONS} value={view} onChange={setView} />
        <Button variant="primary" size="sm" icon="plus" onClick={createContent}>
          새 콘텐츠 <Kbd>N</Kbd>
        </Button>
      </div>

      {brands.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8,
          borderTop: "1px solid var(--line-strong)", paddingTop: 16,
        }}>
          {brands.map((b) => {
            const selected = brandFilter === b.key;
            const count = entries.filter((e) => e.brandKey === b.key).length;
            const color = brandColors.get(b.key) || "var(--fg-faint)";
            return (
              <button
                key={b.key}
                type="button"
                className="brand-log-chip"
                aria-pressed={selected}
                onClick={() => setBrandFilter(selected ? null : b.key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 600,
                  ...chipStyle(selected),
                }}
              >
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                {b.name}
                <span className="num" style={{ color: "var(--fg-dim)" }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 10 }}>
        <Input
          icon="search"
          placeholder="제목·메모 검색"
          value={query}
          onChange={setQuery}
          style={{ maxWidth: 320, flex: 1 }}
        />
        {channelOptions.map((c) => {
          const selected = channelFilter === c;
          return (
            <button
              key={c}
              type="button"
              className="brand-log-chip"
              aria-pressed={selected}
              onClick={() => setChannelFilter(selected ? null : c)}
              style={{
                fontSize: 11.5, fontWeight: 600, padding: "6px 12px", borderRadius: "var(--r-sm)",
                ...chipStyle(selected),
              }}
            >
              {c}
            </button>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>정렬</span>
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={sort === s.key}
              onClick={() => setSort(s.key)}
              style={sortButtonStyle(sort === s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {view === "list" && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {STATUS_FILTER_OPTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={statusFilter === s.key}
              onClick={() => setStatusFilter(s.key)}
              style={sortButtonStyle(statusFilter === s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {globalEmpty ? (
        <EmptyState
          icon="content"
          title={
            ledger.syncState === "error" ? "콘텐츠 로그를 불러오지 못했습니다"
              : ledger.syncState === "live" ? "아직 기록된 콘텐츠가 없습니다"
                : "콘텐츠 로그가 비어 있습니다"
          }
          description={
            ledger.syncState === "error"
              ? "콘텐츠 원장을 읽지 못했습니다 — 비어 보여도 실제 기록이 있을 수 있습니다. 새로고침으로 재시도하세요."
              : ledger.syncState === "live"
                ? "Supabase content_items/content_variants 기록에 표시할 콘텐츠가 없습니다."
                : "콘텐츠가 쌓이면 여기에 모입니다."
          }
          action={<Button variant="primary" size="sm" icon="plus" onClick={createContent}>새 콘텐츠 <Kbd>N</Kbd></Button>}
        />
      ) : isFilteredEmpty ? (
        <EmptyState
          icon="content"
          title="해당 조건의 컨텐츠가 없습니다"
          description="브랜드·채널·검색·상태 필터를 조정하거나 초기화하면 나머지 기록을 볼 수 있습니다."
          action={<Button variant="secondary" size="sm" onClick={resetFilters}>필터 지우기</Button>}
        />
      ) : view === "board" ? (
        <div
          className="brand-log-board"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, alignItems: "start" }}
        >
          {columns.map((col) => (
            <div key={col.key} style={{ background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-lg)", padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", color: "var(--fg)" }}>{col.label}</span>
                <span className="num" style={{ fontSize: 12, color: "var(--fg-dim)" }}>{col.items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.items.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--fg-faint)", fontSize: 12, padding: "32px 0" }}>비어 있음</div>
                ) : col.items.map((e) => (
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    className="brand-log-card"
                    aria-label={`${e.title} · ${e.brandName} — 스튜디오에서 열기`}
                    onClick={() => openStudio(e.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        openStudio(e.id);
                      }
                    }}
                    style={{
                      background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10,
                      padding: "14px 16px", boxShadow: `inset 3px 0 0 ${e.color}`, cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.brandName}</span>
                      <span style={{ flex: 1 }} />
                      <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)", flexShrink: 0 }}>{e.when}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", marginTop: 8, lineHeight: 1.4 }}>{e.title}</div>
                    <div style={{ fontSize: 12, color: "var(--fg-dim)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.memo}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--fg-muted)", background: "var(--surface-3)", borderRadius: 4, padding: "3px 8px" }}>{e.channel}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--fg-muted)", background: "var(--surface-3)", borderRadius: 4, padding: "3px 8px" }}>{e.type}</span>
                      <span style={{ flex: 1 }} />
                      <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)" }}>{e.metricLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {sorted.map((e) => (
            <div
              key={e.id}
              className="hub-row brand-log-row"
              role="button"
              tabIndex={0}
              aria-label={`${e.title} · ${e.brandName} — 스튜디오에서 열기`}
              onClick={() => openStudio(e.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  openStudio(e.id);
                }
              }}
              style={{
                display: "grid", gridTemplateColumns: "84px 150px minmax(0,1fr) 130px 100px 90px",
                gap: 16, alignItems: "center", padding: "14px 4px",
                borderBottom: "1px solid var(--line-soft)", cursor: "pointer",
              }}
            >
              <span className="mono blr-cell-meta" style={{ fontSize: 12, color: "var(--fg-dim)" }}>{e.when}</span>
              <span className="blr-cell-meta" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.brandName}</span>
              </span>
              <div className="blr-cell-title" style={{ minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{e.title}</span>
                <span style={{ fontSize: 12, color: "var(--fg-dim)", marginLeft: 10 }}>{e.memo}</span>
                <div className="blr-mobile-meta">{[e.when, e.brandName, e.channel, e.type, e.metricLabel].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="blr-cell-meta" style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.channel} · {e.type}</span>
              <span className="mono blr-cell-meta" style={{ fontSize: 12, color: "var(--fg-dim)" }}>{e.metricLabel}</span>
              <span className="blr-cell-status" style={{ textAlign: "right" }}>
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 10px", display: "inline-block", ...statusPillStyle(e.status) }}>
                  {e.statusLabel}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
