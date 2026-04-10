import { LogEntry } from "./types";

export async function logError(entry: LogEntry) {
  console.error("[HUB-OS-ERROR]", JSON.stringify(entry));
  // 추후 Supabase 에러 테이블 연결 로직 추가
}
