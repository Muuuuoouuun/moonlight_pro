"use client";

// 고객별 매출 히트맵 — classinkr-web /admin/branch BranchRegionHeatmap 구조 포팅.
// 지도(지역 히트) + 우측 레일(선택 지역 상세 · 고객 순위 · 지도 외) 구성을 유지하되
// Moonlight 토큰으로 번역했다: 히트 램프는 문스톤 단색(color-mix), 서피스·라인 토큰만 사용.
// 지표는 확정(클로징)과 예상(확정+파이프라인) — 목표/달성률 개념은 미정이라 만들지 않는다.

import React from "react";
import { Card, Button, SyncBadge, SegmentedControl, EmptyState, IconButton } from "../hub-primitives";
import { useRevenueLedger } from "./revenue";
import {
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_BY_LABEL,
  KOREA_PROVINCE_WIDTH,
  KOREA_PROVINCE_HEIGHT,
} from "@/lib/korea-province-map";

const fmtMoney = v => {
  const n = Number(v) || 0;
  if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₩${(n / 1_000).toFixed(0)}K`;
  return n ? `₩${n}` : "₩0";
};

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

// ── 문스톤 히트 램프 ─────────────────────────────────────────────────────────
// 값이 클수록 moon-300 비중이 올라가는 단색 램프 — 다크 네이티브에서 지도 fill로
// 안전하고, DESIGN.md의 금지 색(green/purple/warm gold)을 쓰지 않는다.

function heatFill(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) {
    return "color-mix(in oklch, var(--moon-300) 8%, var(--surface-3))";
  }
  const t = Math.max(0, Math.min(1, value / max));
  const pct = Math.round(12 + t * 78); // 12%..90%
  return `color-mix(in oklch, var(--moon-300) ${pct}%, var(--surface-3))`;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.4;

// 광역시 라벨이 둘러싼 도(道) 라벨과 겹치지 않게 센트로이드에서 밀어내는 보정 (SVG 단위)
const LABEL_NUDGE = {
  "서울": { dx: -3.5, dy: -2 },
  "인천": { dx: -4, dy: -1.5 },
  "세종": { dx: -1, dy: -3 },
  "대전": { dx: 0, dy: 3 },
  "광주": { dx: -3, dy: 0 },
  "대구": { dx: 0, dy: -1.5 },
  "울산": { dx: 2.5, dy: -1 },
  "부산": { dx: 1.5, dy: 2 },
};

// ── 지도 ─────────────────────────────────────────────────────────────────────

function KoreaHeatmap({ rows, selectedLabel, onSelect, metricKey, metricLabel }) {
  const [hovered, setHovered] = React.useState(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const rowsByLabel = React.useMemo(() => new Map(rows.map(r => [r.label, r])), [rows]);
  const hoveredRow = hovered ? rowsByLabel.get(hovered) || null : null;
  const max = React.useMemo(() => Math.max(1, ...rows.map(r => r[metricKey] || 0)), [rows, metricKey]);
  const reducedMotion = React.useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // 호버된 지역을 마지막에 그려서 리프트 섀도가 이웃 스트로크 위에 얹히게 한다
  const orderedShapes = React.useMemo(() => {
    if (!hovered) return KOREA_PROVINCE_SHAPES;
    return [...KOREA_PROVINCE_SHAPES].sort((a, b) =>
      a.label === hovered ? 1 : b.label === hovered ? -1 : 0);
  }, [hovered]);

  // 북→남 순차 리빌 (reduced-motion이면 즉시 표시)
  const revealOrder = React.useMemo(() => [...rows].sort((a, b) => a.y - b.y).map(r => r.label), [rows]);
  const [revealedCount, setRevealedCount] = React.useState(0);
  React.useEffect(() => {
    if (reducedMotion) { setRevealedCount(revealOrder.length); return; }
    setRevealedCount(0);
    const timers = revealOrder.map((_, i) =>
      window.setTimeout(() => setRevealedCount(c => Math.max(c, i + 1)), i * 55));
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [revealOrder, reducedMotion]);
  const revealedSet = React.useMemo(() => new Set(revealOrder.slice(0, revealedCount)), [revealOrder, revealedCount]);

  // 줌·팬
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const visibleW = KOREA_PROVINCE_WIDTH / zoom;
  const visibleH = KOREA_PROVINCE_HEIGHT / zoom;
  const maxPanX = (KOREA_PROVINCE_WIDTH - visibleW) / 2;
  const maxPanY = (KOREA_PROVINCE_HEIGHT - visibleH) / 2;
  const cp = {
    x: Math.max(-maxPanX, Math.min(maxPanX, pan.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, pan.y)),
  };
  const viewBox = `${((KOREA_PROVINCE_WIDTH - visibleW) / 2 + cp.x).toFixed(2)} ${((KOREA_PROVINCE_HEIGHT - visibleH) / 2 + cp.y).toFixed(2)} ${visibleW.toFixed(2)} ${visibleH.toFixed(2)}`;
  const dragRef = React.useRef(null);
  const svgRef = React.useRef(null);
  const pxToSvg = (dx) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return dx * (visibleW / rect.width);
  };
  const applyZoom = (next) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    if (clamped === 1) setPan({ x: 0, y: 0 });
    setZoom(clamped);
  };

  return (
    <div
      style={{
        position: "relative", width: "100%", overflow: "hidden",
        borderRadius: "var(--r-sm)", padding: 8,
        // 지도는 카드보다 한 단계 어두운 캔버스에 얹어 계기판 깊이를 만든다
        background: "var(--bg)",
        border: "1px solid var(--line-soft)",
      }}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => { setHovered(null); dragRef.current = null; }}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: "auto", cursor: zoom > 1 ? "grab" : "default" }}
        role="group"
        aria-label="대한민국 지역별 매출 히트맵"
        onMouseDown={e => {
          if (zoom <= 1) return;
          dragRef.current = { startX: e.clientX, startY: e.clientY, panX: cp.x, panY: cp.y };
        }}
        onMouseMoveCapture={e => {
          const d = dragRef.current;
          if (!d) return;
          setPan({ x: d.panX - pxToSvg(e.clientX - d.startX), y: d.panY - pxToSvg(e.clientY - d.startY) });
        }}
        onMouseUp={() => { dragRef.current = null; }}
      >
        {/* 계기판 도트 그리드 텍스처 — 바다 영역에 깔리는 미세 좌표감 */}
        <defs>
          <pattern id="hm-dotgrid" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.16" fill="var(--line-soft)" />
          </pattern>
        </defs>
        <rect
          x={-KOREA_PROVINCE_WIDTH} y={-KOREA_PROVINCE_HEIGHT}
          width={KOREA_PROVINCE_WIDTH * 3} height={KOREA_PROVINCE_HEIGHT * 3}
          fill="url(#hm-dotgrid)" opacity={0.55}
        />
        {/* 기본 시도 실루엣 */}
        <g>
          {KOREA_PROVINCE_SHAPES.map(s => (
            <path key={`base-${s.label}`} d={s.path} fill="var(--surface-2)" stroke="var(--line-soft)" strokeWidth={0.18} />
          ))}
        </g>
        {/* 히트 fill — 호버 시 색 반전(문스톤 하이라이트) + 리프트 */}
        <g>
          {orderedShapes.map(s => {
            const row = rowsByLabel.get(s.label);
            if (!row) return null;
            const sel = selectedLabel === row.label;
            const hov = hovered === row.label;
            const otherHovered = hovered !== null && !hov;
            const shown = revealedSet.has(row.label);
            const value = row[metricKey] || 0;
            return (
              <path
                key={`fill-${s.label}`}
                d={row.path}
                fill={hov ? "var(--moon-100)" : otherHovered ? "var(--surface-3)" : heatFill(value, max)}
                stroke={hov ? "var(--moon-300)" : sel ? "var(--moon-200)" : "var(--bg)"}
                strokeWidth={hov ? 0.35 : sel ? 0.3 : 0.15}
                opacity={shown ? (otherHovered ? 0.4 : 1) : 0}
                style={{
                  cursor: "pointer",
                  outline: "none",
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  transform: hov && !reducedMotion ? "scale(1.035)" : "scale(1)",
                  filter: hov ? "drop-shadow(0 1.4px 1.8px oklch(0 0 0 / 0.55))" : "none",
                  transition: reducedMotion
                    ? "opacity 280ms ease-out"
                    : "opacity 280ms ease-out, fill 160ms ease-out, transform 180ms ease-out, filter 180ms ease-out",
                }}
                role="button"
                tabIndex={0}
                aria-label={`${row.label} ${metricLabel} ${fmtMoney(value)}`}
                onClick={() => onSelect(row)}
                onMouseEnter={() => setHovered(row.label)}
                onFocus={() => setHovered(row.label)}
                onBlur={() => setHovered(null)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row); } }}
              >
                <title>{`${row.label}: ${fmtMoney(value)}`}</title>
              </path>
            );
          })}
        </g>
        {/* 선택 지역 센트로이드 펄스 — 살아있는 계기 표식 */}
        {selectedLabel && rowsByLabel.get(selectedLabel) && (() => {
          const r = rowsByLabel.get(selectedLabel);
          const nudge = LABEL_NUDGE[r.label] || { dx: 0, dy: 0 };
          return (
            <circle
              cx={r.x + nudge.dx}
              cy={r.y + nudge.dy - 3}
              r={0.9}
              fill="var(--moon-200)"
              style={{ pointerEvents: "none", animation: reducedMotion ? "none" : "mlMoonPulse 1.4s ease-in-out infinite" }}
            />
          );
        })()}
        {/* 지역 라벨 — 호버된 지역은 밝은 fill 위라 잉크를 반전 */}
        <g style={{ pointerEvents: "none" }}>
          {rows.map(r => {
            const hov = hovered === r.label;
            const otherHovered = hovered !== null && !hov;
            const nudge = LABEL_NUDGE[r.label] || { dx: 0, dy: 0 };
            return (
              <text
                key={`label-${r.label}`}
                x={r.x + nudge.dx}
                y={r.y + 1 + nudge.dy}
                textAnchor="middle"
                style={{
                  fontSize: Math.max(1.8, 2.6 / Math.sqrt(zoom)),
                  fontWeight: hov ? 700 : 600,
                  fill: hov ? "var(--bg)" : "var(--fg)",
                  paintOrder: "stroke",
                  stroke: hov ? "transparent" : "var(--bg)",
                  strokeWidth: 0.3,
                  opacity: revealedSet.has(r.label) ? (otherHovered ? 0.4 : 0.95) : 0,
                  transition: "opacity 280ms ease-out, fill 160ms ease-out",
                }}
              >
                {r.label}
              </text>
            );
          })}
        </g>
      </svg>

      {/* 호버 요약 카드 — 지역명·지표값 + 확정/파이프라인 구성 바 + 1위 고객 */}
      {hoveredRow && (() => {
        const total = hoveredRow.confirmed + hoveredRow.pipeline;
        const confirmedPct = total > 0 ? (hoveredRow.confirmed / total) * 100 : 0;
        const top = hoveredRow.customers[0] || null;
        return (
          <div style={{
            pointerEvents: "none", position: "absolute", zIndex: 30, width: 196,
            left: mousePos.x + 12,
            top: Math.max(4, mousePos.y - 112),
            transform: mousePos.x > 240 ? "translateX(calc(-100% - 24px))" : undefined,
            background: "var(--elevated, var(--surface-3))",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)",
            padding: "10px 12px",
            boxShadow: "inset 2px 0 0 var(--moon-300), 0 8px 24px -8px oklch(0 0 0 / 0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{hoveredRow.label}</span>
              <span className="num" style={{ fontSize: 13, fontWeight: 700, color: "var(--moon-200)" }}>
                {fmtMoney(hoveredRow[metricKey])}
              </span>
            </div>
            {/* 확정 vs 파이프라인 구성 바 */}
            <div style={{ display: "flex", height: 4, borderRadius: 999, overflow: "hidden", margin: "7px 0 5px", background: "var(--surface-2)" }}>
              <span style={{ width: `${confirmedPct}%`, background: "var(--moon-300)" }} />
              <span style={{ flex: 1, background: "color-mix(in oklch, var(--moon-500) 45%, transparent)" }} />
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-muted)", display: "flex", justifyContent: "space-between" }}>
              <span>확정 {fmtMoney(hoveredRow.confirmed)}</span>
              <span style={{ color: "var(--fg-faint)" }}>예정 {fmtMoney(hoveredRow.pipeline)}</span>
            </div>
            {top && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--line-soft)", display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 10.5, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  1위 {top.name}
                </span>
                <span className="num" style={{ fontSize: 10.5, fontWeight: 600, color: "var(--moon-200)", flexShrink: 0 }}>{fmtMoney(top.expected)}</span>
              </div>
            )}
            <div className="mono" style={{ fontSize: 10, color: "var(--fg-faint)", marginTop: 4 }}>
              딜 {hoveredRow.wonCount}/{hoveredRow.dealsCount}건 · 고객 {hoveredRow.customers.length}개 · 클릭하면 상세
            </div>
          </div>
        );
      })()}

      {/* 줌 컨트롤 */}
      <div style={{
        position: "absolute", right: 8, top: 8, zIndex: 20,
        display: "flex", flexDirection: "column", gap: 2,
        background: "var(--surface-2)", border: "1px solid var(--line)",
        borderRadius: "var(--r-sm)", padding: 2,
      }}>
        {[
          { label: "+", aria: "확대", onClick: () => applyZoom(zoom * ZOOM_STEP), disabled: zoom >= ZOOM_MAX },
          { label: "−", aria: "축소", onClick: () => applyZoom(zoom / ZOOM_STEP), disabled: zoom <= ZOOM_MIN },
          { label: "↺", aria: "원래 크기", onClick: () => { setZoom(1); setPan({ x: 0, y: 0 }); }, disabled: zoom === 1 && pan.x === 0 && pan.y === 0 },
        ].map(b => (
          <button
            key={b.aria}
            type="button"
            aria-label={b.aria}
            title={b.aria}
            onClick={b.onClick}
            disabled={b.disabled}
            style={{
              width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", borderRadius: 4, cursor: "pointer",
              color: "var(--fg-muted)", fontSize: 13, opacity: b.disabled ? 0.35 : 1,
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* 램프 범례 */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "0 2px", fontSize: 10.5, color: "var(--fg-dim)" }}>
        <span>{metricLabel}</span>
        <div style={{
          height: 3, width: 112, borderRadius: 999,
          background: "linear-gradient(90deg, color-mix(in oklch, var(--moon-300) 12%, var(--surface-3)), color-mix(in oklch, var(--moon-300) 90%, var(--surface-3)))",
        }} />
        <span style={{ color: "var(--fg-faint)" }}>낮음</span>
        <span style={{ marginLeft: "auto", color: "var(--fg-faint)" }}>높음</span>
      </div>
    </div>
  );
}

// ── 우측 레일 ────────────────────────────────────────────────────────────────

function RegionDetail({ row }) {
  if (!row) {
    return <div style={{ fontSize: 12, color: "var(--fg-faint)", padding: "6px 2px" }}>지역을 선택하거나 호버하면 상세가 표시됩니다.</div>;
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 10, borderBottom: "1px solid var(--line-soft)" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{row.label}</div>
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
            <span style={{ width: `${pct}%`, background: "var(--moon-300)" }} />
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
          {row.customers.slice(0, 5).map(c => (
            <div key={c.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "baseline", padding: "3px 0" }}>
              <span style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
              <span className="num" style={{ fontSize: 11, fontWeight: 600, color: "var(--moon-200)" }}>{fmtMoney(c.expected)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerRankRow({ customer, rank, max, metricKey, onSelect, onJump }) {
  const value = customer[metricKey] || 0;
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="hub-row"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
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
        <div style={{ height: "100%", width: `${pct}%`, background: heatFill(value, max), borderRadius: 999 }} />
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

// ── 집계 ─────────────────────────────────────────────────────────────────────

const PERIODS = [
  { key: "all", label: "전체", days: null },
  { key: "90d", label: "최근 90일", days: 90 },
  { key: "30d", label: "최근 30일", days: 30 },
];
const ITEM_FILTERS = [
  { key: "all", label: "전체" },
  { key: "hw", label: "HW" },
  { key: "sw", label: "SW" },
];
const METRICS = [
  { key: "expected", label: "예상 (확정+파이프라인)" },
  { key: "confirmed", label: "확정" },
];

function aggregate(ledger, { period, item }) {
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

  const cutoff = period.days ? Date.now() - period.days * 86400000 : null;
  const regionAgg = new Map(); // canonical|미상 → agg
  const customerAgg = new Map(); // name → agg
  let matchedDeals = 0;

  (ledger.deals || []).forEach(d => {
    if (d.stage === "lost") return;
    if (item !== "all" && dealItemType(d.name) !== item) return;
    if (cutoff) {
      const at = new Date(d.closeAt || d.activityAt || 0).getTime();
      if (!Number.isFinite(at) || at < cutoff) return;
    }
    matchedDeals += 1;

    const lead = d.leadId ? leadById.get(d.leadId) : null;
    const rawRegion = lead?.region || (d.companyId ? regionByCompany.get(d.companyId) : null) || "";
    const canonical = canonicalRegion(rawRegion);
    const regionKey = canonical || (rawRegion ? rawRegion : "지역 미상");
    const customer = (d.companyId && companyName.get(d.companyId)) || lead?.name || d.name;
    const won = d.stage === "closing";
    const amount = Number(d.value) || 0;

    const r = regionAgg.get(regionKey) || {
      region: regionKey, canonical, confirmed: 0, pipeline: 0, expected: 0,
      dealsCount: 0, wonCount: 0, customers: new Map(),
    };
    r.dealsCount += 1;
    if (won) { r.confirmed += amount; r.wonCount += 1; } else { r.pipeline += amount; }
    r.expected = r.confirmed + r.pipeline;
    const rc = r.customers.get(customer) || { name: customer, confirmed: 0, pipeline: 0, expected: 0 };
    if (won) rc.confirmed += amount; else rc.pipeline += amount;
    rc.expected = rc.confirmed + rc.pipeline;
    r.customers.set(customer, rc);
    regionAgg.set(regionKey, r);

    const c = customerAgg.get(customer) || {
      name: customer, region: regionKey === "지역 미상" ? null : regionKey, canonical,
      confirmed: 0, pipeline: 0, expected: 0, dealsCount: 0, jumpKey: null,
    };
    c.dealsCount += 1;
    if (won) c.confirmed += amount; else c.pipeline += amount;
    c.expected = c.confirmed + c.pipeline;
    if (!c.jumpKey) {
      const accountId = d.companyId ? accountIdByCompany.get(d.companyId) : null;
      c.jumpKey = accountId ? `account:${accountId}` : d.leadId ? `lead:${d.leadId}` : null;
    }
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
      otherRows.push(finished);
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
  const [periodKey, setPeriodKey] = React.useState("all");
  const [itemKey, setItemKey] = React.useState("all");
  const [metricKey, setMetricKey] = React.useState("expected");
  const [selectedLabel, setSelectedLabel] = React.useState(null);

  const period = PERIODS.find(p => p.key === periodKey) || PERIODS[0];
  const { mapRows, otherRows, customers, matchedDeals } = React.useMemo(
    () => aggregate(ledger, { period, item: itemKey }),
    [ledger, period, itemKey],
  );

  const metric = METRICS.find(m => m.key === metricKey) || METRICS[0];
  const sortedCustomers = React.useMemo(
    () => [...customers].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0)).filter(c => (c[metricKey] || 0) > 0),
    [customers, metricKey],
  );
  const maxCustomer = Math.max(1, ...sortedCustomers.map(c => c[metricKey] || 0));
  const selected = mapRows.find(r => r.label === selectedLabel) || mapRows[0] || null;
  const totalValue = mapRows.reduce((s, r) => s + (r[metricKey] || 0), 0) +
    otherRows.reduce((s, r) => s + (r[metricKey] || 0), 0);

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>매출 히트맵</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            고객·지역별 {metric.label} · 딜 {matchedDeals}건 · 합계 <span className="num">{fmtMoney(totalValue)}</span>
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl className="hub-toolbar" label="기간" options={PERIODS} value={periodKey} onChange={setPeriodKey} />
        <SegmentedControl className="hub-toolbar" label="품목" options={ITEM_FILTERS} value={itemKey} onChange={setItemKey} />
        <SegmentedControl
          className="hub-toolbar"
          label="지표"
          options={[{ key: "expected", label: "예상" }, { key: "confirmed", label: "확정" }]}
          value={metricKey}
          onChange={setMetricKey}
        />
      </div>

      {matchedDeals === 0 ? (
        <Card>
          <EmptyState
            icon="revenue"
            title="조건에 맞는 딜이 없습니다"
            description="기간·품목 필터를 넓히거나, 딜에 HW/SW 마커와 지역 태그를 채우면 히트맵이 살아납니다."
            action={<Button variant="outline" size="sm" onClick={() => { setPeriodKey("all"); setItemKey("all"); }}>필터 초기화</Button>}
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
              metricLabel={metric.key === "expected" ? "예상 매출" : "확정 매출"}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <RegionDetail row={selected} />

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
                      onSelect={() => { if (c.canonical) setSelectedLabel(c.canonical); }}
                      onJump={onNavigate ? (key) => onNavigate(`dashboard/revenue/customers?customer=${encodeURIComponent(key)}`) : null}
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
                    {otherRows.map(r => (
                      <span key={r.region} className="mono" style={{
                        fontSize: 10.5, color: "var(--fg-muted)",
                        background: "var(--surface-2)", border: "1px solid var(--line-soft)",
                        borderRadius: 999, padding: "3px 9px",
                      }}>
                        {r.region} {fmtMoney(r[metricKey])}
                      </span>
                    ))}
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
