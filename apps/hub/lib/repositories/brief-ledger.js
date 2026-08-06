// Morning-brief reader — the missing consumer of the Chief of Staff cron's output.
//
// /api/cron/chief-of-staff writes its composed "오늘 이 3개만" brief to project_updates
// (event_type 'ai.morning_brief', project_id null). Every other project_updates reader is
// project-scoped and drops null-project rows, so without this reader the brief lands in a
// table nobody consumes. Daily Brief surfaces it via getMorningBrief.

import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { resolveSupabaseConfig } from "@/lib/server-write";

// Only a fresh brief is a brief — yesterday's agenda shown as "today" violates signal-first.
const DEFAULT_WINDOW_HOURS = 24;

export async function getMorningBrief({ withinHours = DEFAULT_WINDOW_HOURS } = {}) {
  // preview는 미구성 전용 — 아래 error 분기가 sources에 편입되면서(7차) 미구성 환경이
  // 팬텀 "read 실패"로 표시되지 않도록 구성 여부를 먼저 가른다.
  if (!resolveSupabaseConfig()) return { source: "preview", brief: null };
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();

  const rows = await fetchSupabaseRows("project_updates", {
    filters: withWorkspaceFilter([
      ["event_type", eqFilter("ai.morning_brief")],
      ["happened_at", `gte.${since}`],
    ]),
    order: "happened_at.desc",
    limit: 1,
  });
  // read 실패는 error — preview로 두면 "cron 미실행"과 구분되지 않는다(6차 재감사 S).
  if (!rows) return { source: "error", error: "brief-ledger-read-failed", brief: null };

  const row = rows[0];
  if (!row) return { source: "supabase", brief: null };

  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    source: "supabase",
    brief: {
      id: row.id,
      title: row.title || "오늘의 브리핑",
      summary: row.summary || "",
      items: Array.isArray(payload.items) ? payload.items : [],
      counts: {
        queue: Number(payload.queue) || 0,
        deals: Number(payload.deals) || 0,
      },
      generatedAt: row.happened_at || row.created_at || null,
    },
  };
}
