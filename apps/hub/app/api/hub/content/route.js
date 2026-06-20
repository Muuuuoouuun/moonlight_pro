import { NextResponse } from "next/server";

import {
  buildContentAssetRecord,
  buildContentDraftRecords,
  buildContentDraftUpdateRecords,
  buildContentHandoffRecord,
  getContentLedger,
} from "@/lib/repositories/content-ledger";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { insertSupabaseRecord, updateSupabaseRecord } from "@/lib/server-write";
import { eqFilter } from "@/lib/server-read";
import {
  claimApprovedWorkOrderForExecution,
  createWorkOrder,
  decideWorkOrder,
  releaseWorkOrderExecution,
} from "@/lib/sales-os/work-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compactReplayPayload(payload = {}) {
  const allowed = [
    "action",
    "handoffAction",
    "workspaceId",
    "contentId",
    "variantId",
    "brandId",
    "brandKey",
    "title",
    "event",
    "status",
    "provider",
    "channel",
    "targetChannel",
    "variantType",
    "exportProfile",
    "recordAsset",
    "assetType",
    "mimeType",
    "sizeBytes",
    "storagePath",
    "fileName",
    "targetUrl",
    "externalId",
    "publishedAt",
    "note",
  ];

  return Object.fromEntries(
    allowed
      .map((key) => [key, payload[key]])
      .filter(([, value]) => value != null && value !== ""),
  );
}

function isForbiddenCrmTarget(payload = {}) {
  const hay = [
    payload.target,
    payload.targetChannel,
    payload.channel,
    payload.provider,
    payload.exportProfile,
    payload.note,
  ].filter(Boolean).join(" ").toLowerCase();
  return /(crm|eeocrm|xiaoshouyi|salesforce|회사\s*crm|샤오쇼우이)/.test(hay);
}

async function requireHandoffApproval({ action, handoff, payload }) {
  const approvedWorkOrderId =
    normalizeString(payload.approvedWorkOrderId) ||
    normalizeString(payload.workOrderId);

  if (isForbiddenCrmTarget(payload)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          status: "forbidden_crm_push",
          error: "Company CRM push is forbidden. Create a human checklist instead of a CRM handoff/export.",
        },
        { status: 403 },
      ),
    };
  }

  if (approvedWorkOrderId) {
    const approved = await claimApprovedWorkOrderForExecution({
      workspaceId: handoff.workspaceId,
      id: approvedWorkOrderId,
      kind: action === "export" ? "content_export" : "content_handoff",
      expectedBody: {
        contentId: handoff.contentId,
        variantId: handoff.variantId,
        action,
        event: handoff.event,
        targetChannel: payload.targetChannel || null,
        exportProfile: payload.exportProfile || null,
      },
    });
    if (!approved.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            status: "approval_invalid",
            error: `Approved matching workOrderId is required before content handoff/export can be logged (${approved.reason}).`,
            approvedWorkOrderId,
          },
          { status: 403 },
        ),
      };
    }
    return { ok: true, approvedWorkOrderId };
  }

  const title = normalizeString(payload.title) || "Untitled content";
  const workOrder = await createWorkOrder({
    workspaceId: handoff.workspaceId,
    persona: "production",
    kind: action === "export" ? "content_export" : "content_handoff",
    title: `${action === "export" ? "콘텐츠 export" : "콘텐츠 handoff"} 승인 필요 · ${title}`,
    body: {
      gate: "human_approval",
      contentId: handoff.contentId,
      variantId: handoff.variantId,
      event: handoff.event,
      status: handoff.status,
      action,
      channel: payload.channel || payload.targetChannel || null,
      targetChannel: payload.targetChannel || null,
      exportProfile: payload.exportProfile || null,
      policy: {
        noDirectUploadWithoutApproval: true,
        noCustomerDeliveryWithoutApproval: true,
      },
      replay: compactReplayPayload(payload),
    },
    assetId: handoff.variantId,
    channel: "publish",
    gate: "human_approval",
    source: "manual",
  });

  return {
    ok: false,
    response: NextResponse.json(
      {
        status: "approval_required",
        message: workOrder.persisted
          ? "Content handoff/export was queued for human approval. No publish log, asset, upload, or customer delivery was executed."
          : "Content handoff/export requires human approval, but the approval queue could not be persisted. No publish log, asset, upload, or customer delivery was executed.",
        contentId: handoff.contentId,
        variantId: handoff.variantId,
        event: handoff.event,
        workOrder,
      },
      { status: 202 },
    ),
  };
}

export async function GET() {
  try {
    const ledger = await getContentLedger();

    return NextResponse.json({
      status: ledger.source === "supabase" ? "live" : "preview",
      ...ledger,
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

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) {
      return guard;
    }

    const parsed = await readHubWriteJson(req, { maxBytes: 256 * 1024 });
    if (parsed.error) {
      return parsed.error;
    }

    const action = typeof parsed.data?.action === "string"
      ? parsed.data.action.trim().toLowerCase()
      : "";

    if (action === "handoff" || action === "export") {
      const handoff = buildContentHandoffRecord(parsed.data);

      if (!handoff.variantId) {
        return NextResponse.json(
          {
            status: "error",
            error: "variantId is required to record a content handoff.",
          },
          { status: 400 },
        );
      }

      if (!handoff.workspaceId) {
        return NextResponse.json(
          {
            status: "preview",
            message: "Workspace ID is not configured yet. Content handoff is preview only.",
            contentId: handoff.contentId,
            variantId: handoff.variantId,
            logId: handoff.logId,
            event: handoff.event,
          },
          { status: 202 },
        );
      }

      const approval = await requireHandoffApproval({ action, handoff, payload: parsed.data });
      if (!approval.ok) {
        return approval.response;
      }

      const logPersistence = await insertSupabaseRecord("publish_logs", handoff.logRecord);
      const shouldRecordAsset = action === "export" || parsed.data?.recordAsset === true;
      const asset = shouldRecordAsset
        ? buildContentAssetRecord({
            ...parsed.data,
            event: parsed.data.event || handoff.event,
          })
        : null;
      const assetPersistence = logPersistence.persisted && asset
        ? await insertSupabaseRecord("content_assets", asset.assetRecord)
        : asset
        ? { persisted: false, reason: "publish-log-not-persisted" }
        : { persisted: true, reason: "not-requested" };
      const persisted = logPersistence.persisted && assetPersistence.persisted;

      if (!persisted) {
        if (approval.approvedWorkOrderId) {
          await releaseWorkOrderExecution({
            workspaceId: handoff.workspaceId,
            id: approval.approvedWorkOrderId,
          }).catch(() => null);
        }
        return NextResponse.json(
          {
            status: "preview",
            message: "Content handoff payload is valid, but persistence is not configured or failed.",
            contentId: handoff.contentId,
            variantId: handoff.variantId,
            logId: handoff.logId,
            assetId: asset?.assetId || null,
            event: handoff.event,
            persistence: {
              log: logPersistence,
              asset: assetPersistence,
            },
          },
          { status: 202 },
        );
      }

      const workOrderExecution = approval.approvedWorkOrderId
        ? await decideWorkOrder({ id: approval.approvedWorkOrderId, status: "executed" }).catch((error) => ({
            persisted: false,
            reason: "work-order-execution-failed",
            detail: error instanceof Error ? error.message : String(error),
          }))
        : null;

      return NextResponse.json({
        status: "logged",
        message: "Content handoff recorded in Supabase.",
        contentId: handoff.contentId,
        variantId: handoff.variantId,
        logId: handoff.logId,
        assetId: asset?.assetId || null,
        event: handoff.event,
        persistence: {
          log: logPersistence,
          asset: assetPersistence,
          workOrderExecution,
        },
      });
    }

    const draft = buildContentDraftRecords(parsed.data);

    if (!draft.workspaceId) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Content draft is preview only.",
          ...draft,
        },
        { status: 202 },
      );
    }

    const itemPersistence = await insertSupabaseRecord("content_items", draft.itemRecord);
    const variantPersistence = itemPersistence.persisted
      ? await insertSupabaseRecord("content_variants", draft.variantRecord)
      : { persisted: false, reason: "content-item-not-persisted" };

    const persisted = itemPersistence.persisted && variantPersistence.persisted;

    if (!persisted) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Content draft payload is valid, but persistence is not configured or failed.",
          ...draft,
          persistence: {
            item: itemPersistence,
            variant: variantPersistence,
          },
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      status: "saved",
      message: "Content draft saved to Supabase.",
      ...draft,
      persistence: {
        item: itemPersistence,
        variant: variantPersistence,
      },
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

export async function PATCH(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) {
      return guard;
    }

    const parsed = await readHubWriteJson(req, { maxBytes: 256 * 1024 });
    if (parsed.error) {
      return parsed.error;
    }

    const draft = buildContentDraftUpdateRecords(parsed.data);

    if (!draft.contentId || !draft.variantId) {
      return NextResponse.json(
        {
          status: "error",
          error: "contentId and variantId are required to update a content draft.",
        },
        { status: 400 },
      );
    }

    if (!draft.workspaceId) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Content draft update is preview only.",
          ...draft,
        },
        { status: 202 },
      );
    }

    const itemFilters = [
      ["id", eqFilter(draft.contentId)],
      ["workspace_id", eqFilter(draft.workspaceId)],
    ];
    const variantFilters = [
      ["id", eqFilter(draft.variantId)],
      ["workspace_id", eqFilter(draft.workspaceId)],
    ];

    const [itemPersistence, variantPersistence] = await Promise.all([
      updateSupabaseRecord("content_items", itemFilters, draft.itemPatch),
      updateSupabaseRecord("content_variants", variantFilters, draft.variantPatch),
    ]);

    const persisted = itemPersistence.persisted && variantPersistence.persisted;

    if (!persisted) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Content draft update is valid, but persistence is not configured or failed.",
          ...draft,
          persistence: {
            item: itemPersistence,
            variant: variantPersistence,
          },
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      status: "saved",
      message: "Content draft updated in Supabase.",
      ...draft,
      persistence: {
        item: itemPersistence,
        variant: variantPersistence,
      },
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
