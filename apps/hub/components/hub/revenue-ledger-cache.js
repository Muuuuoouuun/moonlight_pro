// 매출 원장의 모듈 스코프 stale-while-revalidate 저장소.
//
// revenue.jsx의 `useRevenueLedger`와 ⌘K 팔레트의 레코드 인덱스가 같은 스냅샷을
// 공유한다. 이전에는 캐시가 revenue.jsx 안의 비공개 `let`이라 팔레트가 접근할 수
// 없었고, 팔레트를 열 때마다 /api/hub/revenue를 한 번 더 읽었다 — 방금 화면에
// 렌더한 것과 다른 스냅샷을 검색하게 되고 비용도 두 배였다.
import { createLedgerCache } from "./module-ledger-cache";

export const REVENUE_CACHE_SERVABLE_MS = 5 * 60 * 1000;

const cache = createLedgerCache(REVENUE_CACHE_SERVABLE_MS);

// 원장 훅은 5분, 팔레트는 60초를 요구한다.
export function readRevenueLedgerCache(maxAgeMs = REVENUE_CACHE_SERVABLE_MS) {
  return cache.read(maxAgeMs);
}

export function writeRevenueLedgerCache(ledger, syncState) {
  cache.write({ ledger, syncState });
}

export function clearRevenueLedgerCache() {
  cache.clear();
}
