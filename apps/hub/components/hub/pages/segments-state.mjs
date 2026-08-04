export function toggleExpandedSegment(expanded, label) {
  const next = new Set(expanded);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  return next;
}

export function clearExpandedSegments() {
  return new Set();
}

const STAGE_PRIORITY = new Map([
  ["Qualified", 0],
  ["Customer", 1],
  ["Contact", 2],
  ["New", 3],
  ["Lost", 4],
  ["(미지정)", 5],
]);

export function sortSegmentsByPriority(segments, dimension) {
  return [...segments].sort((a, b) => {
    if (dimension === "stage") {
      const aPriority = STAGE_PRIORITY.get(a.label) ?? 4;
      const bPriority = STAGE_PRIORITY.get(b.label) ?? 4;
      if (aPriority !== bPriority) return aPriority - bPriority;
    }

    return b.count - a.count || a.label.localeCompare(b.label);
  });
}
