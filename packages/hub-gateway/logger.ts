import { LogEntry } from "./types"

// ─── Supabase REST insert (fetch — no extra dependency) ───────────────────────
async function persistToSupabase(entry: LogEntry & { severity: string }): Promise<void> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Skip if env vars not configured (dev / placeholder)
  if (!url || !key || url.includes("placeholder")) return

  await fetch(`${url}/rest/v1/error_logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      context:   entry.context,
      payload:   entry.payload,
      trace:     entry.trace,
      timestamp: entry.timestamp,
      severity:  entry.severity,
    }),
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function logError(entry: LogEntry): Promise<void> {
  console.error("[HUB-OS-ERROR]", JSON.stringify(entry))
  try {
    await persistToSupabase({ ...entry, severity: "error" })
  } catch {
    // logger must never throw — fail silently
  }
}

export async function logWarn(entry: LogEntry): Promise<void> {
  console.warn("[HUB-OS-WARN]", JSON.stringify(entry))
  try {
    await persistToSupabase({ ...entry, severity: "warn" })
  } catch {
    // fail silently
  }
}

export async function logInfo(entry: LogEntry): Promise<void> {
  console.info("[HUB-OS-INFO]", JSON.stringify(entry))
  try {
    await persistToSupabase({ ...entry, severity: "info" })
  } catch {
    // fail silently
  }
}
