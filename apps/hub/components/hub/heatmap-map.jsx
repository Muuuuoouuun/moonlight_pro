"use client";

// 매출 히트맵의 지도 계기 — revenue-heatmap.jsx에서 분리 (시각/애니메이션 전용 파일).
// 데이터 계약: rows = [{ label, path, x, y, confirmed, pipeline, expected,
// dealsCount, wonCount, customers[], regions[] }] — 집계는 페이지가 담당한다.
// metricKey는 'confirmed' | 'pipeline' | 'expected' 셋 다 지원한다.

import React from "react";
import {
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_WIDTH,
  KOREA_PROVINCE_HEIGHT,
} from "@/lib/korea-province-map";

export const fmtMoney = v => {
  const n = Number(v) || 0;
  if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₩${(n / 1_000).toFixed(0)}K`;
  return n ? `₩${n}` : "₩0";
};

// 문스톤 단색 히트 램프 — 값이 클수록 moon-300 비중 상승 (토큰만 사용)
export function heatFill(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) {
    return "color-mix(in oklch, var(--moon-300) 8%, var(--surface-3))";
  }
  const t = Math.max(0, Math.min(1, value / max));
  const pct = Math.round(12 + t * 78);
  return `color-mix(in oklch, var(--moon-300) ${pct}%, var(--surface-3))`;
}

// 호버 시 fill — 뚝 반전하는 대신 값에 비례해 밝기를 끌어올린다 (moon-100 78–94%).
// 어느 값이든 잉크(--bg) 라벨이 읽히도록 항상 밝은 대역에 머문다.
function heatHoverFill(value, max) {
  const t = Number.isFinite(value) && Number.isFinite(max) && max > 0
    ? Math.max(0, Math.min(1, value / max))
    : 0;
  const pct = Math.round(78 + t * 16);
  return `color-mix(in oklch, var(--moon-100) ${pct}%, var(--surface-3))`;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.4;
const DRAG_THRESHOLD_MOUSE = 3; // px — 미만 이동은 클릭으로 취급 (지역 선택 보존)
const DRAG_THRESHOLD_TOUCH = 9; // px — 손가락 탭 지터 허용치
const RAMP_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1];

// 뷰(줌·팬) 클램프 — 팬은 현재 줌에서 지도 밖이 드러나지 않는 한계까지만. 저장 값은 항상 이 함수를 통과한다.
function clampView(v) {
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom));
  const maxPanX = (KOREA_PROVINCE_WIDTH - KOREA_PROVINCE_WIDTH / zoom) / 2;
  const maxPanY = (KOREA_PROVINCE_HEIGHT - KOREA_PROVINCE_HEIGHT / zoom) / 2;
  return {
    zoom,
    panX: Math.max(-maxPanX, Math.min(maxPanX, v.panX)),
    panY: Math.max(-maxPanY, Math.min(maxPanY, v.panY)),
  };
}

// 앵커 줌 — fx·fy(0~1, 렌더 박스 기준) 아래의 지도 좌표가 줌 전후 같은 화면 위치에 남도록 팬을 보정
function zoomViewAt(v, nextZoom, fx, fy) {
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));
  const dw = KOREA_PROVINCE_WIDTH / v.zoom - KOREA_PROVINCE_WIDTH / zoom;
  const dh = KOREA_PROVINCE_HEIGHT / v.zoom - KOREA_PROVINCE_HEIGHT / zoom;
  return clampView({ zoom, panX: v.panX + (fx - 0.5) * dw, panY: v.panY + (fy - 0.5) * dh });
}

// 툴팁은 페인트 전 배치가 필요 — SSR 렌더에서는 useLayoutEffect 경고를 피해 useEffect로 대체
const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

// 광역시 라벨 충돌 보정 (SVG 단위) — 데이터 유무와 무관하게 전체 라벨에 적용
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

// linkedLabel: 우측 레일(고객 순위·주요 고객)에서 호버된 지역 — 지도가 하이라이트로
// 응답해 두 계기가 연결돼 있음을 보여준다. 실제 마우스 호버(hovered)와 달리
// 리프트·툴팁 없이 밝기/디밍만 따라간다.
export function KoreaHeatmap({ rows, selectedLabel, onSelect, metricKey, metricLabel, linkedLabel = null }) {
  const [hovered, setHovered] = React.useState(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const rowsByLabel = React.useMemo(() => new Map(rows.map(r => [r.label, r])), [rows]);
  const hoveredRow = hovered ? rowsByLabel.get(hovered) || null : null;
  // 하이라이트 기준: 지도 위 마우스가 우선, 없으면 레일에서 연동된 지역
  const activeLabel = hovered ?? (linkedLabel && rowsByLabel.has(linkedLabel) ? linkedLabel : null);
  const max = React.useMemo(() => Math.max(1, ...rows.map(r => r[metricKey] || 0)), [rows, metricKey]);
  const dataCount = React.useMemo(() => rows.filter(r => (r[metricKey] || 0) > 0).length, [rows, metricKey]);
  const hasData = dataCount > 0;
  const reducedMotion = React.useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // 하이라이트된 지역을 마지막에 그려서 리프트 섀도가 이웃 스트로크 위에 얹히게 한다
  const orderedShapes = React.useMemo(() => {
    if (!activeLabel) return KOREA_PROVINCE_SHAPES;
    return [...KOREA_PROVINCE_SHAPES].sort((a, b) =>
      a.label === activeLabel ? 1 : b.label === activeLabel ? -1 : 0);
  }, [activeLabel]);

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
  // 데이터 리빌 스윕이 끝난 뒤 섀시(무데이터 지역 라벨)가 뒤따라 점등한다
  const chassisShown = revealedCount >= revealOrder.length;

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
        {/* 계기판 도트 그리드 — 미세 도트 + 성근 좌표 도트 2겹으로 계기 좌표감을 만든다 */}
        <defs>
          <pattern id="hm-dotgrid" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.14" fill="var(--line-soft)" />
          </pattern>
          <pattern id="hm-dotgrid-major" width="12.8" height="12.8" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.26" fill="var(--line)" />
          </pattern>
        </defs>
        <rect
          x={-KOREA_PROVINCE_WIDTH} y={-KOREA_PROVINCE_HEIGHT}
          width={KOREA_PROVINCE_WIDTH * 3} height={KOREA_PROVINCE_HEIGHT * 3}
          fill="url(#hm-dotgrid)" opacity={0.5}
        />
        <rect
          x={-KOREA_PROVINCE_WIDTH} y={-KOREA_PROVINCE_HEIGHT}
          width={KOREA_PROVINCE_WIDTH * 3} height={KOREA_PROVINCE_HEIGHT * 3}
          fill="url(#hm-dotgrid-major)" opacity={0.45}
        />
        {/* 기본 시도 실루엣 — 항상 켜져 있는 계기 섀시 */}
        <g>
          {KOREA_PROVINCE_SHAPES.map(s => (
            <path key={`base-${s.label}`} d={s.path} fill="var(--surface-2)" stroke="var(--line-soft)" strokeWidth={0.18} />
          ))}
        </g>
        {/* 히트 fill — 호버 시 값 비례 밝기 리프트 + 문스톤 스트로크 글로우 */}
        <g>
          {orderedShapes.map(s => {
            const row = rowsByLabel.get(s.label);
            if (!row) return null;
            const sel = selectedLabel === row.label;
            const hov = activeLabel === row.label; // 지도 호버 또는 레일 연동
            const lifted = hovered === row.label; // 물리 리프트는 실제 마우스 호버만
            const otherHovered = activeLabel !== null && !hov;
            const shown = revealedSet.has(row.label);
            const value = row[metricKey] || 0;
            return (
              <path
                key={`fill-${s.label}`}
                d={row.path}
                fill={hov ? heatHoverFill(value, max) : otherHovered ? "var(--surface-3)" : heatFill(value, max)}
                stroke={hov
                  ? "color-mix(in oklch, var(--moon-200) 85%, transparent)"
                  : sel ? "var(--moon-200)" : "var(--bg)"}
                strokeWidth={hov ? 0.32 : sel ? 0.3 : 0.15}
                opacity={shown ? (otherHovered ? 0.45 : 1) : 0}
                style={{
                  cursor: "pointer",
                  outline: "none",
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  transform: lifted && !reducedMotion ? "scale(1.02)" : "scale(1)",
                  filter: lifted
                    ? "drop-shadow(0 0 1.1px color-mix(in oklch, var(--moon-200) 45%, transparent)) drop-shadow(0 1.2px 1.6px color-mix(in oklch, var(--bg) 68%, transparent))"
                    : hov
                      ? "drop-shadow(0 0 1.1px color-mix(in oklch, var(--moon-200) 35%, transparent))"
                      : "none",
                  transition: reducedMotion
                    ? "none"
                    : "opacity 240ms ease-out, fill 220ms var(--ease-hub), stroke 220ms var(--ease-hub), transform 200ms var(--ease-hub), filter 200ms ease-out",
                  // 하이라이트가 먼저 켜지고 이웃이 반 박자 늦게 물러난다
                  transitionDelay: !reducedMotion && otherHovered ? "50ms" : "0ms",
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
        {/* 선택 지역 마커 — 펄스 링 + 고정 코어 (살아있는 계기 표식) */}
        {selectedLabel && rowsByLabel.get(selectedLabel) && (() => {
          const r = rowsByLabel.get(selectedLabel);
          const nudge = LABEL_NUDGE[r.label] || { dx: 0, dy: 0 };
          const mx = r.x + nudge.dx;
          const my = r.y + nudge.dy - 3;
          return (
            <g style={{ pointerEvents: "none" }}>
              <circle
                cx={mx} cy={my} r={1.5}
                fill="none"
                stroke="color-mix(in oklch, var(--moon-200) 70%, transparent)"
                strokeWidth={0.16}
                style={{ animation: reducedMotion ? "none" : "mlMoonPulse 1.4s ease-in-out infinite" }}
              />
              <circle cx={mx} cy={my} r={0.5} fill="var(--moon-100)" />
            </g>
          );
        })()}
        {/* 지역 라벨 — 전체 시도 표기. 데이터 있음=선명, 없음=섀시 톤, 호버=잉크 반전 */}
        <g style={{ pointerEvents: "none" }}>
          {KOREA_PROVINCE_SHAPES.map(s => {
            const row = rowsByLabel.get(s.label);
            const nudge = LABEL_NUDGE[s.label] || { dx: 0, dy: 0 };
            const x = s.x + nudge.dx;
            const y = s.y + 1 + nudge.dy;
            if (!row) {
              // 무데이터 지역 — 아주 작고 흐리게, 리빌 스윕이 끝난 뒤 점등
              const dimmed = activeLabel !== null;
              return (
                <text
                  key={`label-${s.label}`}
                  x={x} y={y}
                  textAnchor="middle"
                  style={{
                    fontSize: Math.max(1.4, 2.0 / Math.sqrt(zoom)),
                    fontWeight: 500,
                    fill: "var(--fg-faint)",
                    paintOrder: "stroke",
                    stroke: "var(--bg)",
                    strokeWidth: 0.24,
                    opacity: chassisShown ? (dimmed ? 0.3 : 0.8) : 0,
                    transition: "opacity 280ms ease-out",
                  }}
                >
                  {s.label}
                </text>
              );
            }
            const hov = activeLabel === row.label;
            const otherHovered = activeLabel !== null && !hov;
            return (
              <text
                key={`label-${s.label}`}
                x={x} y={y}
                textAnchor="middle"
                style={{
                  fontSize: Math.max(1.8, 2.6 / Math.sqrt(zoom)),
                  fontWeight: hov ? 700 : 600,
                  fill: hov ? "var(--bg)" : "var(--fg)",
                  paintOrder: "stroke",
                  stroke: hov ? "transparent" : "var(--bg)",
                  strokeWidth: 0.3,
                  opacity: revealedSet.has(row.label) ? (hov ? 1 : otherHovered ? 0.4 : 0.95) : 0,
                  transition: reducedMotion
                    ? "none"
                    : "opacity 240ms ease-out, fill 220ms var(--ease-hub)",
                  transitionDelay: !reducedMotion && otherHovered ? "50ms" : "0ms",
                }}
              >
                {row.label}
              </text>
            );
          })}
        </g>
      </svg>

      {/* 호버 요약 카드 — 지역명·지표값 + 구성 바(현재 지표 쪽 강조) + 1위 고객 */}
      {hoveredRow && (() => {
        const total = hoveredRow.confirmed + hoveredRow.pipeline;
        const confirmedPct = total > 0 ? (hoveredRow.confirmed / total) * 100 : 0;
        const top = hoveredRow.customers[0] || null;
        // metricKey가 pipeline이면 파이프라인 세그먼트를 강조 — 바의 의미가 지표를 따라간다
        const emphasizePipeline = metricKey === "pipeline";
        const emphColor = "var(--moon-300)";
        const mutedColor = "color-mix(in oklch, var(--moon-500) 40%, transparent)";
        return (
          <div
            key={hoveredRow.label}
            style={{
              pointerEvents: "none", position: "absolute", zIndex: 30, width: 208,
              left: mousePos.x + 12,
              top: Math.max(4, mousePos.y - 116),
              transform: mousePos.x > 240 ? "translateX(calc(-100% - 24px))" : undefined,
              background: "var(--elevated, var(--surface-3))",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
              padding: "10px 12px",
              boxShadow: "inset 1px 0 0 var(--moon-300), var(--shadow-pop)",
              animation: reducedMotion ? "none" : "hubFadeIn var(--dur-overlay) ease-out",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{hoveredRow.label}</span>
              <span className="num" style={{ fontSize: 13, fontWeight: 650, color: "var(--moon-200)" }}>
                {fmtMoney(hoveredRow[metricKey] || 0)}
              </span>
            </div>
            {/* 확정 vs 파이프라인 구성 바 — 현재 지표 세그먼트가 밝다 */}
            <div style={{ display: "flex", gap: 1, height: 4, borderRadius: 999, overflow: "hidden", margin: "8px 0 6px", background: "var(--surface-2)" }}>
              <span style={{ width: `${confirmedPct}%`, background: emphasizePipeline ? mutedColor : emphColor }} />
              <span style={{ width: `${total > 0 ? 100 - confirmedPct : 0}%`, background: emphasizePipeline ? emphColor : mutedColor }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 10.5, color: emphasizePipeline ? "var(--fg-faint)" : "var(--fg-muted)" }}>확정</span>
                <span className="mono" style={{ fontSize: 12, color: emphasizePipeline ? "var(--fg-faint)" : "var(--fg)" }}>
                  {fmtMoney(hoveredRow.confirmed)}
                </span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 10.5, color: emphasizePipeline ? "var(--fg-muted)" : "var(--fg-faint)" }}>예정</span>
                <span className="mono" style={{ fontSize: 12, color: emphasizePipeline ? "var(--fg)" : "var(--fg-faint)" }}>
                  {fmtMoney(hoveredRow.pipeline)}
                </span>
              </span>
            </div>
            {top && (
              <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid var(--line-soft)", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 10.5, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  1위 {top.name}
                </span>
                <span className="num" style={{ fontSize: 12, fontWeight: 600, color: "var(--moon-200)", flexShrink: 0 }}>{fmtMoney(top.expected)}</span>
              </div>
            )}
            <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", marginTop: 6 }}>
              딜 {hoveredRow.wonCount}/{hoveredRow.dealsCount}건 · 고객 {hoveredRow.customers.length}개 · 클릭하면 상세
            </div>
          </div>
        );
      })()}

      {/* 줌 컨트롤 — 헤어라인 분할 계기 스택 */}
      <div style={{
        position: "absolute", right: 8, top: 8, zIndex: 20,
        display: "flex", flexDirection: "column",
        background: "color-mix(in oklch, var(--surface-2) 92%, transparent)",
        backdropFilter: "blur(6px)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-sm)", padding: 2, overflow: "hidden",
      }}>
        {[
          { label: "+", aria: "확대", onClick: () => applyZoom(zoom * ZOOM_STEP), disabled: zoom >= ZOOM_MAX },
          { label: "−", aria: "축소", onClick: () => applyZoom(zoom / ZOOM_STEP), disabled: zoom <= ZOOM_MIN },
          { label: "↺", aria: "원래 크기", onClick: () => { setZoom(1); setPan({ x: 0, y: 0 }); }, disabled: zoom === 1 && pan.x === 0 && pan.y === 0 },
        ].map((b, i) => (
          <button
            key={b.aria}
            type="button"
            className="mono"
            aria-label={b.aria}
            title={b.aria}
            onClick={b.onClick}
            disabled={b.disabled}
            style={{
              width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none",
              borderTop: i > 0 ? "1px solid var(--line-soft)" : "none",
              borderRadius: 0, cursor: b.disabled ? "default" : "pointer",
              color: b.disabled ? "var(--fg-faint)" : "var(--fg-muted)",
              fontSize: 12.5, opacity: b.disabled ? 0.45 : 1,
              transition: reducedMotion ? "none" : "color 120ms ease, opacity 120ms ease",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* 램프 범례 — heatFill과 동일 공식의 이산 스텝 + 실측 최대값 + 커버리지 카운터 */}
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.02em", color: "var(--fg-dim)", whiteSpace: "nowrap" }}>
          {metricLabel}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>낮음</span>
        <div style={{ display: "flex", gap: 1 }} aria-hidden="true">
          {RAMP_STEPS.map(t => (
            <span
              key={t}
              style={{
                width: 13, height: 4,
                background: heatFill(t * max, max),
                borderRadius: t === 0 ? "999px 0 0 999px" : t === 1 ? "0 999px 999px 0" : 0,
              }}
            />
          ))}
        </div>
        {hasData ? (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>{fmtMoney(max)}</span>
        ) : (
          <span style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>높음</span>
        )}
        <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--fg-faint)" }}>
          {dataCount}/{KOREA_PROVINCE_SHAPES.length} 지역{zoom !== 1 ? ` · ×${zoom.toFixed(1)}` : ""}
        </span>
      </div>
    </div>
  );
}
