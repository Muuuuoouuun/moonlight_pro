export function resolveCalendarCapabilities({ status, source, readOnly }) {
  const isLive = status === "live";

  if (isLive && source === "ical" && readOnly) {
    return {
      isLive: true,
      canCreate: false,
      shouldShowEvents: true,
      badge: "iCal · read only",
    };
  }

  if (isLive) {
    return {
      isLive: true,
      canCreate: true,
      shouldShowEvents: true,
      badge: "Google Calendar · live",
    };
  }

  return {
    isLive: false,
    canCreate: false,
    shouldShowEvents: false,
    badge: status === "loading" ? "syncing" : "connection required",
  };
}
