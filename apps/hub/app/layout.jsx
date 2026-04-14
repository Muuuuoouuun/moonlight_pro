import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

export const metadata = {
  title: "Com_Moon OS",
  description: "Private operating shell for operations, content, and command center workflows.",
  manifest: "/manifest.json",
  applicationName: "Com_Moon OS",
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
      <body className="app-body">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
