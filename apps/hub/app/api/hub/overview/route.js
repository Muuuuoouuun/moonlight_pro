import { NextResponse } from "next/server";

import { getAutomationsLedger } from "@/lib/repositories/automations-ledger";
import { getContentLedger } from "@/lib/repositories/content-ledger";
import { getProjectLedger } from "@/lib/repositories/operating-ledger";
import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";
import { getWorkLedger } from "@/lib/repositories/work-ledger";
import { buildOperatorHomeSummary } from "@/lib/operator-home-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVITY_DAYS = 30;
const DAY_MS = 86400000;

function ledgerState(result) {
  if (result.status === "rejected") return "error";
  if (result.value?.source === "error") return "error";
  if (result.value?.source === "supabase") return result.value.partial ? "partial" : "live";
  return "preview";
}

function readLedger(result, fallback = {}) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function startOfDaysAgo(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return new Date(date.getTime() - days * DAY_MS);
}

function withinDays(value, days) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= startOfDaysAgo(days - 1).getTime();
}

// Daily histogram of real event timestamps — project_updates (work),
// decisions (planning), and publishes (content). No synthetic fallback
// series: an empty ledger renders as a flat zero line, not a fabricated trend.
function buildActivitySeries(
  updates,
  decisions,
  publishLogs,
  { updatesAvailable = true, decisionsAvailable = true, contentAvailable = true } = {},
) {
  const since = startOfDaysAgo(ACTIVITY_DAYS - 1);
  const buckets = new Map();
  for (let i = 0; i < ACTIVITY_DAYS; i += 1) {
    const key = dayKey(new Date(since.getTime() + i * DAY_MS));
    buckets.set(key, {
      date: key,
      work: updatesAvailable ? 0 : null,
      decisions: decisionsAvailable ? 0 : null,
      content: contentAvailable ? 0 : null,
    });
  }
  updates.forEach((update) => {
    const key = dayKey(update.happenedAt);
    if (key && buckets.has(key)) buckets.get(key).work += 1;
  });
  decisions.forEach((decision) => {
    const key = dayKey(decision.decidedAt);
    if (key && buckets.has(key)) buckets.get(key).decisions += 1;
  });
  publishLogs.filter((log) => log.status === "published").forEach((log) => {
    const key = dayKey(log.publishedAt || log.createdAt);
    if (key && buckets.has(key)) buckets.get(key).content += 1;
  });
  return Array.from(buckets.values());
}

// Which brand recent work actually landed on — project_updates/decisions only
// carry a project_id, so resolve brand through the project row, then attach
// the display name/glyph/tone already computed by mapBrands(). The synthetic
// "all" brand row is excluded (it isn't a real container to attribute to).
function buildBrandActivity(projects) {
  const projectRows = Array.isArray(projects.projects) ? projects.projects : [];
  const brands = Array.isArray(projects.brands) ? projects.brands : [];
  const brandOfProject = new Map(projectRows.map((project) => [project.id, project.brand]));
  const brandMeta = new Map(brands.filter((brand) => brand.key !== "all").map((brand) => [brand.key, brand]));
  const counts = new Map();

  const bump = (projectId) => {
    const brandKey = brandOfProject.get(projectId);
    if (!brandKey || brandKey === "all" || !brandMeta.has(brandKey)) return;
    counts.set(brandKey, (counts.get(brandKey) || 0) + 1);
  };

  (projects.updates || []).forEach((update) => bump(update.projectId));
  (projects.decisions || []).forEach((decision) => bump(decision.projectId));

  return Array.from(counts.entries())
    .map(([key, count]) => {
      const meta = brandMeta.get(key);
      return { key, label: meta.name, glyph: meta.glyph, tone: meta.tone, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

// Cross-pillar "what happened" feed — merges the four event kinds that make
// up "recent work and planning": project updates, decisions, publishes, and
// automation runs. Each source already carries its own real timestamp.
function buildRecentActivity(projects, content, automations) {
  const events = [];

  (projects.updates || []).forEach((update) => {
    events.push({
      id: `update-${update.id}`,
      kind: "work",
      tone: "moon",
      title: update.title || "작업 업데이트",
      summary: update.summary || update.nextAction || "",
      at: update.happenedAt,
      nav: "dashboard/work/projects",
    });
  });

  (projects.decisions || []).forEach((decision) => {
    events.push({
      id: `decision-${decision.id}`,
      kind: "decision",
      tone: "info",
      title: decision.title || "결정",
      summary: decision.summary || "",
      at: decision.decidedAt,
      nav: "dashboard/work/decisions",
    });
  });

  (content.publishLogs || [])
    .filter((log) => log.status === "published")
    .forEach((log) => {
      events.push({
        id: `publish-${log.id}`,
        kind: "content",
        tone: "success",
        title: log.title || "콘텐츠 발행",
        summary: log.channel ? `${log.channel} 채널로 발행` : "발행 완료",
        at: log.publishedAt || log.createdAt,
        nav: "dashboard/content/queue",
      });
    });

  (automations.runs || []).forEach((run) => {
    events.push({
      id: `run-${run.id}`,
      kind: "automation",
      tone: run.statusKey === "failure" ? "danger" : "neutral",
      title: `${run.flow} · ${run.statusKey}`,
      summary: run.detail || "",
      at: run.startedAt,
      nav: "dashboard/automations/runs",
    });
  });

  return events
    .filter((event) => event.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 24);
}

function buildRevenueStageSeries(revenue) {
  const deals = Array.isArray(revenue.deals) ? revenue.deals : [];
  const stages = Array.isArray(revenue.stages) ? revenue.stages : [];
  return stages.map((stage) => {
    const stageDeals = deals.filter((deal) => deal.stage === stage.key);
    return {
      key: stage.key,
      label: stage.label,
      color: stage.color,
      count: stageDeals.length,
      sum: stageDeals.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0),
    };
  });
}

function buildSources(results) {
  return [
    ["projects", "Projects"],
    ["content", "Content"],
    ["revenue", "Revenue"],
    ["automations", "Automations"],
    ["work", "Work"],
  ].map(([key, label]) => {
    const result = results[key];
    const value = result.status === "fulfilled" ? result.value : null;
    return {
      key,
      label,
      state: ledgerState(result),
      failedSources: Array.isArray(value?.failedSources) ? value.failedSources : [],
      partialSources: Array.isArray(value?.partialSources) ? value.partialSources : [],
      error: value?.source === "error" ? value.error || `${key}-ledger-read-failed` : null,
      retryable: value?.source === "error" ? value.retryable !== false : false,
    };
  });
}

export async function GET() {
  const [projectsResult, contentResult, revenueResult, automationsResult, workResult] = await Promise.allSettled([
    getProjectLedger(),
    getContentLedger(),
    getRevenueLedger(),
    getAutomationsLedger(),
    getWorkLedger(),
  ]);

  const results = {
    projects: projectsResult,
    content: contentResult,
    revenue: revenueResult,
    automations: automationsResult,
    work: workResult,
  };

  const projects = readLedger(projectsResult, { projects: [], todos: [], updates: [], decisions: [] });
  const content = readLedger(contentResult, { items: [], publishLogs: [] });
  const revenue = readLedger(revenueResult, { deals: [], stages: [], summary: {} });
  const automations = readLedger(automationsResult, { runs: [], summary: {} });
  const work = readLedger(workResult, { rituals: [], summary: {} });

  const sources = buildSources(results);
  const liveCount = sources.filter((source) => source.state === "live").length;
  const degradedSources = sources.filter((source) => ["error", "partial"].includes(source.state));
  const failedSources = degradedSources.map((source) => source.key);

  const operatorHome = buildOperatorHomeSummary({ projects, content });

  const projectReadable = projects?.source === "supabase";
  const projectFailures = new Set(projects?.failedSources || []);
  const updatesAvailable = projectReadable && !projectFailures.has("project_updates");
  const decisionsAvailable = projectReadable && !projectFailures.has("decisions");
  const contentAvailable = content?.source === "supabase";
  const updatesThisWeek = updatesAvailable
    ? (projects.updates || []).filter((update) => withinDays(update.happenedAt, 7)).length
    : null;
  const decisionsThisWeek = decisionsAvailable
    ? (projects.decisions || []).filter((decision) => withinDays(decision.decidedAt, 7)).length
    : null;
  const publishedThisWeek = contentAvailable
    ? (content.publishLogs || []).filter(
        (log) => log.status === "published" && withinDays(log.publishedAt || log.createdAt, 7),
      ).length
    : null;

  return NextResponse.json({
    status: degradedSources.length ? "partial" : liveCount ? "live" : "preview",
    source: degradedSources.length ? "partial" : liveCount ? "supabase" : "preview",
    generatedAt: new Date().toISOString(),
    sources,
    failedSources,
    kpis: {
      updatesThisWeek,
      decisionsThisWeek,
      publishedThisWeek,
      activeProjects: operatorHome.pms?.activeProjects ?? null,
      blockedProjects: operatorHome.pms?.blockedProjects ?? null,
    },
    activitySeries: buildActivitySeries(
      projects.updates || [],
      projects.decisions || [],
      content.publishLogs || [],
      { updatesAvailable, decisionsAvailable, contentAvailable },
    ),
    operatorHome,
    revenue: {
      summary: revenue.summary || {},
      stageSeries: buildRevenueStageSeries(revenue),
    },
    automationsSummary: automations.summary || {},
    brandActivity: projectReadable ? buildBrandActivity(projects) : null,
    rhythm: {
      summary: work.summary || {},
      rituals: (work.rituals || []).slice().sort((a, b) => (b.streak || 0) - (a.streak || 0)).slice(0, 3),
    },
    recentActivity: buildRecentActivity(projects, content, automations),
  });
}
