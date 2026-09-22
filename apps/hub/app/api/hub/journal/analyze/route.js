import { NextResponse } from "next/server.js";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { fetchSupabaseRows, inFilter, eqFilter } from "@/lib/server-read";
import { forwardPatternAnalysis } from "@/lib/pattern-analysis-client";

export const runtime = "nodejs";

export async function POST(req) {
  const authError = assertHubWriteAllowed(req);
  if (authError) return authError;

  const { data: body, error: jsonError } = await readHubWriteJson(req);
  if (jsonError) return jsonError;

  const { requestId, goal = "general", noteIds = [], question, range } = body || {};
  const isWeeklyRange = range === "7d" || (goal === "weekly_synthesis" && (!Array.isArray(noteIds) || noteIds.length === 0));

  if (!requestId) {
    return NextResponse.json(
      { status: "invalid-input", error: "requestId is required." },
      { status: 400 }
    );
  }

  if (!isWeeklyRange && (!Array.isArray(noteIds) || noteIds.length === 0 || noteIds.length > 25)) {
    return NextResponse.json(
      { status: "invalid-input", error: "noteIds must be an array of 1 to 25 UUIDs or range must be 7d." },
      { status: 400 }
    );
  }

  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId || !resolveSupabaseConfig()) {
    return NextResponse.json(
      { status: "preview", patterns: [], error: "missing-workspace-config" },
      { status: 202 }
    );
  }

  try {
    let rows;
    if (isWeeklyRange) {
      const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      rows = await fetchSupabaseRows("journal_entries", {
        select: "id,title,body,occurred_at,note_meta",
        filters: [
          ["workspace_id", eqFilter(workspaceId)],
          ["occurred_at", `gte.${sinceDate}`],
        ],
        order: "occurred_at.desc",
        limit: 25,
      });

      if (!Array.isArray(rows) || rows.length === 0) {
        rows = await fetchSupabaseRows("journal_entries", {
          select: "id,title,body,occurred_at,note_meta",
          filters: [
            ["workspace_id", eqFilter(workspaceId)],
          ],
          order: "occurred_at.desc",
          limit: 20,
        });
      }
    } else {
      rows = await fetchSupabaseRows("journal_entries", {
        select: "id,title,body,occurred_at,note_meta",
        filters: [
          ["workspace_id", eqFilter(workspaceId)],
          ["id", inFilter(noteIds)],
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
