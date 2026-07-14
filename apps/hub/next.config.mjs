import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.js");

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@com-moon/ui"],
  serverExternalPackages: ["node-ical"],
};

export default withNextIntl(nextConfig);
