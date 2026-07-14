import { createHash } from "crypto";

type JsonRecord = Record<string, unknown>;
type CaptureContext = {
  workspaceId?: string;
  ownerId?: string | null;
};
type RpcResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  detail?: string;
};
type CaptureDependencies = {
  rpc: (name: string, params: JsonRecord) => Promise<RpcResult>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HINTS = new Set(["inbox", "task", "note", "customer", "idea"]);
const ENTITY_TYPES = new Set(["lead", "deal", "contact", "company"]);

function normalizedUuid(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return UUID_PATTERN.test(text) ? text : null;
}

function normalizeEntityRef(value: unknown) {
  if (value == null) return { ok: true as const, value: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false as const, reason: "invalid-entity-ref" };
  }

  const record = value as JsonRecord;
  const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
  const id = normalizedUuid(record.id);
  if (!ENTITY_TYPES.has(type) || !id) {
    return { ok: false as const, reason: "invalid-entity-ref" };
  }
  return { ok: true as const, value: { type, id } };
}

export function normalizeCaptureCommand(
  input: JsonRecord = {},
  context: CaptureContext = {},
) {
  const workspaceId = normalizedUuid(context.workspaceId);
  const ownerId = normalizedUuid(context.ownerId);
  const raw = typeof input.raw === "string" ? input.raw.trim() : "";
  const hint = typeof input.hint === "string" ? input.hint.trim().toLowerCase() : "inbox";
  const idempotencyKey = normalizedUuid(input.idempotencyKey || input.idempotency_key);
  const entityRef = normalizeEntityRef(input.entityRef || input.entity_ref || null);

  if (!workspaceId) return { ok: false as const, reason: "missing-workspace" };
  if (!raw) return { ok: false as const, reason: "empty-capture" };
  if (raw.length > 4000) return { ok: false as const, reason: "capture-too-long" };
  if (!HINTS.has(hint)) return { ok: false as const, reason: "invalid-hint" };
  if (!idempotencyKey) return { ok: false as const, reason: "invalid-idempotency-key" };
  if (!entityRef.ok) return { ok: false as const, reason: entityRef.reason };

  const hashInput = JSON.stringify({ raw, hint, entityRef: entityRef.value });
  const requestHash = createHash("sha256").update(hashInput).digest("hex");

  return {
    ok: true as const,
    operation: "quick_capture",
    params: {
      p_workspace_id: workspaceId,
      p_owner_id: ownerId,
      p_raw: raw,
      p_hint: hint,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_entity_ref: entityRef.value,
    },
  };
}

export async function executeCaptureCommand(
  input: JsonRecord,
  context: CaptureContext,
  dependencies: CaptureDependencies,
) {
  const command = normalizeCaptureCommand(input, context);
  if (!command.ok) {
    return { status: "invalid-input", error: command.reason, retryable: false };
  }

  const result = await dependencies.rpc("capture_quick_input_v1", command.params);
  if (!result.ok) {
    if (result.error === "missing-config") {
      return { status: "preview", error: "missing-config", retryable: true };
    }
    return {
      status: "error",
      error: result.error || "capture-rpc-failed",
      retryable: true,
    };
  }

  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return { status: "error", error: "invalid-capture-response", retryable: true };
  }

  return result.data as JsonRecord;
}
