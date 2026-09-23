// Sidebar preferences are local presentation state. Keep IDs from other scopes:
// filtering by brand must never rewrite the saved order of hidden projects.
const MAX_PROJECT_ORDER_IDS = 10000;

export const PROJECT_INDEX_SORT_OPTIONS = [
  { value: 'manual', label: '직접 정렬' },
  { value: 'name-asc', label: '이름 오름차순' },
  { value: 'name-desc', label: '이름 내림차순' },
  { value: 'due-asc', label: '기한 빠른 순' },
  { value: 'due-desc', label: '기한 늦은 순' },
  { value: 'progress-asc', label: '진척 낮은 순' },
  { value: 'progress-desc', label: '진척 높은 순' },
  { value: 'updated-desc', label: '최근 수정 순' },
];

const sortValues = new Set(PROJECT_INDEX_SORT_OPTIONS.map(({ value }) => value));
const nameCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const normalizeId = (value) => typeof value === 'string' ? value.trim() : '';

function uniqueIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const candidate of value) {
    const id = normalizeId(candidate);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_PROJECT_ORDER_IDS) break;
  }
  return ids;
}

export function normalizeProjectIndexPreferences(value) {
  const preferences = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    order: uniqueIds(preferences.order),
    sort: sortValues.has(preferences.sort) ? preferences.sort : 'manual',
  };
}

function dateValue(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function progressValue(project) {
  const progress = project?.displayProgress;
  return progress && !progress.partial && Number.isFinite(progress.value) ? progress.value : null;
}

// Unknown values stay last regardless of direction. In particular 0% is a
// measured value, while a partial aggregate must not masquerade as measured 0%.
function compareMeasured(a, b, descending = false) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

export function sortProjectIndex(projects, preferences) {
  const rows = Array.isArray(projects) ? projects : [];
  const { order, sort } = normalizeProjectIndexPreferences(preferences);
  const rank = new Map(order.map((id, index) => [id, index]));
  const compareRank = (a, b) => {
    const aRank = rank.get(normalizeId(a.project?.id)) ?? Infinity;
    const bRank = rank.get(normalizeId(b.project?.id)) ?? Infinity;
    return (aRank === bRank ? 0 : aRank < bRank ? -1 : 1) || a.index - b.index;
  };
  return rows.map((project, index) => ({ project, index })).sort((a, b) => {
    let difference = 0;
    if (sort === 'name-asc' || sort === 'name-desc') {
      difference = nameCollator.compare(String(a.project?.name ?? ''), String(b.project?.name ?? ''));
      if (sort === 'name-desc') difference *= -1;
    } else if (sort === 'due-asc' || sort === 'due-desc') {
      difference = compareMeasured(dateValue(a.project?.dueAt), dateValue(b.project?.dueAt), sort === 'due-desc');
    } else if (sort === 'progress-asc' || sort === 'progress-desc') {
      difference = compareMeasured(progressValue(a.project), progressValue(b.project), sort === 'progress-desc');
    } else if (sort === 'updated-desc') {
      difference = compareMeasured(dateValue(a.project?.updatedAt), dateValue(b.project?.updatedAt), true);
    }
    return difference || compareRank(a, b);
  }).map(({ project }) => project);
}

/**
 * Reorder only the visible slots, using the current rendered order as the
 * starting point. `end` needs no target; other placements need a visible target.
 * A valid move also appends visible IDs not yet present in persisted preferences.
 * Valid moves always persist the visible snapshot, even when already adjacent,
 * so switching an automatically sorted list to manual keeps its rendered order.
 * Invalid/self moves return the normalized original order.
 */
export function moveProjectIndex(order, visibleIds, sourceId, targetId, placement = 'before') {
  const saved = uniqueIds(order);
  const visible = uniqueIds(visibleIds);
  const source = normalizeId(sourceId);
  const target = normalizeId(targetId);
  if (!['before', 'after', 'end'].includes(placement) || !visible.includes(source)) return saved;
  if (placement !== 'end' && (!visible.includes(target) || source === target)) return saved;

  const moved = visible.filter((id) => id !== source);
  if (placement === 'end') moved.push(source);
  else moved.splice(moved.indexOf(target) + (placement === 'after' ? 1 : 0), 0, source);

  const savedSet = new Set(saved);
  const completeOrder = [...saved, ...visible.filter((id) => !savedSet.has(id))];
  const visibleSet = new Set(visible);
  let index = 0;
  return completeOrder.map((id) => visibleSet.has(id) ? moved[index++] : id);
}
