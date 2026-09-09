import {
  fetchSupabaseRows,
  withWorkspaceFilter,
  eqFilter,
  inFilter,
} from "@/lib/server-read";
import {
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";
const LIMIT = 100;
export async function getMemoLedger({ taskId = null, noteId = null } = {}) {
  if (!resolveDefaultWorkspaceId() || !resolveSupabaseConfig())
    return {
      status: "preview",
      memos: [],
      links: [],
      tasks: [],
      projects: [],
      failedSources: [],
      partialSources: [],
    };
  const failedSources = [],
    partialSources = [];
  const read = async (table, options = {}) => {
    const rows = await fetchSupabaseRows(table, {
      limit: LIMIT + 1,
      order: "created_at.desc",
      ...options,
      filters: withWorkspaceFilter(options.filters || []),
    }).catch(() => null);
    if (!Array.isArray(rows)) {
      failedSources.push(table);
      return [];
    }
    if (rows.length > LIMIT) partialSources.push(table);
    return rows.slice(0, LIMIT);
  };
  const links = await read("task_memo_links", {
    filters: taskId ? [["task_id", eqFilter(taskId)]] : [],
  });
  const sourceFilter = (key) => [
    ["id", inFilter(links.map((l) => l[key]).filter(Boolean))],
  ];
  const [notes, captures, tasks, projects] = await Promise.all([
    taskId && !links.some((l) => l.note_id)
      ? []
      : read("notes", { filters: taskId ? sourceFilter("note_id") : [] }),
    taskId && !links.some((l) => l.work_order_id)
      ? []
      : read("work_orders", {
          filters: [
            ["source", eqFilter("inbox")],
            ["kind", inFilter(["capture", "note", "idea"])],
            ...(taskId ? sourceFilter("work_order_id") : []),
          ],
        }),
    read("tasks", {
      order: "updated_at.desc",
      filters: taskId ? [["id", eqFilter(taskId)]] : [],
    }),
    read("projects", { order: "updated_at.desc" }),
  ]);
  // Deep links must also reopen older notes outside the newest-page window.
  if (!taskId && noteId && !notes.some((note) => note.id === noteId)) {
    notes.push(
      ...(await read("notes", {
        filters: [["id", eqFilter(noteId)]],
        limit: 1,
      })),
    );
  }
  // Fetch reverse links for ALL loaded sources; global newest links are not proof of absence.
  const exactLinks = taskId
    ? links
    : (
        await Promise.all([
          notes.length
            ? read("task_memo_links", {
                filters: [["note_id", inFilter(notes.map((n) => n.id))]],
              })
            : [],
          captures.length
            ? read("task_memo_links", {
                filters: [
                  ["work_order_id", inFilter(captures.map((n) => n.id))],
                ],
              })
            : [],
        ])
      ).flat();
  const missingTaskIds = [...new Set(exactLinks.map((l) => l.task_id))].filter(
    (id) => !tasks.some((t) => t.id === id),
  );
  if (missingTaskIds.length)
    tasks.push(
      ...(await read("tasks", { filters: [["id", inFilter(missingTaskIds)]] })),
    );
  const allLinks = [...new Map(exactLinks.map((l) => [l.id, l])).values()];
  const memos = [
    ...notes.map((n) => ({
      id: n.id,
      kind: "note",
      title: n.title,
      body: n.body || "",
      projectId: n.project_id,
      createdAt: n.created_at,
      scope: n.meta?.memo_capture?.scope || null,
      labels: n.meta?.memo_capture?.labels || [],
      source: n.meta?.memo_capture?.source || null,
      originalBody: n.meta?.memo_capture?.originalBody ?? null,
    })),
    ...captures.map((n) => ({
      id: n.id,
      kind: "work_order",
      title: n.title,
      body: n.body?.raw || "",
      projectId: null,
      createdAt: n.created_at,
    })),
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    status: failedSources.length || partialSources.length ? "partial" : "live",
    memos,
    links: allLinks,
    tasks,
    projects,
    failedSources: [...new Set(failedSources)],
    partialSources: [...new Set(partialSources)],
    linksComplete:
      !failedSources.includes("task_memo_links") &&
      !partialSources.includes("task_memo_links"),
  };
}
