/** Read-only preflight. Never advertises an unimplemented executor as ready. */
export function getYouTubeUploadReadiness(connection) {
  const blockers = ["upload-executor-not-implemented", "durable-upload-idempotency-required", "media-staging-required", "content-approval-required"];
  if (!connection) blockers.push("channel-not-connected");
  else {
    if (!connection.brandKey) blockers.push("brand-mapping-required");
    if (!String(connection.scope || "").split(/\s+/).includes("https://www.googleapis.com/auth/youtube.upload")) blockers.push("upload-scope-required");
    if (connection.tokenStatus !== "connected") blockers.push(connection.tokenStatus || "token-status-unknown");
  }
  return { supported: true, enabled: false, status: "blocked", blockers, defaultVisibility: "private",
    projectUploadAudit: "unverified", publicUploadEligibility: "unverified" };
}
