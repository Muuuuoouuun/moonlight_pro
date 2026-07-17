import {
  eqFilter,
  fetchSupabaseRows,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

const RITUAL_FALLBACK_NAMES = {
  morning: "Morning check · 07:00",
  midday: "Midday focus · 14:00",
  evening: "Evening shutdown · 22:00",
  weekly: "Weekly Review",
};
const ROUTINE_CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const ROADMAP_ROW_LIMIT = 500;
const RHYTHM_ROW_LIMIT = 240;

function formatDecisionDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function resolveDecisionStatus(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const raw = String(meta.status || meta.commitment || "").toLowerCase();

  if (raw === "trial" || raw === "draft" || raw === "proposed") {
    return meta.statusLabel || "Trial (4w)";
  }

  if (!row.decided_at) return "Draft";

  return "Committed";
}

function resolveDecisionAuthor(row, profileById) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  if (meta.by) return String(meta.by);

  const profile = row.actor_id ? profileById.get(row.actor_id) : null;
  if (profile?.display_name) return profile.display_name;

  return "Me";
}

function resolveDecisionLinks(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const candidate = meta.links ?? meta.linkCount;
  const parsed = Number.parseInt(String(candidate ?? ""), 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;

  if (Array.isArray(meta.references)) return meta.references.length;

  return 0;
}

function mapDecisions(rows, profileById) {
  return rows.map((row) => ({
    id: row.id,
    date: formatDecisionDate(row.decided_at || row.created_at),
    status: resolveDecisionStatus(row),
    by: resolveDecisionAuthor(row, profileById),
    links: resolveDecisionLinks(row),
    title: row.title || "(untitled decision)",
    reason: row.rationale || row.summary || "",
  }));
}

// WHY: schema has no separate "rituals" table; routine_checks rows are instances.
// We aggregate by (meta.ritual_key || meta.name || check_type) and compute a 7-day
// completion bitmap + current streak from checked_at timestamps.
function ritualKeyFor(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  return String(meta.ritual_key || meta.key || meta.name || row.check_type || "ritual").trim() || "ritual";
}

function ritualDisplayName(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  if (meta.name) return String(meta.name);
  if (meta.label) return String(meta.label);
  return RITUAL_FALLBACK_NAMES[row.check_type] || "Ritual";
}

function normalizeCheckType(value) {
  const normalized = String(value || "midday").trim().toLowerCase();
  return ROUTINE_CHECK_TYPES.has(normalized) ? normalized : "midday";
}

function ritualCompositeId(projectId, ritualKey) {
  return `ritual:${projectId ? encodeURIComponent(projectId) : "unscoped"}:${encodeURIComponent(ritualKey)}`;
}

function startOfLocalDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfLocalDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) return null;
  return date.getTime();
}

function buildWeeksBitmap(doneDays, todayStart) {
  const bitmap = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = todayStart - offset * 86400000;
    bitmap.push(doneDays.has(day) ? 1 : 0);
  }
  return bitmap;
}

function computeStreak(doneDays, todayStart) {
  let streak = 0;
  let cursor = todayStart;
  while (doneDays.has(cursor)) {
    streak += 1;
    cursor -= 86400000;
  }
  return streak;
}

function mapRituals(rows, projectRows) {
  const groups = new Map();
  const projectNameById = new Map(
    (Array.isArray(projectRows) ? projectRows : []).map((project) => [project.id, project.name || null]),
  );

  rows.forEach((row) => {
    const ritualKey = ritualKeyFor(row);
    const projectId = row.project_id || null;
    const compositeKey = JSON.stringify([projectId, ritualKey]);
    if (!groups.has(compositeKey)) {
      groups.set(compositeKey, {
        id: ritualCompositeId(projectId, ritualKey),
        projectId,
        projectName: projectId ? projectNameById.get(projectId) || null : null,
        projectHref: projectId
          ? `/dashboard/work/projects?project=${encodeURIComponent(projectId)}`
          : null,
        ritualKey,
        checkType: normalizeCheckType(row.check_type),
        name: ritualDisplayName(row),
        doneDays: new Set(),
        lastCheckedAt: null,
      });
    }

    const group = groups.get(compositeKey);

    if (row.status === "done" && row.checked_at) {
      const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
      const dayStart = startOfLocalDateKey(meta.local_date) ?? startOfLocalDay(row.checked_at);
      if (dayStart !== null) group.doneDays.add(dayStart);

      const ts = new Date(row.checked_at).getTime();
      if (Number.isFinite(ts) && (!group.lastCheckedAt || ts > group.lastCheckedAt)) {
        group.lastCheckedAt = ts;
      }
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  return Array.from(groups.values()).map((group) => ({
    id: group.id,
    projectId: group.projectId,
    projectName: group.projectName,
    projectHref: group.projectHref,
    ritualKey: group.ritualKey,
    checkType: group.checkType,
    name: group.name,
    streak: computeStreak(group.doneDays, todayStart),
    weeks: buildWeeksBitmap(group.doneDays, todayStart),
    lastCheckedAt: group.lastCheckedAt ? new Date(group.lastCheckedAt).toISOString() : null,
  }));
}

function summarizeRituals(rituals) {
  const total = rituals.length;
  const completedThisWeek = rituals.filter((r) => r.weeks.some((v) => v === 1)).length;

  let longestStreak = 0;
  let longestStreakRitual = "";
  rituals.forEach((r) => {
    if (r.streak > longestStreak) {
      longestStreak = r.streak;
      longestStreakRitual = r.name;
    }
  });

  return {
    ritualsCompletedThisWeek: completedThisWeek,
    ritualsTotalThisWeek: total,
    longestStreak,
    longestStreakRitual,
  };
}

function emptyRoadmap(source = "preview", state = "preview") {
  return {
    source,
    state,
    partial: false,
    error: null,
    failedSources: [],
    truncatedSources: [],
    projects: [],
    milestones: [],
  };
}

function mapRoadmapProjects(rows) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    priority: row.priority,
    startedAt: row.started_at ?? null,
    dueAt: row.due_at ?? null,
  }));
}

function mapRoadmapMilestones(rows) {
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    targetAt: row.target_date ?? null,
  }));
}

function buildRoadmapState(projectRows, milestoneRows) {
  const projectsAvailable = Array.isArray(projectRows);
  const milestonesAvailable = Array.isArray(milestoneRows);
  const failedSources = [];
  if (!projectsAvailable) failedSources.push("projects");
  if (!milestonesAvailable) failedSources.push("milestones");

  const truncatedSources = [];
  if (projectsAvailable && projectRows.length > ROADMAP_ROW_LIMIT) truncatedSources.push("projects");
  if (milestonesAvailable && milestoneRows.length > ROADMAP_ROW_LIMIT) truncatedSources.push("milestones");

  const projects = mapRoadmapProjects(
    projectsAvailable ? projectRows.slice(0, ROADMAP_ROW_LIMIT) : [],
  );
  const milestones = mapRoadmapMilestones(
    milestonesAvailable ? milestoneRows.slice(0, ROADMAP_ROW_LIMIT) : [],
  );
  const allFailed = failedSources.length === 2;
  const partial = failedSources.length === 1 || truncatedSources.length > 0;
  const state = allFailed
    ? "error"
    : partial
      ? "partial"
      : projects.length === 0 && milestones.length === 0
        ? "live-empty"
        : "live";

  return {
    source: "supabase",
    state,
    partial,
    error: failedSources.length > 0
      ? {
          message: `${failedSources.join(", ")} 원장을 읽지 못했습니다.`,
          retryable: true,
        }
      : null,
    failedSources,
    truncatedSources,
    projects,
    milestones,
  };
}

export async function getWorkLedger({ projectId = null } = {}) {
  const workspaceId = resolveDefaultWorkspaceId();
  const selectedProjectId = typeof projectId === "string" ? projectId.trim() : "";

  if (!workspaceId) {
    return {
      source: "preview",
      configured: false,
      workspaceId: null,
      decisions: [],
      rituals: [],
      rhythm: {
        source: "preview",
        state: "preview",
        partial: false,
        truncatedSources: [],
        error: null,
      },
      roadmap: emptyRoadmap(),
      summary: {
        ritualsCompletedThisWeek: 0,
        ritualsTotalThisWeek: 0,
        longestStreak: 0,
        longestStreakRitual: "",
      },
    };
  }

  const [decisionRows, routineRows, profileRows, projectRows, milestoneRows] = await Promise.all([
    fetchSupabaseRows("decisions", {
      limit: 40,
      order: "decided_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("routine_checks", {
      limit: RHYTHM_ROW_LIMIT + 1,
      order: "checked_at.desc",
      filters: withWorkspaceFilter(
        selectedProjectId ? [["project_id", eqFilter(selectedProjectId)]] : [],
      ),
    }),
    fetchSupabaseRows("profiles", {
      select: "id,display_name,email",
      limit: 40,
    }),
    fetchSupabaseRows("projects", {
      select: "id,name,status,priority,started_at,due_at",
      limit: ROADMAP_ROW_LIMIT + 1,
      order: "due_at.asc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("milestones", {
      select: "id,project_id,title,status,target_date",
      limit: ROADMAP_ROW_LIMIT + 1,
      order: "target_date.asc",
      filters: withWorkspaceFilter(),
    }),
  ]);

  const roadmap = buildRoadmapState(projectRows, milestoneRows);
  const profileById = new Map((profileRows || []).map((p) => [p.id, p]));
  const decisions = Array.isArray(decisionRows) ? mapDecisions(decisionRows, profileById) : [];
  const routineRowsTruncated = Array.isArray(routineRows) && routineRows.length > RHYTHM_ROW_LIMIT;
  const visibleRoutineRows = Array.isArray(routineRows)
    ? routineRows.slice(0, RHYTHM_ROW_LIMIT)
    : [];
  const rituals = Array.isArray(routineRows) ? mapRituals(visibleRoutineRows, projectRows) : [];
  const rhythm = Array.isArray(routineRows)
    ? {
        source: "supabase",
        state: routineRowsTruncated
          ? "partial"
          : rituals.length > 0
            ? "live"
            : "live-empty",
        partial: routineRowsTruncated,
        truncatedSources: routineRowsTruncated ? ["routine_checks"] : [],
        error: null,
      }
    : {
        source: "supabase",
        state: "error",
        partial: false,
        truncatedSources: [],
        error: {
          message: "routine_checks 원장을 읽지 못했습니다.",
          retryable: true,
        },
      };

  return {
    source: Array.isArray(decisionRows) && Array.isArray(routineRows) ? "supabase" : "preview",
    configured: true,
    workspaceId,
    decisions,
    rituals,
    rhythm,
    roadmap,
    summary: summarizeRituals(rituals),
  };
}
