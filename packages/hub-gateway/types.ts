export type HubStatus = "idle" | "running" | "error";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  context: string;
  payload: Record<string, unknown>;
  trace: string;
  timestamp: string;
  level?: LogLevel;
  source?: string;
  workspace_id?: string;
  automation_run_id?: string;
}
