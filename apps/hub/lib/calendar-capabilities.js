export function resolveCalendarCapabilities({ status, source, readOnly }) {
  if (status === "partial") {
    return {
      isLive: true,
      // Read completeness and the connected source's write capability differ.
      canCreate: source === "oauth" && !readOnly,
      shouldShowEvents: true,
      badge: source === "multi" ? "Personal/Company · 일부 연결" : "Google Calendar · 일부 일정만 확인",
    };
  }
  const isLive = status === "live";

  if (isLive && source === "multi") {
    return {
      isLive: true,
      canCreate: false,
      shouldShowEvents: true,
      badge: status === "partial" ? "Personal/Company · 일부 연결" : "Personal + Company · read only",
    };
  }

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
    badge: status === "loading" ? "syncing" : status === "error" ? "read failed" : "connection required",
  };
}
