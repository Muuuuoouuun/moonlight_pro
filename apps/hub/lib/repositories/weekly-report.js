// 주간 정리 리포트 원장 — Q118·Q119 확정(2026-08-18).
// 목요일 아침 = 회사(ClassIn) 리포트, 월요일 아침 = 개인 리포트. 7일 윈도의 실제
// 기록(완료 할 일·연락 기록·딜 변화·발행)만 집계한다. read 실패는 0으로 뭉개지 않고
// error/failedSources로 명명한다(§5.3 source truth — 코어 read 실패 계약).

import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";

const WINDOW_DAYS = 7;

// 딜의 열린 단계(정체 후보) — followups-ledger와 같은 어휘.
const OPEN_STAGES = new Set(["prospect", "proposal", "negotiation", "lead", "qualified", "qual", "neg", "prop"]);

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// scope: 'company'(ClassIn 세일즈 축) | 'personal'(개인 실행 축).
// 두 리포트가 다른 질문에 답한다 — 회사: 파이프라인이 움직였는가, 개인: 내가 실행했는가.
export async function getWeeklyReport({ scope = "personal", windowDays = WINDOW_DAYS } = {}) {
  const since = new Date(Date.now() - windowDays * 86400e3).toISOString();

  const [taskRows, outcomeRows, dealRows, publishRows] = await Promise.all([
    fetchSupabaseRows("tasks", {
      select: "id,title,status,updated_at",
      filters: withWorkspaceFilter([
        ["status", eqFilter("done")],
        ["updated_at", `gte.${since}`],
      ]),
      limit: 300,
    }),
    fetchSupabaseRows("outreach_outcomes", {
      select: "id,action,occurred_at,lead_id,company_id",
      filters: withWorkspaceFilter([["occurred_at", `gte.${since}`]]),
      limit: 300,
    }),
    fetchSupabaseRows("deals", {
      // deals에 type 컬럼은 없다(스키마 + 0018 마이그레이션) — 정체성은 meta.type.
      select: "id,title,stage,amount,meta,created_at,updated_at",
      filters: withWorkspaceFilter([["updated_at", `gte.${since}`]]),
      limit: 300,
    }),
    fetchSupabaseRows("publish_logs", {
      select: "id,created_at",
      filters: withWorkspaceFilter([["created_at", `gte.${since}`]]),
      limit: 200,
    }),
  ]);

  const failedSources = [
    ...(taskRows === null ? ["tasks"] : []),
    ...(outcomeRows === null ? ["outreach_outcomes"] : []),
    ...(dealRows === null ? ["deals"] : []),
    ...(publishRows === null ? ["publish_logs"] : []),
  ];
  // 네 소스 전부 실패면 이 리포트에 사실이 하나도 없다 — partial 대신 error.
  if (failedSources.length === 4) {
    return {
      source: "error",
      error: "weekly-report-read-failed",
      configured: true,
      scope,
      windowDays,
      failedSources,
      stats: null,
      highlights: [],
    };
  }

  const tasks = taskRows || [];
  const outcomes = outcomeRows || [];
  const deals = dealRows || [];
  const publishes = publishRows || [];

  // 회사 리포트는 company 타입 딜만, 개인 리포트는 personal 타입 딜만 본다.
  // (레거시 딜의 type: 'company' | 'personal' — workspace-map과 같은 어휘.)
  const scopedDeals = deals.filter((d) => {
    const t = d.type ?? d.meta?.type;
    return scope === "company" ? t !== "personal" : t === "personal";
  });
  const newDeals = scopedDeals.filter((d) => d.created_at && d.created_at >= since);
  const openDeals = scopedDeals.filter((d) => OPEN_STAGES.has(String(d.stage || "").toLowerCase()));
  const wonDeals = scopedDeals.filter((d) => {
    const s = String(d.stage || "").toLowerCase();
    return s === "closing" || s === "won" || s === "closed_won";
  });
  const wonAmount = wonDeals.reduce((sum, d) => sum + toNum(d.amount), 0);

  const stats = scope === "company"
    ? {
        contacts: outcomes.length,
        newDeals: newDeals.length,
        movedDeals: openDeals.length,
        wonDeals: wonDeals.length,
        wonAmount,
      }
    : {
        doneTasks: tasks.length,
        publishes: publishes.length,
        contacts: outcomes.length,
        personalDeals: scopedDeals.length,
      };

  // 하이라이트: 리포트가 숫자만 나열하지 않게 실제 제목을 몇 개 남긴다(§10 운영자 카피).
  const highlights = scope === "company"
    ? wonDeals.slice(0, 3).map((d) => ({ kind: "won", label: d.title || "딜" }))
    : tasks.slice(0, 3).map((t) => ({ kind: "done", label: t.title || "할 일" }));

  return {
    source: "supabase",
    configured: true,
    scope,
    windowDays,
    since,
    partial: failedSources.length > 0,
    failedSources,
    stats,
    highlights,
  };
}
