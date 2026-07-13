// Node's type-stripping test runtime requires the explicit extension.
// @ts-expect-error TypeScript does not enable allowImportingTsExtensions in this workspace.
import { callSupabaseRpc, SupabaseRpcError, type SupabaseRpcFailureReason } from "../supabase-rest.ts";

type JsonRecord = Record<string, unknown>;
type RpcCaller = typeof callSupabaseRpc;

type CommandResult = {
  httpStatus: number;
  body: JsonRecord;
};

type BaseCommand = {
  workspaceId: unknown;
  idempotencyKey: unknown;
  correlationId?: string;
  input: unknown;
  callRpc?: RpcCaller;
};

type UpdateCommand = BaseCommand & {
  taskId: unknown;
  expectedUpdatedAt: unknown;
};

const TASK_STATUSES = new Set(["inbox", "todo", "doing", "blocked", "done"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const DUE_PRECISIONS = new Set(["timed", "date", "none"]);
const ENTITY_TYPES = new Set(["lead", "deal", "contact", "company"]);
const UNTRUSTED_CONTEXT_FIELDS = new Set([
  "workspaceId",
  "workspace_id",
  "ownerId",
  "owner_id",
  "actorId",
  "actor_id",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class CommandValidationError extends Error {}

export function sanitizeTaskWriteInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !UNTRUSTED_CONTEXT_FIELDS.has(key)),
  );
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommandValidationError(`${label} must be an object.`);
  }

  return value as JsonRecord;
}

function requiredString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new CommandValidationError(`${label} is required.`);
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new CommandValidationError(`${label} must be between 1 and ${maxLength} characters.`);
  }

  return normalized;
}

function optionalString(value: unknown, label: string, maxLength: number) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return requiredString(value, label, maxLength);
}

function uuid(value: unknown, label: string) {
  const normalized = requiredString(value, label, 64);
  if (!UUID_PATTERN.test(normalized)) {
    throw new CommandValidationError(`${label} must be a UUID.`);
  }

  return normalized;
}

function enumValue(value: unknown, label: string, allowed: Set<string>) {
  const normalized = requiredString(value, label, 32);
  if (!allowed.has(normalized)) {
    throw new CommandValidationError(`${label} is invalid.`);
  }

  return normalized;
}

function isoTimestamp(value: unknown, label: string) {
  const normalized = requiredString(value, label, 64);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new CommandValidationError(`${label} must be a valid timestamp.`);
  }

  return normalized;
}

function entityRef(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const record = asRecord(value, "entityRef");
  return {
    type: enumValue(record.type, "entityRef.type", ENTITY_TYPES),
    id: uuid(record.id, "entityRef.id"),
  };
}

function normalizeBase(command: BaseCommand) {
  return {
    workspaceId: uuid(command.workspaceId, "workspaceId"),
    idempotencyKey: requiredString(command.idempotencyKey, "idempotencyKey", 200),
    correlationId: command.correlationId?.trim() || crypto.randomUUID(),
    input: asRecord(command.input, "input"),
  };
}

function normalizeDue(input: JsonRecord, partial: boolean) {
  const hasDueAt = Object.prototype.hasOwnProperty.call(input, "dueAt");
  const hasDuePrecision = Object.prototype.hasOwnProperty.call(input, "duePrecision");
  const output: JsonRecord = {};
  let dueAt: string | null | undefined;

  if (hasDueAt) {
    if (input.dueAt === null || input.dueAt === "") {
      dueAt = null;
    } else {
      dueAt = isoTimestamp(input.dueAt, "dueAt");
    }
    output.dueAt = dueAt;
  }

  let duePrecision: string | undefined;
  if (hasDuePrecision) {
    duePrecision = enumValue(input.duePrecision, "duePrecision", DUE_PRECISIONS);
    output.duePrecision = duePrecision;
  } else if (!partial) {
    duePrecision = dueAt ? "timed" : "none";
    output.duePrecision = duePrecision;
  }

  if (!partial || hasDueAt) {
    const effectivePrecision = duePrecision ?? (dueAt ? "timed" : "none");
    if ((effectivePrecision === "none") !== (dueAt == null)) {
      throw new CommandValidationError("dueAt and duePrecision do not agree.");
    }
  } else if (hasDuePrecision && duePrecision !== "none" && !hasDueAt) {
    // An update may change precision for an existing due date. The RPC validates the row-level pair.
  }

  return output;
}

function normalizeTaskCreateInput(value: unknown) {
  const input = asRecord(value, "input");
  const output: JsonRecord = {
    title: requiredString(input.title, "title", 4000),
    status:
      input.status === undefined
        ? "inbox"
        : enumValue(input.status, "status", TASK_STATUSES),
    priority:
      input.priority === undefined
        ? "medium"
        : enumValue(input.priority, "priority", TASK_PRIORITIES),
    ...normalizeDue(input, false),
  };

  if (Object.prototype.hasOwnProperty.call(input, "projectId")) {
    output.projectId = input.projectId === null ? null : uuid(input.projectId, "projectId");
  }

  if (Object.prototype.hasOwnProperty.call(input, "entityRef")) {
    output.entityRef = entityRef(input.entityRef);
  }

  if (Object.prototype.hasOwnProperty.call(input, "nextAction")) {
    output.nextAction = optionalString(input.nextAction, "nextAction", 4000);
  }

  return output;
}

function normalizeTaskPatch(value: unknown) {
  const input = asRecord(value, "input");
  const output: JsonRecord = {};

  if (Object.prototype.hasOwnProperty.call(input, "title")) {
    output.title = requiredString(input.title, "title", 4000);
  }
  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    output.status = enumValue(input.status, "status", TASK_STATUSES);
  }
  if (Object.prototype.hasOwnProperty.call(input, "priority")) {
    output.priority = enumValue(input.priority, "priority", TASK_PRIORITIES);
  }
  Object.assign(output, normalizeDue(input, true));
  if (Object.prototype.hasOwnProperty.call(input, "projectId")) {
    output.projectId = input.projectId === null ? null : uuid(input.projectId, "projectId");
  }
  if (Object.prototype.hasOwnProperty.call(input, "entityRef")) {
    output.entityRef = entityRef(input.entityRef);
  }
  if (Object.prototype.hasOwnProperty.call(input, "nextAction")) {
    output.nextAction = optionalString(input.nextAction, "nextAction", 4000);
  }

  if (!Object.keys(output).length) {
    throw new CommandValidationError("input must contain at least one supported task field.");
  }

  return output;
}

function mappedRpcBody(
  value: unknown,
  successStatus: number,
  correlationId: string,
): CommandResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupabaseRpcError("upstream", "Supabase RPC returned an invalid result.", {
      metadata: value,
    });
  }

  const result = value as JsonRecord;
  const { result: outcome, ...durableResult } = result;

  if (outcome === "saved") {
    return {
      httpStatus: successStatus,
      body: { status: "saved", ...durableResult, retryable: false, correlationId },
    };
  }

  if (outcome === "duplicate") {
    return {
      httpStatus: 200,
      body: { status: "duplicate", ...durableResult, retryable: false, correlationId },
    };
  }

  if (outcome === "conflict") {
    return {
      httpStatus: 409,
      body: { status: "conflict", ...durableResult, retryable: false, correlationId },
    };
  }

  throw new SupabaseRpcError("upstream", "Supabase RPC returned an unknown result.", {
    metadata: result,
  });
}

function mappedError(error: unknown, correlationId?: string): CommandResult {
  if (error instanceof CommandValidationError) {
    return {
      httpStatus: 400,
      body: {
        status: "failed",
        reason: "invalid",
        error: error.message,
        retryable: false,
        correlationId: correlationId || crypto.randomUUID(),
      },
    };
  }

  const rpcError =
    error instanceof SupabaseRpcError
      ? error
      : new SupabaseRpcError("upstream", "Task command failed.", { cause: error });
  const mapping: Record<
    SupabaseRpcFailureReason,
    { httpStatus: number; status: string; retryable: boolean }
  > = {
    "missing-config": { httpStatus: 503, status: "degraded", retryable: false },
    timeout: { httpStatus: 504, status: "failed", retryable: true },
    "not-found": { httpStatus: 404, status: "failed", retryable: false },
    invalid: { httpStatus: 400, status: "failed", retryable: false },
    "invalid-transition": { httpStatus: 409, status: "conflict", retryable: false },
    upstream: { httpStatus: 502, status: "failed", retryable: true },
  };
  const mapped = mapping[rpcError.reason];

  return {
    httpStatus: mapped.httpStatus,
    body: {
      status: mapped.status,
      reason: rpcError.reason,
      error: rpcError.message,
      retryable: mapped.retryable,
      correlationId: correlationId || crypto.randomUUID(),
      metadata: rpcError.metadata,
    },
  };
}

export async function executeCreateTaskCommand(command: BaseCommand): Promise<CommandResult> {
  let correlationId = command.correlationId?.trim() || undefined;

  try {
    const base = normalizeBase(command);
    correlationId = base.correlationId;
    const payload = normalizeTaskCreateInput(base.input);
    const result = await (command.callRpc ?? callSupabaseRpc)<JsonRecord>("create_task_v1", {
      p_workspace_id: base.workspaceId,
      p_idempotency_key: base.idempotencyKey,
      p_payload: payload,
    });
    return mappedRpcBody(result, 201, correlationId);
  } catch (error) {
    return mappedError(error, correlationId);
  }
}

export async function executeUpdateTaskCommand(command: UpdateCommand): Promise<CommandResult> {
  let correlationId = command.correlationId?.trim() || undefined;

  try {
    const base = normalizeBase(command);
    correlationId = base.correlationId;
    const taskId = uuid(command.taskId, "taskId");
    const expectedUpdatedAt = isoTimestamp(command.expectedUpdatedAt, "expectedUpdatedAt");
    const payload = normalizeTaskPatch(base.input);
    const result = await (command.callRpc ?? callSupabaseRpc)<JsonRecord>("update_task_v1", {
      p_workspace_id: base.workspaceId,
      p_task_id: taskId,
      p_idempotency_key: base.idempotencyKey,
      p_expected_updated_at: expectedUpdatedAt,
      p_payload: payload,
    });
    return mappedRpcBody(result, 200, correlationId);
  } catch (error) {
    return mappedError(error, correlationId);
  }
}

export async function executeQuickCaptureCommand(command: BaseCommand): Promise<CommandResult> {
  let correlationId = command.correlationId?.trim() || undefined;

  try {
    const base = normalizeBase(command);
    correlationId = base.correlationId;
    const destination = enumValue(
      base.input.destination,
      "destination",
      new Set(["task", "inbox"]),
    );

    if (destination === "task") {
      const titleSource = base.input.title ?? base.input.raw;
      const taskInput: JsonRecord = {
        title: requiredString(titleSource, "title or raw", 4000),
        status: "inbox",
        priority:
          base.input.priority === undefined
            ? "medium"
            : enumValue(base.input.priority, "priority", TASK_PRIORITIES),
        duePrecision: base.input.dueAt === undefined ? "none" : base.input.duePrecision ?? "timed",
      };

      for (const field of ["dueAt", "projectId", "entityRef", "nextAction"] as const) {
        if (Object.prototype.hasOwnProperty.call(base.input, field)) {
          taskInput[field] = base.input[field];
        }
      }

      return await executeCreateTaskCommand({
        workspaceId: base.workspaceId,
        idempotencyKey: base.idempotencyKey,
        correlationId,
        input: taskInput,
        callRpc: command.callRpc,
      });
    }

    const payload: JsonRecord = {
      raw: requiredString(base.input.raw, "raw", 4000),
    };
    for (const field of ["kind", "persona", "summary", "channel"] as const) {
      if (Object.prototype.hasOwnProperty.call(base.input, field)) {
        payload[field] = optionalString(base.input[field], field, field === "summary" ? 4000 : 100);
      }
    }
    if (Object.prototype.hasOwnProperty.call(base.input, "entityRef")) {
      payload.entityRef = entityRef(base.input.entityRef);
    }

    const result = await (command.callRpc ?? callSupabaseRpc)<JsonRecord>(
      "capture_quick_input_v1",
      {
        p_workspace_id: base.workspaceId,
        p_idempotency_key: base.idempotencyKey,
        p_payload: payload,
      },
    );
    return mappedRpcBody(result, 201, correlationId);
  } catch (error) {
    return mappedError(error, correlationId);
  }
}
