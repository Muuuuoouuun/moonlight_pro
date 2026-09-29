/** @type {import("next").NextConfig} */
const nextConfig = {
  // Repository instructions are maintained at the root; dev must not create competing copies.
  agentRules: false,
  transpilePackages: ["@com-moon/content-manager", "@com-moon/hub-gateway", "@com-moon/ui", "@com-moon/guru-guidance"],
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
