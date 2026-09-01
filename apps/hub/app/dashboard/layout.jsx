import { HubApp } from "@/components/hub/hub-app";

export const dynamic = "force-dynamic";

// 셸(HubApp)은 레이아웃이 소유한다 — App Router에서 페이지 컴포넌트는 세그먼트
// param이 바뀔 때마다 리마운트되므로, 셸이 page에 있으면 내비게이션마다 사이드바·
// 스코프·테마·팔레트 상태가 초기화된다 (2026-09-01 실측: URL 파생 스코프가 무스코프
// 탭 한 번에 증발, storage 재복원에만 의존). 레이아웃은 자식 내비에서 인스턴스가
// 보존된다. 페이지 콘텐츠의 경로별 리마운트 의미는 hub-app 내부의 key={path}
// 래퍼가 그대로 유지한다. dashboard/* 의 page들은 null만 반환한다.
export default function DashboardLayout({ children }) {
  return (
    <>
      <HubApp />
      {children}
    </>
  );
}
