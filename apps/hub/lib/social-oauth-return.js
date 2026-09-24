export function resolveSocialOAuthReturnUrl(path, requestOrigin) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL?.trim() || requestOrigin);
}
