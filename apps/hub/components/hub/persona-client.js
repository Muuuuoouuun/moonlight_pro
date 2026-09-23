// Client helper for Sales OS 5 personas, Council Convene, and Legend lenses.
// Calls the Hub BFF proxy (/api/hub/persona-chat) which routes to the Engine.

export const PERSONA_MODE_LABEL = {
  advice: "조언",
  critique: "평가/진단",
  sparring: "3자 토론",
  "weekly-review": "한 주 정리",
  "outreach-draft": "연락 초안",
  "extract-actions": "액션 추출",
  "daily-dispatch": "오더 브리핑",
  chat: "대화",
};

export const LEGEND_LENS_MAP = {
  jobs: { id: "jobs", name: "스티브 잡스", label: "잡스 (단순성·경험)" },
  bezos: { id: "bezos", name: "제프 베이조스", label: "베이조스 (장기가치·가역성)" },
  chouinard: { id: "chouinard", name: "이본 쉬나드", label: "쉬나드 (목적성·단순해법)" },
  socrates: { id: "socrates", name: "소크라테스", label: "소크라테스 (지적 정직성)" },
  voss: { id: "voss", name: "크리스 보스", label: "보스 (협상·No 유도)" },
  ogilvy: { id: "ogilvy", name: "데이비드 오길비", label: "오길비 (사실 카피)" },
  godin: { id: "godin", name: "세스 고딘", label: "고딘 (작은 유효시장)" },
  rackham: { id: "rackham", name: "닐 랙햄", label: "랙햄 (SPIN 질문)" },
  goldratt: { id: "goldratt", name: "엘리 골드랫", label: "골드랫 (제약이론 병목)" },
  carnegie: { id: "carnegie", name: "데일 카네기", label: "카네기 (경청·논쟁회피·오늘의방)" },
  hill: { id: "hill", name: "나폴레온 힐", label: "힐 (목표확신·등가대가)" },
};

export async function requestPersonaChat({
  personaId = "order",
  mode = "advice",
  lens = null,
  message = null,
  draft = null,
  context = null,
} = {}, { signal, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl("/api/hub/persona-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId, mode, lens, message, draft, context }),
      signal,
    });
    const data = await res.json().catch(() => null);

    if (data?.status === "generated" && data.text) {
      return {
        state: "done",
        text: data.text,
        personaId: data.personaId || personaId,
        mode: data.mode || mode,
        lens: data.lens || lens,
        model: data.model,
      };
    }
    if (data?.status === "preview") {
      return {
        state: "preview",
        note: data.error || "Engine이 아직 연결되지 않았습니다. (COM_MOON_ENGINE_URL 미설정)",
      };
    }
    return {
      state: "error",
      note: data?.reason || data?.error || "응답을 생성하지 못했습니다.",
    };
  } catch (e) {
    return { state: "error", note: e instanceof Error ? e.message : String(e) };
  }
}
