import { IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

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

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`app-body ${monoFont.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
