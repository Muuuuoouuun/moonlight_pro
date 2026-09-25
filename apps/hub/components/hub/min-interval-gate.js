// 최소 간격 게이트 — 마지막 mark() 이후 minMs가 지나기 전까지 allow()는 false다.
// 첫 호출(아직 mark()한 적 없음)은 항상 허용한다. 시계 주입은 테스트 전용.
export function createMinIntervalGate(minMs, now = () => Date.now()) {
  let lastMark = null;
  return {
    allow() {
      if (lastMark === null) return true;
      return now() - lastMark >= minMs;
    },
    mark() {
      lastMark = now();
    },
  };
}
