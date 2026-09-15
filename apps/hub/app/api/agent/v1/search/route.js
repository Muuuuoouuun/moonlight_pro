import { createAgentHttpHandler } from "@/lib/agent/http.js";
import { agentJson, readAgentJson } from "@/lib/agent/http.js";
import { authorizeAgentRequest } from "@/lib/agent/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const auth = await authorizeAgentRequest(req, { scope: "read" });
  if (!auth.ok) return agentJson(auth);

  try {
    const body = await readAgentJson(req);
    const query = typeof body.query === "string" ? body.query.slice(0, 200) : "";
    const limit = typeof body.limit === "number" ? Math.min(Math.max(1, body.limit), 20) : 5;
    const kinds = Array.isArray(body.kinds) ? body.kinds : undefined;

    // Use Engine if available, or direct DB retrieval
    const engineUrl = process.env.COM_MOON_ENGINE_URL?.trim().replace(/\/$/, "");
    const secret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim();

    if (engineUrl && secret) {
      try {
        const engineRes = await fetch(`${engineUrl}/api/ai/knowledge-retrieval`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-com-moon-shared-secret": secret,
          },
          body: JSON.stringify({
            workspaceId: auth.context.workspaceId,
            query,
            filters: { limit, kinds },
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const data = await engineRes.json();
        return agentJson({ httpStatus: engineRes.status, data });
      } catch {
        // Engine unreachable, fallback to preview
      }
    }

    return agentJson({
      httpStatus: 200,
      data: {
        status: "preview",
        workspaceId: auth.context.workspaceId,
        query,
        items: [],
        note: "Engine knowledge retrieval not reachable; returned preview envelope.",
      },
    });
  } catch (err) {
    return agentJson({
      httpStatus: 500,
      data: { status: "error", error: "knowledge-search-failed", message: err.message },
    });
  }
}
