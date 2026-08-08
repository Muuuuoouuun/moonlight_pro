"use client";

// Revenue 원장 모듈 캐시의 공유 저장소 — revenue.jsx(SWR 훅)가 쓰고, ⌘K 레코드 검색이
// 읽는다. 예전엔 팔레트가 자체 60초 캐시로 /api/hub/revenue를 따로 받아, Revenue 화면을
// 방금 보고 온 직후에도 팔레트를 열면 같은 원장을 다시 조회했다(8차 잔여 S — 재사용 부재).
// 페이지 청크(2,600줄)를 셸 번들로 끌어오지 않기 위해 캐시만 이 소형 모듈로 분리한다.
export const REVENUE_CACHE_SERVABLE_MS = 5 * 60 * 1000;

let cache = null; // { at, ledger, syncState }

export function readRevenueCache() {
  return cache && Date.now() - cache.at < REVENUE_CACHE_SERVABLE_MS ? cache : null;
}

export function writeRevenueCache(next) {
  cache = next;
}

export function clearRevenueCache() {
  cache = null;
}
