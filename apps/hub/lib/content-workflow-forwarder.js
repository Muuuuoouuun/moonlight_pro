// The workspace and shared secret originate on the server; the browser's
// workspace selection is never an authorization boundary.
export async function forwardContentWorkflow(command, { env = process.env, fetchImpl = fetch } = {}) {
  const engineUrl = String(env.COM_MOON_ENGINE_URL || "").trim().replace(/\/$/, "");
  const workspaceId = String(env.COM_MOON_DEFAULT_WORKSPACE_ID || "").trim();
  const sharedSecret = String(env.COM_MOON_SHARED_WEBHOOK_SECRET || "").trim();
  if (!engineUrl || !workspaceId) return { httpStatus: 202, data: { status: "preview", error: !workspaceId ? "missing-workspace" : "engine-not-configured" } };
  if (!sharedSecret) return { httpStatus: 503, data: { status: "error", error: "shared-secret-not-configured" } };
  try {
    const response = await fetchImpl(`${engineUrl}/api/content/workflow`, {
      method: "POST", headers: { "content-type": "application/json", "x-com-moon-shared-secret": sharedSecret },
      body: JSON.stringify({ ...command, workspaceId }), cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!data || typeof data !== "object" || typeof data.status !== "string") throw new Error("invalid-engine-response");
    return { httpStatus: response.status, data };
  } catch {
    return { httpStatus: 502, data: { status: "error", error: "engine-workflow-unavailable" } };
  }
}
