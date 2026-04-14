import type { LogEntry, LogLevel } from "./types";

interface SupabaseLogConfig {
  url: string;
  apiKey: string;
  table: string;
}

function resolveSupabaseLogConfig(): SupabaseLogConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  const table = process.env.SUPABASE_ERROR_LOGS_TABLE?.trim() || "error_logs";

  if (!url || !apiKey) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    apiKey,
    table,
  };
}

async function persistLogEntry(entry: LogEntry) {
  const config = resolveSupabaseLogConfig();

  if (!config) {
    return false;
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/${config.table}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: config.apiKey,
        authorization: `Bearer ${config.apiKey}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify(entry),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn("[HUB-OS-LOG-PERSIST-FAILED]", response.status, detail);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[HUB-OS-LOG-PERSIST-ERROR]", String(error));
    return false;
  }
}

function emit(level: LogLevel, entry: LogEntry) {
  const normalized = {
    ...entry,
    level: entry.level ?? level,
    source: entry.source ?? "system",
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  const prefix = `[HUB-OS-${level.toUpperCase()}]`;
  const message = JSON.stringify(normalized);

  if (level === "error") {
    console.error(prefix, message);
  } else if (level === "warn") {
    console.warn(prefix, message);
  } else {
    console.log(prefix, message);
  }

  return normalized;
}

export async function logEvent(entry: LogEntry) {
  const normalized = emit(entry.level ?? "info", entry);
  await persistLogEntry(normalized);
  return normalized;
}

export async function logError(entry: LogEntry) {
  const normalized = emit("error", entry);
  await persistLogEntry(normalized);
  return normalized;
}

export async function logWarning(entry: LogEntry) {
  const normalized = emit("warn", entry);
  await persistLogEntry(normalized);
  return normalized;
}

export async function logWarn(entry: LogEntry) {
  return logWarning(entry);
}

export async function logInfo(entry: LogEntry) {
  const normalized = emit("info", entry);
  await persistLogEntry(normalized);
  return normalized;
}
