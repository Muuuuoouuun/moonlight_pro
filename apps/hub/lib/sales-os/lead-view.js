function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tagValue(tags, prefix) {
  const hit = tags.find((tag) => String(tag).startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : "";
}

export function resolveLeadEnrichmentView(row = {}) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const enrichment = meta.enrichment && typeof meta.enrichment === "object" ? meta.enrichment : {};
  const tags = Array.isArray(enrichment.tags) ? enrichment.tags.map(String) : [];
  const ownedByJunhyuk = meta.owner_scope === "junhyuk" || tags.includes("owner:junhyuk");

  return {
    score: finiteNumber(row.score),
    valueAmount: finiteNumber(meta.value),
    owner: row.owner_id || ownedByJunhyuk ? "Me" : "Unassigned",
    priorityLane: enrichment.pipeline?.lane || null,
    nextAction: row.next_action || "",
    enrichmentTags: tags,
    region: meta.region || tagValue(tags, "region:"),
  };
}
