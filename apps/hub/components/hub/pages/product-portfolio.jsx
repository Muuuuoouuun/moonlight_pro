"use client";
// 제품 운영실 · 포트폴리오 (docs/superpowers/specs/2026-09-25-product-operations-room-design.md §0).
// 요약 4칸 · 지금 볼 것(깨졌거나 기한 닥친 것만) · 제품 표. 행을 누르면 제품 페이지로 간다.
// 모르는 숫자는 0이 아니라 "—"다(월 숫자 미입력).
import React from "react";

import {
  monthNumbers,
  openInquiries,
  openWorkCounts,
  portfolioAttention,
  portfolioSummary,
  productBlocker,
  productNextStep,
  productOps,
  productStageLabel,
  productStageOrder,
} from "../../../lib/product-catalog.js";
import styles from "./product-room.module.css";

const won = (value) => (value === null || value === undefined ? "—" : `${value < 0 ? "−" : ""}₩${Math.abs(value).toLocaleString("ko-KR")}`);
const monthLabel = (month) => `${Number(String(month).slice(5, 7))}월`;

export function OpsLabel({ value }) {
  const ops = productOps(value);
  return (
    <span className={styles.ops}>
      <span className={styles.opsGlyph} aria-hidden="true">{ops.glyph}</span>
      {ops.label}
    </span>
  );
}

export function ProductPortfolio({ products, inquiries, month, onOpenProduct, onOpenInbox }) {
  const summary = portfolioSummary(products, inquiries, month);
  const attention = portfolioAttention(products, inquiries);
  const ordered = [...products].sort((a, b) => {
    const ops = ["live", "dev", "paused", "ended"];
    return ops.indexOf(a.opsStatus) - ops.indexOf(b.opsStatus) || productStageOrder(a.stage) - productStageOrder(b.stage);
  });
  const openKey = (event, id) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenProduct(id);
    }
  };
  return (
    <>
      <div className={styles.strip}>
        <div className={styles.cell}>
          <span className="eyebrow">사용 중</span>
          <span className={`stat ${styles.cellValue}`}>{summary.byOps.live}<span className={styles.dim}> / {summary.total}</span></span>
          <span className={styles.dim}>개발 중 {summary.byOps.dev} · 일시 중지 {summary.byOps.paused}</span>
        </div>
        <div className={styles.cell}>
          <span className="eyebrow">주간 사용자</span>
          <span className={`stat ${styles.cellValue}`}>{summary.users ?? "—"}</span>
          <span className={styles.dim}>{summary.usersMissing > 0 ? `${summary.usersMissing}개 제품 미입력` : "최근 7일 활성"}</span>
        </div>
        <div className={styles.cell}>
          <span className="eyebrow">{monthLabel(month)} 순이익</span>
          <span className={`stat ${styles.cellValue}`}>{won(summary.net)}</span>
          <span className={styles.dim}>{summary.moneyKnown ? `매출 ${won(summary.revenue)} · 비용 ${won(summary.cost)}` : "매출·비용 입력 전"}</span>
        </div>
        <div className={styles.cell}>
          <span className="eyebrow">열린 문의</span>
          <span className={`stat ${styles.cellValue}`}>{summary.openInquiries}</span>
          <span className={styles.dim}>새 {summary.newInquiries} · 답변 대기 {summary.waitingInquiries}</span>
        </div>
      </div>

      {attention.length > 0 && (
        <section aria-label="지금 볼 것">
          <div className={styles.bar} style={{ marginBottom: 8 }}>
            <h3 className="eyebrow" style={{ margin: 0 }}>지금 볼 것</h3>
            <span className={styles.dim}>깨졌거나 기한이 닥친 것만</span>
          </div>
          <div className={styles.box}>
            {attention.map((item) => (
              <button key={item.key} type="button" className={`hub-row ${styles.line}${item.urgent ? ` ${styles.rail}` : ""}`}
                onClick={() => (item.inbox ? onOpenInbox() : onOpenProduct(item.productId))}>
                <span className={styles.name}>{item.name}</span>
                <span className={item.urgent ? styles.danger : undefined}>{item.text}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>{item.when || ""}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>제품</th>
              <th>상태</th>
              <th className={styles.right}>주간 사용자</th>
              <th className={styles.right}>{monthLabel(month)} 순이익</th>
              <th>진행 중인 일</th>
              <th className={styles.right}>문의</th>
              <th>다음 행동</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((product) => {
              const numbers = monthNumbers(product, month);
              const counts = openWorkCounts(product);
              const open = openInquiries(product);
              const fresh = open.filter((inquiry) => inquiry.status === "new").length;
              const blocker = productBlocker(product);
              const next = productNextStep(product);
              return (
                <tr key={product.id} className={`hub-row${blocker ? ` ${styles.rail}` : ""}`} tabIndex={0}
                  onClick={() => onOpenProduct(product.id)} onKeyDown={(event) => openKey(event, product.id)}
                  aria-label={`${product.name} 열기`}>
                  <td>
                    <div className={styles.name}>{product.name}</div>
                    <div className={styles.sub}>{product.summary}</div>
                  </td>
                  <td>
                    <OpsLabel value={product.opsStatus} />
                    <div className={styles.dim} style={{ marginTop: 2 }}>{productStageLabel(product.stage)}</div>
                  </td>
                  <td className={`${styles.right} mono`}>{numbers.activeUsers ?? "—"}</td>
                  <td className={styles.right}>
                    <span className="mono">{won(numbers.net)}</span>
                    {numbers.known && numbers.revenue !== null && <div className={styles.dim}>매출 {won(numbers.revenue)}</div>}
                  </td>
                  <td>
                    <span className={styles.work}>
                      <span>신기능 <b className="mono">{counts.feature}</b></span>
                      <span>보수 <b className="mono">{counts.maintenance}</b></span>
                      <span>연락 <b className="mono">{counts.contact}</b></span>
                    </span>
                  </td>
                  <td className={styles.right}>
                    {open.length ? <><span className="mono">{open.length}</span>{fresh ? <span className={styles.dim}> · 새 {fresh}</span> : null}</> : <span className={styles.dim}>—</span>}
                  </td>
                  <td className={blocker ? styles.danger : styles.muted} style={{ maxWidth: "28ch" }}>{next || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.cards}>
        {ordered.map((product) => {
          const numbers = monthNumbers(product, month);
          const blocker = productBlocker(product);
          return (
            <button key={product.id} type="button" className={`${styles.card}${blocker ? ` ${styles.rail}` : ""}`} onClick={() => onOpenProduct(product.id)}>
              <span className={styles.bar}><span className={styles.name}>{product.name}</span><span className={styles.spacer} /><OpsLabel value={product.opsStatus} /></span>
              <span className={styles.work}>
                <span>사용자 <b className="mono">{numbers.activeUsers ?? "—"}</b></span>
                <span>순이익 <b className="mono">{won(numbers.net)}</b></span>
                <span>문의 <b className="mono">{openInquiries(product).length}</b></span>
              </span>
              <span className={blocker ? styles.danger : styles.muted}>{productNextStep(product) || "—"}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
