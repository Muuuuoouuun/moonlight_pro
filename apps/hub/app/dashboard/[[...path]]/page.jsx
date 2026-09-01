export const dynamic = "force-dynamic";

// 셸은 dashboard/layout.jsx가 렌더한다 — 페이지가 셸을 들고 있으면 경로가 바뀔 때마다
// 셸이 리마운트된다. 이 페이지는 라우트 매칭용 자리만 지킨다.
export default function HubCatchAll() {
  return null;
}
