import { normalizePmsCommand } from "./pms-command.ts";

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
  fetchRows: (
    table: string,
    options?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>> | null>;
};

type CommandContext = {
  workspaceId?: string;
  ownerId?: string | null;
  now?: string;
};

export async function executePmsCommand(
  input: Record<string, unknown>,
  context: CommandContext,
  dependencies: Dependencies,
) {
  const command = normalizePmsCommand(input, context);
  if (!command.ok) {
    return { status: "invalid-input", error: command.reason };
  }

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
