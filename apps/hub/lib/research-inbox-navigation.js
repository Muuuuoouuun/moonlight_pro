export function researchBriefReadHref(reference, brand = null) {
  const query = new URLSearchParams();
  if (reference !== null) query.set('brief', reference);
  if (brand && brand !== 'all') query.set('brand', brand);
  return '/api/hub/research/briefs' + (query.size ? '?' + query : '');
}

// Explicit references never fall back to a different source, including after filtering.
export function selectedResearchBrief(briefs, reference, selectedId) {
  const id = reference !== null ? reference : selectedId;
  return id !== null ? briefs.find(brief => brief.id === id) || null : briefs[0] || null;
}
