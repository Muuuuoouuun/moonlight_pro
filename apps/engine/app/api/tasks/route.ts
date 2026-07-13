import { randomUUID } from "crypto";

// Explicit extensions keep these handlers directly executable by Node's type-stripping tests.
// @ts-expect-error TypeScript does not enable allowImportingTsExtensions in this workspace.
import { executeCreateTaskCommand, sanitizeTaskWriteInput } from "../../../lib/commands/task-command.ts";
// @ts-expect-error TypeScript does not enable allowImportingTsExtensions in this workspace.
import { validateSharedWebhookRequest } from "../../../lib/shared-webhook.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExecuteCreate = typeof executeCreateTaskCommand;

function correlationId(req: Request) {
  return req.headers.get("x-correlation-id")?.trim() || randomUUID();
}

function json(body: unknown, status: number, correlation: string) {
  return Response.json(body, {
    status,
    headers: { "x-correlation-id": correlation },
  });
}

export async function handleCreateTaskRequest(
  req: Request,
  dependencies: { execute?: ExecuteCreate } = {},
) {
  const correlation = correlationId(req);
  const auth = validateSharedWebhookRequest(req);

  if (!auth.ok) {
    return json(
      {
        status: "failed",
        reason: "unauthorized",
        error: auth.error,
        retryable: false,
        correlationId: correlation,
      },
      401,
      correlation,
    );
  }

  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return json(
      {
        status: "degraded",
        reason: "missing-workspace",
        retryable: false,
        correlationId: correlation,
      },
      503,
      correlation,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(
      {
        status: "failed",
        reason: "invalid-json",
        retryable: false,
        correlationId: correlation,
      },
      400,
      correlation,
    );
  }

  const result = await (dependencies.execute ?? executeCreateTaskCommand)({
    workspaceId,
    idempotencyKey: req.headers.get("idempotency-key")?.trim() || "",
    correlationId: correlation,
    input: sanitizeTaskWriteInput(body),
  });

  return json(result.body, result.httpStatus, correlation);
}

export async function POST(req: Request) {
  return handleCreateTaskRequest(req);
}
