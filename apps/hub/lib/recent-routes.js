export const RECENT_ROUTES_KEY = "com-moon:hub-recent-routes:v1";
export const MAX_RECENT_ROUTES = 6;

export function loadRecentRoutes() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(RECENT_ROUTES_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function persistRecentRoutes(routes) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      RECENT_ROUTES_KEY,
      JSON.stringify(routes.slice(0, MAX_RECENT_ROUTES)),
    );
  } catch {
    // Ignore storage failures in private mode or locked-down browsers.
  }
}

export function updateRecentRoutes(currentRoutes, href) {
  return [href, ...currentRoutes.filter((item) => item !== href)].slice(0, MAX_RECENT_ROUTES);
}
