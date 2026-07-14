export function extractGoogleCalendarAccountIdentity(payload) {
  const summary = typeof payload?.summary === "string" ? payload.summary.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(summary) ? summary : null;
}
