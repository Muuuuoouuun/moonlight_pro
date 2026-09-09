export const memoKey = (memo) => `${memo.kind}:${memo.id}`;
export function linksForMemo(memo, links = []) {
  return links.filter((link) =>
    memo.kind === "note"
      ? link.note_id === memo.id
      : link.work_order_id === memo.id,
  );
}
export function selectMemos(
  data,
  { query = "", filter = "all", projectId = "", now = Date.now() } = {},
) {
  const needle = query.trim().toLowerCase();
  const tasks = new Map((data.tasks || []).map((task) => [task.id, task]));
  return (data.memos || []).filter((memo) => {
    const links = linksForMemo(memo, data.links);
    if (
      projectId &&
      memo.projectId !== projectId &&
      !links.some((link) => tasks.get(link.task_id)?.project_id === projectId)
    )
      return false;
    if (filter === "linked" && !links.length) return false;
    if (filter === "unlinked" && (links.length || !data.linksComplete))
      return false;
    if (
      filter === "older" &&
      !(new Date(memo.createdAt).getTime() <= now - 30 * 86400000)
    )
      return false;
    return `${memo.title} ${memo.body} ${(memo.labels || []).join(" ")} ${memo.source?.name || ""}`
      .toLowerCase()
      .includes(needle);
  });
}
export function memoLinkVerified(data, source, taskId) {
  return (
    linksForMemo(source, data.links).some((link) => link.task_id === taskId) &&
    data.tasks.some((task) => task.id === taskId)
  );
}
