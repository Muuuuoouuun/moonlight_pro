/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@com-moon/ui"],
  serverExternalPackages: ["node-ical"],
  experimental: {
    // 대시보드 라우트는 force-dynamic이라 클라이언트 라우터 캐시 수명이 0초 —
    // 사이드바 내비 클릭마다 동일한 셸 RSC를 서버 왕복으로 다시 받는다(클릭당 100-400ms).
    // 페이지 선택은 클라이언트(usePathname→PAGE_MAP)에서 일어나고 데이터는 각 페이지가
    // /api/hub/*로 따로 받으므로, 셸 RSC를 5분 재사용해도 데이터 신선도와 무관하다.
    staleTimes: { dynamic: 300 },
  },
  // QA/secondary dev instances set NEXT_DIST_DIR (e.g. ".next.qa") so they
  // never fight the primary dev server over .next. Unset → default ".next".
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
