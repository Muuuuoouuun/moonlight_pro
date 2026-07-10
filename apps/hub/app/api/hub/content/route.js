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
import { insertSupabaseRecord, updateSupabaseRecord } from "@/lib/server-write";
import { eqFilter } from "@/lib/server-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        },
      });
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

      const persistence = await insertSupabaseRecord("campaigns", campaign.record);

      if (!persistence.persisted) {
        return NextResponse.json(
          {
            status: "preview",
            message: "Campaign payload is valid, but persistence is not configured or failed.",
            campaignId: campaign.campaignId,
            campaign: campaign.record,
            persistence,
          },
          { status: 202 },
        );
      }

      return NextResponse.json({
        status: "saved",
        message: "Campaign saved to Supabase.",
        campaignId: campaign.campaignId,
        campaign: campaign.record,
        persistence,
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
