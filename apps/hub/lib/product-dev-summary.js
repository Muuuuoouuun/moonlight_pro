// 제품 탭 첫 화면 — 제품 리스트 + GitHub(개발) 요약 (2026-10-21 운영자 "일단 지금은 제품 리스트, 깃허브(개발) 요약 정도로").
// 원천은 이미 쌓이는 값뿐이다: 저장소 행의 last_summary(폴링: ci·latestRelease·PR·이슈, webhook: lastPushAt·lastPullRequestAt)와
// 제품 신호(project_updates의 github.* 이벤트). 새로 저장하는 값은 없다. 모르는 값은 0이 아니라 null이다.

import { orderProducts, seoulDay } from "./product-catalog.js";

const CI_RANK = { failure: 3, pending: 2, success: 1, none: 0 };

function count(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// 아는 값만 더한다. 하나도 모르면 null(“—”), 일부만 알면 아는 합계.
function sumKnown(values) {
  const known = values.map(count).filter((value) => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function latest(values) {
  return values.filter((value) => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}

function dayDiff(fromDay, toDay) {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86400000);
}

export function activeRepositories(product) {
  return (product?.repositories || []).filter((repository) => repository.status !== "disabled");
}

// "3시간 전" · "어제" · "12일 전" — 날짜 경계는 서울 달력이다.
export function sinceLabel(value, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const days = dayDiff(seoulDay(time), seoulDay(now));
  if (days <= 0) return `${Math.floor(minutes / 60)}시간 전`;
  return days === 1 ? "어제" : `${days}일 전`;
}

export function shortDay(value) {
  const day = seoulDay(value);
  return day ? day.slice(5).replace("-", "/") : null;
}

export function shortTime(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const clock = new Date(time).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${shortDay(value)} ${clock}`;
}

// 제품 한 줄의 개발 요약. 저장소가 여럿이면 CI는 가장 나쁜 상태, 숫자는 합계, 시각은 가장 최근.
export function productDevRow(product) {
  const repositories = activeRepositories(product);
  if (!repositories.length) return { connected: false, repositories: 0 };
  const primary = repositories.find((repository) => repository.role === "app") || repositories[0];
  const summaries = repositories.map((repository) => repository.summary || {});
  const ciRepos = repositories.filter((repository) => repository.summary?.ci?.state in CI_RANK);
  const worst = [...ciRepos].sort((a, b) => CI_RANK[b.summary.ci.state] - CI_RANK[a.summary.ci.state])[0] || null;
  const releases = summaries.map((summary) => summary.latestRelease).filter((release) => release?.tag);
  const release = releases.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))[0] || null;
  const syncErrors = repositories.filter((repository) => repository.status === "error");
  return {
    connected: true,
    repositories: repositories.length,
    repoLabel: String(primary.fullName || "").split("/").pop() || primary.fullName,
    repoFullName: primary.fullName,
    extraRepositories: repositories.length - 1,
    ci: worst ? { state: worst.summary.ci.state, failed: worst.summary.ci.failed || [], url: worst.summary.ci.url || null, at: worst.summary.ci.at || null, repository: worst.fullName } : null,
    syncError: syncErrors.length ? (syncErrors[0].lastError || "동기화 실패") : null,
    lastPushAt: latest(summaries.map((summary) => summary.lastPushAt)),
    lastPullRequestAt: latest(summaries.map((summary) => summary.lastPullRequestAt)),
    release,
    openPullRequests: sumKnown(summaries.map((summary) => summary.openPullRequests)),
    reviewRequests: sumKnown(summaries.map((summary) => summary.reviewRequests)),
    openIssues: sumKnown(summaries.map((summary) => summary.openIssues)),
    blockedIssues: sumKnown(summaries.map((summary) => summary.blockedIssues)),
    staleBugIssues: sumKnown(summaries.map((summary) => summary.staleBugIssues)),
    lastSyncedAt: latest(repositories.map((repository) => repository.lastSyncedAt)),
  };
}

// 리스트 순서: CI 실패 → 막힘 이슈 → 저장소가 있는 제품 → 연결 전. 같은 칸은 포트폴리오 순서(운영 상태 → 단계 → 이름).
export function orderDevRows(products) {
  const rank = (row) => (!row.connected ? 3 : row.ci?.state === "failure" || row.syncError ? 0 : row.blockedIssues ? 1 : 2);
  return orderProducts(products)
    .map((product, index) => ({ product, row: productDevRow(product), index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index);
}

// 맨 위 네 칸. 모르는 저장소는 합계에서 빼고 그 수를 `unknown`으로 돌려준다.
export function devSummary(products) {
  const rows = (products || []).map(productDevRow);
  const connected = rows.filter((row) => row.connected);
  const ci = { failure: 0, pending: 0, success: 0, none: 0, unknown: 0 };
  for (const row of connected) {
    if (row.ci) ci[row.ci.state] += 1;
    else ci.unknown += 1;
  }
  return {
    products: rows.length,
    connected: connected.length,
    notConnected: rows.length - connected.length,
    repositories: connected.reduce((total, row) => total + row.repositories, 0),
    ci,
    openPullRequests: sumKnown(connected.map((row) => row.openPullRequests)),
    reviewRequests: sumKnown(connected.map((row) => row.reviewRequests)),
    openIssues: sumKnown(connected.map((row) => row.openIssues)),
    blockedIssues: sumKnown(connected.map((row) => row.blockedIssues)),
    staleBugIssues: sumKnown(connected.map((row) => row.staleBugIssues)),
    lastSyncedAt: latest(connected.map((row) => row.lastSyncedAt)),
  };
}

// 최근 개발 활동 — GitHub 이벤트만, 최근 7일, 새것부터. CI 실패만 위급(빨강)으로 표시한다.
export function recentDevEvents(products, { now = Date.now(), days = 7, limit = 6 } = {}) {
  const since = now - days * 86400000;
  return (products || [])
    .flatMap((product) => (product.signals || []).map((signal) => ({ ...signal, productId: product.id, productName: product.name })))
    .filter((signal) => String(signal.eventType || "").startsWith("github.") && Date.parse(signal.happenedAt) >= since)
    .sort((a, b) => Date.parse(b.happenedAt) - Date.parse(a.happenedAt))
    .slice(0, limit)
    .map((signal) => ({ ...signal, urgent: signal.eventType === "github.ci_failed" }));
}
