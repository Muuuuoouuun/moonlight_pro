"use client";

// 고객별 매출 히트맵 — classinkr-web /admin/branch BranchRegionHeatmap 구조 포팅.
// 지도(지역 히트) + 우측 레일(선택 지역 상세 · 고객 순위 · 지도 외) 구성을 유지하되
// Moonlight 토큰으로 번역했다: 히트 램프는 문스톤 단색(color-mix), 서피스·라인 토큰만 사용.
// 지표는 매출(확정=클로징) · 파이프라인(진행 중) · 예상(확정+파이프라인) 3단 —
// 목표/달성률 개념은 미정이라 만들지 않는다.
// 기간은 전체 · 최근(90/30일) · 월별 · 분기별 — 월/분기 후보는 원장 딜에서 동적으로 뽑는다.

import React from "react";
import { Badge, Card, Button, SyncBadge, SegmentedControl, EmptyState, IconButton, ScrollShadowX } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { KoreaHeatmap, fmtMoney, heatFill } from "../heatmap-map";
import { useRevenueLedger } from "./revenue";
import {
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_BY_LABEL,
  KOREA_PROVINCE_WIDTH,
  KOREA_PROVINCE_HEIGHT,
} from "@/lib/korea-province-map";

// ── 분류 휴리스틱 ────────────────────────────────────────────────────────────

// 딜 제목의 HW/SW 마커 (운영 데이터 실제 표기: "[HW] …", "HW 75\"", "소프트웨어 …", "SW …")
function dealItemType(name) {
  const t = String(name || "").toUpperCase();
  if (/\bHW\b|\[HW\]|하드웨어/.test(t)) return "hw";
  if (/\bSW\b|\[SW\]|소프트웨어/i.test(String(name || ""))) return "sw";
  return "other";
}

const REGION_ALIASES = [
  ["서울", "서울"], ["인천", "인천"], ["경기", "경기"], ["강원", "강원"],
  ["충북", "충북"], ["충청북", "충북"], ["충남", "충남"], ["충청남", "충남"],
  ["세종", "세종"], ["대전", "대전"],
  ["경북", "경북"], ["경상북", "경북"], ["대구", "대구"], ["울산", "울산"],
  ["부산", "부산"], ["경남", "경남"], ["경상남", "경남"],
  ["전북", "전북"], ["전라북", "전북"], ["광주", "광주"], ["전남", "전남"], ["전라남", "전남"],
  ["제주", "제주"],
];

function canonicalRegion(region) {
  const text = String(region || "").trim();
  if (!text) return null;
  const match = REGION_ALIASES.find(([needle]) => text.includes(needle));
  return match ? match[1] : null;
}

// ── 지도 ─────────────────────────────────────────────────────────────────────


// ── 우측 레일 ────────────────────────────────────────────────────────────────

function RegionDetail({ row, offMap = false, onJump }) {
  if (!row) {
    return <div style={{ fontSize: 12, color: "var(--fg-faint)", padding: "6px 2px" }}>지역을 선택하거나 호버하면 상세가 표시됩니다.</div>;
  }
  return (
    // key로 지역 전환마다 크로스페이드(--dur-overlay) — 값이 뚝 바뀌는 대신 계기가 갱신되는 느낌
    <div key={row.label} style={{ animation: "hubFadeIn var(--dur-overlay) ease-out" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 10, borderBottom: "1px solid var(--line-soft)" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 7 }}>
            {row.label}
            {offMap && <Badge tone="neutral" size="xs" variant="outline">지도 외</Badge>}
          </div>
          {row.regions.length > 1 && (
            <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginTop: 2 }}>{row.regions.join(", ")}</div>
          )}
        </div>
        <span className="stat" style={{ fontSize: 18, color: "var(--moon-200)" }}>{fmtMoney(row.expected)}</span>
      </div>
      {/* 확정 vs 파이프라인 구성 바 */}
      {(() => {
        const total = row.confirmed + row.pipeline;
        const pct = total > 0 ? (row.confirmed / total) * 100 : 0;
        return (
          <div style={{ display: "flex", height: 5, borderRadius: 999, overflow: "hidden", margin: "10px 0 2px", background: "var(--surface-3)" }}>
            <span style={{ width: `${pct}%`, background: "var(--moon-300)", transition: "width 240ms cubic-bezier(0.2, 0.7, 0.3, 1)" }} />
            <span style={{ flex: 1, background: "color-mix(in oklch, var(--moon-500) 45%, transparent)" }} />
          </div>
        );
      })()}
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>확정 (클로징)</div>
          <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--success)", marginTop: 2 }}>{fmtMoney(row.confirmed)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>파이프라인 (진행 중)</div>
          <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", marginTop: 2 }}>{fmtMoney(row.pipeline)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>딜</div>
          <div className="num" style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{row.wonCount} / {row.dealsCount}건</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>고객</div>
          <div className="num" style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{row.customers.length}개</div>
        </div>
      </div>
      {row.customers.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
          <div className="eyebrow" style={{ fontSize: 10.5, letterSpacing: "0.06em", color: "var(--fg-dim)", textTransform: "uppercase", marginBottom: 6 }}>주요 고객</div>
          {row.customers.slice(0, 5).map(c => {
            const jumpable = Boolean(c.jumpKey && onJump);
            return (
              <div
                key={c.name}
                className={jumpable ? "hub-row" : undefined}
                role={jumpable ? "button" : undefined}
                tabIndex={jumpable ? 0 : undefined}
                onClick={jumpable ? () => onJump(c.jumpKey) : undefined}
                onKeyDown={jumpable ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump(c.jumpKey); } } : undefined}
                style={{
                  display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 8,
                  alignItems: "baseline", padding: "4px 4px", borderRadius: 4,
                  cursor: jumpable ? "pointer" : "default",
                }}
              >
                <span style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <span className="num" style={{ fontSize: 11, fontWeight: 600, color: "var(--moon-200)" }}>{fmtMoney(c.expected)}</span>
                {jumpable
                  ? <Iconed name="chevronR" size={11} style={{ color: "var(--fg-faint)", alignSelf: "center" }} />
                  : <span style={{ width: 11 }} />}
              </div>
            );
          })}
        </div>
      )}
      {offMap && (
        <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--fg-faint)", lineHeight: 1.5 }}>
          지도에 없는 지역입니다. 고객을 열어 지역 태그를 채우면 다음 로드부터 지도에 올라갑니다.
        </div>
      )}
    </div>
  );
}

function CustomerRankRow({ customer, rank, max, metricKey, onSelect, onJump, onPeek }) {
  const value = customer[metricKey] || 0;
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="hub-row"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      // 레일→지도 연동: 행에 머무는 동안 지도의 해당 지역이 켜진다 (행 배경은 hub-row가 담당)
      onMouseEnter={onPeek ? () => onPeek(customer.canonical || null) : undefined}
      onMouseLeave={onPeek ? () => onPeek(null) : undefined}
      onFocus={onPeek ? () => onPeek(customer.canonical || null) : undefined}
      onBlur={onPeek ? () => onPeek(null) : undefined}
      style={{
        display: "grid", gridTemplateColumns: "18px minmax(0,1.2fr) minmax(0,1fr) 62px 26px",
        gap: 8, alignItems: "center", padding: "6px 6px", borderRadius: 4, cursor: "pointer",
      }}
    >
      <span className="mono" style={{ fontSize: 10, color: "var(--fg-faint)" }}>{String(rank).padStart(2, "0")}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{customer.name}</div>
        <div style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>{customer.region || "지역 미상"}</div>
      </div>
      <div style={{ height: 4, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: heatFill(value, max), borderRadius: 999, transition: "width 240ms cubic-bezier(0.2, 0.7, 0.3, 1)" }} />
      </div>
      <span className="num" style={{ fontSize: 11, fontWeight: 600, textAlign: "right", color: "var(--moon-200)", fontVariantNumeric: "tabular-nums" }}>
        {fmtMoney(value)}
      </span>
      {customer.jumpKey && onJump ? (
        <IconButton
          icon="chevronR"
          tooltip="고객 DB에서 열기"
          onClick={e => { e.stopPropagation(); onJump(customer.jumpKey); }}
        />
      ) : <span />}
    </div>
  );
}

// ── 기간(월/분기) 순수 헬퍼 ──────────────────────────────────────────────────
// [heatmap-period-pure-start] revenue-heatmap.test.mjs가 이 블록을 소스에서 추출해
// data: 모듈로 실행한다 — 블록 안에서는 JSX·파일 상단 import 참조 금지 (self-contained).

// 딜의 기준 시각: closeAt 우선, 없으면 activityAt. 둘 다 없거나 파싱 불가면 null.
export function dealTimestamp(deal) {
  const raw = deal?.closeAt || deal?.activityAt;
  if (!raw) return null;
  const at = new Date(raw).getTime();
  return Number.isFinite(at) ? at : null;
}

export function monthKeyOf(ms) {
  const dt = new Date(ms);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

export function quarterKeyOf(ms) {
  const dt = new Date(ms);
  return `${dt.getFullYear()}-Q${Math.floor(dt.getMonth() / 3) + 1}`;
}

// key("2026-06" | "2026-Q2") → [시작ms, 끝ms) — 로컬 타임존 캘린더 경계.
export function periodRange(kind, key) {
  if (kind === "month") {
    const [y, m] = String(key).split("-").map(Number);
    return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime()];
  }
  const [y, q] = String(key).split("-Q").map(Number);
  return [new Date(y, (q - 1) * 3, 1).getTime(), new Date(y, q * 3, 1).getTime()];
}

// 칩 라벨: 현재 연도면 "6월"/"Q2", 다른 연도면 "25.12"/"25 Q4".
export function periodChipLabel(kind, key, nowYear) {
  if (kind === "month") {
    const [y, m] = String(key).split("-").map(Number);
    return y === nowYear ? `${m}월` : `${String(y % 100).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
  }
  const [y, q] = String(key).split("-Q").map(Number);
  return y === nowYear ? `Q${q}` : `${String(y % 100).padStart(2, "0")} Q${q}`;
}

// 원장 딜에서 실제 존재하는 월/분기 후보만 (lost·무날짜 제외, 최근 우선). 빈 칩 금지.
export function dealPeriodCandidates(deals, kind, nowYear) {
  const keys = new Set();
  (deals || []).forEach(d => {
    if (d?.stage === "lost") return;
    const at = dealTimestamp(d);
    if (at == null) return;
    keys.add(kind === "month" ? monthKeyOf(at) : quarterKeyOf(at));
  });
  return [...keys].sort().reverse().map(key => ({ key, label: periodChipLabel(kind, key, nowYear) }));
}

// range가 null이면 통과, 아니면 [시작, 끝) 반개구간 비교.
export function inPeriodRange(ms, range) {
  return !range || (ms >= range[0] && ms < range[1]);
}

// [heatmap-period-pure-end]

// ── 집계 ─────────────────────────────────────────────────────────────────────

const PERIOD_MODES = [
  { key: "all", label: "전체" },
  { key: "recent", label: "최근" },
  { key: "month", label: "월별" },
  { key: "quarter", label: "분기별" },
];
const RECENT_OPTIONS = [
  { key: "90d", label: "90일", days: 90 },
  { key: "30d", label: "30일", days: 30 },
];
const ITEM_FILTERS = [
  { key: "all", label: "전체" },
  { key: "hw", label: "HW" },
  { key: "sw", label: "SW" },
];
// 세그먼트 라벨은 짧게, longLabel은 헤더 부제·지도 툴팁용.
const METRICS = [
  { key: "confirmed", label: "매출", longLabel: "확정 매출" },
  { key: "pipeline", label: "파이프라인", longLabel: "파이프라인" },
  { key: "expected", label: "예상", longLabel: "예상 매출" },
];

// cutoff: 최근 N일(ms 하한). range: 월/분기 [시작, 끝) ms 구간. 둘 다 null이면 전체.
function aggregate(ledger, { item, cutoff = null, range = null }) {
  const leadById = new Map((ledger.leads || []).map(l => [l.id, l]));
  const companyName = new Map((ledger.companies || []).map(c => [c.id, c.name]));
  // 회사 → 지역: 리드의 region 태그(더 세밀, "경기-안양")가 우선,
  // 없으면 Sales Ledger 싱크가 채운 companies.meta.region 폴백
  const regionByCompany = new Map();
  (ledger.leads || []).forEach(l => {
    if (l.companyId && l.region && !regionByCompany.has(l.companyId)) {
      regionByCompany.set(l.companyId, l.region);
    }
  });
  (ledger.companies || []).forEach(c => {
    if (c.region && !regionByCompany.has(c.id)) {
      regionByCompany.set(c.id, c.region);
    }
  });
  // 고객 DB 딥링크 타깃: company → customer_accounts.id (accounts 행), 없으면 lead
  const accountIdByCompany = new Map();
  (ledger.accounts || []).forEach(a => {
    if (a.companyId && a.id && !accountIdByCompany.has(a.companyId)) {
      accountIdByCompany.set(a.companyId, a.id);
    }
  });

  const regionAgg = new Map(); // canonical|미상 → agg
  const customerAgg = new Map(); // name → agg
  let matchedDeals = 0;

  (ledger.deals || []).forEach(d => {
    if (d.stage === "lost") return;
    if (item !== "all" && dealItemType(d.name) !== item) return;
    if (cutoff != null || range) {
      const at = dealTimestamp(d);
      if (at == null) return;
      if (cutoff != null && at < cutoff) return;
      if (!inPeriodRange(at, range)) return;
    }
    matchedDeals += 1;

    const lead = d.leadId ? leadById.get(d.leadId) : null;
    const rawRegion = lead?.region || (d.companyId ? regionByCompany.get(d.companyId) : null) || "";
    const canonical = canonicalRegion(rawRegion);
    const regionKey = canonical || (rawRegion ? rawRegion : "지역 미상");
    const customer = (d.companyId && companyName.get(d.companyId)) || lead?.name || d.name;
    const won = d.stage === "closing";
    const amount = Number(d.value) || 0;
    // 고객 DB 딥링크 — 지역 상세의 주요 고객과 전역 고객 순위가 같은 키를 쓴다
    const accountId = d.companyId ? accountIdByCompany.get(d.companyId) : null;
    const jumpKey = accountId ? `account:${accountId}` : d.leadId ? `lead:${d.leadId}` : null;

    const r = regionAgg.get(regionKey) || {
      region: regionKey, canonical, confirmed: 0, pipeline: 0, expected: 0,
      dealsCount: 0, wonCount: 0, customers: new Map(),
    };
    r.dealsCount += 1;
    if (won) { r.confirmed += amount; r.wonCount += 1; } else { r.pipeline += amount; }
    r.expected = r.confirmed + r.pipeline;
    const rc = r.customers.get(customer) || { name: customer, confirmed: 0, pipeline: 0, expected: 0, jumpKey: null };
    if (won) rc.confirmed += amount; else rc.pipeline += amount;
    rc.expected = rc.confirmed + rc.pipeline;
    if (!rc.jumpKey) rc.jumpKey = jumpKey;
    r.customers.set(customer, rc);
    regionAgg.set(regionKey, r);

    const c = customerAgg.get(customer) || {
      name: customer, region: regionKey === "지역 미상" ? null : regionKey, canonical,
      confirmed: 0, pipeline: 0, expected: 0, dealsCount: 0, jumpKey: null,
    };
    c.dealsCount += 1;
    if (won) c.confirmed += amount; else c.pipeline += amount;
    c.expected = c.confirmed + c.pipeline;
    if (!c.jumpKey) c.jumpKey = jumpKey;
    customerAgg.set(customer, c);
  });

  const mapRows = [];
  const otherRows = [];
  for (const r of regionAgg.values()) {
    const finished = {
      ...r,
      customers: [...r.customers.values()].sort((a, b) => b.expected - a.expected),
    };
    const shape = r.canonical ? KOREA_PROVINCE_BY_LABEL.get(r.canonical) : null;
    if (shape) {
      mapRows.push({ ...finished, label: shape.label, path: shape.path, x: shape.x, y: shape.y, regions: [r.region] });
    } else {
      // 지도 밖 행도 RegionDetail이 그대로 렌더할 수 있게 같은 계약(label/regions)으로 맞춘다
      otherRows.push({ ...finished, label: r.region, regions: [r.region] });
    }
  }
  // 같은 canonical에 여러 raw 지역이 접히는 경우 병합
  const merged = new Map();
  for (const row of mapRows) {
    const cur = merged.get(row.label);
    if (!cur) { merged.set(row.label, row); continue; }
    cur.confirmed += row.confirmed;
    cur.pipeline += row.pipeline;
    cur.expected = cur.confirmed + cur.pipeline;
    cur.dealsCount += row.dealsCount;
    cur.wonCount += row.wonCount;
    cur.customers = [...cur.customers, ...row.customers].sort((a, b) => b.expected - a.expected);
    cur.regions = [...cur.regions, ...row.regions];
  }

  return {
    mapRows: [...merged.values()].sort((a, b) => b.expected - a.expected),
    otherRows: otherRows.sort((a, b) => b.expected - a.expected),
    customers: [...customerAgg.values()].sort((a, b) => b.expected - a.expected),
    matchedDeals,
  };
}

// ── 페이지 ───────────────────────────────────────────────────────────────────

export function RevenueHeatmap({ onNavigate }) {
  const { ledger, syncState } = useRevenueLedger();
  const [periodMode, setPeriodMode] = React.useState("all");
  const [recentKey, setRecentKey] = React.useState("90d");
  const [monthKey, setMonthKey] = React.useState(null);
  const [quarterKey, setQuarterKey] = React.useState(null);
  const [itemKey, setItemKey] = React.useState("all");
  const [metricKey, setMetricKey] = React.useState("expected");
  const [selectedLabel, setSelectedLabel] = React.useState(null);
  // 레일→지도 연동 하이라이트 (고객 순위 행 호버 시 해당 지역이 켜짐)
  const [linkedLabel, setLinkedLabel] = React.useState(null);

  // 월/분기 후보는 원장 딜에서 실제 존재하는 것만 (최근 우선). 라벨은 현재 연도 기준.
  const nowYear = new Date().getFullYear();
  const monthOptions = React.useMemo(
    () => dealPeriodCandidates(ledger.deals, "month", nowYear),
    [ledger.deals, nowYear],
  );
  const quarterOptions = React.useMemo(
    () => dealPeriodCandidates(ledger.deals, "quarter", nowYear),
    [ledger.deals, nowYear],
  );
  // 선택값이 후보에 없으면(초기 진입·원장 갱신) 가장 최근 후보로 폴백 — useEffect 동기화 없이 파생.
  const effectiveMonthKey = monthOptions.some(o => o.key === monthKey) ? monthKey : (monthOptions[0]?.key ?? null);
  const effectiveQuarterKey = quarterOptions.some(o => o.key === quarterKey) ? quarterKey : (quarterOptions[0]?.key ?? null);

  const recent = RECENT_OPTIONS.find(r => r.key === recentKey) || RECENT_OPTIONS[0];
  const periodFilter = React.useMemo(() => {
    if (periodMode === "recent") return { cutoff: Date.now() - recent.days * 86400000, range: null };
    // 후보가 없는 월/분기 모드는 [0,0) — 아무것도 매칭하지 않아 EmptyState로 흐른다.
    if (periodMode === "month") return { cutoff: null, range: effectiveMonthKey ? periodRange("month", effectiveMonthKey) : [0, 0] };
    if (periodMode === "quarter") return { cutoff: null, range: effectiveQuarterKey ? periodRange("quarter", effectiveQuarterKey) : [0, 0] };
    return { cutoff: null, range: null };
  }, [periodMode, recent.days, effectiveMonthKey, effectiveQuarterKey]);

  const { mapRows, otherRows, customers, matchedDeals } = React.useMemo(
    () => aggregate(ledger, { item: itemKey, cutoff: periodFilter.cutoff, range: periodFilter.range }),
    [ledger, itemKey, periodFilter],
  );

  const metric = METRICS.find(m => m.key === metricKey) || METRICS[0];
  const periodLabel =
    periodMode === "all" ? "전체 기간"
    : periodMode === "recent" ? `최근 ${recent.label}`
    : periodMode === "month" ? (effectiveMonthKey ? periodChipLabel("month", effectiveMonthKey, nowYear) : "월 후보 없음")
    : (effectiveQuarterKey ? periodChipLabel("quarter", effectiveQuarterKey, nowYear) : "분기 후보 없음");
  const sortedCustomers = React.useMemo(
    () => [...customers].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0)).filter(c => (c[metricKey] || 0) > 0),
    [customers, metricKey],
  );
  const maxCustomer = Math.max(1, ...sortedCustomers.map(c => c[metricKey] || 0));
  // 지도 외(지역 미상 포함) 행도 선택해 상세를 볼 수 있다 — 지도 하이라이트만 없을 뿐.
  const selected =
    mapRows.find(r => r.label === selectedLabel) ||
    otherRows.find(r => r.label === selectedLabel) ||
    mapRows[0] || otherRows[0] || null;
  const selectedOffMap = Boolean(selected && !selected.path);
  const totalValue = mapRows.reduce((s, r) => s + (r[metricKey] || 0), 0) +
    otherRows.reduce((s, r) => s + (r[metricKey] || 0), 0);
  const jumpToCustomer = onNavigate
    ? (key) => onNavigate(`dashboard/revenue/customers?customer=${encodeURIComponent(key)}`)
    : null;

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>매출 히트맵</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            {periodLabel} · {metric.longLabel} · 딜 {matchedDeals}건 · 합계 <span className="num">{fmtMoney(totalValue)}</span>
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl className="hub-toolbar" label="기간" options={PERIOD_MODES} value={periodMode} onChange={setPeriodMode} />
        <SegmentedControl className="hub-toolbar" label="품목" options={ITEM_FILTERS} value={itemKey} onChange={setItemKey} />
        <SegmentedControl className="hub-toolbar" label="지표" options={METRICS} value={metricKey} onChange={setMetricKey} />
      </div>

      {periodMode !== "all" && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", minWidth: 0 }}>
          {periodMode === "recent" ? (
            <SegmentedControl className="hub-toolbar" label="최근 범위" options={RECENT_OPTIONS} value={recentKey} onChange={setRecentKey} />
          ) : (periodMode === "month" ? monthOptions : quarterOptions).length === 0 ? (
            <span style={{ fontSize: 11.5, color: "var(--fg-faint)" }}>
              날짜가 있는 딜이 없어 {periodMode === "month" ? "월" : "분기"} 후보가 없습니다.
            </span>
          ) : (
            // 후보 칩이 많으면 세그먼트를 세로로 쌓지 않고 가로 스크롤 (모바일 포함).
            <ScrollShadowX style={{ flex: "0 1 auto", minWidth: 0, maxWidth: "100%" }}>
              <SegmentedControl
                className="hub-toolbar"
                label={periodMode === "month" ? "월 선택" : "분기 선택"}
                options={periodMode === "month" ? monthOptions : quarterOptions}
                value={periodMode === "month" ? effectiveMonthKey : effectiveQuarterKey}
                onChange={periodMode === "month" ? setMonthKey : setQuarterKey}
                style={{ flexShrink: 0, whiteSpace: "nowrap" }}
              />
            </ScrollShadowX>
          )}
        </div>
      )}

      {matchedDeals === 0 ? (
        <Card>
          <EmptyState
            icon="revenue"
            title={periodMode === "all" ? "조건에 맞는 딜이 없습니다" : "해당 기간 딜 없음"}
            description="기간·품목 필터를 넓히거나, 딜에 HW/SW 마커와 지역 태그를 채우면 히트맵이 살아납니다."
            action={<Button variant="outline" size="sm" onClick={() => { setPeriodMode("all"); setItemKey("all"); }}>필터 초기화</Button>}
            style={{ minHeight: 220, padding: "32px 12px" }}
          />
        </Card>
      ) : (
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="heatmap-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(260px, 340px)", gap: 20, padding: "var(--card-pad)" }}>
            <KoreaHeatmap
              rows={mapRows}
              selectedLabel={selected?.label ?? null}
              onSelect={r => setSelectedLabel(r.label)}
              metricKey={metricKey}
              metricLabel={metric.longLabel}
              linkedLabel={linkedLabel}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <RegionDetail row={selected} offMap={selectedOffMap} onJump={jumpToCustomer} />

              <div>
                <div className="eyebrow" style={{ fontSize: 10.5, letterSpacing: "0.06em", color: "var(--fg-dim)", textTransform: "uppercase", margin: "4px 2px 6px" }}>
                  고객 순위 · {sortedCustomers.length}개
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {sortedCustomers.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--fg-faint)", padding: "4px 2px" }}>표시할 고객이 없습니다.</div>
                  )}
                  {sortedCustomers.map((c, i) => (
                    <CustomerRankRow
                      key={c.name}
                      customer={c}
                      rank={i + 1}
                      max={maxCustomer}
                      metricKey={metricKey}
                      onSelect={() => setSelectedLabel(c.canonical || c.region || "지역 미상")}
                      onJump={jumpToCustomer}
                      onPeek={setLinkedLabel}
                    />
                  ))}
                </div>
              </div>

              {otherRows.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ fontSize: 10.5, letterSpacing: "0.06em", color: "var(--fg-dim)", textTransform: "uppercase", margin: "0 2px 6px" }}>
                    지도 외 · 지역 미상
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {otherRows.map(r => {
                      const isSelected = selected?.label === r.label;
                      return (
                        <button
                          key={r.region}
                          type="button"
                          className="mono"
                          onClick={() => setSelectedLabel(r.label)}
                          aria-pressed={isSelected}
                          style={{
                            fontSize: 10.5, cursor: "pointer",
                            color: isSelected ? "var(--fg)" : "var(--fg-muted)",
                            background: isSelected ? "var(--surface-3)" : "var(--surface-2)",
                            border: `1px solid ${isSelected ? "var(--moon-600)" : "var(--line-soft)"}`,
                            borderRadius: 999, padding: "3px 9px",
                          }}
                        >
                          {r.region} {fmtMoney(r[metricKey])}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <style>{`@media (max-width: 900px) { .heatmap-grid { grid-template-columns: 1fr !important; } }`}</style>
        </Card>
      )}
    </div>
  );
}
