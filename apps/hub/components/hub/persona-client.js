// Client helper for Sales OS 5 personas, Council Convene, and Guru lenses.
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

// 대화 렌즈는 Guru 방법론만 둔다. Legend 인물은 주간 카드로만 산다(agent-layer-direction
// §2.1 ⑧, 2026-09-25 운영자 재확인). 키는 Engine persona-chat의 GURU_LENSES와 같아야 한다 —
// 다르면 고른 렌즈가 조용히 버려진다(예전 카네기·힐 렌즈가 그랬다).
export const GURU_LENS_MAP = {
  voss: { id: "voss", name: "크리스 보스", label: "보스 (협상·No 유도)" },
  ogilvy: { id: "ogilvy", name: "데이비드 오길비", label: "오길비 (사실 카피)" },
  godin: { id: "godin", name: "세스 고딘", label: "고딘 (작은 유효시장)" },
  rackham: { id: "rackham", name: "닐 랙햄", label: "랙햄 (SPIN 질문 유형)" },
  goldratt: { id: "goldratt", name: "엘리 골드랫", label: "골드랫 (제약이론 병목)" },
};

// 칩으로 보이는 렌즈 — 코칭 화면과 멘토 위젯이 같은 목록을 쓴다.
export const GURU_LENS_CHIPS = Object.freeze(["voss", "ogilvy"]);

export function isGuruLens(id) {
  return typeof id === "string" && Object.hasOwn(GURU_LENS_MAP, id);
}

export async function requestPersonaChat({
  personaId = "order",
  mode = "advice",
  lens = null,
  message = null,
  draft = null,
  context = null,
  conversationOnly = false,
} = {}, { signal, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl("/api/hub/persona-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId, mode, lens, message, draft, context, ...(conversationOnly ? { conversationOnly: true } : {}) }),
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
