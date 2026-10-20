// Task completion is a prompt to review the result, never project completion.
export function canReviewProjectCompletion({ project, tasks = [], sourceState, taskPartial = false, failedSources = [] }) {
  return Boolean(project && ['live', 'partial'].includes(sourceState)
    && !['completed', 'archived'].includes(project.statusKey)
    && !taskPartial && !project.displayProgress?.partial
    && !failedSources.some(source => source === 'tasks' || source === 'projects')
    && tasks.length > 0 && tasks.every(task => task.done === true));
}

// This is a navigation hint, not a persisted relationship. Only whitespace is
// normalized; fuzzy/case-insensitive matching could attach a different task.
const titleKey = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

export function resolveProjectNextAction(project, tasks = [], fallbackTask = null) {
  const recorded = [project?.displayNextAction, project?.projectNextAction].find(value => titleKey(value));
  if (!recorded && fallbackTask) {
    return { title: fallbackTask.title, kind: 'task', taskId: fallbackTask.id };
  }
  const title = typeof recorded === 'string' ? recorded.trim() : '';
  if (!title) return { title: '', kind: 'new', taskId: null };
  const matches = tasks.filter(task => titleKey(task.title) === titleKey(title));
  if (matches.length > 1) return { title, kind: 'ambiguous', taskId: null };
  if (matches.length === 1) {
    return { title, kind: matches[0].done ? 'done-task' : 'task', taskId: matches[0].id };
  }
  return { title, kind: 'new', taskId: null };
}
