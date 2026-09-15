import { normalizeContentCommand } from "./content-command.ts";

type PersistenceResult = {
  persisted: boolean;
  reason: string;
  detail?: string;
};

type Dependencies = {
  insert: (table: string, record: Record<string, unknown>) => Promise<PersistenceResult>;
  update: (
    table: string,
    filters: Array<[string, string]>,
    patch: Record<string, unknown>,
  ) => Promise<PersistenceResult>;
  remove: (table: string, filters: Array<[string, string]>) => Promise<PersistenceResult>;
  fetchRows: (
    table: string,
    options?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>> | null>;
};

type CommandContext = {
  workspaceId?: string;
};

function filters(id: string, workspaceId: string): Array<[string, string]> {
  return [
    ["id", `eq.${id}`],
    ["workspace_id", `eq.${workspaceId}`],
  ];
}

function failure(error: string, persistence: PersistenceResult, extra = {}) {
  if (persistence.reason === "missing-config") {
    return { status: "preview", error: "missing-config", ...extra };
  }
  return {
    status: "error",
    error,
    detail: persistence.detail || persistence.reason,
    ...extra,
  };
}

async function exactRow(
  dependencies: Dependencies,
  table: string,
  id: string,
  workspaceId: string,
) {
  const rows = await dependencies.fetchRows(table, {
    filters: filters(id, workspaceId),
    limit: 1,
  });
  return rows?.[0] || null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sameFields(existing: Record<string, unknown>, intended: Record<string, unknown>): boolean {
  return Object.entries(intended).every(([key, value]) => {
    if (key === "created_at" || key === "updated_at") return true;
    if (["scheduled_at", "published_at"].includes(key) && typeof value === "string" && typeof existing[key] === "string") {
      return Date.parse(String(existing[key])) === Date.parse(value);
    }
    if (value && typeof value === "object" && !Array.isArray(value)) return sameFields(object(existing[key]), object(value));
    return JSON.stringify(existing[key] ?? null) === JSON.stringify(value ?? null);
  });
}

export async function executeContentCommand(
  input: Record<string, unknown>,
  context: CommandContext,
  dependencies: Dependencies,
) {
  const command = normalizeContentCommand(input, context);
  if (!command.ok) return { status: "invalid-input", error: command.reason };

  if (command.action === "create_draft") {
    const meta = object(command.itemRecord.meta);
    if (meta.source_note_id) {
      const note = await exactRow(dependencies, "notes", String(meta.source_note_id), command.workspaceId);
      if (!note || object(note.meta).org_scope !== meta.org_scope) return { status: "invalid-input", error: "source-note-missing-or-scope-mismatch" };
    }
    const item = await dependencies.insert("content_items", command.itemRecord);
    let itemWasInserted = item.persisted;
    let itemExists = item.persisted;
    if (!item.persisted && item.reason === "duplicate") {
      const existing = await exactRow(dependencies, "content_items", command.contentId, command.workspaceId);
      if (existing && !sameFields(existing, command.itemRecord)) return { status: "error", error: "content-id-conflict", contentId: command.contentId, variantId: command.variantId };
      itemExists = Boolean(existing);
    }
    if (!itemExists) return failure("item-persistence-failed", item, { contentId: command.contentId, variantId: command.variantId });

    const variant = await dependencies.insert("content_variants", command.variantRecord);
    let variantExists = variant.persisted;
    if (!variant.persisted && variant.reason === "duplicate") {
      const existing = await exactRow(dependencies, "content_variants", command.variantId, command.workspaceId);
      variantExists = existing?.content_id === command.contentId && sameFields(existing, command.variantRecord);
    }

    if (!variantExists) {
      const rollback = itemWasInserted
        ? await dependencies.remove("content_items", filters(command.contentId, command.workspaceId))
        : { persisted: true, reason: "not-inserted-by-command" };
      const migrationRequired = command.variantRecord.variant_type === "threads_post" && /content_variants_variant_type_check|23514/.test(variant.detail || "");
      return failure(migrationRequired ? "threads-contract-migration-required" : "variant-persistence-failed", variant, {
        contentId: command.contentId,
        variantId: command.variantId,
        rollback,
        ...(migrationRequired ? { migration: "20260914_0001_content_threads_post.sql" } : {}),
      });
    }

    return {
      status: !itemWasInserted && !variant.persisted ? "duplicate" : "saved",
      action: command.action,
      contentId: command.contentId,
      variantId: command.variantId,
      itemRecord: command.itemRecord,
      variantRecord: command.variantRecord,
      persistence: { item, variant },
    };
  }

  if (command.action === "update_draft") {
    const existingItem = await exactRow(dependencies, "content_items", command.contentId, command.workspaceId);
    const existingVariant = await exactRow(dependencies, "content_variants", command.variantId, command.workspaceId);
    if (!existingItem || !existingVariant || existingVariant.content_id !== command.contentId) return { status: "error", error: "draft-read-or-ownership-check-failed" };
    const originalMeta = object(existingItem.meta);
    const nextMeta = object(command.itemPatch.meta);
    const sourceChanged = existingItem.source_idea != null && "source_idea" in command.itemPatch && command.itemPatch.source_idea !== existingItem.source_idea;
    const provenanceChanged = ["source_note_id", "org_scope", "source_url"].some((key) => originalMeta[key] != null && key in nextMeta && nextMeta[key] !== originalMeta[key]);
    if (sourceChanged || provenanceChanged) return { status: "invalid-input", error: "original-source-is-immutable" };
    command.itemPatch.meta = { ...object(existingItem.meta), ...object(command.itemPatch.meta) };
    command.variantPatch.meta = { ...object(existingVariant.meta), ...object(command.variantPatch.meta) };
    // 순차 실행 + 반쪽 성공 명명 — 병렬 Promise.all은 item만 저장되고 variant가 실패해도
    // 어느 쪽이 남았는지 알 수 없었다(4차 재감사 M). 보상 롤백 대신 정확한 상태 보고.
    const item = await dependencies.update("content_items", filters(command.contentId, command.workspaceId), command.itemPatch);
    if (!item.persisted) return failure("item-update-failed", item, { contentId: command.contentId, variantId: command.variantId });
    const variant = await dependencies.update("content_variants", filters(command.variantId, command.workspaceId), command.variantPatch);
    if (!variant.persisted) return failure("variant-update-failed-item-saved", variant, { contentId: command.contentId, variantId: command.variantId });
    return {
      status: "saved",
      action: command.action,
      contentId: command.contentId,
      variantId: command.variantId,
      itemPatch: command.itemPatch,
      variantPatch: command.variantPatch,
      persistence: { item, variant },
    };
  }

  if (command.action === "record_publication") {
    const contentId = command.contentId!;
    const item = await exactRow(dependencies, "content_items", contentId, command.workspaceId);
    const variant = await exactRow(dependencies, "content_variants", command.variantId, command.workspaceId);
    if (!item || !variant || variant.content_id !== contentId) return { status: "error", error: "publication-read-or-ownership-check-failed" };
    const log = await dependencies.insert("publish_logs", command.logRecord);
    if (!log.persisted) {
      if (log.reason !== "duplicate") return failure("publication-log-failed", log, { logId: command.logId });
      const existing = await exactRow(dependencies, "publish_logs", command.logId, command.workspaceId);
      if (!existing || existing.variant_id !== command.variantId || existing.target_url !== command.logRecord.target_url || Date.parse(String(existing.published_at)) !== Date.parse(String(command.logRecord.published_at)) || object(existing.payload).event !== "operator_published") {
        return { status: "error", error: "publication-log-id-conflict", logId: command.logId };
      }
    }
    // Durable log first: retries with the same log ID finish a partial status update.
    // This records the operator's confirmation; no provider request is made.
    const patch = { status: "published", published_at: command.logRecord.published_at, updated_at: new Date().toISOString() };
    const variantResult = await dependencies.update("content_variants", filters(command.variantId, command.workspaceId), patch);
    if (!variantResult.persisted) return failure("publication-log-saved-variant-update-failed", variantResult, { partial: true, logId: command.logId });
    const itemResult = await dependencies.update("content_items", filters(contentId, command.workspaceId), patch);
    if (!itemResult.persisted) return failure("publication-log-and-variant-saved-item-update-failed", itemResult, { partial: true, logId: command.logId });
    return { status: log.persisted ? "saved" : "duplicate", action: command.action, contentId, variantId: command.variantId, logId: command.logId, event: "operator_published", provenance: "operator_confirmed", externalVerified: false };
  }

  if (command.action === "handoff") {
    const log = await dependencies.insert("publish_logs", command.logRecord);
    let logWasInserted = log.persisted;
    let logExists = log.persisted;
    if (!log.persisted && log.reason === "duplicate") {
      logExists = Boolean(await exactRow(dependencies, "publish_logs", command.logId, command.workspaceId));
    }
    if (!logExists) return failure("log-persistence-failed", log, { logId: command.logId });

    const asset = command.assetRecord
      ? await dependencies.insert("content_assets", command.assetRecord)
      : { persisted: true, reason: "not-requested" };
    let assetExists = asset.persisted;
    if (command.assetRecord && !asset.persisted && asset.reason === "duplicate" && command.assetId) {
      assetExists = Boolean(await exactRow(dependencies, "content_assets", command.assetId, command.workspaceId));
    }
    if (!assetExists) {
      const rollback = logWasInserted
        ? await dependencies.remove("publish_logs", filters(command.logId, command.workspaceId))
        : { persisted: true, reason: "not-inserted-by-command" };
      return failure("asset-persistence-failed", asset, { logId: command.logId, assetId: command.assetId, rollback });
    }

    return {
      status: "logged",
      action: command.action,
      contentId: command.contentId,
      variantId: command.variantId,
      logId: command.logId,
      assetId: command.assetId,
      event: command.event,
      persistence: { log, asset },
    };
  }

  if (command.action !== "create_campaign") return { status: "invalid-input", error: "invalid-action" };
  const campaign = await dependencies.insert("campaigns", command.campaignRecord);
  if (!campaign.persisted && campaign.reason === "duplicate") {
    const existing = await exactRow(dependencies, "campaigns", command.campaignId, command.workspaceId);
    if (existing) {
      return {
        status: "duplicate",
        action: command.action,
        campaignId: command.campaignId,
        campaign: existing,
        persistence: { campaign },
      };
    }
  }
  if (!campaign.persisted) return failure("campaign-persistence-failed", campaign, { campaignId: command.campaignId });
  return {
    status: "saved",
    action: command.action,
    campaignId: command.campaignId,
    campaign: command.campaignRecord,
    persistence: { campaign },
  };
}
