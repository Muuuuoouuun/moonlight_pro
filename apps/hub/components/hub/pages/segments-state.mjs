export function toggleExpandedSegment(expanded, label) {
  const next = new Set(expanded);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  return next;
}

export function clearExpandedSegments() {
  return new Set();
}
