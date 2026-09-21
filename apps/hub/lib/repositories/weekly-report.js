// 주간 정리 리포트 원장 — Q118·Q119 확정(2026-08-18).
// 목요일 아침 = 회사(ClassIn) 리포트, 월요일 아침 = 개인 리포트. 7일 윈도의 실제
// 기록(완료 할 일·연락 기록·딜 변화·발행·오늘 3개·메모·하루 리뷰)만 집계한다. read 실패는
// 0으로 뭉개지 않고 error/failedSources로 명명한다(§5.3 source truth — 코어 read 실패 계약).
//
// 집계 원천(2026-09-20 세 축·Action KPI 기획 §6.4·§7.3 — 원천 교정):
// - 완료 할 일은 `completed_at`으로 센다. 이전의 `status=done AND updated_at` 집계는 3주 전에
//   끝낸 할 일의 제목만 고쳐도 이번 주 완료로 잡혔다.
// - 연락은 `crm_activities`로 센다. 이전의 `outreach_outcomes`는 유일한 writer 라우트
//   (/api/integrations/outcomes/record)의 UI 호출자가 0이라 실제 연락(record_contact_outcome_v1)이
//   항상 0으로 나왔다.
// - "이동 딜"은 `crm_activities(kind='deal', meta.from/to)` 행 수다. 이전 값은 열린 딜 수였다.

import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { buildWeeklyScorecard } from "@/lib/campaign-business-truth";
import { dateKeyInZone, focusDatesOf, TASK_TIME_ZONE } from "@/lib/task-today";
import { CONTACT_ACTIVITY_KINDS, isContactActivity } from "@/lib/contact-activity";

export { CONTACT_ACTIVITY_KINDS };

const WINDOW_DAYS = 7;

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isStageMove(row) {
  return row.kind === "deal" && row.meta && typeof row.meta === "object" && Boolean(row.meta.from || row.meta.to);
}

// 오늘 3개 — 창 안의 날짜에 고른 할 일과 그 날짜(KST)에 끝낸 할 일을 센다. 분모는 선택 수,
// 분자는 같은 날 완료 수. 재오픈(done→todo)은 completed_at을 비우므로 소급해 내려간다(§6.2 규칙).
export function summarizeFocusWindow(tasks = [], { since, until, timeZone = TASK_TIME_ZONE } = {}) {
  const sinceKey = dateKeyInZone(since, timeZone);
  const untilKey = dateKeyInZone(until, timeZone);
  let picked = 0;
  let done = 0;
  const days = new Set();
  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    const completedKey = dateKeyInZone(task.completed_at ?? task.completedAt, timeZone);
    focusDatesOf(task).forEach((day) => {
      if (sinceKey && day < sinceKey) return;
      if (untilKey && day > untilKey) return;
      picked += 1;
      days.add(day);
      if (completedKey && completedKey === day) done += 1;
    });
  });
  return {
    picked,
    done,
    days: days.size,
    rate: picked > 0 ? Math.round((done / picked) * 100) : null,
  };
}

// scope: 'company'(ClassIn 세일즈 축) | 'personal'(개인 실행 축).
// 두 리포트가 다른 질문에 답한다 — 회사: 파이프라인이 움직였는가, 개인: 내가 실행했는가.
export async function getWeeklyReport({ scope = "personal", windowDays = WINDOW_DAYS, now = new Date() } = {}) {
  const until = new Date(now.getTime());
  const since = new Date(now.getTime() - windowDays * 86400e3).toISOString();
  const sinceDateKey = dateKeyInZone(since, TASK_TIME_ZONE);

  const personal = scope === "personal";
  const [taskRows, focusRows, activityRows, dealRows, publishRows, memoRows, reviewRows, campaignRows] = await Promise.all([
    fetchSupabaseRows("tasks", {
      select: "id,title,status,completed_at,updated_at",
      filters: withWorkspaceFilter([
        ["status", eqFilter("done")],
        ["completed_at", `gte.${since}`],
      ]),
      order: "completed_at.desc",
      limit: 300,
    }),
    personal
      ? fetchSupabaseRows("tasks", {
          select: "id,status,completed_at,meta",
          filters: withWorkspaceFilter([["meta->>focus_dates", "not.is.null"]]),
          order: "updated_at.desc",
          limit: 300,
        })
      : Promise.resolve([]),
    fetchSupabaseRows("crm_activities", {
      select: "id,kind,occurred_at,entity_type,lead_id,deal_id,meta",
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
    personal
      ? fetchSupabaseRows("journal_entries", {
          select: "id,entry_kind,occurred_at,created_at",
          filters: withWorkspaceFilter([
            ["entry_kind", eqFilter("note")],
            ["created_at", `gte.${since}`],
          ]),
          limit: 300,
        })
      : Promise.resolve([]),
    personal
      ? fetchSupabaseRows("journal_entries", {
          select: "id,entry_kind,review_date",
          filters: withWorkspaceFilter([
            ["entry_kind", eqFilter("daily_review")],
            ["review_date", `gte.${sinceDateKey}`],
          ]),
          limit: 31,
        })
      : Promise.resolve([]),
    personal
      ? fetchSupabaseRows("campaigns", {
          select: "id,name,status,meta,updated_at",
          filters: withWorkspaceFilter([["status", eqFilter("active")]]),
          order: "updated_at.desc",
          limit: 20,
        })
      : Promise.resolve([]),
  ]);

  const failedSources = [
    ...(taskRows === null ? ["tasks"] : []),
    ...(personal && focusRows === null ? ["tasks:focus"] : []),
    ...(activityRows === null ? ["crm_activities"] : []),
    ...(dealRows === null ? ["deals"] : []),
    ...(publishRows === null ? ["publish_logs"] : []),
    ...(personal && memoRows === null ? ["journal_entries:note"] : []),
    ...(personal && reviewRows === null ? ["journal_entries:daily_review"] : []),
    ...(personal && campaignRows === null ? ["campaigns"] : []),
  ];
  const sourceCount = personal ? 8 : 4;
  // 집계 소스가 전부 실패면 이 리포트에 사실이 하나도 없다 — partial 대신 error.
  if (failedSources.length === sourceCount) {
    return {
      source: "error",
      error: "weekly-report-read-failed",
      configured: true,
      scope,
      windowDays,
      failedSources,
      stats: null,
      scorecard: null,
      highlights: [],
    };
  }

  const tasks = taskRows || [];
  const activities = activityRows || [];
  const deals = dealRows || [];
  const publishes = publishRows || [];
  const memos = memoRows || [];
  const reviews = reviewRows || [];
  const campaigns = campaignRows || [];

  const contacts = activities.filter(isContactActivity);
  const stageMoves = activities.filter(isStageMove);

  // 회사 리포트는 company 타입 딜만, 개인 리포트는 personal 타입 딜만 본다.
  // (레거시 딜의 type: 'company' | 'personal' — workspace-map과 같은 어휘.)
  const scopedDeals = deals.filter((d) => {
    const t = d.type ?? d.meta?.type;
    return scope === "company" ? t !== "personal" : t === "personal";
  });
  const newDeals = scopedDeals.filter((d) => d.created_at && d.created_at >= since);
  const wonDeals = scopedDeals.filter((d) => {
    const s = String(d.stage || "").toLowerCase();
    return s === "closing" || s === "won" || s === "closed_won";
  });
  const wonAmount = wonDeals.reduce((sum, d) => sum + toNum(d.amount), 0);

  const focus = personal ? summarizeFocusWindow(focusRows || [], { since, until }) : null;

  const stats = scope === "company"
    ? {
        contacts: contacts.length,
        newDeals: newDeals.length,
        movedDeals: stageMoves.length,
        wonDeals: wonDeals.length,
        wonAmount,
      }
    : {
        doneTasks: tasks.length,
        publishes: publishes.length,
        contacts: contacts.length,
        personalDeals: scopedDeals.length,
        focusPicked: focus.picked,
        focusDone: focus.done,
        focusRate: focus.rate,
        focusDays: focus.days,
        memos: memos.length,
        reviewDays: reviews.length,
      };

  let scorecard = null;
  if (personal) {
    for (const campaign of campaigns) {
      const campaignScorecard = buildWeeklyScorecard(campaign.meta);
      if (!campaignScorecard) continue;
      scorecard = {
        campaignId: campaign.id,
        campaignName: campaign.name || "캠페인",
        ...campaignScorecard,
      };
      break;
    }
  }

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
    scorecard,
    highlights,
  };
}
