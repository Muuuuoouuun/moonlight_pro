import { sendEngineWrite } from "@/lib/engine-write-client";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { classifyCapture } from "@/lib/sales-os/inbox-classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_TO_PERSONA = {
  lead: "sales",
  dm: "sales",
  outcome: "sales",
  idea: "content",
  engagement: "content",
  note: "inbox",
  review: "inbox",
};

function summaryFor(raw, kind) {
  const head = raw.replace(/\s+/g, " ").slice(0, 60);
  return `[${kind}] ${head}`;
}

// POST { raw, hint? } — capture one field line, classify, stage as a proposed work order.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const input = parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
    ? parsed.data
    : {};
  const raw = typeof input.raw === "string" ? input.raw.trim() : "";
  const hint = typeof input.hint === "string" ? input.hint : null;
  const classification = classifyCapture(raw, hint);
  const idempotencyKey = req.headers.get("idempotency-key")?.trim() ||
    (typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "");
  const body = {
    destination: "inbox",
    raw,
    kind: classification.kind,
    persona: KIND_TO_PERSONA[classification.kind] || "inbox",
    summary: summaryFor(raw, classification.kind),
    channel: classification.channel,
  };

  if (Object.prototype.hasOwnProperty.call(input, "entityRef")) {
    body.entityRef = input.entityRef;
  }

  return sendEngineWrite("/api/intake/quick-capture", {
    method: "POST",
    idempotencyKey,
    correlationId: req.headers.get("x-correlation-id"),
    body,
  });
}
