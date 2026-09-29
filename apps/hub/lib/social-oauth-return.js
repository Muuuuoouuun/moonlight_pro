export function resolveSocialOAuthReturnUrl(path, requestOrigin) {
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || requestOrigin);
  const fallback = new URL("/dashboard/settings", base);
  if (typeof path !== "string" || !path.startsWith("/") ||
      path.startsWith("//") || path.includes("\\")) {
    return fallback;
  }
  const target = new URL(path, base);
  return target.origin === base.origin ? target : fallback;
}
