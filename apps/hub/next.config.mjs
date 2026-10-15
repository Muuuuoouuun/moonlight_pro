/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@com-moon/ui", "@com-moon/guru-guidance"],
  serverExternalPackages: ["node-ical"],
  outputFileTracingIncludes: {
    '/api/hub/guidance-articles/*': ['./content/guru/*.md'],
    '/api/hub/guidance-articles/*/infographic': ['./content/guru/infographics/*.webp'],
  },
  experimental: {
    // 대시보드 라우트는 force-dynamic이라 클라이언트 라우터 캐시 수명이 0초 —
    // 사이드바 내비 클릭마다 동일한 셸 RSC를 서버 왕복으로 다시 받는다(클릭당 100-400ms).
    // 페이지 선택은 클라이언트(usePathname→PAGE_MAP)에서 일어나고 데이터는 각 페이지가
    // /api/hub/*로 따로 받으므로, 셸 RSC를 5분 재사용해도 데이터 신선도와 무관하다.
    staleTimes: { dynamic: 300 },
    // 화면은 따로 불러오는 묶음(lazyPage)이라, 기본 설정은 셸에 없는 공용 모듈(Guru 카드 데이터·마크다운·
    // 할 일 라벨…)을 화면 묶음마다 합쳐 넣는다 — 화면을 옮길 때마다 같은 코드를 다시 받는다. 합치는 기준을
    // 낮춰 공용 모듈이 한 파일로 남아 캐시에서 재사용되게 한다. 2026-10-06 측정(프로덕션 빌드): 9화면 이동 세션
    // JS 995→826KB, 중복 코드 591K→177K자. 더 잘게 나누면(5000/20000/50000) 세션은 786KB까지 줄지만 화면을
    // 바로 열 때 요청이 43→86개로 늘어 준비가 ~100ms 늦어졌다 — 이 값은 바로 열기 요청 43→54개, 준비 시간 변화 없음.
    turbopackChunking: { minChunkSize: 20000, requestCost: 60000, maxMergeChunkSize: 100000 },
  },
  // 글꼴은 파일 이름이 바뀔 때만 내용이 바뀐다 — 매 방문마다 재검증 왕복을 하지 않게 30일 캐시한다.
  // 같은 이름으로 글꼴 파일을 교체하면 이 기간 동안 옛 파일이 남을 수 있으니 이름을 바꿔 올린다.
  async headers() {
    return [{
      source: "/fonts/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=604800" }],
    }];
  },
  // QA/secondary dev instances set NEXT_DIST_DIR (e.g. ".next.qa") so they
  // never fight the primary dev server over .next. Unset → default ".next".
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
