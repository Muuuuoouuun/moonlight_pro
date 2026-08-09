import { NextResponse } from "next/server";

import { getAttentionLedger } from "@/lib/repositories/attention-ledger";
import { getAutomationsLedger } from "@/lib/repositories/automations-ledger";
import { getMorningBrief } from "@/lib/repositories/brief-ledger";
import { getContentLedger } from "@/lib/repositories/content-ledger";
import { getWorkLedger } from "@/lib/repositories/work-ledger";
import { getWorkOrders } from "@/lib/sales-os/work-orders";
import {
  buildContentBrandCatalog,
  filterContentLedgerToBrandLanes,
} from "@/lib/content-brand-catalog";
import { buildOperatorHomeSummary } from "@/lib/operator-home-summary";
import { buildTaskToday } from "@/lib/task-today";
import {
  filterOperatorOwnedRevenue,
  selectOperatorFocusLeads,
} from "@/lib/operator-revenue-scope";
import { buildDailyFocus, withoutFocusDuplicates } from "@/lib/daily-focus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ledgerState(result) {
  if (result.status === "rejected") return "error";
  if (result.value?.source === "error") return "error";
  if (result.value?.source === "supabase") return result.value.partial ? "partial" : "live";
  return "preview";
}

function readLedger(result, fallback = {}) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return "₩0";
  if (n >= 1000000) return `₩${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₩${Math.round(n / 1000)}K`;
  return `₩${n}`;
}

// spark는 실측 시계열이 있을 때만 채운다 — 합성 기본값을 넣으면 라이브 지표 옆에 지어낸
// 상승 곡선이 실데이터처럼 렌더된다(§2 운영결과 6 위반). 없으면 클라이언트가 생략한다.
function metric(label, value, delta, tone = "moon", spark = null) {
  return { label, value, delta, tone, spark };
}

function action(label, actionKey, primary = false) {
  return { label, action: actionKey, primary };
}

// Cross-pillar risk: the strategist judgment a solo operator lacks bandwidth for.
// (a) best-effort — a stale deal and a blocked project that share a name token = one account
//     at risk on two fronts. (b) reliable — when >=2 danger fronts pile up today, surface the
//     convergence so the operator triages once instead of pillar-by-pillar.
const RISK_STOP = new Set(["도입", "프로젝트", "deal", "project", "리뉴얼", "운영"]);

function nameTokens(name) {
  return String(name || "")
    .toLowerCase()
    .split(/[\s·,/|—\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !RISK_STOP.has(t));
}

// staleDealIds: attention 원장(§4 공식)의 stalled 판정 — 이 라우트의 자체 age>=10 하드코딩을
// 대체한다(A-1 컷오버 + §8.1 STALLED_DAYS 단일 기준). operator 스코프는 revenue.deals 조인이 보장.
function buildUnifiedRiskSignals(revenue, projects, automations, staleDealIds = new Set()) {
  const staleDeals = (Array.isArray(revenue.deals) ? revenue.deals : []).filter(
    (d) => staleDealIds.has(d.id),
  );
  const blocked = (Array.isArray(projects.projects) ? projects.projects : []).filter(
    (p) => p.status === "Blocked",
  );
  const failedRuns = (Array.isArray(automations.runs) ? automations.runs : []).filter(
    (r) => r.status === "err" || r.statusKey === "failure",
  );

  // (a) name-overlap join — same account on two fronts
  for (const deal of staleDeals) {
    const dealTokens = new Set(nameTokens(deal.name));
    for (const project of blocked) {
      const overlap = nameTokens(project.name).find((t) => dealTokens.has(t));
      if (overlap) {
        return [{
          id: `risk-converge-${deal.id}-${project.id}`,
          tone: "danger",
          kind: "Risk",
          title: `${overlap} — 두 전선에서 위험`,
          summary: `정체 딜 "${deal.name}"(${deal.age}일)과 막힌 프로젝트 "${project.name}"이 같은 축에서 동시에 위험합니다. 한 번에 정리하세요.`,
          meta: "Cross-pillar · deal × project",
          source: { from: "Risk", ref: deal.id },
          decisions: [
            action("딜 열기", "deals", true),
            action("프로젝트 열기", "projects"),
            action("오늘 보류", "wait"),
          ],
        }];
      }
    }
  }

  // (b) convergence — >=2 danger fronts today
  const fronts = [];
  if (staleDeals.length) fronts.push(`정체 딜 ${staleDeals.length}`);
  if (blocked.length) fronts.push(`막힌 프로젝트 ${blocked.length}`);
  if (failedRuns.length) fronts.push(`실패 run ${failedRuns.length}`);
  if (fronts.length >= 2) {
    return [{
      id: "risk-convergence",
      tone: "danger",
      kind: "Risk",
      title: `복합 리스크 — ${fronts.length}개 전선`,
      summary: `${fronts.join(" · ")}이(가) 동시에 쌓였습니다. 우선순위를 정해 한 화면에서 처리하세요.`,
      meta: "Cross-pillar · convergence",
      source: { from: "Risk", ref: "TODAY" },
      decisions: [
        action("Revenue 보기", "revenue", true),
        action("프로젝트 보기", "projects"),
      ],
    }];
  }

  return [];
}

// Pending approvals nudge — the proposed work-order queue surfaced in the signal feed.
// Groups by persona so this reads as "which agents are waiting on me" instead of just
// a bare count — the same roster Council/Orders show, not a separately invented one.
function buildApprovalSignals(queue) {
  const pending = queue?.pending || 0;
  if (!pending) return [];
  const orders = queue.orders || [];
  const byPersona = new Map();
  orders.forEach((o) => {
    const key = o.persona || "미지정";
    byPersona.set(key, (byPersona.get(key) || 0) + 1);
  });
  const personaBreakdown = Array.from(byPersona.entries())
    .map(([persona, count]) => (count > 1 ? `${persona} ${count}` : persona))
    .join(" · ");
  const preview = orders.slice(0, 3).map((o) => o.title).join(" · ");
  return [{
    id: "queue-approvals",
    tone: "neutral",
    kind: "Queue",
    title: `승인 대기 ${pending}건 — ${personaBreakdown}`,
    summary: preview || "페르소나·인박스가 제안한 액션이 승인을 기다립니다.",
    meta: "Work orders · proposed",
    source: { from: "Agents", ref: "PROPOSED" },
    decisions: [action("승인 큐 확인", "queueApprovals", true)],
  }];
}

function buildRevenueSignals(revenue, staleDealIds = new Set()) {
  const deals = Array.isArray(revenue.deals) ? revenue.deals : [];
  const leads = Array.isArray(revenue.leads) ? revenue.leads : [];
  const signals = [];

  selectOperatorFocusLeads(revenue).forEach((lead) => {
    signals.push({
      id: `revenue-focus-${lead.id}`,
      // subject = 이 신호가 가리키는 원장 레코드. 첫 화면 확정 슬롯이 같은 레코드를 이미
      // 렌더했는지 판정하는 유일한 근거다(withoutFocusDuplicates).
      subject: { type: "lead", id: lead.id },
      tone: "neutral",
      kind: "Revenue",
      title: `${lead.name} — 고객 성공 후속`,
      summary: lead.nextAction,
      meta: "Focus customer · verified owner",
      source: { from: "Leads", ref: lead.id },
      decisions: [
        action("리드 열기", "leads", true),
        action("오늘 보류", "wait"),
      ],
    });
  });

  // 정체 딜 판정은 attention 원장이 정본(§4 "다음 연락 시점 지남" = STALLED_DAYS 14) —
  // 이 라우트의 자체 age>=10 밴드는 §8.1 단일 기준 위반이었고, 내 작업과 첫 화면이 같은
  // 딜을 다르게 판정했다(A-1). stalled(14+)는 즉시 손실 위험이라 전부 danger.
  deals
    .filter((deal) => staleDealIds.has(deal.id))
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 2)
    .forEach((deal) => {
      signals.push({
        id: `revenue-stale-${deal.id}`,
        subject: { type: "deal", id: deal.id },
        tone: "danger",
        kind: "Revenue",
        title: `${deal.name} — ${deal.age}일째 정체`,
        summary: `${deal.stage} 단계에서 마지막 활동이 오래됐습니다. 오늘 follow-up을 보내거나 다음 액션을 명확히 정해야 합니다.`,
        meta: `Deal · ${formatMoney(deal.value)} · close ${deal.close}`,
        source: { from: "Deals", ref: deal.id },
        decisions: [
          action("리마인드 초안", "followup", true),
          action("딜 보드 열기", "deals"),
          action("오늘 보류", "wait"),
        ],
      });
    });

  const newLeads = leads.filter((lead) => lead.stage === "New").slice(0, 3);
  if (newLeads.length) {
    signals.push({
      id: "revenue-new-leads",
      tone: "neutral",
      kind: "Revenue",
      title: `신규 리드 ${newLeads.length}건 분류 대기`,
      summary: newLeads.map((lead) => lead.name).join(" · "),
      meta: "Leads · classify within 24h",
      source: { from: "Leads", ref: "NEW" },
      decisions: [
        action("리드 분류", "leads", true),
        action("Revenue 보기", "revenue"),
      ],
    });
  }

  return signals;
}

function buildContentSignals(content) {
  const attention = Array.isArray(content.attention) ? content.attention : [];
  const queue = Array.isArray(content.queue) ? content.queue : [];
  const signals = [];

  attention.slice(0, 2).forEach((item) => {
    signals.push({
      id: `content-${item.id}`,
      tone: item.tone || "warning",
      kind: "Content",
      title: item.title,
      summary: item.hint || "발행 또는 handoff 이력을 확인해야 합니다.",
      meta: "Content · attention",
      source: { from: "Content", ref: item.itemId || item.id },
      decisions: [
        action("Studio에서 확인", "write", true),
        action("Queue 보기", "queue"),
      ],
    });
  });

  const draft = queue.find((item) => ["Draft", "Review", "Ready"].includes(item.status));
  if (draft && signals.length < 2) {
    signals.push({
      id: `content-draft-${draft.id}`,
      tone: "neutral",
      kind: "Content",
      title: `${draft.title} — ${draft.status}`,
      summary: `${draft.kind} / ${draft.channel}. 다음 발행 산출물로 이어갈 수 있습니다.`,
      meta: `Queue · ${draft.when}`,
      source: { from: "Content Queue", ref: draft.id },
      decisions: [
        action("이어쓰기", "write", true),
        action("Queue 보기", "queue"),
      ],
    });
  }

  return signals;
}

function buildAutomationSignals(automations) {
  const runs = Array.isArray(automations.runs) ? automations.runs : [];
  const flows = Array.isArray(automations.automations) ? automations.automations : [];
  const signals = [];

  runs
    .filter((run) => run.status === "err" || run.statusKey === "failure")
    .slice(0, 2)
    .forEach((run) => {
      signals.push({
        id: `automation-failed-${run.id}`,
        tone: "danger",
        kind: "Automation",
        title: `${run.flow} 실패`,
        summary: run.detail || "실패 로그를 열고 재시도 후보인지 확인해야 합니다.",
        meta: `Run · ${run.at} · ${run.ms}ms`,
        source: { from: "Runs", ref: run.correlationId || run.id },
        decisions: [
          action("로그 열기", "review", true),
          action("Flow 확인", "flows"),
        ],
      });
    });

  const paused = flows.find((flow) => flow.status === "Paused");
  if (paused && signals.length < 2) {
    signals.push({
      id: `automation-paused-${paused.id}`,
      tone: "neutral",
      kind: "Automation",
      title: `${paused.name} paused`,
      summary: "중요 flow라면 다시 켜고 최근 실행 로그를 확인하세요.",
      meta: `Flow · ${paused.lastRun}`,
      source: { from: "Automations", ref: paused.id },
      decisions: [
        action("Flow 열기", "flows", true),
        action("Run log", "review"),
      ],
    });
  }

  return signals;
}

function buildWorkSignals(projects, work) {
  const projectRows = Array.isArray(projects.projects) ? projects.projects : [];
  const decisions = Array.isArray(work.decisions) ? work.decisions : [];
  const decisionState = work?.decisionsState?.state;
  const decisionComplete = decisionState
    ? decisionState === "live" || decisionState === "live-empty"
    : work?.source === "supabase"
      && !(work.failedSources || []).includes("decisions")
      && !(work.partialSources || []).includes("decisions");
  const signals = [];

  const blocked = projectRows.find((project) => project.status === "Blocked");
  if (blocked) {
    signals.push({
      id: `work-blocked-${blocked.id}`,
      tone: "danger",
      kind: "Work",
      title: `${blocked.name} blocked`,
      summary: blocked.nextAction || blocked.summary || "막힌 이유와 다음 액션을 정리해야 합니다.",
      meta: `Project · due ${blocked.due}`,
      source: { from: "Projects", ref: blocked.id },
      decisions: [
        action("프로젝트 열기", "projects", true),
        action("결정 기록", "decision"),
      ],
    });
  }

  if (decisionComplete && !decisions.length && signals.length < 2) {
    signals.push({
      id: "work-decision-missing",
      tone: "neutral",
      kind: "Work",
      title: "오늘의 결정 기록이 비어 있습니다",
      summary: "브랜드 자산으로 남길 판단을 하나라도 기록하면 주간 회고와 콘텐츠 전환이 쉬워집니다.",
      meta: "Decision · daily ritual",
      source: { from: "Decisions", ref: "TODAY" },
      decisions: [
        action("결정 기록", "decision", true),
        action("Rhythm 보기", "rhythm"),
      ],
    });
  }

  return signals;
}

function buildMetrics(revenue, content, automations, projects) {
  // 읽지 못한 원장의 지표를 0으로 단언하지 않는다 — 실패한 자동화 read가
  // "Runs failed 0"으로, 매출 블립이 "₩0 MRR"로 위장되던 경로(5차 재감사 M).
  const revenueReadable = revenue?.source === "supabase";
  const contentReadable = content?.source === "supabase";
  const automationsReadable = automations?.source === "supabase";
  const revenueSummary = revenue.summary || {};
  const contentSummary = content.summary || {};
  const automationSummary = automations.summary || {};
  const projectsReadable = projects?.source === "supabase";
  const openProjects = projectsReadable && Array.isArray(projects.projects)
    ? projects.projects.filter((project) => project.status !== "Done").length
    : null;

  return [
    // §5.3: 지표 톤은 실패만 danger — 카테고리/증가에 semantic·moon 배정 금지.
    revenueReadable
      ? metric("MRR", formatMoney(revenueSummary.mrr || 0), revenueSummary.mrr ? "ledger" : "waiting", "neutral")
      : metric("MRR", "—", revenue?.source === "error" ? "revenue read failed" : "ledger unavailable", "neutral"),
    revenueReadable
      ? metric("Pipeline", formatMoney(revenueSummary.pipeline || 0), `${revenueSummary.openDeals || 0} deals`, "neutral")
      : metric("Pipeline", "—", revenue?.source === "error" ? "revenue read failed" : "ledger unavailable", "neutral"),
    contentReadable
      ? metric("Published", String(contentSummary.published || 0), `${contentSummary.drafts || 0} drafts`, "neutral")
      : metric("Published", "—", content?.source === "error" ? "content read failed" : "ledger unavailable", "neutral"),
    automationsReadable
      ? metric("Runs failed", String(automationSummary.failuresToday || 0), `${automationSummary.runsToday || 0} runs`, automationSummary.failuresToday ? "danger" : "neutral")
      : metric("Runs failed", "—", automations?.source === "error" ? "automation read failed" : "ledger unavailable", automations?.source === "error" ? "danger" : "neutral"),
    metric("Open work", openProjects === null ? "—" : String(openProjects), projectsReadable ? "active projects" : "project ledger unavailable", "neutral"),
  ].slice(0, 5);
}

function buildSources(results) {
  return [
    ["projects", "Projects"],
    ["work", "Work"],
    ["content", "Content"],
    ["revenue", "Revenue"],
    ["automations", "Automations"],
    ["orders", "Agents"],
    ["brief", "Brief"], // 아침 브리프 read 실패가 화면에서 무음 소실되지 않게 sources에 편입(7차)
  ].map(([resultKey, label]) => {
    const result = results[resultKey];
    const value = result.status === "fulfilled" ? result.value : null;
    return {
      key: resultKey === "orders" ? "agents" : resultKey,
      label,
      state: ledgerState(result),
      failedSources: Array.isArray(value?.failedSources) ? value.failedSources : [],
      partialSources: Array.isArray(value?.partialSources) ? value.partialSources : [],
      error: value?.source === "error" ? value.error || `${resultKey}-ledger-read-failed` : null,
      retryable: value?.source === "error" ? value.retryable !== false : false,
    };
  });
}

export async function GET() {
  // A-1 컷오버(Phase 1B 잔여 — README §3): tasks·revenue·calendar는 attention 원장을 정본
  // 어댑터로 한 번만 읽는다. 예전엔 이 라우트가 같은 세 원장을 attention과 별개로 다시 읽어
  // "지금 중요한 것" 판정이 첫 화면과 내 작업에서 두 벌로 갈라졌다(정체성 캡의 원인).
  // §7 확정 슬롯(KA·집중 고객·오늘 일정·할 일 레인)은 attention.raw 원본 위의 프로젝션.
  const [attentionResult, workResult, contentResult, automationsResult, ordersResult, briefResult] = await Promise.allSettled([
    getAttentionLedger({ includeRaw: true }),
    getWorkLedger(),
    getContentLedger(),
    getAutomationsLedger(),
    getWorkOrders({ status: "proposed", limit: 20 }),
    getMorningBrief(),
  ]);

  const attention = readLedger(attentionResult, null);
  // attention 자체가 죽으면(예외) 세 원장 전부 read 실패로 명명 — 빈 화면 위장 금지.
  const rawFallback = {
    projectLedger: { source: "error", error: "attention-ledger-request-failed", failedSources: ["tasks"], todos: [], projects: [] },
    revenue: { source: "error", error: "attention-ledger-request-failed", failedSources: ["deals"], leads: [], deals: [] },
    calendar: { ok: false, reason: "calendar-read-failed", items: [] },
  };
  const raw = attention?.raw || rawFallback;

  // buildSources/ledgerState의 기존 allSettled 계약을 유지하기 위해 raw 원장을 결과 봉투로
  // 재포장한다 — 판정 로직(ledgerState)은 원장 shape만 보므로 무수정 동작.
  const projectsResult = { status: "fulfilled", value: raw.projectLedger };
  const revenueResult = { status: "fulfilled", value: raw.revenue };

  const results = {
    projects: projectsResult,
    work: workResult,
    content: contentResult,
    revenue: revenueResult,
    automations: automationsResult,
    orders: ordersResult,
    brief: briefResult,
  };

  const projects = readLedger(projectsResult);
  const work = readLedger(workResult);
  const content = readLedger(contentResult);
  const revenue = readLedger(revenueResult);
  const operatorRevenue = filterOperatorOwnedRevenue(revenue);
  const automations = readLedger(automationsResult);
  // reject(transport throw)는 read 실패다 — preview로 두면 승인 큐 신호가 "빈 큐"로 위장된다.
  const ordersLedger = readLedger(ordersResult, { source: "error", error: "work-orders-request-failed", orders: [] });
  // Chief of Staff composed brief (ai.morning_brief) — the cron's output finally has a reader.
  const morning = readLedger(briefResult, { source: "preview", brief: null });
  // attention의 캘린더 창은 7일(내 작업과 공유) — 오늘 일정 슬롯은 buildDailyFocus가
  // KST 오늘로 자체 필터하므로 창이 넓어도 프로젝션은 동일하다.
  const calendar = raw.calendar || { ok: false, reason: "calendar-read-failed", items: [] };
  // §2 확정 슬롯: 긴급 KA ≤1 · 집중 고객 ≤5 · 오늘 일정 — tone 정렬 신호 큐와 별개의
  // 명명된 풀. 각 슬롯이 자기 소스 truth 상태를 따로 갖는다.
  const dailyFocus = buildDailyFocus({ revenue: operatorRevenue, calendar });
  const queue = {
    source: ordersLedger.source || "preview",
    pending: Array.isArray(ordersLedger.orders) ? ordersLedger.orders.length : 0,
    orders: Array.isArray(ordersLedger.orders) ? ordersLedger.orders.slice(0, 12) : [],
  };
  const sources = buildSources(results);
  const liveCount = sources.filter((source) => source.state === "live").length;
  const errorCount = sources.filter((source) => source.state === "error").length;
  const partialCount = sources.filter((source) => source.state === "partial").length;
  const failedSources = sources
    .filter((source) => ["error", "partial"].includes(source.state))
    .map((source) => source.key);
  // A-1: 정체 딜 신호의 판정원은 attention 원장 하나 — 첫 화면 신호와 내 작업 deal 레인이
  // 같은 stalled 집합(§4 공식·STALLED_DAYS)을 본다. entityId → operator 스코프 조인은
  // build* 안에서 revenue.deals 필터가 수행.
  const staleDealIds = new Set(
    (attention?.items || [])
      .filter((item) => item.lane === "deal" && item.stalled)
      .map((item) => item.entityId),
  );
  const signals = withoutFocusDuplicates(
    [
      ...buildUnifiedRiskSignals(operatorRevenue, projects, automations, staleDealIds),
      ...buildApprovalSignals(queue),
      ...buildRevenueSignals(operatorRevenue, staleDealIds),
      ...buildContentSignals(content),
      ...buildAutomationSignals(automations),
      ...buildWorkSignals(projects, work),
    ],
    dailyFocus,
  ).slice(0, 7);
  const operatorHome = buildOperatorHomeSummary({
    projects,
    content: filterContentLedgerToBrandLanes(content),
  });
  const projectState = ledgerState(projectsResult);
  const taskToday = projects?.source === "supabase"
    ? {
        ...buildTaskToday(projects.todos),
        state: projects.taskAggregation?.partial === true ? "partial" : "live",
      }
    : {
        state: projectState,
        items: [],
        counts: null,
        hiddenCount: null,
        error: projects?.source === "error" ? projects.error || "project-ledger-core-read-failed" : null,
      };
  const contentBrands = buildContentBrandCatalog(content);

  return NextResponse.json({
    status: errorCount || partialCount ? "partial" : liveCount ? "live" : "preview",
    source: errorCount || partialCount ? "partial" : liveCount ? "supabase" : "preview",
    generatedAt: new Date().toISOString(),
    sources,
    failedSources,
    summary: {
      liveCount,
      previewCount: sources.filter((source) => source.state === "preview").length,
      errorCount,
      partialCount,
      // urgentCount는 신호 큐 전용(「결정 큐」 배지가 소비) — 확정 슬롯은 큐에 없다.
      signalCount: signals.length,
      urgentCount: signals.filter((signal) => signal.tone === "danger").length,
      todayCount: signals.filter((signal) => signal.tone === "warning").length,
      // 헤더 "즉시 N"은 화면 전체 기준이라 danger 레일을 단 긴급 KA 슬롯까지 포함해야 한다 —
      // 큐 배지와 헤더가 같은 수를 쓰면 둘 중 하나는 반드시 틀린다(사용성 재감사 A).
      focusUrgentCount: dailyFocus?.urgentKa?.item ? 1 : 0,
    },
    metrics: buildMetrics(revenue, content, automations, projects),
    operatorHome,
    taskToday,
    contentBrands,
    signals,
    dailyFocus,
    queue,
    morningBrief: morning.brief || null,
  });
}
