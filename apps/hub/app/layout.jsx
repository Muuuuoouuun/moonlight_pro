import "./globals.css";

export const metadata = {
  title: "Moonlight",
  description: "Moonlight Hub — 1인·소규모 창업자용 운영 OS.",
  manifest: "/manifest.json",
  applicationName: "Moonlight",
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
        <link
          rel="preload"
          href="/fonts/SUIT-Variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/JetBrainsMono-Variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="app-body">{children}</body>
    </html>
  );
}
