import { NextResponse } from "next/server";

import {
  buildContentDraftRecords,
  buildContentDraftUpdateRecords,
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
