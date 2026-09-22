import { NextResponse } from "next/server.js";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { extractMultimodalIntakeHub, MAX_MULTIMODAL_REQUEST_BYTES } from "@/lib/multimodal-intake-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  let parsed;
  try {
    parsed = await readHubWriteJson(req, { maxBytes: MAX_MULTIMODAL_REQUEST_BYTES });
  } catch {
    return NextResponse.json({ status: "error", error: "요청 본문을 읽을 수 없습니다." }, { status: 400 });
  }
  if (parsed.error) {
    const envelope = await parsed.error.json();
    return NextResponse.json({ ...envelope, code: envelope.status, status: "error" }, { status: parsed.error.status });
  }
  if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
    return NextResponse.json(
      { status: "error", error: "JSON 객체가 필요합니다." },
      { status: 400 },
    );
  }
  const { mediaBase64, mimeType, text, instruction } = parsed.data;

  const result = await extractMultimodalIntakeHub({
    mediaBase64,
    mimeType,
    text,
    instruction,
  });

  if (!result.ok) {
    if (result.reason === "gemini-not-configured") {
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
      { status: [400, 413].includes(result.status) ? result.status : 200 },
    );
  }

  return NextResponse.json({
    status: "ok",
    data: result.data,
  });
}
