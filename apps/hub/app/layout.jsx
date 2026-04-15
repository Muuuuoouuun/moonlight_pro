import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { IBM_Plex_Mono, Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";

const displayFont = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--cm-font-serif",
});

const bodyFont = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--cm-font-sans",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--cm-font-mono",
});

export const metadata = {
  title: "moonlight 프로젝트",
  description: "운영, 콘텐츠, 커맨드를 한곳에서 다루는 moonlight 프로젝트의 프라이빗 허브입니다.",
  manifest: "/manifest.json",
  applicationName: "moonlight 프로젝트",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5274a8",
};

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`app-body ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
