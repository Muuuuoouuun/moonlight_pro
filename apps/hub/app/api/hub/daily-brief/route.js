import { NextResponse } from "next/server";

import { getAutomationsLedger } from "@/lib/repositories/automations-ledger";
import { getMorningBrief } from "@/lib/repositories/brief-ledger";
import { getContentLedger } from "@/lib/repositories/content-ledger";
import { getProjectLedger } from "@/lib/repositories/operating-ledger";
import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";
import { getWorkLedger } from "@/lib/repositories/work-ledger";
import { getWorkOrders } from "@/lib/sales-os/work-orders";
import { buildTaskLanes } from "@/lib/task-attention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ledgerState(result) {
  if (result.status === "rejected") return "error";
  return result.value?.source === "supabase" ? "live" : "preview";
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

function metric(label, value, delta, tone = "moon", spark = [3, 4, 3, 5, 4, 6, 5, 7]) {
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

function buildUnifiedRiskSignals(revenue, projects, automations) {
  const staleDeals = (Array.isArray(revenue.deals) ? revenue.deals : []).filter(
    (d) => d.stage !== "won" && d.stage !== "lost" && Number(d.age) >= 10,
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
    tone: "info",
    kind: "Queue",
    title: `승인 대기 ${pending}건 — ${personaBreakdown}`,
    summary: preview || "페르소나·인박스가 제안한 액션이 승인을 기다립니다.",
    meta: "Work orders · proposed",
    source: { from: "Agents", ref: "PROPOSED" },
    decisions: [action("승인 큐 확인", "queueApprovals", true)],
  }];
}

function buildRevenueSignals(revenue) {
  const deals = Array.isArray(revenue.deals) ? revenue.deals : [];
  const leads = Array.isArray(revenue.leads) ? revenue.leads : [];
  const signals = [];

  deals
    .filter((deal) => deal.stage !== "won" && deal.stage !== "lost" && Number(deal.age) >= 10)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 2)
    .forEach((deal) => {
      const danger = Number(deal.age) >= 14 || Number(deal.value) >= 10000000;
      signals.push({
        id: `revenue-stale-${deal.id}`,
        tone: danger ? "danger" : "warning",
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
      tone: "info",
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
      tone: "warning",
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
      tone: "warning",
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
  const todos = Array.isArray(projects.todos) ? projects.todos : [];
  const decisions = Array.isArray(work.decisions) ? work.decisions : [];
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

  const todayHigh = todos.find((todo) => todo.bucket === "오늘" && todo.priority === "high" && !todo.done);
  if (todayHigh) {
    signals.push({
      id: `work-today-${todayHigh.id}`,
      tone: "warning",
      kind: "Work",
      title: `${todayHigh.title} — 오늘`,
      summary: `${todayHigh.assignee} 담당. 집중 블록으로 바로 전환할 수 있습니다.`,
      meta: `Task · ${todayHigh.due}`,
      source: { from: "Tasks", ref: todayHigh.id },
      decisions: [
        action("15분 집중", "focus", true),
        action("Projects 보기", "projects"),
      ],
    });
  }

  if (!decisions.length && signals.length < 2) {
    signals.push({
      id: "work-decision-missing",
      tone: "info",
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
  const revenueSummary = revenue.summary || {};
  const contentSummary = content.summary || {};
  const automationSummary = automations.summary || {};
  const openProjects = Array.isArray(projects.projects)
    ? projects.projects.filter((project) => project.status !== "Done").length
    : 0;

  return [
    metric("MRR", formatMoney(revenueSummary.mrr || 0), revenueSummary.mrr ? "ledger" : "waiting", revenueSummary.mrr ? "success" : "neutral"),
    metric("Pipeline", formatMoney(revenueSummary.pipeline || 0), `${revenueSummary.openDeals || 0} deals`, "moon"),
    metric("Published", String(contentSummary.published || 0), `${contentSummary.drafts || 0} drafts`, "info"),
    metric("Runs failed", String(automationSummary.failuresToday || 0), `${automationSummary.runsToday || 0} runs`, automationSummary.failuresToday ? "warning" : "success"),
    metric("Open work", String(openProjects), "active projects", "moon"),
  ].slice(0, 4);
}

function buildSources(results) {
  return [
    { key: "projects", label: "Projects", state: ledgerState(results.projects) },
    { key: "work", label: "Work", state: ledgerState(results.work) },
    { key: "content", label: "Content", state: ledgerState(results.content) },
    { key: "revenue", label: "Revenue", state: ledgerState(results.revenue) },
    { key: "automations", label: "Automations", state: ledgerState(results.automations) },
    { key: "agents", label: "Agents", state: ledgerState(results.orders) },
  ];
}

export async function GET() {
  const [projectsResult, workResult, contentResult, revenueResult, automationsResult, ordersResult, briefResult] = await Promise.allSettled([
    getProjectLedger(),
    getWorkLedger(),
    getContentLedger(),
    getRevenueLedger(),
    getAutomationsLedger(),
    getWorkOrders({ status: "proposed", limit: 20 }),
    getMorningBrief(),
  ]);

  const results = {
    projects: projectsResult,
    work: workResult,
    content: contentResult,
    revenue: revenueResult,
    automations: automationsResult,
    orders: ordersResult,
  };

  const projects = readLedger(projectsResult);
  const work = readLedger(workResult);
  const content = readLedger(contentResult);
  const revenue = readLedger(revenueResult);
  const automations = readLedger(automationsResult);
  const ordersLedger = readLedger(ordersResult, { source: "preview", orders: [] });
  // Chief of Staff composed brief (ai.morning_brief) — the cron's output finally has a reader.
  const morning = readLedger(briefResult, { source: "preview", brief: null });
  const queue = {
    source: ordersLedger.source || "preview",
    pending: Array.isArray(ordersLedger.orders) ? ordersLedger.orders.length : 0,
    orders: Array.isArray(ordersLedger.orders) ? ordersLedger.orders.slice(0, 12) : [],
  };
  const sources = buildSources(results);
  const liveCount = sources.filter((source) => source.state === "live").length;
  const errorCount = sources.filter((source) => source.state === "error").length;
  const signals = [
    ...buildUnifiedRiskSignals(revenue, projects, automations),
    ...buildApprovalSignals(queue),
    ...buildRevenueSignals(revenue),
    ...buildContentSignals(content),
    ...buildAutomationSignals(automations),
    ...buildWorkSignals(projects, work),
  ].slice(0, 7);
  const taskSource = projectsResult.status === "rejected"
    ? "error"
    : projects.taskSource || "preview";
  const taskError = projectsResult.status === "rejected"
    ? "프로젝트 할 일 원장을 불러오지 못했습니다. 이전에 불러온 할 일을 유지합니다."
    : null;
  const taskLanes = buildTaskLanes(
    Array.isArray(projects.tasks) ? projects.tasks : [],
    new Date(),
    projects.taskTimezone,
  );

  return NextResponse.json({
    status: errorCount ? "partial" : liveCount ? "live" : "preview",
    source: liveCount ? "supabase" : "preview",
    generatedAt: new Date().toISOString(),
    sources,
    summary: {
      liveCount,
      previewCount: sources.filter((source) => source.state === "preview").length,
      errorCount,
      signalCount: signals.length,
      urgentCount: signals.filter((signal) => signal.tone === "danger").length,
      todayCount: signals.filter((signal) => signal.tone === "warning").length,
    },
    metrics: buildMetrics(revenue, content, automations, projects),
    signals,
    taskSource,
    taskError,
    taskTimezone: projects.taskTimezone,
    taskLanes,
    blocks: [],
    queue,
    morningBrief: morning.brief || null,
  });
}
