"use client";
// 제품 탭 첫 화면 — 제품 리스트 + GitHub(개발) 요약 (2026-10-21 운영자 "일단 지금은 제품 리스트, 깃허브(개발) 요약 정도로").
// 맨 위 네 칸(저장소 · CI · 열린 PR · 열린 이슈) → 제품 리스트(행마다 저장소·CI·최근 push·릴리스·열린 PR/이슈) → 최근 개발 활동.
// 숫자는 저장소 요약(last_summary)과 GitHub 신호에서만 온다(lib/product-dev-summary.js). 모르는 값은 "—"이고,
// 빨강은 CI 실패·동기화 실패·막힘 이슈에만 쓴다(DESIGN §5.2). 행을 누르면 그 제품의 상세(12d)로 가고, 개발 탭은 상세의
// 운영 건강 칸 "개발 · GitHub"에서 연다(2026-10-21 운영자 "D 첫 화면 + 12a-1 보기 + 상세 12d").
import React from "react";

import { SectionTitle } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { CI_STATE_LABEL, productStageLabel } from "../../../lib/product-catalog.js";
import { devSummary, orderDevRows, recentDevEvents, shortDay, shortTime, sinceLabel } from "../../../lib/product-dev-summary.js";
import { ModeLabel, ProductMark } from "./product-mark";
import styles from "./product-room.module.css";

const CI_GLYPH = { success: "✓", failure: "✕", pending: "◌", none: "·" };
const EVENT_GLYPH = {
  "github.ci_failed": "✕",
  "github.ci_recovered": "✓",
  "github.pr_opened": "○",
  "github.pr_review_requested": "◎",
  "github.pr_merged": "⇢",
  "github.bug_opened": "!",
  "github.bug_closed": "✓",
  "github.release": "◆",
};
const known = (value) => (value === null || value === undefined ? "—" : value);
const joinParts = (parts) => parts.filter(Boolean).join(" · ");

function CiText({ row }) {
  if (row.syncError) return <span className={styles.danger}>✕ 동기화 실패 · {row.syncError}</span>;
  if (!row.ci) return <span className={styles.dim}>CI 아직 모름 · 동기화 필요</span>;
  const failed = row.ci.state === "failure";
  return (
    <span className={failed ? styles.danger : undefined}>
      <span aria-hidden="true">{CI_GLYPH[row.ci.state]} </span>
      CI {CI_STATE_LABEL[row.ci.state] || row.ci.state}
      {failed && row.ci.failed.length ? ` · ${row.ci.failed.join(", ")}` : ""}
      {row.ci.at ? <span className="mono"> · {shortDay(row.ci.at)}</span> : null}
    </span>
  );
}

function SummaryStrip({ summary }) {
  const { ci } = summary;
  const ciRest = joinParts([
    ci.failure && ci.success ? `통과 ${ci.success}` : null,
    ci.pending ? `진행 중 ${ci.pending}` : null,
    ci.none ? `check 없음 ${ci.none}` : null,
    ci.unknown ? `모름 ${ci.unknown}` : null,
  ]);
  return (
    <div className={styles.strip} aria-label="개발 요약">
      <div className={styles.cell}>
        <span className={styles.cellLabel}>저장소</span>
        <span className={`stat ${styles.cellValue}`}>{summary.connected}<span className={styles.dim}> / {summary.products} 제품</span></span>
        <span className={styles.dim}>{joinParts([summary.notConnected ? `연결 전 ${summary.notConnected}` : null, summary.lastSyncedAt ? `마지막 동기화 ${shortTime(summary.lastSyncedAt)}` : "동기화 전"])}</span>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>CI · 기본 브랜치</span>
        {ci.failure ? (
          <span className={`stat ${styles.cellValue}`}><span className={styles.danger}>✕ {ci.failure}</span><span className={styles.dim}> 실패</span></span>
        ) : (
          <span className={`stat ${styles.cellValue}`}>{ci.success}<span className={styles.dim}> 통과</span></span>
        )}
        <span className={styles.dim}>{ciRest || (summary.connected ? "모두 확인됨" : "연결된 저장소 없음")}</span>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>열린 PR</span>
        <span className={`stat ${styles.cellValue}`}>{known(summary.openPullRequests)}</span>
        <span className={styles.dim}>{summary.reviewRequests ? `리뷰 요청 ${summary.reviewRequests}` : summary.openPullRequests === null ? "동기화 전" : "리뷰 요청 없음"}</span>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>열린 이슈</span>
        <span className={`stat ${styles.cellValue}`}>{known(summary.openIssues)}</span>
        <span className={styles.dim}>{joinParts([summary.blockedIssues ? `막힘 ${summary.blockedIssues}` : null, summary.staleBugIssues ? `오래된 버그 ${summary.staleBugIssues}` : null]) || (summary.openIssues === null ? "동기화 전" : "막힘 없음")}</span>
      </div>
    </div>
  );
}

function DevRow({ product, row, onOpen }) {
  const urgent = Boolean(row.ci?.state === "failure" || row.syncError);
  return (
    <button type="button" className={`hub-row ${styles.devRow}${urgent ? ` ${styles.rail}` : ""}`} onClick={() => onOpen(product.id)} aria-label={`${product.name} 상세 열기`}>
      <span className={styles.pfName}>
        <ProductMark product={product} />
        <span className={styles.devCell}>
          <span className={styles.name}>{product.name}</span>
          <span><ModeLabel product={product} /> · {productStageLabel(product.stage)}</span>
        </span>
      </span>
      {row.connected ? (
        <>
          <span className={styles.devCell}>
            <span className="mono" style={{ color: "var(--fg)" }}>{row.repoLabel}{row.extraRepositories ? ` 외 ${row.extraRepositories}` : ""}</span>
            <CiText row={row} />
          </span>
          <span className={styles.devCell}>
            <span>push <b>{sinceLabel(row.lastPushAt) || "—"}</b></span>
            <span>릴리스 {row.release ? <b className="mono">{row.release.tag}{row.release.at ? ` · ${shortDay(row.release.at)}` : ""}</b> : "—"}</span>
          </span>
          <span className={styles.devCell}>
            <span>PR <b className="mono">{known(row.openPullRequests)}</b>{row.reviewRequests ? ` · 리뷰 ${row.reviewRequests}` : ""}</span>
            <span className={row.blockedIssues ? styles.danger : undefined}>
              이슈 <b className="mono" style={row.blockedIssues ? { color: "inherit" } : undefined}>{known(row.openIssues)}</b>
              {row.blockedIssues ? ` · 막힘 ${row.blockedIssues}` : ""}
              {row.staleBugIssues ? ` · 오래된 버그 ${row.staleBugIssues}` : ""}
            </span>
          </span>
        </>
      ) : (
        <span className={styles.devEmpty}>
          <span className={styles.devPending}>저장소 연결 전</span>
          <span>눌러서 상세의 개발 · GitHub에서 저장소를 연결해요</span>
        </span>
      )}
      <Iconed name="chevronR" size={14} style={{ color: "var(--fg-dim)" }} />
    </button>
  );
}

export function ProductDevList({ products, onOpenProduct }) {
  const summary = devSummary(products);
  const rows = orderDevRows(products);
  const events = recentDevEvents(products);
  return (
    <>
      <SummaryStrip summary={summary} />

      <section className={styles.devList} aria-label="제품 리스트">
        <div className={styles.devHead} aria-hidden="true"><span>제품</span><span>저장소 · CI</span><span>최근</span><span>열린 일</span><span /></div>
        {rows.map(({ product, row }) => <DevRow key={product.id} product={product} row={row} onOpen={onOpenProduct} />)}
      </section>

      <section aria-label="최근 개발 활동">
        <SectionTitle right={<span className={styles.dim}>GitHub · 최근 7일</span>} style={{ marginBottom: 8 }}>최근 개발 활동</SectionTitle>
        {events.length ? (
          <ol className={styles.events}>
            {events.map((event) => (
              <li key={event.id}>
                <span className="mono">{shortTime(event.happenedAt)}</span>
                <span className={styles.muted}>{event.productName}</span>
                <span aria-hidden="true" className={event.urgent ? styles.danger : styles.muted}>{EVENT_GLYPH[event.eventType] || "·"}</span>
                {event.url ? (
                  <a href={event.url} target="_blank" rel="noreferrer" className={event.urgent ? styles.danger : undefined}>{event.title}</a>
                ) : (
                  <span className={event.urgent ? styles.danger : undefined}>{event.title}</span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.dim} style={{ margin: 0 }}>최근 7일 GitHub 이벤트가 없어요. webhook을 연결하면 PR·릴리스·CI 변화가 여기에 쌓여요.</p>
        )}
      </section>
    </>
  );
}
