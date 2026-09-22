// 넛지 입력 조립 — IO만 담당하고 판정은 순수 엔진(crm-nudges·calendar-touchpoints)이 한다.
//
// 새 테이블을 만들지 않는다. 이미 있는 것만 읽는다: 매출 데이터(리드·딜·회사), 최근 활동,
// 지난 3일 캘린더. 실패한 소스는 숨기지 않고 failedSources로 이름을 댄다 — 읽기 실패를
// "넛지 없음"으로 위장하면 운영자가 조용히 놓친다.

import { getRevenueLedger } from "./revenue-ledger.js";
import { listRecentActivities } from "./crm-activities.js";
import { readCombinedGoogleCalendarEvents } from "../google-calendar.js";
import { buildCrmNudges } from "../sales-os/crm-nudges.js";
import { findUnrecordedMeetings } from "../sales-os/calendar-touchpoints.js";
import { filterOperatorOwnedRevenue } from "../operator-revenue-scope.js";

const DAY_MS = 86400000;
// 넛지가 보는 활동 창 — 반응·마지막 접점 판정에 30일이면 충분하다.
const ACTIVITY_WINDOW_DAYS = 30;
// 미기록 미팅을 찾는 창. 더 뒤로 가면 "이제 와서 뭘" 하는 잔소리가 된다.
const CALENDAR_LOOKBACK_DAYS = 3;

// 매출 데이터의 리드·딜을 넛지 엔진이 보는 고객 모양으로 접는다.
function toCustomers(revenue) {
  const out = [];
  for (const lead of revenue?.leads || []) {
    if (!lead?.id) continue;
    out.push({
      id: lead.id,
      kind: "lead",
      name: lead.name,
      companyName: lead.companyName || null,
      companyId: lead.companyId || null,
      nextAction: lead.nextAction || "",
      nextActionAt: lead.nextActionAt || null,
      dormant: Boolean(lead.dormant),
      dormantSince: lead.dormantSince || null,
      open: lead.stage !== "Lost",
    });
  }
  for (const deal of revenue?.deals || []) {
    if (!deal?.id || deal.hidden) continue;
    out.push({
      id: deal.id,
      kind: "deal",
      name: deal.name,
      companyName: deal.companyName || null,
      companyId: deal.companyId || null,
      nextAction: deal.nextAction || "",
      nextActionAt: deal.nextActionAt || null,
      dormant: Boolean(deal.dormant),
      dormantSince: deal.dormantSince || null,
      // 딜이 걸어 둔 다음 미팅은 캘린더 확정 매칭의 근거다.
      eventId: deal.nextMeeting?.eventId || null,
      open: !["closing", "lost"].includes(deal.stage),
    });
  }
  return out;
}

// 리드·딜 id → meta.nudges. isSuppressed가 subject.id로 찾는다.
export function collectNudgeSuppressions(revenue) {
  const out = {};
  for (const record of [...(revenue?.leads || []), ...(revenue?.deals || [])]) {
    if (record?.id && record.nudgeSuppression) out[record.id] = record.nudgeSuppression;
  }
  return out;
}

export async function getCrmNudges({ now = Date.now(), ignoredEventIds = [], suppressions = {} } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const since = new Date(nowMs - ACTIVITY_WINDOW_DAYS * DAY_MS).toISOString();

  const [revenue, activities, calendar] = await Promise.all([
    getRevenueLedger().catch(() => ({ source: "error", leads: [], deals: [] })),
    listRecentActivities({ since, limit: 500 }),
    readCombinedGoogleCalendarEvents({
      timeMin: new Date(nowMs - CALENDAR_LOOKBACK_DAYS * DAY_MS).toISOString(),
      timeMax: new Date(nowMs).toISOString(),
      maxResults: 50,
    }).catch(() => ({ ok: false, reason: "calendar-read-failed", items: [] })),
  ]);

  // 매출 데이터를 못 읽으면 넛지의 대상 자체가 없다 — 빈 목록이 아니라 error다.
  if (revenue?.source === "error") {
    return { status: "error", failedSources: ["revenue"], nudges: [], unrecordedMeetings: [] };
  }
  if (revenue?.source !== "supabase") {
    return { status: "preview", failedSources: [], nudges: [], unrecordedMeetings: [] };
  }

  const failedSources = [
    ...(activities === null ? ["crm_activities"] : []),
    // 캘린더 미연결(preview)은 실패가 아니다 — 연결한 적이 없는 것과 못 읽은 것을 가른다.
    ...(!calendar?.ok && !["calendar-not-connected", "missing-connection", "missing-access-token", "missing-config"].includes(calendar?.reason || "")
      ? ["calendar"]
      : []),
  ];

  const owned = filterOperatorOwnedRevenue(revenue);
  const customers = toCustomers(owned);
  // 억제는 대상 레코드의 meta.nudges에 산다(nudge-suppression.js가 씀). 여기서 읽어 넘기지
  // 않으면 숨기기·미루기가 저장만 되고 다음 읽기에 같은 넛지가 그대로 다시 뜬다.
  const storedSuppressions = collectNudgeSuppressions(owned);
  const unrecordedMeetings = findUnrecordedMeetings({
    events: calendar?.ok ? calendar.items : [],
    candidates: customers,
    activities: activities || [],
    ignoredEventIds,
    now: nowMs,
  });

  const nudges = buildCrmNudges({
    customers,
    activities: activities || [],
    unrecordedMeetings,
    suppressions: { ...storedSuppressions, ...suppressions },
    now: nowMs,
  });

  return {
    status: failedSources.length ? "partial" : "live",
    failedSources,
    calendarConnected: Boolean(calendar?.ok),
    nudges,
    unrecordedMeetings,
  };
}
