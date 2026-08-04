// Brand context assembler — the richer input for the Council brand-mentor (the brand-side
// counterpart of context-assembler.js, which feeds the ClassIn sales Guru).
//
// Where the sales assembler pulls the revenue ledger, this one pulls the content + project
// ledgers (brands with voice guardrails, publishing cadence, idea queue, brand projects) plus
// episodic memory (agent_runs where agent='council'). It scopes projects to the 브랜드 workspace
// brand set (workspace-map is the SSOT) and degrades honestly: a source failure lands in
// missing[] and the advice continues on whatever slices resolved.

import { getContentLedger } from "@/lib/repositories/content-ledger";
import { getProjectLedger } from "@/lib/repositories/operating-ledger";
import { getRecentAgentRuns } from "@/lib/sales-os/agent-runs";
import { cadenceStatusString } from "@/lib/sales-os/context-schema";
import { filterBrandsByWorkspace } from "@/components/hub/workspace-map";

const COUNCIL_AGENT = "council";
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

// Pick the guardrail brand: prefer an explicit ref match, then an own-brand (브랜드 workspace),
// then the first content brand. Keeps the Council anchored to the operator's own brand voice
// instead of the ClassIn sales brand.
function selectFocusBrand(brands, ownKeys, ref) {
  const list = Array.isArray(brands) ? brands : [];
  if (!list.length) return null;
  const needle = ref ? String(ref).toLowerCase() : null;
  if (needle) {
    const byRef = list.find(
      (b) => String(b.key).toLowerCase() === needle || (b.name || "").toLowerCase().includes(needle),
    );
    if (byRef) return byRef;
  }
  return list.find((b) => ownKeys.includes(b.key)) || list[0];
}

export async function assembleBrandContext({ mode = "brand-strategy", ref = null, draft = null, workspace = "brand" } = {}) {
  const missing = [];
  let [content, projectLedger, runsRes] = await Promise.all([
    settled(getContentLedger(), "content-ledger", missing),
    settled(getProjectLedger(), "operating-ledger", missing),
    settled(getRecentAgentRuns({ agent: COUNCIL_AGENT, ref, limit: 5 }), "agent_runs", missing),
  ]);

  if (content?.source === "error") {
    missing.push({
      source: "content-ledger",
      reason: content.error || "content-ledger-read-failed",
      failedSources: Array.isArray(content.failedSources) ? content.failedSources : [],
    });
    content = null;
  }
  if (projectLedger?.source === "error") {
    missing.push({
      source: "operating-ledger",
      reason: projectLedger.error || "project-ledger-core-read-failed",
      failedSources: Array.isArray(projectLedger.failedSources) ? projectLedger.failedSources : [],
    });
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
      source: missing.length ? "error" : "preview",
      error: "brand ledgers unavailable",
      missing,
    };
  }

  const brands = content?.brands || [];
  const ownKeys = brandKeysForWorkspace(brands, workspace);
  const focusBrand = selectFocusBrand(brands, ownKeys, ref);

  // Scope projects to the 브랜드 workspace brands; if nothing matches yet, keep all so the
  // advice is never silently empty (the prompt still ignores the ClassIn sales lane).
  const allProjects = Array.isArray(projectLedger?.projects) ? projectLedger.projects : [];
  const scopedProjects = allProjects.filter((p) => ownKeys.includes(p.brand));
  const projects = (scopedProjects.length ? scopedProjects : allProjects).map((p) => ({
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

  const ideaQueue = trim(content?.ideaQueue, 8);

  const context = {
    source: missing.length ? "partial" : content?.source || projectLedger?.source || "preview",
    brand: brandGuardrail(focusBrand),
    brands: brands.map((b) => ({ key: b.key, name: b.name, kind: b.kind, voice: b.voice })),
    content: content
      ? {
          cadence_status: cadenceStatusString(content.cadence),
          cadence: content.cadence || null,
          idea_queue_top: ideaQueue,
          queue_counts: content.summary || null,
        }
      : null,
    projects: trim(projects, 30),
    memory: {
      recent_runs: trim(runsRes?.runs, 5),
    },
    missing,
  };

  // Focus: when a ref is given (a project row or an idea), surface it so the advice is specific.
  if (ref) {
    const needle = String(ref).toLowerCase();
    const project = projects.find(
      (p) => String(p.id).toLowerCase() === needle || (p.name || "").toLowerCase().includes(needle),
    );
    const idea = ideaQueue.find((i) => (i.title || "").toLowerCase().includes(needle));
    if (project) {
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
    } else {
      context.focus = { found: false, missing: [{ source: "projects/content", reason: "focus ref 매칭 안 됨" }] };
    }
  }

  return context;
}
