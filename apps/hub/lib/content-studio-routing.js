export function shouldRestoreActiveStudioDraft({ itemParam, newParam } = {}) {
  return !itemParam && newParam !== "draft";
}
