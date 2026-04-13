import type { Metadata, Viewport } from "next"
import { Toaster } from "@com-moon/ui"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "Com_Moon OS", template: "%s · Com_Moon" },
  description: "개인 운영체제 Hub",
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  themeColor: "#0F0F0F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
