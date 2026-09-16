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

// 값이 같으면 이전 객체를 돌려줘 재렌더를 막는다 — 경계에서 휠·핀치가 공회전할 때
function sameOrNext(prev, next) {
  return next.zoom === prev.zoom && next.panX === prev.panX && next.panY === prev.panY ? prev : next;
}

// 클라이언트 좌표 → 렌더 박스 내 비율(0~1). 호출 측이 rect.width/height > 0을 보장한다.
function boxFraction(clientX, clientY, rect) {
  return { fx: (clientX - rect.left) / rect.width, fy: (clientY - rect.top) / rect.height };
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
  const rowsByLabel = React.useMemo(() => new Map(rows.map(r => [r.label, r])), [rows]);
  const hoveredRow = hovered ? rowsByLabel.get(hovered) || null : null;
  // 툴팁 위치는 명령형 — 포인터 이동은 React 상태를 건드리지 않고 rAF당 1회 DOM만 갱신한다.
  // 상태가 바뀌는 순간은 hovered(어느 지역인지)가 바뀔 때뿐.
  const mousePosRef = React.useRef({ x: 0, y: 0 });
  const tooltipRef = React.useRef(null);
  const tooltipRafRef = React.useRef(0);
  const positionTooltip = () => {
    const el = tooltipRef.current;
    if (!el) return;
    const { x, y } = mousePosRef.current;
    el.style.left = `${x + 12}px`;
    el.style.top = `${Math.max(4, y - 116)}px`;
    // 우측 영역(x > 240)에선 왼쪽으로 플립
    el.style.transform = x > 240 ? "translateX(calc(-100% - 24px))" : "";
  };
  const scheduleTooltip = () => {
    if (!tooltipRef.current || tooltipRafRef.current) return;
    tooltipRafRef.current = window.requestAnimationFrame(() => {
      tooltipRafRef.current = 0;
      positionTooltip();
    });
  };
  // 마운트·지역 전환 시 페인트 전에 1회 배치 — 이후 추적은 rAF가 맡는다
  useIsoLayoutEffect(positionTooltip, [hoveredRow]);
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

  // 북→남 순차 리빌 — 데이터가 처음 도착했을 때 1회만. 이후 rows 교체(기간·품목 필터)는 즉시 전체 표시해
  // 값 전환이 fill 220ms 크로스페이드로만 보인다 (reduced-motion이면 항상 즉시).
  const revealOrder = React.useMemo(() => [...rows].sort((a, b) => a.y - b.y).map(r => r.label), [rows]);
  const [revealedCount, setRevealedCount] = React.useState(0);
  const revealStartedRef = React.useRef(false);
  React.useEffect(() => {
    if (reducedMotion || revealStartedRef.current) { setRevealedCount(Infinity); return; }
    if (revealOrder.length === 0) return; // 빈 rows는 1회 재생을 소모하지 않는다
    revealStartedRef.current = true;
    let finished = false;
    const timers = revealOrder.map((_, i) =>
      window.setTimeout(() => setRevealedCount(c => Math.max(c, i + 1)), i * 55));
    // 스윕 완료 시 Infinity로 승격 — 이후 rows가 바뀌어도 slice(0, Infinity)가 새 라벨 전체를 덮는다
    timers.push(window.setTimeout(() => { finished = true; setRevealedCount(Infinity); }, revealOrder.length * 55));
    return () => {
      timers.forEach(t => window.clearTimeout(t));
      // 중단된 스윕(StrictMode 리마운트 포함)은 미소모 처리 — 다음 실행이 남은 구간부터 이어 그린다
      if (!finished) revealStartedRef.current = false;
    };
  }, [revealOrder, reducedMotion]);
  const revealedSet = React.useMemo(() => new Set(revealOrder.slice(0, revealedCount)), [revealOrder, revealedCount]);
  // 데이터 리빌 스윕이 끝난 뒤 섀시(무데이터 지역 라벨)가 뒤따라 점등한다
  const chassisShown = revealedCount >= revealOrder.length;

  // 줌·팬 — 단일 view 상태, 저장 값은 항상 clampView를 거친다. 제스처는 rAF당 1회만 상태를 쓴다.
  const [view, setView] = React.useState({ zoom: 1, panX: 0, panY: 0 });
  const zoom = view.zoom;
  const visibleW = KOREA_PROVINCE_WIDTH / zoom;
  const visibleH = KOREA_PROVINCE_HEIGHT / zoom;
  const cp = { x: view.panX, y: view.panY };
  const viewBox = `${((KOREA_PROVINCE_WIDTH - visibleW) / 2 + cp.x).toFixed(2)} ${((KOREA_PROVINCE_HEIGHT - visibleH) / 2 + cp.y).toFixed(2)} ${visibleW.toFixed(2)} ${visibleH.toFixed(2)}`;
  const applyView = updater => setView(v => sameOrNext(v, updater(v)));
  const svgRef = React.useRef(null);
  const dragRef = React.useRef(null); // 단일 포인터 팬 { id, startX, startY, prevX, prevY, lastX, lastY, capturing }
  const pinchRef = React.useRef(null); // 두 포인터 핀치 { dist, mid } — 직전 프레임 기준
  const pointersRef = React.useRef(new Map()); // 활성 포인터 id → { x, y }
  const gestureRafRef = React.useRef(0);
  const touchTapAtRef = React.useRef(0); // 터치 탭 직후의 focus를 호버로 승격하지 않기 위한 타임스탬프
  // 프레임당 1회: 핀치(중점 이동=팬, 거리 비=줌) 또는 드래그 팬을 증분으로 반영.
  // 렌더 클로저 값은 쓰지 않는다(ref + 함수형 업데이트만) — rAF가 늦게 발화해도 stale 값이 없다.
  const flushGesture = () => {
    gestureRafRef.current = 0;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const pts = [...pointersRef.current.values()];
    if (pinchRef.current && pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const prev = pinchRef.current;
      pinchRef.current = { dist, mid };
      const { fx, fy } = boxFraction(mid.x, mid.y, rect);
      const dmx = mid.x - prev.mid.x;
      const dmy = mid.y - prev.mid.y;
      const ratio = dist / prev.dist;
      applyView(v => {
        const panned = clampView({
          zoom: v.zoom,
          panX: v.panX - dmx * (KOREA_PROVINCE_WIDTH / v.zoom / rect.width),
          panY: v.panY - dmy * (KOREA_PROVINCE_HEIGHT / v.zoom / rect.height),
        });
        return zoomViewAt(panned, panned.zoom * ratio, fx, fy);
      });
    } else if (dragRef.current) {
      const d = dragRef.current;
      const dx = d.lastX - d.prevX;
      const dy = d.lastY - d.prevY;
      d.prevX = d.lastX;
      d.prevY = d.lastY;
      if (dx === 0 && dy === 0) return;
      applyView(v => clampView({
        zoom: v.zoom,
        panX: v.panX - dx * (KOREA_PROVINCE_WIDTH / v.zoom / rect.width),
        panY: v.panY - dy * (KOREA_PROVINCE_HEIGHT / v.zoom / rect.height),
      }));
    }
  };
  const scheduleGesture = () => {
    if (gestureRafRef.current) return;
    gestureRafRef.current = window.requestAnimationFrame(flushGesture);
  };
  const capturePointer = id => {
    try { svgRef.current?.setPointerCapture(id); } catch { /* 이미 뗀 포인터 — 무시 */ }
  };
  const releasePointer = e => {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current && pointersRef.current.size < 2) {
      pinchRef.current = null;
      // 한 손가락만 남으면 팬으로 승계 (핀치 시작 때 이미 캡처된 포인터)
      const rest = [...pointersRef.current.entries()][0];
      if (rest) {
        const [id, p] = rest;
        dragRef.current = { id, startX: p.x, startY: p.y, prevX: p.x, prevY: p.y, lastX: p.x, lastY: p.y, capturing: true };
      }
    }
    if (dragRef.current && dragRef.current.id === e.pointerId) dragRef.current = null;
  };

  // 트랙패드 핀치(ctrl+wheel)·⌘+휠 줌 — React onWheel은 passive라 preventDefault가 막힌다. 네이티브로 부착하고
  // 수정키가 있을 때만 기본 동작을 막아 일반 휠은 페이지 스크롤로 남긴다.
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const { fx, fy } = boxFraction(e.clientX, e.clientY, rect);
      const dy = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY; // line 단위(Firefox 마우스 휠) 보정
      setView(v => sameOrNext(v, zoomViewAt(v, v.zoom * Math.exp(-dy * 0.005), fx, fy)));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);
  // 언마운트 시 미해소 rAF 정리
  React.useEffect(() => () => {
    window.cancelAnimationFrame(tooltipRafRef.current);
    window.cancelAnimationFrame(gestureRafRef.current);
  }, []);
  // 터치/좁은 화면 판정 — hub-tokens의 44px 터치 플로어와 동일 쿼리. 그 환경에선 26px 줌 버튼이 44px로
  // 커지므로 스택 배치만 바꾼다. 초기값 false는 SSR 마크업과 하이드레이션을 일치시키기 위함.
  const [compactControls, setCompactControls] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia?.("(pointer: coarse), (max-width: 720px)");
    if (!mq) return;
    const sync = () => setCompactControls(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

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
        mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        scheduleTooltip();
      }}
      onMouseLeave={() => {
        setHovered(null);
        // 캡처 전 팬 후보만 폐기 — 캡처된 드래그는 pointerup/cancel이 정리한다
        if (dragRef.current && !dragRef.current.capturing) dragRef.current = null;
      }}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{
          display: "block", width: "100%", height: "auto",
          cursor: zoom > 1 ? "grab" : "default",
          // 줌 1에선 세로 스크롤을 페이지에 넘기고, 줌인 뒤엔 제스처를 지도가 소유한다
          touchAction: zoom > 1 ? "none" : "pan-y",
        }}
        role="group"
        aria-label="대한민국 지역별 매출 히트맵"
        onPointerDown={e => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          if (e.pointerType === "touch") touchTapAtRef.current = Date.now();
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointersRef.current.size === 2) {
            // 두 번째 포인터 → 핀치 시작. 팬 후보는 폐기, 둘 다 캡처해 지도 밖 이동도 추적한다
            dragRef.current = null;
            const [a, b] = [...pointersRef.current.values()];
            pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
            pointersRef.current.forEach((_, id) => capturePointer(id));
          } else if (pointersRef.current.size === 1 && zoom > 1) {
            // 팬 후보 — 이동 임계 전엔 캡처하지 않아 클릭/탭(지역 선택)이 그대로 살아있다
            dragRef.current = {
              id: e.pointerId, startX: e.clientX, startY: e.clientY,
              prevX: e.clientX, prevY: e.clientY, lastX: e.clientX, lastY: e.clientY, capturing: false,
            };
          }
        }}
        onPointerMove={e => {
          const p = pointersRef.current.get(e.pointerId);
          if (p) { p.x = e.clientX; p.y = e.clientY; }
          if (pinchRef.current) { if (p) scheduleGesture(); return; }
          const d = dragRef.current;
          if (!d || d.id !== e.pointerId) return;
          if (e.pointerType === "mouse" && e.buttons === 0) { dragRef.current = null; return; } // svg 밖에서 버튼이 풀린 잔재
          d.lastX = e.clientX;
          d.lastY = e.clientY;
          if (!d.capturing) {
            const threshold = e.pointerType === "touch" ? DRAG_THRESHOLD_TOUCH : DRAG_THRESHOLD_MOUSE;
            if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < threshold) return;
            d.capturing = true;
            capturePointer(e.pointerId);
          }
          scheduleGesture();
        }}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerLeave={e => {
          // 캡처되지 않은 포인터가 svg를 벗어나면 등록 해제 — 고아 엔트리가 핀치 판정을 오염하지 않게
          const d = dragRef.current;
          if (pinchRef.current || (d && d.id === e.pointerId && d.capturing)) return;
          pointersRef.current.delete(e.pointerId);
          if (d && d.id === e.pointerId) dragRef.current = null;
        }}
        onDoubleClick={e => {
          // 더블클릭·더블탭: 원래 크기 ↔ 한 단계 확대(클릭 지점 앵커)
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect || rect.width === 0 || rect.height === 0) return;
          const { fx, fy } = boxFraction(e.clientX, e.clientY, rect);
          applyView(v => (v.zoom > 1 ? { zoom: 1, panX: 0, panY: 0 } : zoomViewAt(v, ZOOM_STEP, fx, fy)));
        }}
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
                    : "opacity var(--dur-enter) var(--ease-hub), fill var(--dur-enter) var(--ease-hub), stroke var(--dur-enter) var(--ease-hub), transform var(--dur-enter) var(--ease-hub), filter var(--dur-enter) var(--ease-hub)",
                  // 하이라이트가 먼저 켜지고 이웃이 반 박자 늦게 물러난다
                  transitionDelay: !reducedMotion && otherHovered ? "var(--stagger-step)" : "0s",
                }}
                role="button"
                tabIndex={0}
                aria-pressed={sel}
                aria-label={`${row.label} ${metricLabel} ${fmtMoney(value)}`}
                onClick={() => onSelect(row)}
                // 호버 카드·리프트는 마우스/펜 전용 — 터치는 탭→선택으로 우측 레일이 응답한다
                onPointerEnter={e => { if (e.pointerType !== "touch") setHovered(row.label); }}
                // 키보드 포커스는 호버와 동일하게 강조하되, 터치 탭이 만든 포커스는 제외(700ms 창)
                onFocus={() => { if (Date.now() - touchTapAtRef.current < 700) return; setHovered(row.label); }}
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
                    transition: "opacity var(--dur-enter) var(--ease-hub)",
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
                    : "opacity var(--dur-enter) var(--ease-hub), fill var(--dur-enter) var(--ease-hub)",
                  transitionDelay: !reducedMotion && otherHovered ? "var(--stagger-step)" : "0s",
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
            ref={tooltipRef}
            style={{
              // left/top/transform은 positionTooltip이 DOM에 직접 쓴다 — 여기 두면 재렌더가 되돌린다
              pointerEvents: "none", position: "absolute", zIndex: 30, width: 208,
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

      {/* 줌 컨트롤 — 헤어라인 분할 계기 스택. 데스크톱은 지도 위 우상단 오버레이(세로 3단).
          터치/좁은 화면은 44px 플로어로 커진 버튼이 지도·범례를 가리지 않도록 지도 아래 플로우에
          우측 정렬 가로 1열로 내려놓는다 — 범례 줄바꿈·지도 비율과 무관하게 겹침이 없다 */}
      <div style={{
        ...(compactControls
          ? { position: "static", width: "fit-content", marginLeft: "auto", marginTop: 8, flexDirection: "row" }
          : { position: "absolute", right: 8, top: 8, zIndex: 20, flexDirection: "column" }),
        display: "flex",
        background: "color-mix(in oklch, var(--surface-2) 92%, transparent)",
        backdropFilter: "blur(6px)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-sm)", padding: 2, overflow: "hidden",
      }}>
        {[
          { label: "+", aria: "확대", onClick: () => applyView(v => zoomViewAt(v, v.zoom * ZOOM_STEP, 0.5, 0.5)), disabled: zoom >= ZOOM_MAX },
          { label: "−", aria: "축소", onClick: () => applyView(v => zoomViewAt(v, v.zoom / ZOOM_STEP, 0.5, 0.5)), disabled: zoom <= ZOOM_MIN },
          { label: "↺", aria: "원래 크기", onClick: () => applyView(() => ({ zoom: 1, panX: 0, panY: 0 })), disabled: zoom === 1 && cp.x === 0 && cp.y === 0 },
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
              // 분할 헤어라인: 세로 스택은 위쪽, 가로 스택은 왼쪽
              borderTop: !compactControls && i > 0 ? "1px solid var(--line-soft)" : "none",
              borderLeft: compactControls && i > 0 ? "1px solid var(--line-soft)" : "none",
              borderRadius: 0, cursor: b.disabled ? "default" : "pointer",
              color: b.disabled ? "var(--fg-faint)" : "var(--fg-muted)",
              fontSize: 12.5, opacity: b.disabled ? 0.45 : 1,
              transition: reducedMotion ? "none" : "color var(--dur-hover) ease, opacity var(--dur-hover) ease",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* 램프 범례 — heatFill과 동일 공식의 이산 스텝 + 실측 최대값 + 커버리지 카운터.
          좁은 폭에서는 항목 단위로 줄바꿈한다(단어 중간 개행 금지) — 카운터는 auto 마진으로 우측 유지 */}
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, rowGap: 4, padding: "0 2px" }}>
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
