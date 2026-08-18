// 모듈 스코프 stale-while-revalidate 캐시 팩토리.
//
// 허브는 탭을 옮길 때마다 페이지 컴포넌트를 언마운트하므로, 캐시가 없으면 돌아올
// 때마다 동일한 원장을 다시 받고 스켈레톤을 보인다. 캐시는 즉시 서빙하고 배경
// 재검증을 항상 돌리므로 신선도 손실은 1 RTT다.
//
// 재검증이 실패하면 오래된 값을 live처럼 보여주면 안 된다 — 소비처가 syncState를
// 'partial'/'error'로 낮춰 표시해야 한다(17차 회귀: 만료 캐시 위 stale 위장).
const DEFAULT_SERVABLE_MS = 5 * 60 * 1000;

export function createLedgerCache(servableMs = DEFAULT_SERVABLE_MS) {
  let entry = null; // { at, value }

  return {
    // maxAgeMs를 넘긴 항목은 없는 것으로 취급 — 소비처마다 신선도 요구가 다르다.
    read(maxAgeMs = servableMs) {
      if (!entry) return null;
      return Date.now() - entry.at < maxAgeMs ? entry.value : null;
    },
    write(value) {
      entry = { at: Date.now(), value };
    },
    clear() {
      entry = null;
    },
  };
}
