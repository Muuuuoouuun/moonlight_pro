import { normalizePmsCommand } from "./pms-command.ts";

type PersistenceResult = {
  persisted: boolean;
  reason: string;
  detail?: string;
  rows?: Array<Record<string, unknown>>;
};

type RowReadResult =
  | { ok: true; rows: Array<Record<string, unknown>> }
  | { ok: false; reason: string; detail?: string };

type Dependencies = {
  insert: (table: string, record: Record<string, unknown>) => Promise<PersistenceResult>;
  update: (
    table: string,
    filters: Array<[string, string]>,
    patch: Record<string, unknown>,
  ) => Promise<PersistenceResult>;
  fetchRows: (
    table: string,
    options?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>> | null>;
  fetchRowsDetailed?: (
    table: string,
    options?: Record<string, unknown>,
  ) => Promise<RowReadResult>;
};

type CommandContext = {
  workspaceId?: string;
  ownerId?: string | null;
  now?: string;
};

function comparableTimestamp(value: unknown) {
  if (typeof value !== "string" || !value) return value ?? null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function canonicalCreatePayload(action: string, row: Record<string, unknown>) {
  const meta = row.meta && typeof row.meta === "object"
    ? row.meta as Record<string, unknown>
    : {};

  if (action === "create_project") {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      area_id: row.area_id ?? null,
      brand_id: row.brand_id ?? null,
      lead_id: row.lead_id ?? null,
      customer_account_id: row.customer_account_id ?? null,
      name: row.name,
      summary: row.summary ?? null,
      status: row.status,
      priority: row.priority,
      progress: row.progress ?? 0,
      next_action: row.next_action ?? null,
      due_at: comparableTimestamp(row.due_at),
      org_scope: meta.org_scope ?? null,
      origin_deal_id: meta.origin_deal_id ?? null,
      source: meta.source ?? null,
    };
  }

  if (action === "create_task") {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      project_id: row.project_id ?? null,
      deal_id: meta.deal_id ?? null,
      title: row.title,
      status: row.status,
      priority: row.priority,
      description: row.description ?? null,
      next_action: row.next_action ?? null,
      due_at: comparableTimestamp(row.due_at),
      source: meta.source ?? null,
    };
  }

  if (action === "create_brand") {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      category: meta.category ?? null,
      org_scope: meta.org_scope ?? null,
      source: meta.source ?? null,
      glyph: meta.glyph ?? null,
    };
  }

  return null;
}

function sameCanonicalCreatePayload(
  action: string,
  requested: Record<string, unknown>,
  existing: Record<string, unknown>,
) {
  const requestedPayload = canonicalCreatePayload(action, requested);
  const existingPayload = canonicalCreatePayload(action, existing);
  return requestedPayload !== null &&
    JSON.stringify(requestedPayload) === JSON.stringify(existingPayload);
}

function filterValue(filters: Array<[string, string]> | undefined, key: string) {
  const value = filters?.find(([filterKey]) => filterKey === key)?.[1];
  return value?.startsWith("eq.") ? value.slice(3) : null;
}

async function validateRelationship(
  command: Extract<ReturnType<typeof normalizePmsCommand>, { ok: true }>,
  dependencies: Dependencies,
) {
  const values = command.record || command.patch || {};
  const workspaceId = typeof command.record?.workspace_id === "string"
    ? command.record.workspace_id
    : filterValue(command.filters, "workspace_id");
  const relationships = command.table === "projects"
    ? [
        ["area_id", "areas", "invalid-reference"],
        ["brand_id", "brands", "invalid-brand-reference"],
        ["lead_id", "leads", "invalid-reference"],
        ["customer_account_id", "customer_accounts", "invalid-reference"],
      ].flatMap(([column, table, error]) => (
        typeof values[column] === "string"
          ? [{ table, id: values[column] as string, error }]
          : []
      ))
    : command.table === "tasks" && typeof values.project_id === "string"
      ? [{ table: "projects", id: values.project_id, error: "invalid-project-reference" }]
      : [];

  if (!relationships.length || !workspaceId) return null;

  for (const relationship of relationships) {
    const options = {
      select: "id",
      filters: [
        ["id", `eq.${relationship.id}`],
        ["workspace_id", `eq.${workspaceId}`],
      ] as Array<[string, string]>,
      limit: 1,
    };
    const detailed = dependencies.fetchRowsDetailed
      ? await dependencies.fetchRowsDetailed(relationship.table, options)
      : null;
    if (detailed && !detailed.ok) {
      if (detailed.reason === "missing-config") {
        return { status: "error", error: "missing-config" };
      }
      return {
        status: "error",
        error: "relationship-check-failed",
        detail: detailed.reason,
      };
    }
    const rows = detailed?.ok
      ? detailed.rows
      : await dependencies.fetchRows(relationship.table, options);
    if (rows === null) {
      return command.table === "projects"
        ? { status: "error", error: "reference-lookup-unavailable" }
        : { status: "error", error: "relationship-check-failed" };
    }
    if (!rows[0]) return { status: "invalid-input", error: relationship.error };
  }
  return null;
}

export async function executePmsCommand(
  input: Record<string, unknown>,
  context: CommandContext,
  dependencies: Dependencies,
) {
  const command = normalizePmsCommand(input, context);
  if (!command.ok) {
    return { status: "invalid-input", error: command.reason };
  }

  const relationshipError = await validateRelationship(command, dependencies);
  if (relationshipError) return relationshipError;

  if (command.record) {
    const persistence = await dependencies.insert(command.table, command.record);
    if (!persistence.persisted) {
      if (persistence.reason === "duplicate") {
        const existing = await dependencies.fetchRows(command.table, {
          filters: [
            ["id", `eq.${command.record.id}`],
            ["workspace_id", `eq.${command.record.workspace_id}`],
          ],
          limit: 1,
        });
        if (existing?.[0]) {
          if (!sameCanonicalCreatePayload(command.action, command.record, existing[0])) {
            return {
              status: "conflict",
              action: command.action,
              error: "id-reuse-payload-mismatch",
              retryable: false,
              entity: existing[0],
            };
          }
          return {
            status: "duplicate",
            action: command.action,
            entity: existing[0],
          };
        }
      }
      return {
        status: "error",
        error: persistence.reason,
        detail: persistence.detail || null,
      };
    }

    return {
      status: "saved",
      action: command.action,
      entity: command.record,
    };
  }

  if (command.filters && command.patch) {
    const persistence = await dependencies.update(command.table, command.filters, command.patch);
    if (!persistence.persisted) {
      return {
        status: "error",
        error: persistence.reason,
        detail: persistence.detail || null,
      };
    }

    if (Array.isArray(persistence.records)) {
      if (!persistence.records[0]) {
        if (filterValue(command.filters, "updated_at")) {
          const identityFilters = command.filters.filter(
            ([key]) => key === "id" || key === "workspace_id",
          );
          const current = await dependencies.fetchRows(command.table, {
            filters: identityFilters,
            limit: 1,
          });
          if (current === null) {
            return {
              status: "error",
              action: command.action,
              error: "current-entity-read-failed",
            };
          }
          if (!current[0]) {
            return {
              status: "error",
              action: command.action,
              error: "not-found",
            };
          }
          return {
            status: "conflict",
            action: command.action,
            error: "stale-update",
            retryable: false,
            entity: current[0],
          };
        }
        return {
          status: "error",
          action: command.action,
          error: "not-found",
        };
      }

      return {
        status: "saved",
        action: command.action,
        entity: persistence.records[0],
      };
    }

    return {
      status: "saved",
      action: command.action,
      entity: {
        id: input.id,
        ...command.patch,
      },
    };
  }

  return { status: "error", error: "unsupported-command-shape" };
}
