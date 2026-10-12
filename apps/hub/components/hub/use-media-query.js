"use client";

// 미디어 쿼리를 듣는다 — 스타일시트와 같은 자로 화면 폭을 잰다(소수 폭 · 확대 · 분할 화면에서도 두 쪽이
// 어긋나지 않는다). 서버 렌더와 첫 그리기는 false다(데스크톱 기본). 쿼리를 비우면 듣지 않는다 — 빈 쿼리는
// 브라우저에서 언제나 참이라 그대로 넘기면 데스크톱이 휴대폰 배치가 된다.
// 고객 드로어(pages/customers.jsx)의 같은 훅과 같은 규칙이다: 그쪽은 렌더 시험이 페이지 안의 정의를 그대로
// 세워 보므로 옮기지 않고 둔다.

import React from "react";

export function useMediaQuery(query) {
  const readable = () => Boolean(query) && typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [matches, setMatches] = React.useState(() => (readable() ? window.matchMedia(query).matches : false));
  React.useEffect(() => {
    if (!readable()) { setMatches(false); return undefined; }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readable은 query만 본다
  }, [query]);
  return matches;
}
