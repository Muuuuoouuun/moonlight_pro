import { NextResponse } from "next/server";

import {
  buildCampaignPreview,
  getCampaignRunTone,
  normalizeCampaignRunStatus,
  normalizeCampaignStatus,
} from "@/lib/content-campaigns";
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

function normalizeDate(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function isPersistableId(value) {
  const normalized = normalizeString(value);
  return normalized && !normalized.startsWith("preview-") && UUID_PATTERN.test(normalized);
}

function buildCampaignRecord(payload, action) {
  const status =
    action === "handoff"
      ? "active"
      : normalizeCampaignStatus(payload.status || "draft");

  return {
    name: normalizeString(payload.title || payload.name, "새 캠페인"),
    brand_key: normalizeString(payload.brandKey || payload.brand),
    channel: normalizeString(payload.channel, "Content"),
    status,
    goal: normalizeString(payload.goal, "Campaign brief is ready for alignment."),
    next_action: normalizeString(
      payload.nextAction,
      "Lock the next content move and the follow-up lane together.",
    ),
    handoff: normalizeString(payload.handoff, "Content -> Publish -> Follow-up"),
    start_date: normalizeDate(payload.startDate),
    end_date: normalizeDate(payload.endDate),
  };
}

function buildRunResponse(run, campaign) {
  const status = normalizeCampaignRunStatus(run.status);

  return {
    id: run.id || `preview-run-${Date.now()}`,
    campaignId: campaign.id,
    title: campaign.title,
    brand: campaign.brand,
    brandLabel: campaign.brandLabel,
    status,
    tone: getCampaignRunTone(status),
    detail: run.result_summary || campaign.nextAction,
    handoff: campaign.handoff,
    time: "방금",
  };
}

export async function POST(req) {
  try {
    const payload = await req.json();
    const requestedAction = normalizeString(payload.action, "create").toLowerCase();
    const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
    const id = normalizeString(payload.id);

    if (!normalizeString(payload.title || payload.name)) {
      return NextResponse.json(
        {
          status: "error",
          error: "Campaign title is required.",
        },
        { status: 400 },
      );
    }

    if (!normalizeString(payload.channel)) {
      return NextResponse.json(
        {
          status: "error",
          error: "Campaign channel is required.",
        },
        { status: 400 },
      );
    }

    const action =
      requestedAction === "handoff"
        ? "handoff"
        : requestedAction === "update" && isPersistableId(id)
          ? "update"
          : "create";
    const record = buildCampaignRecord(payload, action);
    const previewCampaign = buildCampaignPreview({
      id: id || `preview-campaign-${Date.now()}`,
      ...record,
    });

    if (!workspaceId) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Preview only.",
          campaign: previewCampaign,
          run:
            action === "handoff"
              ? buildRunResponse(
                  {
                    status: "queued",
                    result_summary: `${previewCampaign.title} handoff queued.`,
                  },
                  previewCampaign,
                )
              : null,
        },
        { status: 202 },
      );
    }

    let persistence;

    if (action === "create" || !isPersistableId(id)) {
      persistence = await insertSupabaseRecord(
        "campaigns",
        {
          workspace_id: workspaceId,
          ...record,
        },
        { returning: true },
      );
    } else {
      persistence = await updateSupabaseRecord(
        "campaigns",
        [["id", `eq.${id}`]],
        record,
        { returning: true },
      );
    }

    let runPersistence = null;

    if (action === "handoff" && persistence.row?.id) {
      runPersistence = await insertSupabaseRecord(
        "campaign_runs",
        {
          workspace_id: workspaceId,
          campaign_id: persistence.row.id,
          status: "queued",
          payload: {
            brand_key: record.brand_key,
            channel: record.channel,
            goal: record.goal,
            handoff: record.handoff,
            campaign_title: record.name,
          },
          result_summary: `${record.name} handoff queued for publish and follow-up.`,
        },
        { returning: true },
      );
    }

    await insertSupabaseRecord("activity_logs", {
      workspace_id: workspaceId,
      entity_type: "campaign",
      entity_id: persistence.row?.id || null,
      action:
        action === "handoff"
          ? "campaign.handoff_queued"
          : action === "update"
            ? "campaign.updated"
            : "campaign.created",
      payload: {
        brand_key: record.brand_key,
        channel: record.channel,
        status: record.status,
      },
    });

    if (!persistence.persisted || !persistence.row) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Campaign payload is valid, but persistence is not configured or failed.",
          campaign: previewCampaign,
          run:
            action === "handoff"
              ? buildRunResponse(
                  {
                    status: "queued",
                    result_summary: `${previewCampaign.title} handoff queued.`,
                  },
                  previewCampaign,
                )
              : null,
          persistence,
        },
        { status: 202 },
      );
    }

    const campaign = buildCampaignPreview(persistence.row);
    const run = runPersistence?.row ? buildRunResponse(runPersistence.row, campaign) : null;

    return NextResponse.json({
      status: "saved",
      message:
        action === "handoff"
          ? "Campaign handoff queued in Supabase."
          : action === "update"
            ? "Campaign updated in Supabase."
            : "Campaign created in Supabase.",
      campaign,
      run,
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
