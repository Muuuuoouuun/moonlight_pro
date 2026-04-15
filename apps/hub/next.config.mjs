import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.js");

/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir:
    process.env.COM_MOON_NEXT_DIST_DIR?.trim() || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  transpilePackages: ["@com-moon/ui"],
};

export default withNextIntl(nextConfig);
