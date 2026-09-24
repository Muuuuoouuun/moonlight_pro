// Brand context assembler — the richer input for Council and requested brand Guru questions
// (the brand-side counterpart of context-assembler.js, which feeds ClassIn sales Guru).
//
// Where the sales assembler pulls the revenue ledger, this one pulls the content + project
// ledgers (brands with voice guardrails, publishing cadence, idea queue, brand projects) plus
// episodic memory (Council and Guru-brand runs kept separate). It scopes projects to the 브랜드 workspace
// brand set (workspace-map is the SSOT) and degrades honestly: a source failure lands in
// missing[] and the advice continues on whatever slices resolved.

import { getContentLedger } from "@/lib/repositories/content-ledger";
import { getProjectLedger } from "@/lib/repositories/operating-ledger";
import { getRecentAgentRuns } from "@/lib/sales-os/agent-runs";
import { filterBrandsByWorkspace } from "@/components/hub/workspace-map";

const COUNCIL_AGENT = "council";
const BRAND_GURU_AGENT = "guru.brand";
const trim = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

// Brand keys that belong to a workspace — real_v1.1 replacement for the removed
// `brandsForWorkspace(workspace)`. workspace-map no longer keeps a static per-workspace
// `brands` array; membership is now derived from each brand's orgScope (the SSOT). We filter
// the BRANDS registry through that resolver and drop the 'all' pseudo-brand, preserving the
// original return shape (an array of brand key strings).
function brandKeysForWorkspace(brands, workspace) {
  return filterBrandsByWorkspace(brands, workspace)
    .filter((b) => b && b.key && b.key !== "all")
    .map((b) => b.key);
}

async function settled(promise, source, missing) {
  try {
    return await promise;
  } catch (error) {
    missing.push({ source, reason: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

// Map a content-ledger brand (richest guardrail source) to the compact guardrail the prompt needs.
function brandGuardrail(brand) {
  if (!brand) return null;
  return {
    key: brand.key || null,
    name: brand.name || brand.key || null,
    voice: brand.voice || null,
    philosophy: brand.philosophy || null,
    direction: brand.direction || null,
    keywords: trim(brand.keywords, 8),
    rules: trim(brand.rules, 6),
    forbidden: trim(brand.forbidden, 8),
  };
}

// Legacy advisory modes choose a first personal brand when no ref is supplied.
// Open questions need an exact, explicit match so a general shelf question cannot
// inherit an unrelated brand voice or an ambiguous partial name.
function selectFocusBrand(brands, ownKeys, ref, strict = false) {
  const list = Array.isArray(brands) ? brands : [];
  if (!list.length) return null;
  const needle = ref ? String(ref).toLowerCase() : null;
  if (needle) {
    const byRef = list.find(
      (b) => String(b.key).toLowerCase() === needle || (strict
        ? (b.name || "").toLowerCase() === needle
        : (b.name || "").toLowerCase().includes(needle)),
    );
    if (byRef) return byRef;
  }
  return strict ? null : list.find((b) => ownKeys.includes(b.key)) || null;
}

export async function assembleBrandContext({ mode = "brand-strategy", ref = null, draft = null, workspace = "brand" } = {}) {
  const missing = [];
  const memoryAgent = mode === "open-question" ? BRAND_GURU_AGENT : COUNCIL_AGENT;
  let [content, projectLedger, runsRes] = await Promise.all([
    settled(getContentLedger(), "content-ledger", missing),
    settled(getProjectLedger(), "operating-ledger", missing),
    settled(getRecentAgentRuns({ agent: memoryAgent, ref, ...(mode === "open-question"
      ? { mode: "open-question", ...(!ref ? { unscopedOnly: true } : {}) } : {}), limit: 5 }), "agent_runs", missing),
  ]);
  const coreReadFailed = !content || content.source === "error" || !projectLedger || projectLedger.source === "error";

  if (content?.source === "error") {
    missing.push({
      source: "content-ledger",
      reason: content.error || "content-ledger-read-failed",
      failedSources: Array.isArray(content.failedSources) ? content.failedSources : [],
    });
    content = null;
  }
  if (content?.source === "preview") {
    missing.push({ source: "content-ledger", reason: "content-ledger-unconfigured" });
    content = null;
  }
  if (content?.partial) {
    missing.push({ source: "content-ledger", reason: "partial-read", failedSources: content.failedSources || [] });
  }
  if (runsRes?.source === "error" || runsRes?.source === "preview") {
    missing.push({ source: "agent_runs", reason: runsRes.error || "memory-unavailable" });
    runsRes = null;
  }
  if (projectLedger?.source === "error") {
    missing.push({
      source: "operating-ledger",
      reason: projectLedger.error || "project-ledger-core-read-failed",
      failedSources: Array.isArray(projectLedger.failedSources) ? projectLedger.failedSources : [],
    });
    projectLedger = null;
  } else if (projectLedger?.source === "preview") {
    missing.push({ source: "operating-ledger", reason: "operating-ledger-unconfigured" });
    projectLedger = null;
  } else if (projectLedger?.source === "supabase" && projectLedger.partial) {
    missing.push({
      source: "operating-ledger",
      reason: "project-ledger-partial-read",
      failedSources: Array.isArray(projectLedger.failedSources) ? projectLedger.failedSources : [],
    });
  }

  if (!content && !projectLedger) {
    return {
      source: coreReadFailed ? "error" : "preview",
      error: "brand ledgers unavailable",
      missing,
    };
  }

  const brands = content?.brands || [];
  const ownKeys = brandKeysForWorkspace(brands, workspace);
  const scopedBrands = brands.filter((b) => ownKeys.includes(b.key));

  // An empty personal slice stays empty; never substitute company projects.
  const allProjects = Array.isArray(projectLedger?.projects) ? projectLedger.projects : [];
  const scopedProjects = allProjects.filter((p) => p.workspace ? p.workspace === workspace : ownKeys.includes(p.brand));
  const projects = scopedProjects.map((p) => ({
    id: p.id,
    brand: p.brand,
    name: p.name,
    status: p.status,
    progress: p.progress,
    due: p.due,
    owner: p.owner,
    tag: p.tag,
    tasks: p.tasks,
    done: p.done,
    nextAction: p.nextAction || "",
    summary: p.summary || "",
  }));

  // Keep only ideas backed by content rows from this scope.
  const scopedItemIds = new Set((content?.items || []).filter((i) => ownKeys.includes(i.brandKey)).map((i) => i.id));
  const ideaQueue = trim((content?.ideaQueue || []).filter((i) => scopedItemIds.has(i.id)), 8);
  const scopedCampaigns = (content?.campaigns || []).filter((c) => ownKeys.includes(c.brandKey))
    .map((c) => ({ id: c.id, name: c.name, status: c.status, brandKey: c.brandKey, businessTruth: c.businessTruth }));
  const matchesRef = (row) => ref && (String(row.id).toLowerCase() === String(ref).toLowerCase()
    || (mode === "open-question"
      ? (row.name || row.title || "").toLowerCase() === String(ref).toLowerCase()
      : (row.name || row.title || "").toLowerCase().includes(String(ref).toLowerCase())));
  const focusCampaign = scopedCampaigns.find(matchesRef);
  const focusProject = projects.find(matchesRef);
  const focusIdea = ideaQueue.find(matchesRef);
  const focusBrand = selectFocusBrand(scopedBrands, ownKeys,
    focusCampaign?.brandKey || focusProject?.brand || focusIdea?.brandKey || ref,
    mode === "open-question");
  const focusedBrandKey = mode === "open-question" && ref && focusBrand ? focusBrand.key : null;
  const relevantBrands = focusedBrandKey ? scopedBrands.filter((b) => b.key === focusedBrandKey) : scopedBrands;
  const relevantCampaigns = focusedBrandKey ? scopedCampaigns.filter((c) => c.brandKey === focusedBrandKey) : scopedCampaigns;
  const relevantProjects = focusedBrandKey ? projects.filter((p) => p.brand === focusedBrandKey) : projects;
  const relevantIdeas = focusedBrandKey ? ideaQueue.filter((i) => i.brandKey === focusedBrandKey) : ideaQueue;

  const context = {
    source: missing.length ? "partial" : content?.source || projectLedger?.source || "preview",
    brand: brandGuardrail(focusBrand),
    // Keep portfolio membership for general questions, but only the explicitly
    // focused brand may contribute voice guidance to an open question.
    brands: relevantBrands.map((b) => mode === "open-question"
      ? { key: b.key, name: b.name, kind: b.kind }
      : { key: b.key, name: b.name, kind: b.kind, voice: b.voice }),
    campaigns: trim(relevantCampaigns, 10),
    content: content
      ? {
          // Existing aggregates cover the whole workspace, including ClassIn.
          cadence_status: "개인 범위 집계 미지원 — 발행 공백을 추정하지 마세요",
          cadence: null,
          idea_queue_top: relevantIdeas,
          queue_counts: null,
        }
      : null,
    projects: trim(relevantProjects, 30),
    memory: {
      recent_runs: trim((runsRes?.runs || []).filter((run) => run.agent === memoryAgent
        && (mode !== "open-question" || (run.mode === "open-question" && (ref ? run.ref === ref : !run.ref)))), 5),
    },
    missing,
  };

  // Exact IDs are preferred; names remain a convenience for existing UI callers.
  if (ref) {
    const project = focusProject;
    const idea = focusIdea;
    if (focusCampaign) {
      context.focus = { found: true, kind: "campaign", entity: focusCampaign };
    } else if (project) {
      context.focus = {
        found: true,
        kind: "project",
        entity: {
          name: project.name,
          status: project.status,
          progress: project.progress,
          nextAction: project.nextAction,
          brand: project.brand,
        },
      };
    } else if (idea) {
      context.focus = {
        found: true,
        kind: "idea",
        entity: { name: idea.title, status: "idea", nextAction: "" },
      };
    } else if (scopedBrands.some((b) => b.key === ref || b.name === ref)) {
      context.focus = { found: true, kind: "brand", entity: brandGuardrail(focusBrand) };
    } else {
      context.focus = { found: false, missing: [{ source: "projects/content/campaigns", reason: "focus ref 매칭 안 됨" }] };
    }
  }

  return context;
}
