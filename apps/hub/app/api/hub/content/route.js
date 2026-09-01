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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getContentLedger();

    if (ledger.source === "error") {
      // read 실패는 status:"error" 봉투로 알린다(HTTP 200) — daily-brief와 같은 계약.
      // 5xx로 내리면 공유 캐시·인프라가 이 라우트를 장애로 오판한다.
      return NextResponse.json(
        { status: "error", ...ledger, brandCatalog: buildContentBrandCatalog(ledger) },
      );
    }

    return NextResponse.json({
      status: ledger.source === "supabase"
        ? ledger.partial ? "partial" : "live"
        : "preview",
      ...ledger,
      brandCatalog: buildContentBrandCatalog(ledger),
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
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
