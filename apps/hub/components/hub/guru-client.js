// Shared client helper for the Sales Guru mentor agent.
// Calls the Hub proxy (/api/hub/sales-mentor) which enriches the request with
// the revenue ledger context and forwards to the Engine. Reused by the Revenue
// Overview panel, the Deals/Accounts entry points, and the Agents chat session.

export const GURU_MODE_LABEL = {
  "pipeline-triage": "파이프라인 분류",
  "deal-review": "딜 진단",
  "proposal-critique": "제안 검토",
  "weekly-retro": "주간 회고",
};

// Build the canonical Guru chat deep-link. Every entry point funnels into the
// single mentor thread (plan §9): dashboard/agents/chat?agent=guru&mode=…&ref=…
export function guruChatPath({ mode, ref } = {}) {
  const params = new URLSearchParams({ agent: "guru" });
  if (mode) params.set("mode", mode);
  if (ref) params.set("ref", ref);
  return `dashboard/agents/chat?${params.toString()}`;
}

// Returns a normalized result: { state: 'done'|'preview'|'error', text?, note? }
export async function requestGuruCoaching({ mode = "pipeline-triage", ref = null, draft = null } = {}) {
  try {
    const res = await fetch("/api/hub/sales-mentor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, ref, draft }),
    });
    const data = await res.json().catch(() => null);

    if (data?.status === "generated" && data.text) {
      return { state: "done", text: data.text, mode: data.mode || mode, ref: data.ref ?? ref };
    }
    if (data?.status === "preview") {
      return { state: "preview", note: data.error || "Engine이 아직 연결되지 않았습니다." };
    }
    return { state: "error", note: data?.reason || data?.error || "코칭을 생성하지 못했습니다." };
  } catch (e) {
    return { state: "error", note: e instanceof Error ? e.message : String(e) };
  }
}

export const GURU_PREVIEW_NOTE =
  "Engine이 아직 연결되지 않아 실제 코칭을 생성할 수 없습니다. (COM_MOON_ENGINE_URL 미설정)";
