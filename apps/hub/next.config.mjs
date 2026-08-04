import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.js");

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@com-moon/ui"],
  serverExternalPackages: ["node-ical"],
  // QA/secondary dev instances set NEXT_DIST_DIR (e.g. ".next.qa") so they
  // never fight the primary dev server over .next. Unset → default ".next".
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default withNextIntl(nextConfig);
