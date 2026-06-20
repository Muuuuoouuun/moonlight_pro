// Shared client helper for the Council brand-mentor (the brand-side counterpart of
// guru-client.js). Calls the Hub proxy (/api/hub/brand-mentor) which enriches the request with
// the content/project ledger context and forwards to the Engine. Reused by the Studio editor,
// the Brand Projects advisory panel, and the Council chat session.

export const COUNCIL_MODE_LABEL = {
  "content-critique": "콘텐츠 검토",
  "brand-strategy": "브랜드 전략",
  "audience-analysis": "오디언스 분석",
  "meeting-synthesis": "회의록 정리",
  "flow-review": "플로우 점검",
};

// One mentor thread for the Council, like Guru. The mode switches the advisory lens
// (Writer / Strategist / Analyst); ref pins the focus project/idea.
export function councilChatPath({ mode, ref } = {}) {
  const params = new URLSearchParams({ agent: "council" });
  if (mode) params.set("mode", mode);
  if (ref) params.set("ref", ref);
  return `dashboard/agents/chat?${params.toString()}`;
}

// Returns a normalized result: { state: 'done'|'preview'|'error', text?, note? }
export async function requestCouncilAdvice({ mode = "brand-strategy", ref = null, draft = null } = {}) {
  try {
    const res = await fetch("/api/hub/brand-mentor", {
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
    return { state: "error", note: data?.reason || data?.error || "자문을 생성하지 못했습니다." };
  } catch (e) {
    return { state: "error", note: e instanceof Error ? e.message : String(e) };
  }
}

export const COUNCIL_PREVIEW_NOTE =
  "Engine이 아직 연결되지 않아 실제 자문을 생성할 수 없습니다. (COM_MOON_ENGINE_URL 미설정)";
