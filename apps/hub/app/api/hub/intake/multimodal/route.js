import { NextResponse } from "next/server.js";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { extractMultimodalIntakeHub } from "@/lib/multimodal-intake-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  // Max 24MB payload for base64 photo/audio
  const parsed = await readHubWriteJson(req, { maxBytes: 24 * 1024 * 1024 });
  if (parsed.error) return parsed.error;

  const { mediaBase64, mimeType, text, instruction } = parsed.data || {};

  if (!mediaBase64 && (!text || !text.trim())) {
    return NextResponse.json(
      { status: "error", error: "mediaBase64 또는 text 중 최소 하나가 필요합니다." },
      { status: 400 },
    );
  }

  const result = await extractMultimodalIntakeHub({
    mediaBase64,
    mimeType,
    text,
    instruction,
  });

  if (!result.ok) {
    if (result.error?.includes("GEMINI_API_KEY not configured")) {
      return NextResponse.json(
        {
          status: "preview",
          reason: "gemini-not-configured",
          message: "GEMINI_API_KEY 설정이 필요합니다.",
        },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { status: "error", error: result.error },
      { status: 200 },
    );
  }

  return NextResponse.json({
    status: "ok",
    data: result.data,
  });
}
