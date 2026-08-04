export function calendarDateKey(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mapTasksToCalendar(tasks, days) {
  const dayIndex = new Map(days.map((day, index) => [calendarDateKey(day), index]));

  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task && !task.done && task.status !== "done" && task.dueAt)
    .map((task) => {
      const day = dayIndex.get(calendarDateKey(task.dueAt));
      if (day == null) return null;
      return {
        id: task.id,
        day,
        title: task.title || "제목 없는 할 일",
        priority: task.priorityRaw || task.priority || "medium",
        projectId: task.project || "",
        dueAt: task.dueAt,
      };
    })
    .filter(Boolean);
}
