import "./globals.css";

export const metadata = {
  title: "Moonlight",
  description: "Moonlight Hub — 1인·소규모 창업자용 운영 OS.",
  manifest: "/manifest.json",
  applicationName: "Moonlight",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c1018",
};

// next-intl 제거(2026-08-05 system-eval 속도 감사): useTranslations 소비자 0인데
// 전 페이지에 클라이언트 런타임+메시지 번들이 실렸다. 허브는 한국어 단일 로케일.
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        {/* 본문 글꼴은 첫 화면 글자 전부에 쓰인다 — CSS를 다 읽은 뒤에야 받기 시작하면 대체 글꼴로
            그렸다가 늦게 바뀌며 줄바꿈이 한 번 흔들린다. 앞당겨 받는다. */}
        <link rel="preload" href="/fonts/SUIT-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/JetBrainsMono-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="app-body">{children}</body>
    </html>
  );
}
