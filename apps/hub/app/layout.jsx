import { Calistoga, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const displayFont = Calistoga({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Com_Moon OS",
  description: "Private operating shell for operations, content, and command center workflows.",
  manifest: "/manifest.json",
  applicationName: "Com_Moon OS",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#084734",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={`app-body ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
