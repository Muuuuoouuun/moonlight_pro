import { insertSupabaseRecord } from "@com-moon/supabase-rest";

import type { LogEntry, LogLevel } from "./types";

function resolveLogTable() {
  return process.env.SUPABASE_ERROR_LOGS_TABLE?.trim() || "error_logs";
}

async function persistLogEntry(entry: LogEntry) {
  const result = await insertSupabaseRecord(resolveLogTable(), { ...entry });

  if (!result.persisted && result.reason !== "missing-config") {
    console.warn("[HUB-OS-LOG-PERSIST-FAILED]", result.reason, result.detail || "");
  }

  return result.persisted;
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
