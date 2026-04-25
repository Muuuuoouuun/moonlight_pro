import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { sendProjectWebhook } from "@/lib/server-write";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) {
      return guard;
    }

    const parsed = await readHubWriteJson(req);
    if (parsed.error) {
      return parsed.error;
    }

    const payload = parsed.data;
    const result = await sendProjectWebhook(payload);

    if (!result.sent) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Project webhook target is not configured or request failed.",
          ...result,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      status: "sent",
      message: "Project webhook smoke test completed.",
      ...result,
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
