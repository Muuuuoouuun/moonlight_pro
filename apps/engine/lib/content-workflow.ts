import { createHash } from "node:crypto";

type JsonRecord = Record<string, unknown>;
type Context = { workspaceId?: string };
type RpcResult = { ok: boolean; data?: unknown; error?: string; detail?: string };
type Dependencies = { rpc: (name: string, params: JsonRecord) => Promise<RpcResult> };

export const MAX_CONTENT_WORKFLOW_BYTES = 256 * 1024;
export const CONTENT_WORKFLOW_CHANNELS: Record<string, readonly string[]> = {
  threads_post: ["threads"],
  x_thread: ["threads", "x"], social_post: ["threads", "x"],
  blog_insight: ["blog"], blog: ["blog"], landing_copy: ["blog"],
  card_news: ["instagram"], reels_script: ["reels", "instagram", "youtube_shorts"],
  newsletter: ["email"],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const BRIEF_FIELDS = ["audience", "purpose", "message", "angle", "evidence", "ending"];
const own = (object: JsonRecord, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === "object" && !Array.isArray(value));
const validUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const validTimestamp = (value: unknown): value is string => typeof value === "string" && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
const validText = (value: unknown): value is string => typeof value === "string" && !value.includes("\u0000");

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

type Normalized = { ok: false; reason: string } | {
  ok: true; workspaceId: string; requestId: string; requestHash: string; command: JsonRecord;
};

export function normalizeContentWorkflow(input: unknown, context: Context = {}): Normalized {
  const invalid = (reason: string): Normalized => ({ ok: false, reason });
  if (!isRecord(input)) return invalid("invalid-command");
  const workspaceId = context.workspaceId;
  if (!validUuid(workspaceId)) return invalid("missing-workspace");
  if (!["save", "create_variant", "apply_candidate", "restore_revision"].includes(String(input.action))) return invalid("invalid-action");
  if (!validUuid(input.requestId)) return invalid("invalid-request-id");
  const contentId = input.contentId ?? null;
  const variantId = input.variantId ?? null;
  if (contentId !== null && !validUuid(contentId)) return invalid("invalid-content-id");
  if (variantId !== null && !validUuid(variantId)) return invalid("invalid-variant-id");
  if ((!contentId && variantId) || (input.action !== "save" && (!contentId || !variantId))) return invalid("missing-parent");
  if (contentId && !validTimestamp(input.expectedItemUpdatedAt)) return invalid("missing-item-version");
  if (variantId && !validTimestamp(input.expectedVariantUpdatedAt)) return invalid("missing-variant-version");
  const command: JsonRecord = {
    action: input.action, contentId, variantId,
    expectedItemUpdatedAt: contentId ? input.expectedItemUpdatedAt : null,
    expectedVariantUpdatedAt: variantId ? input.expectedVariantUpdatedAt : null,
  };

  if (input.action === "save") {
    const item = input.item ?? {};
    if (!isRecord(item)) return invalid("invalid-item");
    const patch: JsonRecord = {};
    for (const field of ["title", "sourceIdea", "nextAction", "blocker"]) {
      if (!own(item, field)) continue;
      if (!validText(item[field])) return invalid(`invalid-${field}`);
      patch[field] = item[field];
    }
    if (own(item, "brandId")) {
      if (item.brandId !== null && !validUuid(item.brandId)) return invalid("invalid-brand-id");
      patch.brandId = item.brandId;
    }
    if (own(item, "brief")) {
      if (!isRecord(item.brief)) return invalid("invalid-brief");
      const brief: JsonRecord = {};
      for (const field of BRIEF_FIELDS) {
        if (!own(item.brief, field)) continue;
        if (!validText(item.brief[field])) return invalid(`invalid-brief-${field}`);
        brief[field] = item.brief[field];
      }
      patch.brief = brief;
    }
    if (own(input, "checkpoint") && typeof input.checkpoint !== "boolean") return invalid("invalid-checkpoint");
    command.item = patch;
    command.checkpoint = input.checkpoint === true;
  }

  if (input.action === "save" || input.action === "create_variant") {
    const variant = input.variant ?? {};
    if (!isRecord(variant)) return invalid("invalid-variant");
    const patch: JsonRecord = {};
    for (const field of ["title", "body", "variantType", "channel"]) {
      if (!own(variant, field)) continue;
      if (!validText(variant[field])) return invalid(`invalid-variant-${field}`);
      patch[field] = variant[field];
    }
    if (own(patch, "variantType") && !CONTENT_WORKFLOW_CHANNELS[String(patch.variantType)]) return invalid("invalid-variant-type");
    if (own(patch, "channel") && !Object.values(CONTENT_WORKFLOW_CHANNELS).some((channels) => channels.includes(String(patch.channel)))) return invalid("invalid-channel");
    if (patch.variantType && patch.channel && !CONTENT_WORKFLOW_CHANNELS[String(patch.variantType)].includes(String(patch.channel))) return invalid("invalid-channel-format");
    command.variant = patch;
  }

  if (input.action === "apply_candidate") {
    if (!validUuid(input.runId)) return invalid("invalid-run-id");
    if (!validText(input.candidateId) || !input.candidateId || input.candidateId.length > 100 || !/^[\w-]+$/.test(input.candidateId)) return invalid("invalid-candidate-id");
    if (input.mode !== "replace" && input.mode !== "new_variant") return invalid("invalid-apply-mode");
    Object.assign(command, { runId: input.runId, candidateId: input.candidateId, mode: input.mode });
  }
  if (input.action === "restore_revision") {
    if (!validUuid(input.revisionId)) return invalid("invalid-revision-id");
    command.revisionId = input.revisionId;
  }
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_CONTENT_WORKFLOW_BYTES) return invalid("payload-too-large");
  const requestHash = createHash("sha256").update(stableJson({ workspaceId, command })).digest("hex");
  return { ok: true, workspaceId, requestId: input.requestId, requestHash, command };
}

export async function executeContentWorkflow(input: unknown, context: Context, dependencies: Dependencies): Promise<JsonRecord> {
  const normalized = normalizeContentWorkflow(input, context);
  if (!normalized.ok) return { status: "invalid-input", error: normalized.reason };
  try {
    const result = await dependencies.rpc("content_workflow_v1", {
      p_workspace_id: normalized.workspaceId,
      p_request_id: normalized.requestId,
      p_request_hash: normalized.requestHash,
      p_command: normalized.command,
    });
    if (!result.ok) return { status: result.error === "missing-config" ? "preview" : "error", error: result.error || "workflow-persistence-failed" };
    if (!isRecord(result.data) || !["saved", "duplicate", "conflict", "error", "invalid-input"].includes(String(result.data.status))) return { status: "error", error: "invalid-workflow-response" };
    return result.data;
  } catch {
    return { status: "error", error: "workflow-persistence-failed" };
  }
}
