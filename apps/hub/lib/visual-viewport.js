// 화면 키보드가 가리는 높이 — 순수, import 없음.
//
// 휴대폰에서 키보드가 올라오면 배치 창(innerHeight)은 그대로이고 보이는 창(visualViewport)만 줄어든다
// (iOS Safari · Android Chrome 108+). 바닥에 붙인 표면(빠른 메모 · 전체 높이 기록 시트)이 키보드 밑에
// 깔리지 않으려면 그 차이만큼 올려야 한다. iOS는 입력 칸을 보이게 하려고 보이는 창을 아래로 끌기도 한다
// (offsetTop) — 그만큼은 키보드가 아니므로 뺀다. visualViewport가 없는 브라우저 · 서버에서는 0이다.
//   keyboard — 바닥에서 키보드(또는 그 밖에 가려진 부분)의 위 끝까지의 높이(px).
//   viewport — 지금 실제로 보이는 높이(px).
export function keyboardInset({ innerHeight = 0, viewportHeight = null, offsetTop = 0 } = {}) {
  const inner = Math.max(0, Number(innerHeight) || 0);
  const visible = Number(viewportHeight) > 0 ? Number(viewportHeight) : inner;
  const pan = Math.max(0, Number(offsetTop) || 0);
  return { keyboard: Math.max(0, inner - visible - pan), viewport: visible };
}
