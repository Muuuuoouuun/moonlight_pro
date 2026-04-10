export type HubStatus = "idle" | "running" | "error";

export interface LogEntry {
  context: string;
  payload: Record<string, any>;
  trace: string;
  timestamp: string;
}
