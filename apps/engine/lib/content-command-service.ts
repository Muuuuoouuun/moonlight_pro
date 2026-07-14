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

export async function executeContentCommand(
  input: Record<string, unknown>,
  context: CommandContext,
  dependencies: Dependencies,
) {
  const command = normalizeContentCommand(input, context);
  if (!command.ok) return { status: "invalid-input", error: command.reason };

  if (command.action === "create_draft") {
    const item = await dependencies.insert("content_items", command.itemRecord);
    let itemWasInserted = item.persisted;
    let itemExists = item.persisted;
    if (!item.persisted && item.reason === "duplicate") {
      itemExists = Boolean(await exactRow(dependencies, "content_items", command.contentId, command.workspaceId));
    }
    if (!itemExists) return failure("item-persistence-failed", item, { contentId: command.contentId, variantId: command.variantId });

    const variant = await dependencies.insert("content_variants", command.variantRecord);
    let variantExists = variant.persisted;
    if (!variant.persisted && variant.reason === "duplicate") {
      const existing = await exactRow(dependencies, "content_variants", command.variantId, command.workspaceId);
      variantExists = existing?.content_id === command.contentId;
    }

    if (!variantExists) {
      const rollback = itemWasInserted
        ? await dependencies.remove("content_items", filters(command.contentId, command.workspaceId))
        : { persisted: true, reason: "not-inserted-by-command" };
      return failure("variant-persistence-failed", variant, {
        contentId: command.contentId,
        variantId: command.variantId,
        rollback,
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
    const [item, variant] = await Promise.all([
      dependencies.update("content_items", filters(command.contentId, command.workspaceId), command.itemPatch),
      dependencies.update("content_variants", filters(command.variantId, command.workspaceId), command.variantPatch),
    ]);
    if (!item.persisted) return failure("item-update-failed", item, { contentId: command.contentId, variantId: command.variantId });
    if (!variant.persisted) return failure("variant-update-failed", variant, { contentId: command.contentId, variantId: command.variantId });
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
