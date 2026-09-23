import {
  eqFilter,
  fetchSupabaseRows,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import {
  resolveRhythmTimeZone,
  routineLocalDateKey,
  routineSemanticKey,
  shiftDateKey,
  toZonedDateKey,
} from "../rhythm-calendar.js";
import { RITUAL_CATEGORIES, defaultTargetPerWeek, normalizeTargetPerWeek } from "../rhythm-ui.js";

const RITUAL_FALLBACK_NAMES = {
  morning: "Morning check · 07:00",
  midday: "Midday focus · 14:00",
  evening: "Evening shutdown · 22:00",
  weekly: "Weekly Review",
};
const ROUTINE_CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const DECISION_ROW_LIMIT = 40;
const ROADMAP_ROW_LIMIT = 500;
const RHYTHM_ROW_LIMIT = 240;
// 루틴 정의(씨앗) 행 — status:'pending', checked_at:null. 체크인 행 조회는 checked_at.desc
// nullslast라 기록이 RHYTHM_ROW_LIMIT를 넘으면 씨앗 행이 먼저 잘린다. category·주간 목표는
// 씨앗 행(과 PATCH로 편집된 행)의 meta에만 있으므로, 씨앗 행을 따로 소량 읽어 폴백 정본으로 쓴다.
const RITUAL_DEFINITION_LIMIT = 200;

function formatDecisionDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
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
    // Raw edit-draft fields, kept separate from the `reason` display fallback above so an
    // edit round-trip never writes a merged/derived value back as if it were the operator's
    // own rationale (same discipline as the project edit draft in operating-ledger.js).
    projectId: row.project_id || "",
    rationale: row.rationale || "",
    decidedAt: row.decided_at || "",
  }));
}

function mapDecisionProjectOptions(rows) {
  const linkableStatuses = new Set(["draft", "active", "blocked", "completed"]);
  return rows
    .filter((row) => linkableStatuses.has(row.status))
    .map((row) => ({ id: row.id, name: row.name || "(제목 없음)" }));
}

function buildDecisionsState(decisionRows, profileRows) {
  if (!Array.isArray(decisionRows)) {
    return {
      source: "supabase",
      state: "error",
      partial: false,
      failedSources: ["decisions"],
      truncatedSources: [],
      error: { message: "decisions 기록을 읽지 못했습니다.", retryable: true },
    };
  }

  const truncated = decisionRows.length > DECISION_ROW_LIMIT;
  const profilesFailed = !Array.isArray(profileRows);
  return {
    source: "supabase",
    state: profilesFailed || truncated
      ? "partial"
      : decisionRows.length === 0
        ? "live-empty"
        : "live",
    partial: profilesFailed || truncated,
    failedSources: profilesFailed ? ["profiles"] : [],
    truncatedSources: truncated ? ["decisions"] : [],
    error: profilesFailed
      ? { message: "profiles 기록을 읽지 못해 결정 작성자 일부를 확인할 수 없습니다.", retryable: true }
      : null,
  };
}

// WHY: schema has no separate "rituals" table; routine_checks rows are instances.
// We aggregate by the shared semantic key and compute a 7-day completion bitmap
// from date-only keys in the configured workspace timezone.
function ritualKeyFor(row) {
  return routineSemanticKey(row);
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

// category/targetPerWeek live in meta alongside ritual_key/name — no schema migration,
// same "no separate rituals table" model as the rest of the routine definition fields.
// Only the seed (definition) row and any row touched by a later PATCH edit carry these —
// /api/routine/check never writes them onto a check-in row's meta. Rows are read in
// checked_at.desc order, which sorts a fresh check-in ahead of the (checked_at: null)
// seed row, so this must scan every row in the group for an explicit value rather than
// trust whichever row happens to be seen first — otherwise the very next check-in after
// creating a ritual "resets" its category/target back to the default in the UI.
function rawRitualCategory(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const value = String(meta.category || "").trim().toLowerCase();
  return RITUAL_CATEGORIES.has(value) ? value : null;
}

function rawRitualTargetPerWeek(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  return normalizeTargetPerWeek(meta.target_per_week);
}

function ritualGroupKey(row) {
  return JSON.stringify([row.project_id || null, ritualKeyFor(row)]);
}

// 씨앗 행에서 (project_id, ritual_key)별 category·target을 뽑는다. 그룹을 새로 만들지는
// 않는다 — 어떤 루틴이 보이는지는 체크인 조회 창이 정하고, 이 맵은 값의 폴백일 뿐이다.
function buildRitualDefinitionIndex(definitionRows) {
  const index = new Map();
  (Array.isArray(definitionRows) ? definitionRows : []).forEach((row) => {
    const key = ritualGroupKey(row);
    const entry = index.get(key) || { category: null, targetPerWeek: null };
    if (!entry.category) entry.category = rawRitualCategory(row);
    if (!entry.targetPerWeek) entry.targetPerWeek = rawRitualTargetPerWeek(row);
    index.set(key, entry);
  });
  return index;
}

function ritualCompositeId(projectId, ritualKey) {
  return `ritual:${projectId ? encodeURIComponent(projectId) : "unscoped"}:${encodeURIComponent(ritualKey)}`;
}

function buildWeeksBitmap(doneDateKeys, todayKey) {
  return Array.from({ length: 7 }, (_, index) => (
    doneDateKeys.has(shiftDateKey(todayKey, index - 6)) ? 1 : 0
  ));
}

function computeStreak(doneDateKeys, todayKey) {
  let streak = 0;
  let cursor = todayKey;
  while (doneDateKeys.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

// 어제까지 이어진 연속 — "오늘 체크하면 N+1일"의 N. streak(오늘 포함 연속)의 정의는
// 그대로 두고 별도 필드로 싣는다. 오늘 체크를 취소해도 화면이 연속을 되돌릴 수 있게 오늘
// 완료 여부와 무관하게 어제 기준으로 센다.
function computePendingStreak(doneDateKeys, todayKey) {
  return computeStreak(doneDateKeys, shiftDateKey(todayKey, -1));
}

function mapRituals(rows, projectRows, { timeZone, now, definitionRows = null }) {
  const definitions = buildRitualDefinitionIndex(definitionRows);
  const groups = new Map();
  const projectNameById = new Map(
    (Array.isArray(projectRows) ? projectRows : []).map((project) => [project.id, project.name || null]),
  );

  rows.forEach((row) => {
    const ritualKey = ritualKeyFor(row);
    const projectId = row.project_id || null;
    const compositeKey = ritualGroupKey(row);
    if (!groups.has(compositeKey)) {
      const checkType = normalizeCheckType(row.check_type);
      groups.set(compositeKey, {
        id: ritualCompositeId(projectId, ritualKey),
        projectId,
        projectName: projectId ? projectNameById.get(projectId) || null : null,
        projectHref: projectId
          ? `/dashboard/work/projects?project=${encodeURIComponent(projectId)}`
          : null,
        ritualKey,
        checkType,
        name: ritualDisplayName(row),
        category: null,
        targetPerWeek: null,
        doneDateKeys: new Set(),
        lastCheckedAt: null,
      });
    }

    const group = groups.get(compositeKey);
    if (!group.category) group.category = rawRitualCategory(row);
    if (!group.targetPerWeek) group.targetPerWeek = rawRitualTargetPerWeek(row);

    if (row.status === "done") {
      const dateKey = routineLocalDateKey(row, timeZone);
      if (dateKey) group.doneDateKeys.add(dateKey);

      const ts = row.checked_at ? new Date(row.checked_at).getTime() : Number.NaN;
      if (Number.isFinite(ts) && (!group.lastCheckedAt || ts > group.lastCheckedAt)) {
        group.lastCheckedAt = ts;
      }
    }
  });

  const todayKey = toZonedDateKey(now, timeZone);

  return Array.from(groups.entries()).map(([compositeKey, group]) => {
    const definition = definitions.get(compositeKey);
    const category = group.category || definition?.category || "general";
    const targetPerWeek = group.targetPerWeek
      || definition?.targetPerWeek
      || defaultTargetPerWeek(group.checkType);
    return {
      id: group.id,
      projectId: group.projectId,
      projectName: group.projectName,
      projectHref: group.projectHref,
      ritualKey: group.ritualKey,
      checkType: group.checkType,
      name: group.name,
      category,
      targetPerWeek,
      streak: computeStreak(group.doneDateKeys, todayKey),
      pendingStreak: computePendingStreak(group.doneDateKeys, todayKey),
      weeks: buildWeeksBitmap(group.doneDateKeys, todayKey),
      lastCheckedAt: group.lastCheckedAt ? new Date(group.lastCheckedAt).toISOString() : null,
    };
  });
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
    brands: [],
  };
}

// Brand is a *lens* on the roadmap, not roadmap data: a failed brand read leaves
// the timeline fully usable and just drops the filter, so it never enters
// failedSources (2026-08-29 브랜드 탭 설계 §4 P0-4).
function mapRoadmapBrands(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    id: row.id,
    key: row.slug || row.id,
    name: row.name,
  }));
}

function mapRoadmapProjects(rows, brandById = new Map()) {
  return rows.map((row) => {
    const brand = row.brand_id ? brandById.get(row.brand_id) : null;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      priority: row.priority,
      startedAt: row.started_at ?? null,
      dueAt: row.due_at ?? null,
      brandId: row.brand_id ?? null,
      brandKey: brand?.key ?? null,
      brandName: brand?.name ?? null,
    };
  });
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

function buildRoadmapState(projectRows, milestoneRows, brandRows) {
  const projectsAvailable = Array.isArray(projectRows);
  const milestonesAvailable = Array.isArray(milestoneRows);
  const failedSources = [];
  if (!projectsAvailable) failedSources.push("projects");
  if (!milestonesAvailable) failedSources.push("milestones");

  const truncatedSources = [];
  if (projectsAvailable && projectRows.length > ROADMAP_ROW_LIMIT) truncatedSources.push("projects");
  if (milestonesAvailable && milestoneRows.length > ROADMAP_ROW_LIMIT) truncatedSources.push("milestones");

  const brands = mapRoadmapBrands(brandRows);
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const projects = mapRoadmapProjects(
    projectsAvailable ? projectRows.slice(0, ROADMAP_ROW_LIMIT) : [],
    brandById,
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
          message: `${failedSources.join(", ")} 기록을 읽지 못했습니다.`,
          retryable: true,
        }
      : null,
    failedSources,
    truncatedSources,
    projects,
    milestones,
    brands,
  };
}

export async function getWorkLedger({ projectId = null, now = new Date() } = {}) {
  const workspaceId = resolveDefaultWorkspaceId();
  const supabaseConfig = resolveSupabaseConfig();
  const selectedProjectId = typeof projectId === "string" ? projectId.trim() : "";

  if (!workspaceId || !supabaseConfig) {
    return {
      source: "preview",
      configured: false,
      workspaceId: workspaceId || null,
      timeZone: resolveRhythmTimeZone(null),
      decisions: [],
      decisionsState: {
        source: "preview",
        state: "preview",
        partial: false,
        failedSources: [],
        truncatedSources: [],
        error: null,
      },
      rituals: [],
      projects: [],
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
      partial: false,
      failedSources: [],
      partialSources: [],
    };
  }

  const [
    decisionRows,
    routineRows,
    profileRows,
    projectRows,
    milestoneRows,
    workspaceRows,
    roadmapBrandRows,
    ritualDefinitionRows,
  ] = await Promise.all([
    fetchSupabaseRows("decisions", {
      limit: DECISION_ROW_LIMIT + 1,
      order: "decided_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("routine_checks", {
      limit: RHYTHM_ROW_LIMIT + 1,
      order: "checked_at.desc.nullslast,created_at.desc.nullslast,id.desc",
      filters: withWorkspaceFilter(
        selectedProjectId ? [["project_id", eqFilter(selectedProjectId)]] : [],
      ),
    }),
    fetchSupabaseRows("profiles", {
      select: "id,display_name,email",
      limit: 40,
    }),
    fetchSupabaseRows("projects", {
      select: "id,name,status,priority,started_at,due_at,brand_id",
      limit: selectedProjectId ? 2 : ROADMAP_ROW_LIMIT + 1,
      order: "due_at.asc",
      filters: withWorkspaceFilter(
        selectedProjectId ? [["id", eqFilter(selectedProjectId)]] : [],
      ),
    }),
    fetchSupabaseRows("milestones", {
      select: "id,project_id,title,status,target_date",
      limit: ROADMAP_ROW_LIMIT + 1,
      order: "target_date.asc",
      filters: withWorkspaceFilter(
        selectedProjectId ? [["project_id", eqFilter(selectedProjectId)]] : [],
      ),
    }),
    fetchSupabaseRows("workspaces", {
      select: "id,timezone",
      limit: 1,
      filters: [["id", eqFilter(workspaceId)]],
    }),
    fetchSupabaseRows("brands", {
      select: "id,slug,name",
      limit: 40,
      order: "name.asc",
      filters: withWorkspaceFilter([["status", eqFilter("active")]]),
    }),
    fetchSupabaseRows("routine_checks", {
      select: "project_id,check_type,status,meta",
      limit: RITUAL_DEFINITION_LIMIT,
      order: "created_at.desc.nullslast,id.desc",
      filters: withWorkspaceFilter([
        ["status", eqFilter("pending")],
        ...(selectedProjectId ? [["project_id", eqFilter(selectedProjectId)]] : []),
      ]),
    }),
  ]);

  const workspaceTimeZoneAvailable = Array.isArray(workspaceRows) && workspaceRows.length === 1;
  const timeZone = resolveRhythmTimeZone(
    workspaceTimeZoneAvailable ? workspaceRows[0].timezone : null,
  );
  const roadmap = buildRoadmapState(projectRows, milestoneRows, roadmapBrandRows);
  const profileById = new Map((profileRows || []).map((p) => [p.id, p]));
  const decisionsState = buildDecisionsState(decisionRows, profileRows);
  const decisions = Array.isArray(decisionRows)
    ? mapDecisions(decisionRows.slice(0, DECISION_ROW_LIMIT), profileById)
    : [];
  const routineRowsTruncated = Array.isArray(routineRows) && routineRows.length > RHYTHM_ROW_LIMIT;
  const visibleRoutineRows = Array.isArray(routineRows)
    ? routineRows.slice(0, RHYTHM_ROW_LIMIT)
    : [];
  const rhythmAvailable = Array.isArray(routineRows) && workspaceTimeZoneAvailable;
  const rituals = rhythmAvailable
    ? mapRituals(visibleRoutineRows, projectRows, { timeZone, now, definitionRows: ritualDefinitionRows })
    : [];
  const rhythm = rhythmAvailable
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
          message: Array.isArray(routineRows)
            ? "workspace timezone 기록을 읽지 못했습니다."
            : "routine_checks 기록을 읽지 못했습니다.",
          retryable: true,
        },
      };

  const failedSources = [
    ...decisionsState.failedSources,
    ...(!rhythmAvailable
      ? [Array.isArray(routineRows) ? "workspaces" : "routine_checks"]
      : []),
    ...roadmap.failedSources,
  ];
  const partialSources = [
    ...decisionsState.truncatedSources,
    ...rhythm.truncatedSources,
    ...roadmap.truncatedSources,
  ];

  // 세 코어 레인(결정·리듬·로드맵)이 전부 error면 "일부 데이터"가 아니라 전면 read 실패다 —
  // partial 200으로 내리면 상태줄이 '일부'를 말하는 동안 화면 전체가 비어 렌더된다(8차 잔여 S).
  const allCoreFailed =
    decisionsState.state === "error" && rhythm.state === "error" && roadmap.state === "error";

  return {
    source: allCoreFailed ? "error" : "supabase",
    ...(allCoreFailed ? { error: "work-ledger-read-failed" } : {}),
    configured: true,
    workspaceId,
    timeZone,
    decisions,
    decisionsState,
    rituals,
    projects: mapDecisionProjectOptions(Array.isArray(projectRows) ? projectRows : []),
    rhythm,
    roadmap,
    summary: summarizeRituals(rituals),
    partial: !allCoreFailed && (failedSources.length > 0 || partialSources.length > 0),
    failedSources,
    partialSources,
  };
}
