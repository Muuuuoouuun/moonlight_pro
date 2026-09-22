import { fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";

export async function assembleOfficeContext({ agentId, mode, scope = "all" } = {}) {
  try {
    const filters = withWorkspaceFilter();

    // Relevant snapshots depending on role
    const [tasks, deals, projects, updates] = await Promise.all([
      fetchSupabaseRows("tasks", {
        filters,
        order: "updated_at.desc",
        limit: 10,
      }).catch(() => null),
      fetchSupabaseRows("deals", {
        filters,
        order: "updated_at.desc",
        limit: 10,
      }).catch(() => null),
      fetchSupabaseRows("projects", {
        filters,
        order: "updated_at.desc",
        limit: 8,
      }).catch(() => null),
      fetchSupabaseRows("project_updates", {
        filters,
        order: "happened_at.desc",
        limit: 8,
      }).catch(() => null),
    ]);

    const hasData = Boolean(tasks || deals || projects || updates);

    return {
      source: hasData ? "supabase" : "preview",
      scope,
      agentId,
      mode,
      recentTasks: Array.isArray(tasks)
        ? tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority }))
        : [],
      recentDeals: Array.isArray(deals)
        ? deals.map((d) => ({ id: d.id, name: d.name, stage: d.stage, value: d.value }))
        : [],
      recentProjects: Array.isArray(projects)
        ? projects.map((p) => ({ id: p.id, name: p.name, status: p.status, priority: p.priority }))
        : [],
      recentUpdates: Array.isArray(updates)
        ? updates.map((u) => ({ id: u.id, title: u.title, summary: u.summary }))
        : [],
    };
  } catch {
    return {
      source: "preview",
      scope,
      agentId,
      mode,
    };
  }
}
