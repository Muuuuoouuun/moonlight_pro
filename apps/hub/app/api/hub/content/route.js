import { NextResponse } from "next/server";

import {
  buildCampaignRecord,
  buildContentAssetRecord,
  buildContentDraftRecords,
  buildContentDraftUpdateRecords,
  buildContentHandoffRecord,
  getContentLedger,
} from "@/lib/repositories/content-ledger";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { buildContentBrandCatalog } from "@/lib/content-brand-catalog";
import { forwardContentCommand } from "@/lib/content-engine-client";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getContentLedger();

    return NextResponse.json({
      status: ledger.source === "supabase" ? "live" : "preview",
      ...ledger,
      brandCatalog: buildContentBrandCatalog(ledger),
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

      const shouldRecordAsset = action === "export" || parsed.data?.recordAsset === true;
      const asset = shouldRecordAsset
        ? buildContentAssetRecord({
            ...parsed.data,
            event: parsed.data.event || handoff.event,
          })
        : null;
      const result = await forwardContentCommand({
        action: "handoff",
        workspaceId: handoff.workspaceId,
        contentId: handoff.contentId,
        event: handoff.event,
        logRecord: handoff.logRecord,
        assetRecord: asset?.assetRecord || null,
      });
      return NextResponse.json(result.data, { status: result.httpStatus });
    }

    if (action === "campaign") {
      const campaign = buildCampaignRecord(parsed.data);

      if (!campaign.workspaceId) {
        return NextResponse.json(
          {
            status: "preview",
            message: "Workspace ID is not configured yet. Campaign is preview only.",
            campaignId: campaign.campaignId,
            campaign: campaign.record,
          },
          { status: 202 },
        );
      }

      const result = await forwardContentCommand({
        action: "create_campaign",
        workspaceId: campaign.workspaceId,
        campaignRecord: campaign.record,
      });
      return NextResponse.json(result.data, { status: result.httpStatus });
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

    const result = await forwardContentCommand({
      action: "create_draft",
      ...draft,
    });
    return NextResponse.json(result.data, { status: result.httpStatus });
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

// Soft delete (migration 0021): stamps deleted_at on the content item (and its variant)
// so an errant draft leaves the queue but stays recoverable. Body carries { contentId, variantId? }.
export async function DELETE(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req, { maxBytes: 8 * 1024 });
    if (parsed.error) return parsed.error;

    const contentId = typeof parsed.data?.contentId === "string" ? parsed.data.contentId.trim() : "";
    if (!contentId) {
      return NextResponse.json(
        { status: "error", error: "contentId is required to delete a content item." },
        { status: 400 },
      );
    }

    const workspaceId = resolveDefaultWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { status: "preview", message: "Workspace ID is not configured yet. Content delete is preview only.", contentId },
        { status: 202 },
      );
    }

    const result = await forwardContentCommand({
      action: "delete_content",
      workspaceId,
      contentId,
      variantId: typeof parsed.data?.variantId === "string" ? parsed.data.variantId.trim() : null,
    });
    return NextResponse.json(result.data, { status: result.httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
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

    const result = await forwardContentCommand({
      action: "update_draft",
      ...draft,
    });
    return NextResponse.json(result.data, { status: result.httpStatus });
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
