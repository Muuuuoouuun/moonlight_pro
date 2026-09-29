import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import {
  resolveRhythmTimeZone,
  routineLocalDateKey,
  routineSemanticKey,
  shiftDateKey,
  toZonedDateKey,
} from "../rhythm-calendar.js";
import { RITUAL_CATEGORIES, normalizeTargetPerWeek } from "../rhythm-ui.js";
import { buildRhythmHistory, resolveHistoryWindow } from "../rhythm-history.js";

// 리듬 기록(주·월·분기·연) read. work-ledger의 Rhythm 읽기는 최근 240행만 보므로 긴 기간을
// 담을 수 없다 — 이 저장소는 기간 창 안의 완료 행만 페이지로 끝까지 읽는다.
// 루틴 식별·이름·분류 규칙은 work-ledger mapRituals와 같다((project_id, ritual_key) 묶음).

const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
const DEFINITION_LIMIT = 500;
const CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const SELECT = "project_id,check_type,status,meta,checked_at,created_at";

function metaOf(row) {
  return row?.meta && typeof row.meta === "object" ? row.meta : {};
}

function groupKey(row) {
  return JSON.stringify([row.project_id || null, routineSemanticKey(row)]);
}

function ritualId(projectId, ritualKey) {
  return `ritual:${projectId ? encodeURIComponent(projectId) : "unscoped"}:${encodeURIComponent(ritualKey)}`;
}

async function readDoneRowsInWindow(window, projectId) {
  // checked_at은 UTC — 현지 날짜 경계를 넉넉히 덮도록 앞뒤 하루씩 더 읽고, 날짜 판정은 현지 키로 한다.
  const filters = withWorkspaceFilter([
    ["status", eqFilter("done")],
    ["checked_at", `gte.${shiftDateKey(window.startKey, -1)}T00:00:00.000Z`],
    ["checked_at", `lt.${shiftDateKey(window.endKey, 2)}T00:00:00.000Z`],
    ...(projectId ? [["project_id", eqFilter(projectId)]] : []),
  ]);
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchSupabaseRows("routine_checks", {
      select: SELECT,
      limit: PAGE_SIZE,
      order: "checked_at.asc,id.asc",
      filters: [...filters, ["offset", String(page * PAGE_SIZE)]],
    });
    if (!Array.isArray(batch)) return { rows: null, truncated: false };
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export function mapHistoryRituals({ definitionRows = [], doneRows = [], timeZone, window }) {
  const groups = new Map();
  const ensure = (row) => {
    const key = groupKey(row);
    if (!groups.has(key)) {
      const meta = metaOf(row);
      const checkType = CHECK_TYPES.has(String(row.check_type || "").toLowerCase())
        ? String(row.check_type).toLowerCase()
        : "midday";
      groups.set(key, {
        id: ritualId(row.project_id || null, routineSemanticKey(row)),
        projectId: row.project_id || null,
        name: String(meta.name || meta.label || routineSemanticKey(row)),
        checkType,
        category: null,
        targetPerWeek: null,
        activeFrom: null,
        done: new Set(),
      });
    }
    const group = groups.get(key);
    const meta = metaOf(row);
    if (!group.category && RITUAL_CATEGORIES.has(String(meta.category || "").toLowerCase())) {
      group.category = String(meta.category).toLowerCase();
    }
    if (!group.targetPerWeek) group.targetPerWeek = normalizeTargetPerWeek(meta.target_per_week);
    return group;
  };

  (Array.isArray(definitionRows) ? definitionRows : []).forEach((row) => {
    const group = ensure(row);
    const created = row.created_at ? toZonedDateKey(row.created_at, timeZone) : "";
    if (created && (!group.activeFrom || created < group.activeFrom)) group.activeFrom = created;
  });

  (Array.isArray(doneRows) ? doneRows : []).forEach((row) => {
    const dateKey = routineLocalDateKey(row, timeZone);
    if (!dateKey || dateKey < window.startKey || dateKey > window.endKey) return;
    ensure(row).done.add(dateKey);
  });

  const rituals = [];
  const doneByRitual = new Map();
  groups.forEach((group) => {
    // 창 이후에 만들어진 루틴은 이 기간의 기록 대상이 아니다.
    if (group.activeFrom && group.activeFrom > window.endKey && group.done.size === 0) return;
    rituals.push({
      id: group.id,
      projectId: group.projectId,
      name: group.name,
      checkType: group.checkType,
      category: group.category || "general",
      targetPerWeek: group.targetPerWeek,
      activeFrom: group.activeFrom,
    });
    doneByRitual.set(group.id, group.done);
  });
  return { rituals, doneByRitual };
}

export async function getRhythmHistory({ range, offset = 0, projectId = null, now = new Date() } = {}) {
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId || !resolveSupabaseConfig()) {
    return { source: "preview", state: "preview", history: null };
  }

  const workspaceRows = await fetchSupabaseRows("workspaces", {
    select: "id,timezone",
    limit: 1,
    filters: [["id", eqFilter(workspaceId)]],
  });
  if (!Array.isArray(workspaceRows) || workspaceRows.length !== 1) {
    return { source: "error", state: "error", error: "workspace timezone 기록을 읽지 못했습니다.", history: null };
  }
  const timeZone = resolveRhythmTimeZone(workspaceRows[0].timezone);
  const todayKey = toZonedDateKey(now, timeZone);
  const window = resolveHistoryWindow({ range, offset, todayKey });

  const [definitionRows, done] = await Promise.all([
    fetchSupabaseRows("routine_checks", {
      select: SELECT,
      limit: DEFINITION_LIMIT,
      order: "created_at.asc.nullslast",
      filters: withWorkspaceFilter([
        ["status", eqFilter("pending")],
        ...(projectId ? [["project_id", eqFilter(projectId)]] : []),
      ]),
    }),
    readDoneRowsInWindow(window, projectId),
  ]);

  if (!Array.isArray(definitionRows) || !Array.isArray(done.rows)) {
    return { source: "error", state: "error", error: "routine_checks 기록을 읽지 못했습니다.", history: null };
  }

  const { rituals, doneByRitual } = mapHistoryRituals({ definitionRows, doneRows: done.rows, timeZone, window });
  const history = buildRhythmHistory({ rituals, doneByRitual, window, todayKey });

  return {
    source: "supabase",
    state: done.truncated ? "partial" : rituals.length > 0 ? "live" : "live-empty",
    partial: done.truncated,
    truncatedSources: done.truncated ? ["routine_checks"] : [],
    timeZone,
    todayKey,
    history,
  };
}
