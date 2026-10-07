import { NextResponse } from "next/server.js";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { fetchSupabaseRows, inFilter, eqFilter } from "@/lib/server-read";
import { forwardPatternAnalysis } from "@/lib/pattern-analysis-client";
import { isCanonicalUuid } from "@/lib/uuid";
import { isJournalTimestamp, JOURNAL_NOTE_KINDS, JOURNAL_SCOPES } from "@/lib/journal";
import { memoPeriod } from "@/lib/journal-search-client";
import { normalizeJournalSearch } from "@/lib/journal-search";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  const authError = assertHubWriteAllowed(req);
  if (authError) return authError;

  const { data: body, error: jsonError } = await readHubWriteJson(req);
  if (jsonError) return jsonError;

  const { requestId, goal = "general", noteIds = [], question, range, scope = "", workspaceId: expectedWorkspace } = body || {};
  const noteScope = scope === 'all' ? '' : scope;
  const isWeeklyRange = range === "7d" || (goal === "weekly_synthesis" && Array.isArray(noteIds) && noteIds.length === 0);

  if (!isCanonicalUuid(requestId) || !['', ...JOURNAL_SCOPES, 'unclassified'].includes(noteScope)
    || (expectedWorkspace !== undefined && !isCanonicalUuid(expectedWorkspace)) || (range !== undefined && range !== '7d')) {
    return NextResponse.json(
      { status: "invalid-input", error: "invalid-input", message: "분석 요청과 메모 범위를 확인해 주세요." },
      { status: 400 }
    );
  }

  if (!Array.isArray(noteIds) || (isWeeklyRange ? noteIds.length !== 0 : noteIds.length === 0 || noteIds.length > 25)
    || noteIds.some(id => !isCanonicalUuid(id)) || new Set(noteIds.map(id => id.toLowerCase())).size !== noteIds.length) {
    return NextResponse.json(
      { status: "invalid-input", error: "invalid-input", message: "메모를 다시 선택하거나 최근 7일 분석을 실행해 주세요." },
      { status: 400 }
    );
  }

  const configuredWorkspace = resolveDefaultWorkspaceId();
  const workspaceId = isCanonicalUuid(configuredWorkspace) ? configuredWorkspace.toLowerCase() : null;
  if (expectedWorkspace !== undefined && workspaceId && expectedWorkspace.toLowerCase() !== workspaceId) {
    return NextResponse.json({ status: 'invalid-input', error: 'invalid-input', message: '메모 범위가 바뀌었습니다. 목록을 다시 확인해 주세요.' }, { status: 400 });
  }
  if (!workspaceId || !resolveSupabaseConfig()) {
    return NextResponse.json(
      { status: "preview", patterns: [], error: "missing-workspace-config" },
      { status: 202 }
    );
  }

  try {
    const filters = [["workspace_id", eqFilter(workspaceId)], ["entry_kind", eqFilter('note')]];
    if (noteScope) filters.push(['note_meta->>scope', noteScope === 'unclassified' ? 'is.null' : eqFilter(noteScope)]);
    const ids = noteIds.map(id => id.toLowerCase());
    const period = isWeeklyRange ? normalizeJournalSearch(memoPeriod(7, new Date(Date.now()))).value : null;
    let rows;
    if (isWeeklyRange) {
      rows = await fetchSupabaseRows("journal_entries", {
        select: "id,workspace_id,entry_kind,title,body,occurred_at,note_meta",
        filters: [
          ...filters,
          ["occurred_at", `gte.${period.dateFromAt}`],
          ["occurred_at", `lt.${period.dateToAt}`],
        ],
        order: "occurred_at.desc,id.desc",
        limit: 25,
      });
    } else {
      rows = await fetchSupabaseRows("journal_entries", {
        select: "id,workspace_id,entry_kind,title,body,occurred_at,note_meta",
        filters: [
          ...filters,
          ["id", inFilter(ids)],
        ],
        limit: 25,
      });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { status: "error", error: "records-not-found", message: "선택 또는 분석할 메모를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Filtering at storage is necessary but not sufficient: never forward a
    // partial selection or a row outside the verified workspace/scope/period.
    if (rows.length > 25 || new Set(rows.map(row => row?.id)).size !== rows.length
      || (!isWeeklyRange && (rows.length !== ids.length || rows.some(row => !ids.includes(row?.id))))
      || rows.some(row => !row || row.workspace_id !== workspaceId || row.entry_kind !== 'note' || !isCanonicalUuid(row.id)
        || row.id !== row.id.toLowerCase() || !isJournalTimestamp(row.occurred_at)
        || typeof row.body !== 'string' || !row.body.trim() || (row.title != null && typeof row.title !== 'string')
        || !row.note_meta || !JOURNAL_NOTE_KINDS.includes(row.note_meta.kind)
        || (row.note_meta.scope !== undefined && !JOURNAL_SCOPES.includes(row.note_meta.scope))
        || (noteScope && (noteScope === 'unclassified' ? row.note_meta.scope !== undefined : row.note_meta.scope !== noteScope))
        || (period && (Date.parse(row.occurred_at) < Date.parse(period.dateFromAt) || Date.parse(row.occurred_at) >= Date.parse(period.dateToAt))))) {
      return NextResponse.json({ status: 'error', error: 'records-not-found', message: '선택한 메모의 범위를 확인하지 못했습니다. 목록을 다시 확인해 주세요.' }, { status: 409 });
    }

    const records = rows.map((r) => ({
      id: r.id,
      title: r.title || "",
      body: r.body || "",
      occurredAt: r.occurred_at || "",
      enhancement: r.note_meta?.enhancement || "",
    }));

    const engineRes = await forwardPatternAnalysis({
      workspaceId,
      requestId,
      goal,
      records,
      question,
    });

    return NextResponse.json(engineRes.data, { status: engineRes.httpStatus });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: "analysis-dispatch-failed", message: err.message },
      { status: 500 }
    );
  }
}
