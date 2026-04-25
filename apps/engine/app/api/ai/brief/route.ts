import { NextResponse } from "next/server";

import { generateGeminiText, getGeminiIntegrationStatus } from "../../../../lib/gemini";
import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "../../../../lib/integration-state";
import { validateSharedWebhookRequest } from "../../../../lib/shared-webhook";
import { fetchSupabaseRows, insertSupabaseRecord } from "../../../../lib/supabase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseFilter = [string, string];

function eqFilter(value: string) {
  return `eq.${value}`;
}

async function readJson(req: Request) {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

async function buildWorkspaceContext(projectId?: string | null) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return {
      workspaceId,
      projects: [],
      tasks: [],
      updates: [],
      decisions: [],
    };
  }

  const projectFilters: SupabaseFilter[] = [["workspace_id", eqFilter(workspaceId)]];
  const childFilters: SupabaseFilter[] = projectId
    ? [
        ["workspace_id", eqFilter(workspaceId)],
        ["project_id", eqFilter(projectId)],
      ]
    : [["workspace_id", eqFilter(workspaceId)]];
  const [projects, tasks, updates, decisions] = await Promise.all([
    fetchSupabaseRows("projects", {
      select: "id,name,status,priority,next_action,due_at",
      filters: projectId ? [...projectFilters, ["id", eqFilter(projectId)] as SupabaseFilter] : projectFilters,
      order: "created_at.desc",
      limit: projectId ? 1 : 8,
    }),
    fetchSupabaseRows("tasks", {
      select: "id,project_id,title,status,next_action,due_at",
      filters: childFilters,
      order: "created_at.desc",
      limit: 12,
    }),
    fetchSupabaseRows("project_updates", {
      select: "id,project_id,source,event_type,status,title,summary,next_action,happened_at",
      filters: childFilters,
      order: "happened_at.desc",
      limit: 12,
    }),
    fetchSupabaseRows("decisions", {
      select: "id,project_id,title,summary,decided_at",
      filters: childFilters,
      order: "decided_at.desc",
      limit: 8,
    }),
  ]);

  return {
    workspaceId,
    projects: projects || [],
    tasks: tasks || [],
    updates: updates || [],
    decisions: decisions || [],
  };
}

function buildPrompt(context: Awaited<ReturnType<typeof buildWorkspaceContext>>, prompt?: string) {
  return [
    prompt ||
      "Write a concise operator brief for the current project/workspace state. Include risks, next actions, and what changed recently.",
    "",
    "Return Korean output in this shape:",
    "1. 지금 볼 것",
    "2. 막힌 것",
    "3. 다음 액션",
    "",
    "Workspace ledger snapshot:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

export async function GET() {
  return NextResponse.json({
    service: "com-moon-engine",
    integration: "gemini",
    status: getGeminiIntegrationStatus(),
  });
}

export async function POST(req: Request) {
  const auth = validateSharedWebhookRequest(req);

  if (!auth.ok) {
    return NextResponse.json(
      {
        status: "unauthorized",
        error: auth.error,
      },
      { status: 401 },
    );
  }

  let payload: any = {};

  try {
    payload = await readJson(req);
  } catch {
    return NextResponse.json(
      {
        status: "invalid-json",
        error: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  const context = await buildWorkspaceContext(projectId || null);
  const startedAt = new Date().toISOString();
  const result = await generateGeminiText({
    systemInstruction:
      "You are Com_Moon's backend operations analyst. Be terse, concrete, and action-oriented.",
    prompt: buildPrompt(context, typeof payload.prompt === "string" ? payload.prompt : undefined),
    maxOutputTokens: typeof payload.maxOutputTokens === "number" ? payload.maxOutputTokens : 768,
  });
  const finishedAt = new Date().toISOString();
  const connection = await upsertIntegrationConnection({
    provider: "gemini",
    status: result.ok ? "connected" : "error",
    config: {
      ...getGeminiIntegrationStatus(),
      lastResult: {
        ok: result.ok,
        status: result.status,
        reason: result.reason,
      },
    },
    lastSyncedAt: result.ok ? finishedAt : null,
  });
  const syncRun = await insertIntegrationSyncRun({
    provider: "gemini",
    connectionId: connection.connection?.id || null,
    status: result.ok ? "success" : "failure",
    payload: {
      startedAt,
      finishedAt,
      projectId: projectId || null,
      model: result.model,
      usageMetadata: result.ok ? result.usageMetadata : null,
    },
    errorMessage: result.ok ? null : result.reason,
  });
  let projectUpdate = null;

  if (result.ok && context.workspaceId) {
    projectUpdate = await insertSupabaseRecord("project_updates", {
      workspace_id: context.workspaceId,
      project_id: projectId || null,
      source: "gemini",
      event_type: "ai.brief",
      status: "reported",
      title: projectId ? "AI project brief" : "AI workspace brief",
      summary: result.text.slice(0, 500),
      progress: null,
      milestone: null,
      next_action: "Review the AI brief and convert the top recommendation into a concrete task.",
      payload: {
        model: result.model,
        text: result.text,
      },
      happened_at: finishedAt,
    });
  }

  return NextResponse.json(
    {
      status: result.ok ? "generated" : "error",
      model: result.model,
      text: result.text,
      reason: result.reason,
      persistence: {
        connection,
        syncRun,
        projectUpdate,
      },
    },
    { status: result.ok ? 200 : 502 },
  );
}
