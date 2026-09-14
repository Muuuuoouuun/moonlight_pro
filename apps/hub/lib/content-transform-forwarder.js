export async function forwardContentTransform(command, { env = process.env, fetchImpl = fetch } = {}) {
  const engineUrl = String(env.COM_MOON_ENGINE_URL || "").trim().replace(/\/$/, "");
  const workspaceId = String(env.COM_MOON_DEFAULT_WORKSPACE_ID || "").trim();
  const sharedSecret = String(env.COM_MOON_SHARED_WEBHOOK_SECRET || "").trim();
  if (!engineUrl || !workspaceId) return { httpStatus: 202, data: { status: "preview", error: !workspaceId ? "missing-workspace" : "engine-not-configured", persisted: false } };
  if (!sharedSecret) return { httpStatus: 503, data: { status: "error", error: "shared-secret-not-configured", persisted: false } };
  try {
    const response = await fetchImpl(`${engineUrl}/api/content/transform`, {
      method: "POST", headers: { "content-type": "application/json", "x-com-moon-shared-secret": sharedSecret },
      body: JSON.stringify({ ...command, workspaceId }), cache: "no-store",
      // Allow the Engine's one 45-second model call plus bounded ledger reads
      // and persistence. Network failures are not automatically retried.
      signal: AbortSignal.timeout(115000),
    });
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)
      || !["generated", "duplicate", "unsaved", "running", "unknown", "error", "invalid-input", "conflict", "preview"].includes(data.status)) throw new Error("invalid-engine-response");
    return { httpStatus: response.status, data };
  } catch {
    return { httpStatus: 202, data: { status: "unknown", error: "engine-transform-outcome-unknown", persisted: false } };
  }
}
