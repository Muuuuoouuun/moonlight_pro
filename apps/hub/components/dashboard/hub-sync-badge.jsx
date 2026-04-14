"use client";

import { useEffect, useState } from "react";

/**
 * Relative-time pill that surfaces the latest GitHub sync freshness
 * without polluting the hub shell with data it doesn't own.
 *
 * Pages that have sync information (PMS, Roadmap, Releases) render
 * <HubSyncBadge syncAt={iso} connectionTone="green" /> in their page
 * head, and the badge recomputes relative time every 30s on the
 * client so "2분 전" → "3분 전" without a full reload.
 */
function formatRelative(ms, locale = "ko-KR") {
  if (!Number.isFinite(ms)) return null;
  const deltaMs = Date.now() - ms;
  const sign = deltaMs < 0 ? 1 : -1;
  const abs = Math.abs(deltaMs);
  const units = [
    { unit: "day", ms: 86_400_000 },
    { unit: "hour", ms: 3_600_000 },
    { unit: "minute", ms: 60_000 },
    { unit: "second", ms: 1_000 },
  ];
  for (const { unit, ms: unitMs } of units) {
    if (abs >= unitMs || unit === "second") {
      const value = Math.round(abs / unitMs) * sign;
      try {
        return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
      } catch {
        return `${Math.abs(value)}${unit[0]}`;
      }
    }
  }
  return null;
}

export function HubSyncBadge({ syncAt, tone = "green", label = "Last sync" }) {
  const [relative, setRelative] = useState(() => {
    if (!syncAt) return null;
    return formatRelative(new Date(syncAt).getTime());
  });

  useEffect(() => {
    if (!syncAt) return undefined;
    const ms = new Date(syncAt).getTime();
    const tick = () => setRelative(formatRelative(ms));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [syncAt]);

  if (!syncAt || !relative) {
    return (
      <span className="hub-sync-badge" data-tone={tone}>
        {label} · pending
      </span>
    );
  }

  return (
    <span className="hub-sync-badge" data-tone={tone}>
      {label} · {relative}
    </span>
  );
}
