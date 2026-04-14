import { timingSafeEqual } from "crypto";

import type { ProjectWebhookPayload } from "./project-webhook";

export const SHARED_WEBHOOK_SECRET_HEADER = "x-com-moon-shared-secret";
export const SHARED_PROJECT_WEBHOOK_PROVIDERS = ["openclaw", "moltbot"] as const;

export type SharedProjectWebhookProvider = (typeof SHARED_PROJECT_WEBHOOK_PROVIDERS)[number];

type JsonRecord = Record<string, unknown>;
type AuthResult = {
  ok: boolean;
  mode: "header" | "bearer";
  error?: string;
};
type SharedWebhookAuthDetails = {
  required: true;
  configured: boolean;
  header: string;
  bearer: string;
  accepted: Array<"header" | "bearer">;
  note: string;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function pickString(records: Array<JsonRecord | null>, keys: string[]) {
  for (const record of records) {
    if (!record) {
      continue;
    }

    for (const key of keys) {
      const value = asString(record[key]);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function pickNumber(records: Array<JsonRecord | null>, keys: string[]) {
  for (const record of records) {
    if (!record) {
      continue;
    }

    for (const key of keys) {
      const value = asNumber(record[key]);
      if (value != null) {
        return value;
      }
    }
  }

  return null;
}

function nullToUndefined<T>(value: T | null) {
  return value == null ? undefined : value;
}

function resolveBearerToken(req: Request) {
  const header = req.headers.get("authorization")?.trim() || "";

  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return header.slice(7).trim() || null;
}

export function normalizeSharedWebhookProvider(
  value: string | null | undefined,
): SharedProjectWebhookProvider | null {
  const normalized = value?.trim().toLowerCase().replace(/[\s_]+/g, "") || "";

  if (normalized === "openclaw") {
    return "openclaw";
  }

  if (normalized === "moltbot" || normalized === "molt-bot") {
    return "moltbot";
  }

  return null;
}

export function listSharedProjectWebhookRoutes() {
  return SHARED_PROJECT_WEBHOOK_PROVIDERS.map((provider) => `/api/webhook/project/${provider}`);
}

export function getSharedWebhookAuthDetails(): SharedWebhookAuthDetails {
  const configured = Boolean(process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim());

  return {
    required: true,
    configured,
    header: SHARED_WEBHOOK_SECRET_HEADER,
    bearer: "Authorization: Bearer <secret>",
    accepted: ["header", "bearer"],
    note: configured
      ? "Provide either the shared secret header or a bearer token matching COM_MOON_SHARED_WEBHOOK_SECRET."
      : "COM_MOON_SHARED_WEBHOOK_SECRET must be set; requests without it are rejected.",
  };
}

export function validateSharedWebhookRequest(req: Request): AuthResult {
  const expectedSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim();

  if (!expectedSecret) {
    return {
      ok: false,
      mode: "header",
      error: "Shared webhook secret is not configured.",
    };
  }

  const headerSecret = req.headers.get(SHARED_WEBHOOK_SECRET_HEADER)?.trim() || null;
  const bearerSecret = resolveBearerToken(req);
  const candidate = headerSecret || bearerSecret;

  if (!candidate) {
    return {
      ok: false,
      mode: "header",
      error: `Missing ${SHARED_WEBHOOK_SECRET_HEADER} header or Authorization bearer token.`,
    };
  }

  const expectedBuffer = Buffer.from(expectedSecret);
  const candidateBuffer = Buffer.from(candidate);

  if (
    expectedBuffer.length !== candidateBuffer.length ||
    !timingSafeEqual(expectedBuffer, candidateBuffer)
  ) {
    return {
      ok: false,
      mode: headerSecret ? "header" : "bearer",
      error: "Shared webhook secret did not match.",
    };
  }

  return {
    ok: true,
    mode: headerSecret ? "header" : "bearer",
  };
}

export function buildSharedProjectWebhookPayload(
  input: unknown,
  providerHint: SharedProjectWebhookProvider,
): ProjectWebhookPayload {
  const root = asRecord(input);
  const meta = asRecord(root?.meta) || asRecord(root?.metadata);
  const project = asRecord(root?.project);
  const event = asRecord(root?.event);
  const check = asRecord(root?.check);
  const payload = asRecord(root?.payload);
  const provider =
    normalizeSharedWebhookProvider(
      pickString([meta, root, payload], ["provider", "providerName", "agent", "agentName"]),
    ) || providerHint;
  const rawPayload = root || { value: input };
  const records = [root, meta, project, event, check, payload];

  return {
    workspaceId: nullToUndefined(pickString(records, ["workspaceId", "workspace_id"])),
    projectId: nullToUndefined(pickString([project, root, meta], ["projectId", "project_id", "id"])),
    title:
      pickString(records, [
        "title",
        "name",
        "headline",
        "projectTitle",
        "project_title",
      ]) || `${provider} webhook update`,
    summary: nullToUndefined(pickString(records, ["summary", "message", "description", "detail", "body"])),
    status: nullToUndefined(pickString(records, ["status", "state"])),
    progress: nullToUndefined(pickNumber(records, ["progress", "percent", "percentage", "completion"])),
    milestone: nullToUndefined(pickString(records, ["milestone", "stage", "phase"])),
    nextAction: nullToUndefined(
      pickString(records, [
        "nextAction",
        "next_action",
        "followUp",
        "follow_up",
        "action",
        "todo",
      ]),
    ),
    eventType:
      pickString(records, ["eventType", "event_type", "type", "kind"]) ||
      `project.${provider}.update`,
    provider,
    source: pickString(records, ["source", "sourceName", "origin"]) || provider,
    checkType: nullToUndefined(pickString(records, ["checkType", "check_type", "cadence", "routine"])),
    note: nullToUndefined(pickString(records, ["note", "comment", "reason"])),
    payload: rawPayload,
  };
}
