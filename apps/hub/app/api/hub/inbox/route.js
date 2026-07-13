import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { routeCapture } from "@/lib/sales-os/inbox-router";
import { classifyWritePersistence } from "@/lib/write-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classifiedResponse(persistence, details = {}, options) {
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

  return classifiedResponse({ persisted: false, reason }, details);
}

// POST { raw, hint? } — capture one field line, classify, stage as a proposed work order.
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return writeInputError(parsed.error);

    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return classifiedResponse(
        { persisted: false, reason: "validation" },
        { error: "Request body must be a JSON object." },
      );
    }

    const input = parsed.data || {};
    const raw = typeof input.raw === "string" ? input.raw : "";
    const hint = typeof input.hint === "string" ? input.hint : null;

    const result = await routeCapture({ raw, hint });
    const persistence = result.workOrder || {
      persisted: result.routed === true,
      reason: result.reason || "persistence-failed",
    };
    const successOptions = result.routed
      ? { successStatus: "accepted", successHttpStatus: 201 }
      : undefined;

    return classifiedResponse(
      persistence,
      result,
      successOptions,
    );
  } catch (error) {
    return classifiedResponse(
      { persisted: false, reason: "mutation-failed" },
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}
