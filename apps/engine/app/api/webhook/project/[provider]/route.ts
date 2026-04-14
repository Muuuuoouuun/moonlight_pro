import { NextResponse } from "next/server";

import { failProjectWebhook, handleProjectWebhook } from "../../../../../lib/project-webhook";
import {
  buildSharedProjectWebhookPayload,
  normalizeSharedWebhookProvider,
  SHARED_WEBHOOK_SECRET_HEADER,
  validateSharedWebhookRequest,
} from "../../../../../lib/shared-webhook";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

function resolveProvider(providerParam: string) {
  return normalizeSharedWebhookProvider(providerParam);
}

export async function GET(_req: Request, context: RouteContext) {
  const { provider: providerParam } = await context.params;
  const provider = resolveProvider(providerParam);

  if (!provider) {
    return NextResponse.json(
      {
        status: "not-found",
        error: "Unsupported shared webhook provider.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: "ok",
    provider,
    route: `/api/webhook/project/${provider}`,
    auth: {
      header: SHARED_WEBHOOK_SECRET_HEADER,
      requiredWhenConfigured: true,
    },
    accepts: {
      meta: {
        workspaceId: "string",
        provider: provider,
        source: "string",
      },
      project: {
        id: "uuid (optional)",
        title: "string",
        status: "reported | active | blocked | done",
        progress: "number (0-100)",
        milestone: "string",
        nextAction: "string",
      },
      event: {
        type: "string",
        summary: "string",
        note: "string",
      },
      check: {
        checkType: "morning | midday | evening | weekly",
      },
    },
  });
}

export async function POST(req: Request, context: RouteContext) {
  const { provider: providerParam } = await context.params;
  const provider = resolveProvider(providerParam);

  if (!provider) {
    return NextResponse.json(
      {
        status: "not-found",
        error: "Unsupported shared webhook provider.",
      },
      { status: 404 },
    );
  }

  let body: Record<string, unknown> = {};

  try {
    body = await req.json();

    const auth = validateSharedWebhookRequest(req);
    if (!auth.ok) {
      return NextResponse.json(
        {
          status: "unauthorized",
          error: auth.error,
          provider,
        },
        { status: 401 },
      );
    }

    const payload = buildSharedProjectWebhookPayload(body, provider);
    const result = await handleProjectWebhook(payload);

    return NextResponse.json(
      {
        ...result,
        provider,
        auth: auth.mode,
      },
      { status: 202 },
    );
  } catch (error) {
    await failProjectWebhook(error, body);
    return NextResponse.json(
      {
        status: "failed",
        provider,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
