// 첫 화면 확정 슬롯 (docs/README §2 · deep-design §7): 긴급 KA 최대 1건 · 집중 고객 3~5건 ·
// 오늘 일정. 이전에는 집중 고객이 tone 정렬 신호 큐(QUEUE_LIMIT=2)에 섞여 일상적으로
// 화면에서 소실됐고, KA·일정 슬롯은 아예 없었다(2026-08-05 system-eval B-3/B-4).
// 서버(UTC) 실행 전제 — 날짜 판정은 전부 KST day-key로 한다.

import { filterOperatorOwnedRevenue, selectOperatorFocusLeads } from "./operator-revenue-scope.js";

const TIME_ZONE = "Asia/Seoul";

function kstDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // en-CA → YYYY-MM-DD. 날짜-only 문자열("2026-08-05")은 UTC 자정 파싱 → KST 같은 날.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function diffKstDays(fromKey, toKey) {
  if (!fromKey || !toKey) return 0;
  return Math.round((Date.parse(toKey) - Date.parse(fromKey)) / 86400000);
}

function timeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

// 긴급 KA: KA 표시 회사(companies.meta.ka)에 걸린 운영자 소유 레코드 중 가장 급한 1건.
// 리드는 다음 행동 기한이 오늘이거나 지났을 때, 딜은 7일 이상 방치됐을 때 후보가 된다.
// 후보가 없으면 null — 빈 슬롯을 자리표시자로 채우지 않는다(§2 최대 1건).
export function selectUrgentKa(revenue = {}, now = new Date()) {
  const companies = Array.isArray(revenue.companies) ? revenue.companies : [];
  const kaCompanies = new Map(companies.filter((c) => c?.ka).map((c) => [c.id, c]));
  if (!kaCompanies.size) return null;

  const todayKey = kstDayKey(now);
  const owned = filterOperatorOwnedRevenue(revenue);
  const candidates = [];

  owned.leads.forEach((lead) => {
    if (!lead?.companyId || !kaCompanies.has(lead.companyId) || lead.dormant) return;
    const dueKey = lead.nextActionAt ? kstDayKey(lead.nextActionAt) : "";
    if (!dueKey || dueKey > todayKey) return;
    const overdueDays = diffKstDays(dueKey, todayKey);
    candidates.push({
      kind: "lead",
      id: lead.id,
      name: lead.name,
      company: kaCompanies.get(lead.companyId)?.name || lead.companyName || null,
      nextAction: lead.nextAction || "",
      overdueDays,
      reason: overdueDays > 0 ? `다음 행동 ${overdueDays}일 지남` : "오늘 연락 예정",
      href: `dashboard/revenue/customers?customer=${encodeURIComponent(`lead:${lead.id}`)}`,
    });
  });

  owned.deals.forEach((deal) => {
    if (!deal?.companyId || !kaCompanies.has(deal.companyId) || deal.hidden) return;
    const age = Number(deal.age) || 0;
    if (age < 7) return;
    candidates.push({
      kind: "deal",
      id: deal.id,
      name: deal.name,
      company: kaCompanies.get(deal.companyId)?.name || null,
      nextAction: "정체 딜 재가동",
      overdueDays: age,
      reason: `${age}일째 활동 없음`,
      href: `dashboard/revenue/deals?deal=${encodeURIComponent(deal.id)}`,
    });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.overdueDays - a.overdueDays);
  return candidates[0];
}

// 첫 화면은 우선순위 판정을 두 벌 돌린다: 확정 슬롯(buildDailyFocus)과 tone 정렬 신호 큐
// (daily-brief 라우트의 build*Signals). 둘 다 같은 selectOperatorFocusLeads를 호출해서 같은
// 고객이 「집중 고객」 슬롯과 「결정 큐」에 동시에 렌더됐고, 헤더 "신호 N"이 그 중복까지 세서
// 5초 판단의 첫 앵커를 화면에서 검증할 수 없었다(2026-08-07 사용성 재감사 A).
// 규칙: 확정 슬롯이 정본이고, 신호 큐는 슬롯이 다루지 않는 나머지만 싣는다.
export function focusOccupiedKeys(dailyFocus) {
  const keys = new Set();
  const ka = dailyFocus?.urgentKa?.item;
  if (ka?.kind && ka?.id) keys.add(`${ka.kind}:${ka.id}`);
  (dailyFocus?.focusCustomers?.items || []).forEach((item) => {
    if (item?.id) keys.add(`lead:${item.id}`);
  });
  return keys;
}

// 신호는 `subject: { type, id }`로 자기가 가리키는 원장 레코드를 밝힌다. subject가 없는
// 집계 신호(복합 리스크·신규 리드 묶음 등)는 슬롯과 1:1 대응이 아니므로 그대로 둔다.
// 반드시 정원 slice 앞에서 호출한다 — 뒤에서 걸면 중복이 자리를 먹고 진짜 신호가 잘린다.
export function withoutFocusDuplicates(signals, dailyFocus) {
  const list = Array.isArray(signals) ? signals : [];
  const occupied = focusOccupiedKeys(dailyFocus);
  if (!occupied.size) return list;
  return list.filter((signal) => {
    const subject = signal?.subject;
    if (!subject?.type || !subject?.id) return true;
    return !occupied.has(`${subject.type}:${subject.id}`);
  });
}

// 슬롯 묶음 — 각 슬롯이 자기 소스의 truth 상태를 따로 들고 간다(§5.3: 캘린더 미연결이
// 매출 슬롯을 preview로 오염시키지 않는다).
export function buildDailyFocus({ revenue, calendar, now = new Date() } = {}) {
  const revenueReadable = revenue?.source === "supabase";
  // 라이브 read 실패는 error — preview("미구성")로 뭉개면 첫 화면 KA/집중 슬롯이
  // "연결하세요" 카피와 함께 무언 공백이 된다(4차 재감사 M).
  const revenueState = revenueReadable ? "live" : revenue?.source === "error" ? "error" : "preview";
  const focusLeads = revenueReadable ? selectOperatorFocusLeads(revenue, { limit: 5 }) : [];
  const todayKey = kstDayKey(now);
  const calendarOk = Boolean(calendar?.ok);
  const events = calendarOk && Array.isArray(calendar.items) ? calendar.items : [];

  const agendaItems = events
    .map((event, index) => {
      const start = event?.start?.dateTime || event?.start?.date || "";
      if (!start || kstDayKey(start) !== todayKey) return null;
      const allDay = Boolean(event?.start?.date && !event?.start?.dateTime);
      return {
        id: event?.id || String(index),
        title: event?.summary || "(제목 없는 일정)",
        whenAt: start,
        whenLabel: allDay ? "종일" : timeLabel(start),
        allDay,
        calendarLink: event?.htmlLink || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      // 종일 일정이 맨 위(하루의 컨텍스트), 나머지는 시작 시각순.
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.whenAt).getTime() - new Date(b.whenAt).getTime();
    })
    .slice(0, 8);

  return {
    urgentKa: {
      state: revenueState,
      item: revenueReadable ? selectUrgentKa(revenue, now) : null,
    },
    focusCustomers: {
      state: revenueState,
      // deep-design §7 행동 행 최소 정보: 지금 올린 이유 · 기한(또는 기약 없음) · 최근 활동.
      items: focusLeads.map((lead) => {
        const dueKey = lead.nextActionAt ? kstDayKey(lead.nextActionAt) : "";
        const overdueDays = dueKey ? diffKstDays(dueKey, todayKey) : 0;
        return {
          id: lead.id,
          name: lead.name,
          company: lead.companyName || null,
          nextAction: lead.nextAction || "",
          score: Number.isFinite(lead.score) ? Math.round(lead.score) : null,
          dueLabel: !dueKey
            ? "기약 없음"
            : overdueDays > 0
              ? `기한 ${overdueDays}일 지남`
              : overdueDays === 0
                ? "오늘까지"
                : `기한 ${dueKey.slice(5).replace("-", ".")}`,
          dueOverdue: Boolean(dueKey) && overdueDays > 0,
          lastTouch: lead.last || null,
          reason: lead.focusOverride === "raise"
            ? "수동 상향"
            : dueKey && overdueDays >= 0
              ? "다음 행동 기한 도래"
              : "다음 행동 대기",
          href: `dashboard/revenue/customers?customer=${encodeURIComponent(`lead:${lead.id}`)}`,
        };
      }),
    },
    todayAgenda: {
      // 미연결 계열(missing-*)만 preview — 그 외(read 실패·타임아웃·토큰 만료)는 error.
      state: calendarOk
        ? "live"
        : ["calendar-not-connected", "missing-connection", "missing-access-token", "missing-config"].includes(calendar?.reason || "calendar-not-connected")
          ? "preview"
          : "error",
      reason: calendarOk ? "" : calendar?.reason || "calendar-not-connected",
      items: agendaItems,
    },
  };
}
