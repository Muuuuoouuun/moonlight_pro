import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Com_Moon Public",
  description: "Brand, content, sales, and operations flowing through one public-facing surface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
