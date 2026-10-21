// 제품 탭 계기 — 12a-1 포트폴리오와 12d 제품 상세가 읽는 숫자·선·건강·링크·단계 이력
// (2026-10-21 운영자 "D 첫 화면 + 12a-1 보기 + 상세 12d", 목업 docs/design-studies/2026-10-21-product-tab-options).
// 원천은 제품 원장에 이미 있는 값뿐이다: 월 숫자(product_monthly_metrics 최근 6개월), 저장소 요약, 문의, stage_history.
// 모르는 값은 null — 0으로 채우지 않는다. 가동 체크·에러 수집처럼 원천이 없는 것은 "연결 전"으로 말한다.

import { BUILDING_STAGES, monthNumbers, orderProducts, portfolioSummary, productBlocker, productMode, productOps, productStageLabel, seoulDay } from "./product-catalog.js";
import { productDevRow, sinceLabel } from "./product-dev-summary.js";

// 동시에 MVP·출시·성장인 제품 상한(§12-5, Engine이 거절한다).
export const FOCUS_LIMIT = 3;

export const monthShort = (month) => `${Number(String(month).slice(5, 7))}월`;

export function productSeries(product, months) {
  return months.map((month) => monthNumbers(product, month));
}

// 포트폴리오 달별 합 — 포트폴리오 요약과 같은 규칙(아는 값만 더함, 종료 제품의 사용자는 뺌). 아는 제품이 없으면 null.
export function portfolioSeries(products, months) {
  return months.map((month) => {
    const summary = portfolioSummary(products, [], month);
    return {
      month,
      activeUsers: summary.users,
      revenue: summary.moneyKnown ? summary.revenue : null,
      cost: summary.moneyKnown ? summary.cost : null,
      net: summary.net,
    };
  });
}

// back칸 전 대비 % — 두 값을 다 알고 기준이 0보다 클 때만. 모르면 null(“—”가 아니라 표시하지 않음).
export function percentChange(values, back) {
  const last = values[values.length - 1];
  const base = values[values.length - 1 - back];
  if (!Number.isFinite(last) || !Number.isFinite(base) || base <= 0) return null;
  return Math.round(((last - base) / base) * 100);
}

export function changeLabel(percent, span) {
  if (percent === null) return null;
  const mark = percent > 0 ? "▲" : percent < 0 ? "▼" : "＝";
  return `${mark} ${Math.abs(percent)}% · ${span}`;
}

// 그래프의 접근 가능한 이름 — 달마다 값을 읽는다. 모르는 달은 "모름".
export function monthlyLabel(title, months, values, format) {
  return `${title} ${months.map((month, index) => `${monthShort(month)} ${Number.isFinite(values[index]) ? format(values[index]) : "모름"}`).join(", ")}`;
}

const round = (value) => Math.round(value * 10) / 10;

// 추세선 좌표(오래된 달 → 이번 달). 모르는 달은 점을 찍지 않고 아는 점끼리 잇는다.
// 아는 값이 없거나 모두 0이면 empty — 화면은 점선 바닥선만 그린다. end는 이번 달 값을 알 때만 있다.
export function trendGeometry(values, { width, height, padX = 3, padY = 4 }) {
  const floorY = height - padY;
  const known = values.map((value, index) => [index, value]).filter(([, value]) => Number.isFinite(value));
  const max = Math.max(0, ...known.map(([, value]) => value));
  if (!known.length || max <= 0) return { empty: true, floorY };
  const step = values.length > 1 ? (width - padX * 2) / (values.length - 1) : 0;
  const x = (index) => round(padX + index * step);
  const y = (value) => round(padY + (1 - Math.max(0, value) / max) * (floorY - padY));
  const points = known.map(([index, value]) => [x(index), y(value)]);
  const line = points.map((point) => point.join(",")).join(" ");
  const last = values.length - 1;
  return {
    empty: false,
    floorY,
    points,
    line,
    area: `${points[0][0]},${floorY} ${line} ${points[points.length - 1][0]},${floorY}`,
    end: Number.isFinite(values[last]) ? { x: x(last), y: y(values[last]) } : null,
  };
}

// 막대 높이(%) — 가장 큰 값 = 100. 모르는 달은 null(빈 자리), 0은 바닥 한 줄.
export function barHeights(values) {
  const max = Math.max(0, ...values.filter(Number.isFinite));
  return values.map((value) => (Number.isFinite(value) ? (max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2) : null));
}

// 손익 막대 — 막대 = 매출, 그 안 아래쪽 빗금 = 비용. 같은 눈금(둘 중 큰 값)으로 잰다.
export function profitColumns(series) {
  const max = Math.max(0, ...series.flatMap((row) => [row.revenue, row.cost]).filter(Number.isFinite));
  const pct = (value) => (Number.isFinite(value) && max > 0 ? Math.round((value / max) * 100) : null);
  return series.map((row) => ({ month: row.month, revenue: pct(row.revenue), cost: pct(row.cost), known: row.net !== null }));
}

// 모드 구성(사용 중 칸) — 목록 순서대로 제품마다 한 칸, 그리고 모드별 수.
export function modeComposition(products) {
  const cells = orderProducts(products).map((product) => ({ id: product.id, mode: productMode(product).value }));
  const counts = { live: 0, dev: 0, idea: 0, paused: 0, ended: 0 };
  for (const cell of cells) counts[cell.mode] += 1;
  return { cells, counts };
}

// 집중 구간 — MVP·출시·성장(종료 단계 제외). 상한 3개.
export function focusProducts(products) {
  return orderProducts(products).filter((product) => BUILDING_STAGES.has(product.stage));
}

// 탭 머리 칩: 파는 것 · 집중 · 고장(CI 실패·동기화 실패).
export function productTabCounts(products) {
  const list = products || [];
  return { total: list.length, focus: focusProducts(list).length, broken: list.filter((product) => productBlocker(product)).length };
}

const DOT_KIND = { new: "new", waiting: "wait", in_progress: "open" };
// 열린 문의 점 격자 — 제품별 한 줄(문의 많은 순, 최대 rows줄) + 제품 미정 한 줄. 점: 새 = 채움, 답변 대기 = 반, 처리 중 = 빈 원.
export function inquiryDots(inquiries, products, { rows = 3 } = {}) {
  const open = (inquiries || []).filter((inquiry) => DOT_KIND[inquiry.status]);
  const names = new Map((products || []).map((product) => [product.id, product.name]));
  const byProduct = new Map();
  for (const inquiry of open) {
    const key = inquiry.productId && names.has(inquiry.productId) ? inquiry.productId : null;
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(DOT_KIND[inquiry.status]);
  }
  const named = [...byProduct.entries()].filter(([key]) => key).sort((a, b) => b[1].length - a[1].length);
  const shown = named.slice(0, rows).map(([key, dots]) => ({ key, label: names.get(key), dots }));
  const more = named.slice(rows).reduce((total, [, dots]) => total + dots.length, 0);
  if (byProduct.has(null)) shown.push({ key: "unassigned", label: "미정", dots: byProduct.get(null) });
  return { rows: shown, more, total: open.length };
}

// 한 제품의 문의 점 — 상태별 한 줄(새 · 답변 대기 · 처리 중).
export function statusDots(inquiries) {
  const open = (inquiries || []).filter((inquiry) => DOT_KIND[inquiry.status]);
  return [
    { key: "new", label: "새", dots: open.filter((inquiry) => inquiry.status === "new").map(() => "new") },
    { key: "waiting", label: "답변 대기", dots: open.filter((inquiry) => inquiry.status === "waiting").map(() => "wait") },
    { key: "in_progress", label: "처리 중", dots: open.filter((inquiry) => inquiry.status === "in_progress").map(() => "open") },
  ];
}

// 운영 건강 — 연결된 원천(GitHub CI)만 판정하고, 가동 체크·에러 수집은 원천이 생기기 전까지 "연결 전"(○)이다.
export function productHealth(product, now = Date.now()) {
  const row = productDevRow(product);
  let ci;
  if (!row.connected) ci = { key: "ci", glyph: "○", known: false, label: "CI", value: "저장소 연결 전" };
  else if (row.syncError) ci = { key: "ci", glyph: "✕", known: true, urgent: true, label: "동기화 실패", value: row.syncError };
  else if (!row.ci) ci = { key: "ci", glyph: "○", known: false, label: "CI", value: "동기화 필요" };
  else {
    const since = sinceLabel(row.ci.at, now);
    const state = row.ci.state;
    ci = state === "failure"
      ? { key: "ci", glyph: "✕", known: true, urgent: true, label: `CI 실패${row.ci.failed.length ? ` · ${row.ci.failed.join(", ")}` : ""}`, value: since }
      : { key: "ci", glyph: state === "success" ? "✓" : state === "pending" ? "◌" : "·", known: true, label: state === "success" ? "CI 통과" : state === "pending" ? "CI 진행 중" : "CI check 없음", value: since };
  }
  const lines = [
    ci,
    { key: "uptime", glyph: "○", known: false, label: "가동 체크", value: "연결 전" },
    { key: "errors", glyph: "○", known: false, label: "에러 수집", value: "도구 미정" },
  ];
  return { lines, connected: lines.filter((line) => line.known).length, total: lines.length };
}

// 칩에 보일 주소 — 호스트 + 경로(끝 / 없이). github.com만 보이면 어느 저장소인지 모른다.
function host(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch { return null; }
}
const safeUrl = (url) => (/^https?:\/\//i.test(String(url || "")) ? url : null);

// 연결 링크 — 연결된 것은 실선 칩(누르면 열림), 연결 전은 점선 칩.
export function productLinks(product) {
  const out = [];
  const repositories = (product?.repositories || []).filter((repository) => repository.status !== "disabled");
  for (const repository of repositories) {
    out.push({ key: `repo-${repository.id}`, label: "GitHub", value: String(repository.fullName || "").split("/").pop(), url: `https://github.com/${repository.fullName}`, on: true });
  }
  if (!repositories.length) out.push({ key: "repo", label: "GitHub", value: "연결 전", url: null, on: false });
  const deploy = safeUrl(product?.details?.deployUrl);
  out.push(deploy ? { key: "deploy", label: "배포 주소", value: host(deploy), url: deploy, on: true } : { key: "deploy", label: "배포 주소", value: "연결 전", url: null, on: false });
  for (const [index, link] of (Array.isArray(product?.details?.links) ? product.details.links : []).entries()) {
    const url = safeUrl(link?.url);
    if (url) out.push({ key: `link-${index}`, label: link.label || "링크", value: host(url), url, on: true });
  }
  out.push({ key: "errors", label: "에러 수집", value: "도구 미정", url: null, on: false });
  out.push({ key: "uptime", label: "가동 체크", value: "연결 전", url: null, on: false });
  return out;
}

function dayDiff(fromDay, toDay) {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86400000);
}

// 단계 이력 — 새것부터. 운영 상태 제작중 → 운영중은 유일한 모드 전환이라 launch(굵은 점)로 표시한다(§14.3, 축하 없음).
// currentDays: 지금 단계에 들어온 지 며칠(그 기록이 없으면 null).
export function stageTimeline(product, { today = seoulDay(), limit = 6 } = {}) {
  const valid = (product?.stageHistory || []).filter((entry) => entry?.to && Number.isFinite(Date.parse(entry.at)));
  const entries = valid
    .map((entry) => {
      const ops = entry.kind === "ops";
      const label = ops ? (value) => productOps(value).label : productStageLabel;
      return {
        at: entry.at,
        day: seoulDay(entry.at),
        launch: ops && entry.from === "dev" && entry.to === "live",
        text: entry.from ? `${label(entry.from)} → ${label(entry.to)}` : `등록 · ${label(entry.to)}`,
        reason: entry.reason || null,
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const entered = valid.filter((entry) => entry.kind !== "ops" && entry.to === product?.stage).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return { entries: entries.slice(0, limit), more: Math.max(0, entries.length - limit), currentDays: entered ? dayDiff(seoulDay(entered.at), today) : null };
}
