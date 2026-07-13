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
import { classifyWritePersistence } from "@/lib/write-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function writeResponse(persistence, details = {}, options) {
  const classification = classifyWritePersistence(persistence, options);

  return NextResponse.json(
    {
      ...details,
      ...classification,
    },
    { status: classification.httpStatus },
  );
}

async function writeInputError(response) {
  const details = await response.json().catch(() => ({}));
  const reason = response.status === 413 ? "payload-too-large" : "invalid-json";

  return writeResponse({ persisted: false, reason }, details);
}

function markPartialPersistence(persistence) {
  return {
    ...persistence,
    persisted: false,
    partialPersisted: true,
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
      return writeInputError(parsed.error);
    }

    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return writeResponse(
        { persisted: false, reason: "validation" },
        { error: "Request body must be a JSON object." },
      );
    }

    const action = typeof parsed.data?.action === "string"
      ? parsed.data.action.trim().toLowerCase()
      : "";

    if (action === "handoff" || action === "export") {
      const handoff = buildContentHandoffRecord(parsed.data);

      if (!handoff.variantId) {
        return writeResponse(
          { persisted: false, reason: "validation" },
          {
            error: "variantId is required to record a content handoff.",
          },
        );
      }

      if (!handoff.workspaceId) {
        return writeResponse(
          { persisted: false, reason: "missing-workspace" },
          {
            message: "Workspace ID is required before a content handoff can be saved.",
            contentId: handoff.contentId,
            variantId: handoff.variantId,
            logId: handoff.logId,
            event: handoff.event,
          },
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
        const failedPersistence = !logPersistence.persisted
          ? logPersistence
          : assetPersistence;
        const partialPersisted = logPersistence.persisted && !assetPersistence.persisted;

        return writeResponse(
          partialPersisted
            ? markPartialPersistence(failedPersistence)
            : failedPersistence,
          {
            message: "Content handoff persistence failed.",
            contentId: handoff.contentId,
            variantId: handoff.variantId,
            logId: handoff.logId,
            assetId: asset?.assetId || null,
            event: handoff.event,
            persistence: {
              log: logPersistence,
              asset: assetPersistence,
            },
            ...(partialPersisted
              ? {
                  partialWrite: {
                    persisted: ["publish_logs"],
                    failed: "content_assets",
                  },
                }
              : {}),
          },
        );
      }

      return writeResponse(
        { persisted: true, reason: "ok" },
        {
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
        },
      );
    }

    if (action === "campaign") {
      const campaign = buildCampaignRecord(parsed.data);

      if (!campaign.workspaceId) {
        return writeResponse(
          { persisted: false, reason: "missing-workspace" },
          {
            message: "Workspace ID is required before a campaign can be saved.",
            campaignId: campaign.campaignId,
            campaign: campaign.record,
          },
        );
      }

      const persistence = await insertSupabaseRecord("campaigns", campaign.record);

      if (!persistence.persisted) {
        return writeResponse(
          persistence,
          {
            message: "Campaign persistence failed.",
            campaignId: campaign.campaignId,
            campaign: campaign.record,
            persistence,
          },
        );
      }

      return writeResponse(
        persistence,
        {
          message: "Campaign saved to Supabase.",
          campaignId: campaign.campaignId,
          campaign: campaign.record,
          persistence,
        },
      );
    }

    const draft = buildContentDraftRecords(parsed.data);

    if (!draft.workspaceId) {
      return writeResponse(
        { persisted: false, reason: "missing-workspace" },
        {
          message: "Workspace ID is required before a content draft can be saved.",
          ...draft,
        },
      );
    }

    const itemPersistence = await insertSupabaseRecord("content_items", draft.itemRecord);
    const variantPersistence = itemPersistence.persisted
      ? await insertSupabaseRecord("content_variants", draft.variantRecord)
      : { persisted: false, reason: "content-item-not-persisted" };

    const persisted = itemPersistence.persisted && variantPersistence.persisted;

    if (!persisted) {
      const failedPersistence = !itemPersistence.persisted
        ? itemPersistence
        : variantPersistence;
      const partialPersisted = itemPersistence.persisted && !variantPersistence.persisted;

      return writeResponse(
        partialPersisted
          ? markPartialPersistence(failedPersistence)
          : failedPersistence,
        {
          message: "Content draft persistence failed.",
          ...draft,
          persistence: {
            item: itemPersistence,
            variant: variantPersistence,
          },
          ...(partialPersisted
            ? {
                partialWrite: {
                  persisted: ["content_items"],
                  failed: "content_variants",
                },
              }
            : {}),
        },
      );
    }

    return writeResponse(
      { persisted: true, reason: "ok" },
      {
        message: "Content draft saved to Supabase.",
        ...draft,
        persistence: {
          item: itemPersistence,
          variant: variantPersistence,
        },
      },
    );
  } catch (error) {
    return writeResponse(
      { persisted: false, reason: "mutation-failed" },
      {
        error: error instanceof Error ? error.message : String(error),
      },
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
      return writeInputError(parsed.error);
    }

    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return writeResponse(
        { persisted: false, reason: "validation" },
        { error: "Request body must be a JSON object." },
      );
    }

    const draft = buildContentDraftUpdateRecords(parsed.data);

    if (!draft.contentId || !draft.variantId) {
      return writeResponse(
        { persisted: false, reason: "validation" },
        {
          error: "contentId and variantId are required to update a content draft.",
        },
      );
    }

    if (!draft.workspaceId) {
      return writeResponse(
        { persisted: false, reason: "missing-workspace" },
        {
          message: "Workspace ID is required before a content draft can be updated.",
          ...draft,
        },
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
      updateSupabaseRecord(
        "content_items",
        itemFilters,
        draft.itemPatch,
        { returnRepresentation: true, select: "id" },
      ),
      updateSupabaseRecord(
        "content_variants",
        variantFilters,
        draft.variantPatch,
        { returnRepresentation: true, select: "id" },
      ),
    ]);

    const persisted = itemPersistence.persisted && variantPersistence.persisted;

    if (!persisted) {
      const failedPersistence = !itemPersistence.persisted
        ? itemPersistence
        : variantPersistence;
      const partialPersisted = itemPersistence.persisted !== variantPersistence.persisted;
      const persistedResource = itemPersistence.persisted
        ? "content_items"
        : "content_variants";
      const failedResource = itemPersistence.persisted
        ? "content_variants"
        : "content_items";

      return writeResponse(
        partialPersisted
          ? markPartialPersistence(failedPersistence)
          : failedPersistence,
        {
          message: "Content draft update persistence failed.",
          ...draft,
          persistence: {
            item: itemPersistence,
            variant: variantPersistence,
          },
          ...(partialPersisted
            ? {
                partialWrite: {
                  persisted: [persistedResource],
                  failed: failedResource,
                },
              }
            : {}),
        },
      );
    }

    return writeResponse(
      { persisted: true, reason: "ok" },
      {
        message: "Content draft updated in Supabase.",
        ...draft,
        persistence: {
          item: itemPersistence,
          variant: variantPersistence,
        },
      },
    );
  } catch (error) {
    return writeResponse(
      { persisted: false, reason: "mutation-failed" },
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}
