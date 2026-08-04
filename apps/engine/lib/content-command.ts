type CommandContext = {
  workspaceId?: string;
};

type RecordValue = Record<string, unknown>;

export type NormalizedContentCommand =
  | {
      ok: true;
      action: "create_draft";
      workspaceId: string;
      contentId: string;
      variantId: string;
      itemRecord: RecordValue;
      variantRecord: RecordValue;
    }
  | {
      ok: true;
      action: "update_draft";
      workspaceId: string;
      contentId: string;
      variantId: string;
      itemPatch: RecordValue;
      variantPatch: RecordValue;
    }
  | {
      ok: true;
      action: "handoff";
      workspaceId: string;
      contentId: string | null;
      variantId: string;
      logId: string;
      assetId: string | null;
      event: string;
      logRecord: RecordValue;
      assetRecord: RecordValue | null;
    }
  | {
      ok: true;
      action: "create_campaign";
      workspaceId: string;
      campaignId: string;
      campaignRecord: RecordValue;
    }
  | { ok: false; reason: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function uuid(value: unknown) {
  const normalized = text(value, 100);
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function validateWorkspaceRecord(value: RecordValue, workspaceId: string) {
  return uuid(value.workspace_id) === workspaceId;
}

export function normalizeContentCommand(
  input: RecordValue = {},
  context: CommandContext = {},
): NormalizedContentCommand {
  const action = text(input.action, 50).toLowerCase();
  const workspaceId = uuid(context.workspaceId || input.workspaceId);
  if (!workspaceId) return { ok: false, reason: "missing-workspace" };

  if (action === "create_draft") {
    const itemRecord = record(input.itemRecord);
    if (!itemRecord) return { ok: false, reason: "missing-item-record" };
    const variantRecord = record(input.variantRecord);
    if (!variantRecord) return { ok: false, reason: "missing-variant-record" };
    const contentId = uuid(itemRecord.id);
    const variantId = uuid(variantRecord.id);
    if (!contentId) return { ok: false, reason: "invalid-content-id" };
    if (!variantId) return { ok: false, reason: "invalid-variant-id" };
    if (!validateWorkspaceRecord(itemRecord, workspaceId)) return { ok: false, reason: "item-workspace-mismatch" };
    if (!validateWorkspaceRecord(variantRecord, workspaceId)) return { ok: false, reason: "variant-workspace-mismatch" };
    if (uuid(variantRecord.content_id) !== contentId) return { ok: false, reason: "variant-content-mismatch" };

    return { ok: true, action, workspaceId, contentId, variantId, itemRecord, variantRecord };
  }

  if (action === "update_draft") {
    const contentId = uuid(input.contentId);
    const variantId = uuid(input.variantId);
    const itemPatch = record(input.itemPatch);
    const variantPatch = record(input.variantPatch);
    if (!contentId) return { ok: false, reason: "invalid-content-id" };
    if (!variantId) return { ok: false, reason: "invalid-variant-id" };
    if (!itemPatch) return { ok: false, reason: "missing-item-patch" };
    if (!variantPatch) return { ok: false, reason: "missing-variant-patch" };

    return { ok: true, action, workspaceId, contentId, variantId, itemPatch, variantPatch };
  }

  if (action === "handoff") {
    const logRecord = record(input.logRecord);
    if (!logRecord) return { ok: false, reason: "missing-log-record" };
    const assetRecord = input.assetRecord == null ? null : record(input.assetRecord);
    if (input.assetRecord != null && !assetRecord) return { ok: false, reason: "invalid-asset-record" };
    const contentId = uuid(input.contentId);
    const variantId = uuid(logRecord.variant_id);
    const logId = uuid(logRecord.id);
    const assetId = assetRecord ? uuid(assetRecord.id) : null;
    if (!variantId) return { ok: false, reason: "invalid-variant-id" };
    if (!logId) return { ok: false, reason: "invalid-log-id" };
    if (!validateWorkspaceRecord(logRecord, workspaceId)) return { ok: false, reason: "log-workspace-mismatch" };
    if (assetRecord) {
      if (!assetId) return { ok: false, reason: "invalid-asset-id" };
      if (!validateWorkspaceRecord(assetRecord, workspaceId)) return { ok: false, reason: "asset-workspace-mismatch" };
      if (uuid(assetRecord.variant_id) !== variantId) return { ok: false, reason: "asset-variant-mismatch" };
    }

    return {
      ok: true,
      action,
      workspaceId,
      contentId,
      variantId,
      logId,
      assetId,
      event: text(input.event, 100),
      logRecord,
      assetRecord,
    };
  }

  if (action === "create_campaign") {
    const campaignRecord = record(input.campaignRecord);
    if (!campaignRecord) return { ok: false, reason: "missing-campaign-record" };
    const campaignId = uuid(campaignRecord.id);
    if (!campaignId) return { ok: false, reason: "invalid-campaign-id" };
    if (!validateWorkspaceRecord(campaignRecord, workspaceId)) return { ok: false, reason: "campaign-workspace-mismatch" };
    return { ok: true, action, workspaceId, campaignId, campaignRecord };
  }

  return { ok: false, reason: "invalid-action" };
}
