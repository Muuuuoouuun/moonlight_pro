import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { recordOutreachOutcome } from "@/lib/repositories/outcomes-ledger";
import { classifyWritePersistence } from "@/lib/write-response";

export const runtime = "nodejs";

function writeResponse(persistence, details = {}) {
  const classification = classifyWritePersistence(persistence);

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

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) {
      return guard;
    }

    const parsed = await readHubWriteJson(req);
    if (parsed.error) {
      return writeInputError(parsed.error);
    }

    const body = parsed.data;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return writeResponse(
        { persisted: false, reason: "validation" },
        { error: "Request body must be a JSON object." },
      );
    }

    const result = await recordOutreachOutcome({
      leadId: body.leadId || null,
      dealId: body.dealId || null,
      companyId: body.companyId || null,
      play: body.play || null,
      assetId: body.assetId || null,
      channel: body.channel || null,
      action: body.action || "sent",
      note: body.note || null,
      occurredAt: body.occurredAt || null,
    });
    return writeResponse(
      result,
      {
        result,
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
