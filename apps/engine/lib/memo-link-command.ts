type Input = Record<string, unknown>;
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function normalizeMemoLinkCommand(input: Input, workspaceId: unknown) {
  if (!uuid(workspaceId))
    return { ok: false as const, reason: "missing-workspace" };
  if (
    !["note", "work_order"].includes(String(input.sourceKind)) ||
    !uuid(input.sourceId)
  )
    return { ok: false as const, reason: "invalid-source" };
  if (!["create", "link"].includes(String(input.action)))
    return { ok: false as const, reason: "invalid-action" };
  if (input.action === "link" && !uuid(input.taskId))
    return { ok: false as const, reason: "invalid-task" };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (
    input.action === "create" &&
    (!title || title.length > 300 || !uuid(input.projectId))
  )
    return { ok: false as const, reason: "invalid-task-fields" };
  const due = input.dueAt ? new Date(String(input.dueAt)) : null;
  if (due && Number.isNaN(due.getTime()))
    return { ok: false as const, reason: "invalid-due-at" };
  return {
    ok: true as const,
    params: {
      p_workspace_id: workspaceId,
      p_source_kind: input.sourceKind,
      p_source_id: input.sourceId,
      p_action: input.action,
      p_task_id: input.action === "link" ? input.taskId : null,
      p_title: title,
      p_project_id: input.action === "create" ? input.projectId : null,
      p_due_at: due?.toISOString() || null,
    },
  };
}
export async function executeMemoLinkCommand(
  input: Input,
  workspaceId: unknown,
  rpc: (
    name: string,
    params: Input,
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>,
) {
  const normalized = normalizeMemoLinkCommand(input, workspaceId);
  if (!normalized.ok)
    return { status: "invalid-input", error: normalized.reason };
  const result = await rpc("link_memo_task_v1", normalized.params);
  if (!result.ok)
    return {
      status: result.error === "missing-config" ? "preview" : "error",
      error: "memo-link-not-saved",
      retryable: true,
    };
  const data = result.data as Input;
  if (
    !data ||
    !["saved", "duplicate", "invalid-input"].includes(String(data.status))
  )
    return {
      status: "error",
      error: "invalid-memo-link-response",
      retryable: true,
    };
  return data;
}
