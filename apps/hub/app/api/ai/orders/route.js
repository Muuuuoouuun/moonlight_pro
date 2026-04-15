import { NextResponse } from "next/server";

import {
  getAiOrderStatusLabel,
  getAiOrderTone,
  getAiTargetLabel,
  normalizeAiOrderStatus,
  normalizeAiPriority,
  normalizeAiTarget,
} from "@/lib/ai-console";
import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  updateSupabaseRecord,
} from "@/lib/server-write";

export const runtime = "nodejs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function isPersistableId(value) {
  const normalized = normalizeString(value);
  return normalized && !normalized.startsWith("preview-") && UUID_PATTERN.test(normalized);
}

function buildOrderPreview(id, payload) {
  const target = normalizeAiTarget(payload.target);
  const status = normalizeAiOrderStatus(payload.status || (payload.action === "reassign" ? "running" : "queued"));

  return {
    id,
    title: normalizeString(payload.title, "새 오더"),
    target: getAiTargetLabel(target),
    status: getAiOrderStatusLabel(status),
    tone: getAiOrderTone(status),
    priority: normalizeAiPriority(payload.priority),
    lane: normalizeString(payload.lane, "Work OS"),
    due: normalizeString(payload.due, "오늘"),
    note: normalizeString(payload.note, "세부 지시사항이 아직 비어 있습니다."),
  };
}

export async function POST(req) {
  try {
    const payload = await req.json();
    const action = normalizeString(payload.action, "create").toLowerCase();
    const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
    const id = normalizeString(payload.id);

    if (action !== "reassign" && !normalizeString(payload.title)) {
      return NextResponse.json(
        {
          status: "error",
          error: "Order title is required.",
        },
        { status: 400 },
      );
    }

    if (action !== "reassign" && !normalizeString(payload.note)) {
      return NextResponse.json(
        {
          status: "error",
          error: "Order note is required.",
        },
        { status: 400 },
      );
    }

    const previewOrder = buildOrderPreview(id || `preview-order-${Date.now()}`, payload);

    if (!workspaceId) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Preview only.",
          order: previewOrder,
        },
        { status: 202 },
      );
    }

    const target = normalizeAiTarget(payload.target);
    const status = normalizeAiOrderStatus(
      payload.status || (action === "reassign" ? "running" : action === "update" ? "queued" : "queued"),
    );
    const record = {
      title: normalizeString(payload.title, previewOrder.title),
      target,
      status,
      priority: normalizeAiPriority(payload.priority),
      lane: normalizeString(payload.lane, "Work OS"),
      due_label: normalizeString(payload.due, "오늘"),
      note: normalizeString(payload.note, previewOrder.note),
      tone: getAiOrderTone(status),
      updated_at: new Date().toISOString(),
    };

    let persistence;

    if (action === "create" || !isPersistableId(id)) {
      persistence = await insertSupabaseRecord(
        "ai_orders",
        {
          workspace_id: workspaceId,
          ...record,
        },
        { returning: true },
      );
    } else {
      persistence = await updateSupabaseRecord(
        "ai_orders",
        [["id", `eq.${id}`]],
        record,
        { returning: true },
      );
    }

    await insertSupabaseRecord("activity_logs", {
      workspace_id: workspaceId,
      entity_type: "ai_order",
      entity_id: persistence.row?.id || null,
      action:
        action === "reassign"
          ? "order.reassigned"
          : action === "update"
            ? "order.updated"
            : "order.created",
      payload: {
        target,
        lane: record.lane,
        priority: record.priority,
      },
    });

    if (!persistence.persisted || !persistence.row) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Order payload is valid, but persistence is not configured or failed.",
          order: previewOrder,
          persistence,
        },
        { status: 202 },
      );
    }

    const orderRow = persistence.row;

    return NextResponse.json({
      status: "saved",
      message:
        action === "reassign"
          ? "Order reassigned in Supabase."
          : action === "update"
            ? "Order updated in Supabase."
            : "Order created in Supabase.",
      order: {
        id: orderRow.id,
        title: orderRow.title,
        target: getAiTargetLabel(orderRow.target),
        status: getAiOrderStatusLabel(orderRow.status),
        tone: orderRow.tone || getAiOrderTone(orderRow.status),
        priority: orderRow.priority,
        lane: orderRow.lane,
        due: orderRow.due_label || "오늘",
        note: orderRow.note,
      },
      persistence,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
