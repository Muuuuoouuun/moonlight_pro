import { sendEngineWrite } from "@/lib/engine-write-client";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestKey(req, body) {
  return req.headers.get("idempotency-key")?.trim() ||
    (typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "");
}

function requestBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const { idempotencyKey: _idempotencyKey, ...body } = value;
  return body;
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  return sendEngineWrite("/api/tasks", {
    method: "POST",
    idempotencyKey: requestKey(req, parsed.data),
    correlationId: req.headers.get("x-correlation-id"),
    body: requestBody(parsed.data),
  });
}
