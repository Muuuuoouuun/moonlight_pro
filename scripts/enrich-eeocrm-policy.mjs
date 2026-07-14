export function assertEnrichmentApplyPolicy({ apply = false, evidencePath = null } = {}) {
  if (apply && !evidencePath) {
    throw new Error("--evidence is required with --apply to preserve public enrichment signals");
  }
}
