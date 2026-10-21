"use client";
// 제품 탭 · 포트폴리오 = 12a-1 정밀 계기 (2026-10-21 운영자 확정, docs/design-studies/2026-10-21-product-tab-options).
// 요약 5칸(사용 중 구성 · 주간 사용자 선 · 이번 달 순이익과 6개월 손익 막대 · 열린 문의 점 · 집중 칸) → 지금 볼 것 →
// 표(집중 구간 MVP·출시·성장 / 나머지). 행을 누르면 제품 상세(12d)로 간다. 숫자는 원장에 있는 것뿐이다:
// 월 숫자는 최근 6개월 입력값, 모르는 값은 "—"(0이 아님). 주간 사용자 선은 달마다 적은 "최근 7일 활성"이라 주 단위가 아니라 월 단위다.
// 추세선은 한 색 명도 + 선 아래 옅은 면, 이번 달 끝점만 mlMoonPulse 링 — 이번 달 매출이 있을 때만(§14.5). 빨강은 고장(1px 레일)뿐.
import React from "react";
import { formatSignedWonShort, formatWonShort } from "@/lib/won-format";

import { Button } from "../hub-primitives";
import {
  WORK_TYPES,
  monthNumbers,
  openInquiries,
  openWorkCounts,
  portfolioAttention,
  portfolioSummary,
  productBlocker,
  productNextStep,
  productStageLabel,
} from "../../../lib/product-catalog.js";
import {
  FOCUS_LIMIT,
  barHeights,
  changeLabel,
  focusProducts,
  inquiryDots,
  modeComposition,
  monthShort,
  monthlyLabel,
  percentChange,
  portfolioSeries,
  productSeries,
  profitColumns,
  trendGeometry,
} from "../../../lib/product-instruments.js";
import { ModeLabel, ProductMark } from "./product-mark";
import styles from "./product-room.module.css";

const pick = (series, key) => series.map((row) => row[key]);
const hasRevenue = (revenue) => Number.isFinite(revenue[revenue.length - 1]) && revenue[revenue.length - 1] > 0;

// ── 계기 조각 (12d 제품 상세도 쓴다) ─────────────────────────────────────────

// 추세선 — 아는 달끼리 잇고 선 아래 10% 면. pulse는 이번 달 끝점 링(매출이 있을 때만 켠다). 감소 모션이면 링이 꺼진다.
export function TrendLine({ values, label, pulse = false, width = 120, height = 34 }) {
  const geo = trendGeometry(values, { width, height });
  return (
    <svg className={styles.trend} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      {geo.empty ? (
        <line className={styles.trendFloor} x1="0" x2={width} y1={geo.floorY} y2={geo.floorY} />
      ) : (
        <>
          <polygon className={styles.trendArea} points={geo.area} />
          <polyline className={styles.trendLine} points={geo.line} />
          {geo.end && pulse && <circle className={styles.trendRing} cx={geo.end.x} cy={geo.end.y} r="5" />}
          {geo.end && <circle className={styles.trendEnd} cx={geo.end.x} cy={geo.end.y} r="2.6" />}
        </>
      )}
    </svg>
  );
}

// 달별 작은 막대 — 이번 달만 진하게, 모르는 달은 점선 눈금.
export function MonthBars({ values, label }) {
  return (
    <span className={styles.bars} role="img" aria-label={label}>
      {barHeights(values).map((height, index, all) => (
        <i key={index} data-now={index === all.length - 1 ? "" : undefined} data-unknown={height === null ? "" : undefined}
          style={height === null ? undefined : { height: `${height}%` }} />
      ))}
    </span>
  );
}

// 손익 막대 — 막대 = 매출, 아래 빗금 = 비용, 이번 달만 진하게. 모르는 달은 점선 눈금.
export function ProfitColumns({ series, label }) {
  const columns = profitColumns(series);
  return (
    <span className={styles.columns} role="img" aria-label={label}>
      {columns.map((column, index) => (
        <span key={column.month} className={styles.column} data-now={index === columns.length - 1 ? "" : undefined}>
          {column.revenue === null && column.cost === null && <i className={styles.columnUnknown} />}
          {column.revenue !== null && <i className={`hub-bar-rise ${styles.columnRevenue}`} style={{ height: `${Math.max(2, column.revenue)}%` }} />}
          {column.cost !== null && <i className={styles.columnCost} style={{ height: `${Math.max(2, column.cost)}%` }} />}
        </span>
      ))}
    </span>
  );
}

export function Axis({ months }) {
  return <span className={styles.axis} aria-hidden="true"><span>{monthShort(months[0])}</span><span>{monthShort(months[months.length - 1])}</span></span>;
}

// 문의 점 격자 — 새 = 채운 점, 답변 대기 = 반 점, 처리 중 = 빈 점.
export function DotRows({ rows, label }) {
  return (
    <span className={styles.dotGrid} role="img" aria-label={label}>
      {rows.map((row) => (
        <React.Fragment key={row.key}>
          <span className={styles.dotLabel}>{row.label}</span>
          <span className={styles.dots}>{row.dots.length ? row.dots.map((kind, index) => <i key={index} data-kind={kind} />) : <span className={styles.dim}>—</span>}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

export function Kpi({ label, note, value, foot, children }) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiHead}><span className={styles.eyebrow}>{label}</span>{note && <span className={styles.delta}>{note}</span>}</div>
      {value !== undefined && <div className={`stat ${styles.kpiValue}`}>{value}</div>}
      {children}
      {foot && <div className={styles.kpiFoot}>{foot}</div>}
    </div>
  );
}

const dotsLabel = (title, rows) => `${title}: ${rows.map((row) => `${row.label} ${row.dots.length}`).join(", ")}`;

// ── 12a-1 포트폴리오 ──────────────────────────────────────────────────────────

function PortfolioRow({ product, months, onOpen }) {
  const series = productSeries(product, months);
  const users = pick(series, "activeUsers");
  const revenue = pick(series, "revenue");
  const numbers = monthNumbers(product, months[months.length - 1]);
  const counts = openWorkCounts(product);
  const open = openInquiries(product);
  const fresh = open.filter((inquiry) => inquiry.status === "new").length;
  const blocker = productBlocker(product);
  const change = changeLabel(percentChange(revenue, 3), "3개월");
  return (
    <button type="button" className={`hub-row ${styles.pfRow}${blocker ? ` ${styles.rail}` : ""}`} onClick={() => onOpen(product.id)} aria-label={`${product.name} 열기`}>
      <span className={styles.pfName}>
        <ProductMark product={product} />
        <span style={{ minWidth: 0 }}><span className={styles.name}>{product.name}</span><span className={styles.sub}>{product.summary}</span></span>
      </span>
      <span className={styles.devCell}><ModeLabel product={product} /><span className={styles.dim}>{productStageLabel(product.stage)}</span></span>
      <span className={styles.pfNum}>
        <span className="mono">{numbers.activeUsers ?? "—"}</span>
        <MonthBars values={users} label={monthlyLabel("주간 사용자", months, users, String)} />
      </span>
      <span className={styles.pfNum}>
        <span className={styles.pfMoney}><span className="mono">{formatWonShort(numbers.net)}</span>{change && <span className={styles.delta}>{change}</span>}</span>
        <TrendLine values={revenue} pulse={hasRevenue(revenue)} label={monthlyLabel("6개월 매출", months, revenue, formatWonShort)} />
      </span>
      <span className={styles.work}>
        {WORK_TYPES.map((type) => <span key={type.value}>{type.label.slice(0, 1)} <b className="mono">{counts[type.value]}</b></span>)}
      </span>
      <span className={styles.pfInq}>{open.length ? <><span className="mono">{open.length}</span>{fresh ? <span className={styles.dim}> · 새 {fresh}</span> : null}</> : <span className={styles.dim}>—</span>}</span>
      <span className={blocker ? styles.danger : styles.muted} style={{ fontSize: 12.5 }}>{productNextStep(product) || "—"}</span>
    </button>
  );
}

export function ProductPortfolio({ products, inquiries, month, months, onOpenProduct, onOpenInbox }) {
  const summary = portfolioSummary(products, inquiries, month);
  const attention = portfolioAttention(products, inquiries);
  const series = portfolioSeries(products, months);
  const users = pick(series, "activeUsers");
  const nets = pick(series, "net");
  const revenue = pick(series, "revenue");
  const { cells, counts } = modeComposition(products);
  const focus = focusProducts(products);
  const focusIds = new Set(focus.map((product) => product.id));
  const rest = cells.map((cell) => products.find((product) => product.id === cell.id)).filter((product) => !focusIds.has(product.id));
  const dots = inquiryDots(inquiries, products);
  const byId = new Map(products.map((product) => [product.id, product]));
  const netPrev = nets[nets.length - 2];
  const netNote = summary.net !== null && Number.isFinite(netPrev) ? `${formatSignedWonShort(summary.net - netPrev)} · 지난달` : null;
  const legend = [["live", "운영"], ["dev", "제작"], ["idea", "기획"], ["paused", "중지"], ["ended", "종료"]].filter(([key]) => counts[key] || key !== "ended");
  const slots = Math.max(FOCUS_LIMIT, focus.length);

  return (
    <>
      <div className={`${styles.kpis} ${styles.kpis5}`}>
        <Kpi label="사용 중" value={<>{counts.live}<span className={styles.of}> / {summary.total}</span></>}
          foot={legend.map(([key, text]) => `${text} ${counts[key]}`).join(" · ")}>
          <span className={styles.comp} role="img" aria-label={`모드 구성: ${legend.map(([key, text]) => `${text} ${counts[key]}`).join(", ")}`}>
            {cells.map((cell) => <i key={cell.id} data-mode={cell.mode} />)}
          </span>
        </Kpi>
        <Kpi label={summary.usersMissing > 0 && summary.users !== null ? "확인된 주간 사용자" : "주간 사용자"}
          note={changeLabel(percentChange(users, 1), "지난달")} value={summary.users ?? "—"}
          foot={summary.usersMissing > 0 ? `${summary.usersMissing}개 제품 미입력` : "최근 7일 활성 · 달마다 입력"}>
          <TrendLine values={users} pulse={hasRevenue(revenue)} width={172} height={56} label={monthlyLabel("주간 사용자", months, users, String)} />
          <Axis months={months} />
        </Kpi>
        <Kpi label={`${monthShort(month)} ${summary.moneyMissing > 0 && summary.moneyKnown > 0 ? "확인된 순이익" : "순이익"}`}
          note={netNote} value={formatWonShort(summary.net)}
          foot={summary.moneyMissing > 0 ? `${summary.moneyMissing}개 제품 매출·비용 확인 필요` : summary.moneyKnown ? `매출 ${formatWonShort(summary.revenue)} · 비용 ${formatWonShort(summary.cost)} (빗금)` : "매출·비용 입력 전"}>
          <ProfitColumns series={series} label={monthlyLabel("6개월 순이익", months, nets, formatWonShort)} />
          <Axis months={months} />
        </Kpi>
        <Kpi label="열린 문의" note={`새 ${summary.newInquiries} · 대기 ${summary.waitingInquiries}`} value={summary.openInquiries}
          foot={<>{dots.more ? <span>외 {dots.more}건 · </span> : null}<Button variant="ghost" size="sm" onClick={onOpenInbox}>문의함 열기</Button></>}>
          {dots.rows.length ? <DotRows rows={dots.rows} label={dotsLabel(`열린 문의 ${dots.total}`, dots.rows)} /> : <span className={styles.dim}>열린 문의 없음</span>}
        </Kpi>
        <Kpi label="집중 칸" note="MVP · 출시 · 성장" value={<>{focus.length}<span className={styles.of}> / {FOCUS_LIMIT}</span></>}
          foot={focus.length >= FOCUS_LIMIT ? "올리려면 하나를 유지·종료로 내려요" : `빈 칸 ${FOCUS_LIMIT - focus.length}`}>
          <span className={styles.slots} role="img" aria-label={`집중 칸 ${focus.length}/${FOCUS_LIMIT}${focus.length ? `: ${focus.map((product) => product.name).join(", ")}` : ""}`}>
            {Array.from({ length: slots }, (_, index) => (
              <span key={index} className={styles.slot} data-filled={focus[index] ? "" : undefined}>{focus[index] && <ProductMark product={focus[index]} size="sm" />}</span>
            ))}
          </span>
        </Kpi>
      </div>

      {attention.length > 0 && (
        <section className={styles.sheet} aria-label="지금 볼 것">
          <div className={styles.sheetHead}><span className={styles.eyebrow}>지금 볼 것</span><span className={styles.dim}>깨졌거나 기한이 닥친 것만 · <span className="mono">{attention.length}</span></span></div>
          {attention.map((item) => (
            <button key={item.key} type="button" className={`hub-row ${styles.line}${item.urgent ? ` ${styles.rail}` : ""}`}
              onClick={() => (item.inbox ? onOpenInbox() : onOpenProduct(item.productId))}>
              <span className={styles.pfName}>
                <ProductMark product={item.inbox ? { name: "?", stage: "idea" } : byId.get(item.productId)} size="sm" />
                <span className={styles.name}>{item.name}</span>
              </span>
              <span className={item.urgent ? styles.danger : styles.muted}>{item.text}</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>{item.when || ""}</span>
            </button>
          ))}
        </section>
      )}

      <section className={`${styles.sheet} ${styles.pfSheet}`} aria-label="제품 표">
        <div className={styles.pfHead} aria-hidden="true">
          <span>제품</span><span>상태</span><span>주간 사용자 · 6개월</span><span>{monthShort(month)} 순이익 · 6개월 매출</span><span>신기능 · 보수 · 연락</span><span>문의</span><span>다음 행동</span>
        </div>
        {focus.length > 0 && (
          <>
            <div className={styles.group}><b>집중 구간</b><span className="mono">{focus.length}/{FOCUS_LIMIT}</span><span>MVP · 출시 · 성장</span></div>
            {focus.map((product) => <PortfolioRow key={product.id} product={product} months={months} onOpen={onOpenProduct} />)}
          </>
        )}
        {rest.length > 0 && (
          <>
            <div className={styles.group}><b>나머지</b><span className="mono">{rest.length}</span><span>칸이 비면 올릴 후보</span></div>
            {rest.map((product) => <PortfolioRow key={product.id} product={product} months={months} onOpen={onOpenProduct} />)}
          </>
        )}
      </section>
    </>
  );
}
