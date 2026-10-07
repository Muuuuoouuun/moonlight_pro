// 연락 기록 입력 계약 — 순수, import 없음.
//
// 기록창은 하나다(스펙 §4.3). 큐·고객 목록·첫 화면·고객 상세 어디서 열어도 같은 폼·같은
// 저장 계약을 쓰고, 채널만 프리셋으로 달라진다. 채널별로 "무엇을 묻는가"가 다른 이유는
// ClassIn `lib/crm/contact-log.ts`가 이미 겪은 결함 때문이다 — 카톡·이메일에 통화 결과를
// 실어 보내면 저장은 되지만 "발신했을 뿐인 기록"에 반응이 붙어 응대 통계가 조용히 부푼다.

// crm_activities.reaction CHECK(0016)과 같은 5종.
export const REACTIONS = [
  { key: "positive", label: "긍정" },
  { key: "neutral", label: "중립" },
  { key: "concern", label: "우려" },
  { key: "rejected", label: "거절" },
  { key: "no_response", label: "무응답" },
];

export const REACTION_KEYS = new Set(REACTIONS.map((r) => r.key));

// 기록창이 여는 채널. `reaction`은 대화가 오간 채널에서만 의미가 있다 — 카톡·이메일·메모는
// 보낸 사실이지 상대의 반응이 아니다. `promptsReply`는 "회신 받았나요?" 토글을 띄울지.
export const CONTACT_CHANNELS = [
  { key: "call", label: "통화", reaction: true },
  { key: "meeting", label: "미팅", reaction: true },
  { key: "visit", label: "방문", reaction: true },
  { key: "demo", label: "데모", reaction: true },
  { key: "kakao", label: "카톡·문자", reaction: false, promptsReply: true },
  { key: "email", label: "이메일", reaction: false, promptsReply: true },
  { key: "note", label: "메모", reaction: false },
];

const CHANNEL_BY_KEY = new Map(CONTACT_CHANNELS.map((c) => [c.key, c]));

// record_contact_outcome_v1(0042)이 빈 반응을 받아 null로 저장하는 채널. 폼의 반응 없는 채널
// (카톡·이메일·메모)과 RPC가 아는 비대화 kind(update·quote)를 합친 것 — 0042의 SQL 목록과
// 같아야 한다(contact-outcome-reactionless.postgres.test.mjs가 고정).
export const REACTIONLESS_KINDS = new Set(["kakao", "email", "note", "update", "quote"]);

export function isContactChannel(kind) {
  return CHANNEL_BY_KEY.has(String(kind || ""));
}

export function channelLabel(kind) {
  return CHANNEL_BY_KEY.get(String(kind || ""))?.label || String(kind || "");
}

// 반응을 물을 것인가. 대화 채널이면 항상, 발신 채널은 "회신 받음"을 켰을 때만.
export function reactionRequired(kind, { replied = false } = {}) {
  const channel = CHANNEL_BY_KEY.get(String(kind || ""));
  if (!channel) return false;
  if (channel.reaction) return true;
  return Boolean(channel.promptsReply && replied);
}

// 후속 계획 3상태(CRM 지침 §3.1): 날짜 있음 / 기약 없음 / 후속 없음.
export const FOLLOWUP_MODES = [
  { key: "dated", label: "날짜 정하기" },
  { key: "dormant", label: "기약 없음" },
  { key: "none", label: "후속 없음" },
];

// 저장 전 검증. 화면은 이 결과만 보고 무엇이 비었는지 말한다 — 이유를 말하지 않는
// disabled 버튼을 두지 않기 위해 "막을 것"과 "한 번 경고할 것"을 나눈다.
export function validateContactRecord(form = {}) {
  const summary = String(form.summary || "").trim();
  const missing = [];
  if (!summary) missing.push("summary");
  if (reactionRequired(form.kind, { replied: form.replied }) && !form.reaction) missing.push("reaction");
  if (form.followup === "dated" && !String(form.at || "").trim()) missing.push("at");

  // 열린 건인데 후속을 아무것도 고르지 않았으면 막지 않고 한 번 경고한다(기존 RPC의
  // no-next-action warning과 같은 취지).
  const warn = missing.length === 0 && form.followup === "none" && !String(form.nextAction || "").trim();
  return { ok: missing.length === 0, missing, warn };
}

// RPC(record_contact_outcome_v1) 페이로드. 채널이 반응을 묻지 않았으면 reaction은 빈 문자열이다.
export function buildContactRecordPayload(form = {}, target = {}) {
  const followup = form.followup === "dormant" || form.followup === "none" ? form.followup : "dated";
  const dormant = followup === "dormant";
  const wantsReaction = reactionRequired(form.kind, { replied: form.replied });
  const nextAction = String(form.nextAction || "").trim();

  return {
    entityType: target.kind === "account" ? "account" : target.kind === "deal" ? "deal" : "lead",
    entityId: target.id,
    kind: isContactChannel(form.kind) ? form.kind : "call",
    summary: String(form.summary || "").trim(),
    // 반응 없는 채널은 빈 문자열 — RPC(0042)는 REACTIONLESS_KINDS에 한해 이를 null로 저장한다.
    // "묻지 않은 것"을 임의 값으로 채우지 않는다(대화 채널은 validate가 먼저 막는다).
    reaction: wantsReaction && REACTION_KEYS.has(form.reaction) ? form.reaction : "",
    nextAction: followup === "dated" || nextAction ? nextAction || null : null,
    nextActionAt: followup === "dated" ? String(form.at || "").trim() || null : null,
    dormant,
  };
}

// 붙여넣은 원문은 요약과 별개로 보관한다. 요약은 목록 한 줄, 원문은 나중에 다시 읽을 것.
// 원자 저장이 아니므로(1b의 RPC v2 전까지) 실패해도 요약 기록은 이미 남아 있다.
export function buildRawNoteWrite(form = {}, target = {}) {
  const body = String(form.body || "").trim();
  if (!body) return null;
  return {
    op: "create",
    type: "note",
    body,
    ...(target.kind === "account" ? { accountId: target.id } : {}),
    ...(target.kind === "deal" ? { dealId: target.id } : {}),
    ...(target.kind === "lead" || !target.kind ? { leadId: target.id } : {}),
    ...(target.companyId ? { companyId: target.companyId } : {}),
  };
}

// AI 추출 결과를 폼에 얹는다(3a0c18f의 자동 채우기). AI는 폼만 채우고 저장 계약은 그대로다.
// 발신형 채널(카톡·이메일)은 상대가 실제로 회신했다는 추출(`replied === true`)이 있을 때만
// 반응을 받는다 — 프롬프트가 반응을 늘 1개 고르게 하므로, 반응만 보고 회신을 켜면 보낸
// 메시지에 반응이 붙어 응대 통계가 부푼다(이 파일 머리 주석의 결함). 무응답은 회신이 아니다.
// 메모처럼 반응을 묻지 않는 채널에서는 반응을 채우지도 세지도 않는다.
export function applyContactExtraction(form = {}, extracted = {}) {
  const next = { ...form };
  let filled = 0;
  if (extracted.kind && CHANNEL_BY_KEY.has(extracted.kind)) { next.kind = extracted.kind; filled++; }
  const channel = CHANNEL_BY_KEY.get(String(next.kind || ""));
  if (extracted.reaction && REACTION_KEYS.has(extracted.reaction) && channel) {
    if (channel.reaction) {
      next.reaction = extracted.reaction;
      filled++;
    } else if (channel.promptsReply) {
      if (extracted.replied === true && extracted.reaction !== "no_response") {
        next.replied = true;
        next.reaction = extracted.reaction;
        filled++;
      } else {
        next.replied = false;
        next.reaction = null;
      }
    }
  }
  if (extracted.summary) { next.summary = extracted.summary; filled++; }
  if (extracted.nextAction) { next.nextAction = extracted.nextAction; filled++; }
  if (extracted.dormant) { next.followup = "dormant"; next.at = ""; }
  else if (extracted.nextAt) { next.followup = "dated"; next.at = extracted.nextAt; filled++; }
  return { form: next, filled };
}

// 저장 표시 글자 — 서버가 saved로 답하기 전에는 끝난 말(기록됨·저장됨·완료)을 쓰지 않는다
// (DESIGN.md §8.1 Save envelope). 확인 문구("기록됨 · 이름")는 onPersisted를 받은 호출처가 띄운다.
//   pending — 되돌리기 창(3.5초). 요청이 아직 나가지 않았다.
//   sending — 요청을 보냈고 서버의 답을 기다린다. 되돌릴 수 없다.
const RECORD_SAVE_LABELS = { pending: "기록 중", sending: "저장 중" };

export function recordSaveLabel(phase) {
  return RECORD_SAVE_LABELS[phase] || "";
}

// 저장 줄에 무엇을 보일지 — 두 가지는 서로 다른 말이라 한 문장으로 잇지 않는다.
//   progress — 앞서 누른 저장의 진행. 되돌리기 창이면 "기록 중" + 되돌리기, 보낸 뒤면 되돌리기
//              없는 "저장 중"(죽은 버튼을 두지 않는다). 서버가 답하면 사라진다.
//   note     — 지금 쓰는 폼에 대한 말 하나: 빠진 항목 > 빈 약속 경고 > 실패 원인 > 쉬는 초안 글자.
//              초안 글자는 진행 중인 저장이 없을 때만 — 방금 비운 폼에 초안이 있다고 하지 않는다.
// 앞선 저장이 가는 동안 다음 기록을 쓰다 경고를 만나면 둘 다 보인다(각자 자기 줄에).
// errorTitle(넓은 기록창)을 주면 실패 원인에 제목("저장 못 함" · "일부 저장")이 붙는다 — 화면은 제목과
// 1px 레일만 위급 색으로, 원인 문장은 본문색으로 그린다.
export function recordSaveLine({ pending = null, showMissing = false, state = "idle", warnCopy = "", errorMsg = "", errorTitle = "", draftHint = "" } = {}) {
  const label = recordSaveLabel(pending?.phase);
  const progress = label ? { label, canUndo: pending.phase === "pending" } : null;
  let note = null;
  if (showMissing) note = { tone: "missing", text: "위 필수 항목을 채우면 저장됩니다." };
  else if (state === "warn") note = { tone: "warn", text: warnCopy };
  else if (state === "error") note = { tone: "error", text: errorMsg, ...(errorTitle ? { title: errorTitle } : {}) };
  else if (!progress && draftHint) note = { tone: "hint", text: draftHint };
  return { progress, note };
}

// 저장 버튼의 글자 — 무엇이 일어나는지 버튼이 말한다(주 버튼은 하나).
//   retry  — 일부 저장 뒤 긴 글만 다시 보낸다(그 칸 이름의 글자). 다음으로 넘어가지 않는다.
//   queued — 오늘 연락에서 연 넓은 기록창(Q-CR8): 저장하면 창이 다음 사람으로 넘어간다. '저장만'은
//            넘어가지 않고 창을 닫는 보조 버튼이다. 다른 진입점은 언제나 '저장' 하나다.
//   sheet  — 휴대폰 시트. ⌘↵ 글자를 달지 않고, 실패 뒤에는 머리 버튼이 '다시 저장'이라고 말한다
//            (원인 줄이 버튼과 떨어져 있다).
export function recordSaveButtons({ retry = "", queued = false, sheet = false, failed = false } = {}) {
  if (retry) return { primary: retry, secondary: "", chord: false };
  if (queued) return { primary: "저장하고 다음", secondary: "저장만", chord: !sheet };
  return { primary: sheet && failed ? "다시 저장" : "저장", secondary: "", chord: !sheet };
}

// 저장 줄이 쉬고 있는가 — 앞선 저장의 진행도, 지금 폼에 대해 할 말(빠진 칸 · 경고 · 실패 원인)도 없다.
// 남은 것은 쉬는 초안 글자뿐이다. 휴대폰 시트는 이때 키보드 위의 줄을 비우고 칩 줄 하나만 남긴다
// (초안이 놓인 곳은 머리의 둘째 줄이 말한다) — 글 쓸 높이를 상태 없는 줄에 쓰지 않는다.
export function recordSaveLineResting(line = {}) {
  return !line?.progress && (!line?.note || line.note.tone === "hint");
}

// 초안이 놓인 곳을 그대로 말한다 — 연락 기록 초안은 서버에 없고, 어디까지 살아남는지는 곳마다 다르다.
//   tab    — sessionStorage. 같은 탭에서만 살고(새로고침은 견딘다) 탭을 닫으면 사라진다.
//   memory — 저장소가 막힌 창(사생활 보호 등)의 메모리 사본. 새로고침하면 사라진다.
// "이 기기"(localStorage)는 아직 약속하지 않는다(Q-CR4 결정 전) — 모르는 곳은 빈 문자열이다.
const DRAFT_PLACE_LABELS = { tab: "초안 · 이 탭", memory: "초안 · 새로고침 전까지" };

export function draftPlaceLabel(place) {
  return DRAFT_PLACE_LABELS[place] || "";
}

// 다시 연 기록창이 되살린 초안 — 어디 것을 불러왔는지 함께 말한다.
export function draftRestoredCopy(place) {
  const label = draftPlaceLabel(place);
  return label ? `${label} · 쓰던 내용을 불러왔어요` : "쓰던 내용을 불러왔어요";
}

// 저장 줄의 쉬는 글자. 아직 쓴 게 없으면 "어디에 남는지"를, 쓰기 시작했으면 "어디에 있고
// 서버에는 없다"를 말한다. 초안을 둘 곳이 없으면(저장된 고객이 아님) 아무 약속도 하지 않는다.
export function draftHintCopy(place, { dirty = false } = {}) {
  const label = draftPlaceLabel(place);
  if (!label) return "";
  if (dirty) return `${label} · 서버에는 아직 없어요`;
  return place === "tab" ? "닫아도 이 탭에 초안으로 남아요" : "닫아도 초안으로 남아요 · 새로고침하면 사라져요";
}

// ── 넓은 기록창(2026-09-30 · 권장, 화면 확인 뒤 확정) ────────────────────────────────

// 기록창의 그릇 — 같은 Drawer이고 폭만 바뀐다(Q-CR1 · Q-CR3). 읽을 땐 좁게, 쓸 때만 넓게.
export const RECORD_DRAWER_WIDTH = {
  rest: "min(480px, 96vw)",
  wide: "min(960px, calc(100% - 56px))",
};

// 화면 폭으로 고르는 배치는 셋이다(Q-CR3 · Q-CR11). 중단점은 §7 Responsive의 둘(900 · 600)만 쓴다 —
// 새 폭을 만들지 않는다.
//   wide  — 901px 이상. 쓰기 칸과 읽기 칸이 나란히 선다.
//   tabs  — 601–900px. 같은 넓은 드로어(폭은 화면이 자른다)에 두 칸이 '쓰기 | 이 고객' 탭으로 선다.
//   sheet — 600px 이하. 전체 높이 바닥 시트 · 저장은 머리에 · 같은 탭 · 키보드 위 칩 줄.
// 폭은 화면이 미디어 쿼리로 잰다 — 스타일시트(드로어의 바닥 시트 · 이 기록창의 탭)와 같은 자로 재야
// 소수 폭(확대 · 분할 화면)에서도 두 쪽이 어긋나지 않는다. 그래서 폭 숫자를 직접 받는 함수는 두지 않는다.
// 쿼리를 아직 못 들었으면(서버 렌더 · 첫 그리기) 데스크톱 기본인 wide다.
export const RECORD_LAYOUT_BREAKPOINTS = { sheet: 600, tabs: 900 };
export const RECORD_LAYOUT_QUERIES = {
  sheet: `(max-width: ${RECORD_LAYOUT_BREAKPOINTS.sheet}px)`,
  tabs: `(max-width: ${RECORD_LAYOUT_BREAKPOINTS.tabs}px)`,
};

// 누르는 곳이 44px로 서는 화면 — 전역 터치 플로어(hub-tokens.css)와 같은 쿼리다. 배치를 고르지 않는다(배치는
// 위의 둘뿐이다): 버튼이 커지는 화면에서 글자뿐인 줄도 같은 높이로 세워, 버튼이 나타났다 사라질 때 그 아래가
// 밀리지 않게 하는 데만 쓴다(넓은 기록창의 이어 쓰기 줄).
export const RECORD_TOUCH_QUERY = "(pointer: coarse), (max-width: 720px)";

// 드로어가 듣는 두 미디어 쿼리(RECORD_LAYOUT_QUERIES)의 답에서 배치를 고른다 — mobile은 sheet
// 쿼리, narrow는 tabs 쿼리가 맞았는지다. 600px 이하에서는 둘 다 맞으므로 sheet가 이긴다.
export function recordLayoutModeFromMedia({ mobile = false, narrow = false } = {}) {
  return mobile ? "sheet" : narrow ? "tabs" : "wide";
}

// 기록 모드의 그릇 — 쓰는 동안에만 넓다. 쉬는 드로어는 어느 폭에서든 지금 그대로다.
//   mode    — 위의 배치(쓰지 않을 때도 화면 폭이 고른 값을 돌려준다).
//   form    — 기록 폼의 배치. "wide"는 요약 한 줄 + 늘 펼친 자세히 + 제자리 아래 띠, "sheet"는 같은 두 칸에
//             아래 띠 대신 칩 줄(누르면 칸이 펼쳐진다). "compact"는 쓰지 않을 때의 값이다(폼이 없다).
//   context — 읽기 칸(약속 · 최근 기록)을 둘지.   tabs — 두 칸을 '쓰기 | 이 고객' 탭으로 나눌지.
//   headerSave — 저장을 드로어 머리에 둘지(휴대폰: 키보드가 몇 px이든 가리지 않는다).
export function recordWindowLayout({ recording = false, mobile = false, narrow = false } = {}) {
  const mode = recordLayoutModeFromMedia({ mobile, narrow });
  const on = Boolean(recording);
  const sheet = on && mode === "sheet";
  return {
    mode,
    width: on && !sheet ? RECORD_DRAWER_WIDTH.wide : RECORD_DRAWER_WIDTH.rest,
    form: !on ? "compact" : sheet ? "sheet" : "wide",
    context: on,
    tabs: on && mode !== "wide",
    headerSave: sheet,
  };
}

// 좁은 화면의 두 탭 — 쓰기(기록 칸) | 이 고객(읽기 칸). 탭을 바꿔도 기록 칸은 그대로 서 있다(가려질 뿐):
// 쓰던 글 · 앞선 저장의 되돌리기 · 실패 원인이 사라지지 않는다.
export const RECORD_TABS = [
  { key: "write", label: "쓰기" },
  { key: "context", label: "이 고객" },
];

// 지금 보이는 탭 — 탭이 없는 배치(wide)에서는 언제나 쓰기다(넓은 화면으로 돌아오면 두 칸이 다시 나란히 선다).
export function recordTab(tab, { tabs = false } = {}) {
  return tabs && tab === "context" ? "context" : "write";
}

// '이 고객' 탭을 보는 동안 아래 줄이 말하는 것 — 쓰던 글이 몇 자 남아 있는지. 글자는 글쓰기 칸의 것만 센다
// (앞뒤 빈칸 제외). 글은 없어도 고쳐 둔 것이 있으면(dirty — 다음 약속 · 반응 · 날짜만 만진 폼) 남아 있다고
// 말한다: 저장 안 된 입력이 가려진 칸에 있는데 "쓴 게 없다"고 하지 않는다. 아무것도 안 만졌을 때만 없다고 한다.
export function recordAwayLabel({ mode = "contact", chars = 0, dirty = false } = {}) {
  const memo = normalizeRecordMode(mode) === "memo";
  const count = Math.max(0, Math.floor(Number(chars) || 0));
  if (count) return `${memo ? "쓰던 메모" : "쓰던 기록"} · ${count.toLocaleString("en-US")}자`;
  if (dirty) return memo ? "쓰던 메모가 남아 있어요" : "쓰던 기록이 남아 있어요";
  return memo ? "아직 쓴 메모가 없어요" : "아직 쓴 기록이 없어요";
}

// 연락 기록에서 운영자가 쓴 글자 수 — 요약 + 자세히(글쓰기 칸 둘).
export function recordDraftChars(form = {}) {
  return ["summary", "body"].reduce((sum, key) => sum + String(form?.[key] || "").trim().length, 0);
}

// 접힌 자세히 한 줄이 말하는 줄 수 — 앞뒤 빈 줄은 세지 않는다. 비었으면 0.
export function recordDetailLines(body = "") {
  const text = String(body || "").trim();
  return text ? text.split(/\r?\n/).length : 0;
}

// 휴대폰 시트의 칩 줄 — 키보드 바로 위에서 어떻게 · 반응과 다음 약속을 한 줄씩 요약한다. 누르면 그 칸들이
// 펼쳐진다(칩은 요약일 뿐 값을 바꾸지 않는다). 글자는 아래 칸들이 보이는 것과 같은 말이다.
//   how     — 종류 · 반응. 반응을 묻는 채널인데 아직 안 골랐으면 '반응 필수'라고 말한다.
//   promise — 무엇을 · 언제. 날짜는 M/D(date — 화면은 mono로 그린다). 날짜가 비면 '날짜 필요'.
// kindLabel · whenLabel은 폼이 고른 칸의 글자(시트 채널 이름 · 내일 · 3일 뒤 · 다음 주)다.
const REACTION_LABELS = Object.fromEntries(REACTIONS.map((r) => [r.key, r.label]));
const DATE_KEY = /^\d{4}-(\d{2})-(\d{2})$/;
const PROMISE_CHIP_MAX = 14;

function clipChars(text, max) {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

export function recordSheetChips(form = {}, { kindLabel = "", whenLabel = "" } = {}) {
  const channel = CHANNEL_BY_KEY.get(String(form.kind || ""));
  const asks = reactionRequired(form.kind, { replied: form.replied });
  const reaction = asks ? REACTION_LABELS[form.reaction] || "" : "";
  const how = [kindLabel || channelLabel(form.kind)];
  if (channel?.promptsReply && form.replied) how.push("회신 받음");
  if (asks) how.push(reaction || "반응 필수");

  const what = String(form.nextAction || "").trim();
  const day = form.followup === "dated" ? DATE_KEY.exec(String(form.at || "")) : null;
  const date = day ? `${Number(day[1])}/${Number(day[2])}` : "";
  const when = form.followup === "dormant" ? "기약 없음"
    : form.followup === "none" ? "후속 없음"
    : date ? whenLabel : "날짜 필요";
  return [
    { key: "how", label: how.join(" · "), date: "" },
    { key: "promise", label: [what ? clipChars(what, PROMISE_CHIP_MAX) : "약속", when].filter(Boolean).join(" · "), date },
  ];
}

// 같은 칸의 두 모드(Q-CR6 · 권장, 화면 확인 뒤 확정) — 연락 기록 | 메모. 모드가 다르면 저장되는 곳이
// 다르다: 연락 기록은 record_contact_outcome_v1(활동 + 고객 행), 메모는 일지 메모(journal)다.
export const RECORD_MODES = [
  { key: "contact", label: "연락 기록" },
  { key: "memo", label: "메모" },
];

export function normalizeRecordMode(mode) {
  return mode === "memo" ? "memo" : "contact";
}

// 머리 문장 — 저장하면 무엇이 바뀌는지 미리 말한다. 코드가 실제로 하는 일만 적는다:
//   연락 기록 — RPC(0042)가 고객 행의 last_touch_at(계약 고객은 updated_at)과 next_action을 언제나 새로
//               쓴다. 다음 약속을 비워 저장하면 약속이 '기약 없음'으로 바뀐다 — "그대로"가 아니다.
//   메모      — journal_workflow_v1의 save는 journal_* 테이블만 쓴다. 고객 행 · 활동을 건드리지 않는다.
const RECORD_MODE_SENTENCES = {
  contact: "연락한 일을 남겨요 · 마지막 연락일과 다음 약속이 바뀌어요",
  memo: "연락이 아니에요 · 마지막 연락일과 약속은 그대로예요",
};

export function recordModeSentence(mode) {
  return RECORD_MODE_SENTENCES[normalizeRecordMode(mode)];
}

// 모드 전환 칸의 글자. 메모를 쓰는 동안 앞서 누른 연락 기록이 실패하면 그 사실(contactIssue — 저장 줄의
// 제목과 같은 말: "저장 못 함" · "일부 저장")이 '연락 기록' 칸 이름에 글자로 선다 — 보이지 않는 모드에
// 원인을 숨겨 두지 않는다(돌아가면 쓰던 글과 원인이 그대로 있다). 연락 기록을 보고 있을 때는 저장 줄이 말한다.
export function recordModeOptions({ mode = "contact", contactIssue = "" } = {}) {
  const flag = normalizeRecordMode(mode) === "memo" ? String(contactIssue || "") : "";
  return RECORD_MODES.map((option) => (
    option.key === "contact" && flag ? { ...option, label: `${option.label} · ${flag}` } : option
  ));
}

// 메모를 쓰는 동안 앞서 누른 연락 기록이 실패했다 — 메모 칸의 저장 줄 위에 서는 원인 줄(RecordSaveLine의
// note: 1px 위급 레일 + 제목). 전환 칸의 이름(흐린 글자)만으로는 저장 실패가 읽히지 않는다: 영속 실패는
// 위급 표식과 원인을 함께 말한다(DESIGN §5.3). 빨강은 이 줄의 레일과 제목 한 곳뿐이고, 자세한 원인 · 쓰던 글 ·
// 다시 저장은 연락 기록 쪽에 그대로 있다 — 여기서는 어디로 가면 되는지만 말한다.
const MEMO_MODE_CONTACT_TEXT = {
  "일부 저장": "요약은 저장됐어요 · 연락 기록으로 돌아가면 자세히를 다시 저장할 수 있어요.",
};
export function memoModeContactNote(contactIssue = "") {
  const issue = String(contactIssue || "");
  if (!issue) return null;
  return {
    tone: "error",
    title: `연락 기록 · ${issue}`,
    text: MEMO_MODE_CONTACT_TEXT[issue] || "연락 기록으로 돌아가면 쓰던 글과 원인이 그대로 있어요.",
  };
}

// 메모 모드가 있는 기록창에서는 '메모만' 채널을 메모 모드가 대신한다 — 같은 뜻의 길을 둘로 두지 않는다
// ('메모만'으로 남긴 연락 기록은 RPC를 타므로 마지막 연락일과 약속을 바꾼다). 다른 진입점이나 쓰던 초안이
// 이미 '메모만'을 골라 둔 폼은 그 칸을 남긴다(고른 값이 사라지지 않게).
export function recordChannelOptions(options = [], kind = "", { memoMode = false } = {}) {
  if (!memoMode) return options;
  return options.filter((option) => option.key !== "note" || kind === "note");
}

// 한글 조합을 끝내는 Enter(isComposing · keyCode 229)는 글자를 확정할 뿐이다 — 어느 단축키도 아니다.
// React 합성 이벤트(nativeEvent)와 창에서 받은 원래 이벤트 둘 다 읽는다.
const composingEnter = (event) => Boolean(event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229);

// 요약 칸의 Enter — 저장이 아니라 자세히로 내려간다. ⌘↵ · Ctrl+↵(저장)와 Shift · Alt 조합은
// 여기 몫이 아니다.
export function isPlainEnter(event = {}) {
  if (event.key !== "Enter") return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return !composingEnter(event);
}

// ⌘↵ · Ctrl+↵ — 저장. 기록창 안에서는 폼이, 넓은 기록창에서는 창 어디서나(읽기 칸 · 발판 · 빈 곳) 받는다.
// 누르고 있는 동안 되풀이되는 keydown(repeat)은 저장이 아니다 — 한 번 누른 것이 한 번의 저장이다. 받아 주면
// 저장 뒤 비워진 폼(또는 '저장하고 다음'으로 넘어온 다음 사람의 폼)을 같은 손짓이 다시 저장한다.
export function isSaveChord(event = {}) {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return false;
  if (event.repeat || event.nativeEvent?.repeat) return false;
  return !composingEnter(event);
}

// 넘어온 창의 첫 한 박자 — '저장하고 다음'은 창을 곧바로 다음 사람으로 넘기고, 새 폼의 주 버튼은 같은 자리에 선다.
// 앞 사람을 저장한 손짓의 남은 절반(더블 클릭의 둘째 클릭 · 연달아 누른 ⌘↵)이 그 폼에 닿으면, 미리 채워진 기록
// 후보는 읽히지도 않고 저장되고 빈 폼은 꾸짖음부터 받는다. 그래서 넘어와 선 폼(handoff)은 선 직후의 저장을 받지
// 않는다 — 더블 클릭 간격보다 조금 길게. 직접 연 창(handoff 아님)은 언제나 받는다.
export const RECORD_HANDOFF_GUARD_MS = 600;
export function recordSaveArmed({ handoff = false, openedAt = 0, now = Date.now(), guardMs = RECORD_HANDOFF_GUARD_MS } = {}) {
  return !handoff || now - openedAt >= guardMs;
}

// 넓은 기록창 밖에서 난 ⌘↵를 이 기록창이 받아도 되는가 — 폼 안은 폼이 이미 받았고(inForm), 같은
// 드로어 안(읽기 칸 · 발판)이거나 포커스가 어디에도 없을 때(빈 곳을 누른 뒤)만 받는다. 위에 뜬
// 다른 창(⌘K 등)의 ⌘↵는 그 창의 것이다.
export function saveChordReachesRecord({ inForm = false, inShell = false, onBody = false } = {}) {
  return !inForm && (inShell || onBody);
}

// 자세히 칸의 높이 — 글이 차지하는 높이(scrollHeight)에 테두리 두께를 더한 border-box 값이다
// (안 더하면 늘 테두리만큼 넘쳐 칸 안 스크롤 막대가 선다). 최소 · 최대는 스타일시트가 자른다.
export function detailFieldHeight({ scrollHeight = 0, offsetHeight = 0, clientHeight = 0 } = {}) {
  return Math.max(0, Number(scrollHeight) || 0) + Math.max(0, (Number(offsetHeight) || 0) - (Number(clientHeight) || 0));
}

// 기록 줄 영수증 — 방금 남긴 기록 한 줄이 어디까지 갔는지. 새 기록 줄 자체가 영수증이다.
//   pending — 되돌리기 창(3.5초). 아직 보내지 않았다.
//   sending — 보냈고 서버의 답을 기다린다.
//   partial — 요약은 저장됐고 자세히(원문 메모)는 저장하지 못했다. 다시 저장은 기록 칸이 든다.
//   saved   — 서버가 saved로 답했다. 시각은 그 답을 받은 시각이다(그 전에는 시각을 달지 않는다).
// receipt가 없는 낙관 행(pending만 켜진 행)은 되돌리기 창으로 읽는다 — 보냈다고 말할 근거가 없다.
const RECEIPT_COPY = {
  pending: { label: recordSaveLabel("pending"), detail: "아직 보내지 않았어요" },
  sending: { label: recordSaveLabel("sending"), detail: "" },
  // 긴 글 칸의 이름은 배치마다 다르다(넓은 창 '자세히' · 좁은 시트 '원문') — 두 곳 모두에 맞는 말로.
  partial: { label: "일부 저장", detail: "요약만 저장됐어요 · 긴 글은 아직" },
  saved: { label: "저장됨", detail: "" },
};

const RECEIPT_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// 영수증 시각 hh:mm(운영은 KST). 못 읽는 값이면 빈 문자열 — 지어낸 시각을 달지 않는다.
export function receiptTimeLabel(value) {
  const at = value ? new Date(value) : null;
  return at && !Number.isNaN(at.getTime()) ? RECEIPT_TIME.format(at) : "";
}

export function recordReceipt(row = {}) {
  const phase = Object.hasOwn(RECEIPT_COPY, row?.receipt) ? row.receipt : row?.pending ? "pending" : null;
  if (!phase) return null;
  const settled = phase === "saved" || phase === "partial";
  return { phase, ...RECEIPT_COPY[phase], time: settled ? receiptTimeLabel(row.savedAt) : "", settled };
}

// 기록창이 알린 저장 사건을 기록 줄에 얹는다 — 순수. 낙관 ID든 서버 ID든 같은 줄을 찾는다
// (요약이 저장되면 줄의 ID가 서버 ID로 바뀐다).
//   sending — 되돌리기 창이 닫혀 요청이 나갔다.
//   partial — 요약만 저장됐다.     saved — 전부 저장됐다. 둘 다 at(답을 받은 시각)을 남긴다.
export function applyReceiptEvent(rows = [], { type, optimisticId = null, activityId = null, at = null } = {}) {
  const patch = type === "sending" ? { receipt: "sending" }
    : type === "partial" || type === "saved" ? { pending: false, receipt: type, savedAt: at }
    : null;
  if (!patch || (optimisticId == null && activityId == null)) return rows;
  return rows.map((row) => (
    row?.id != null && (row.id === optimisticId || row.id === activityId) ? { ...row, ...patch } : row
  ));
}

// 자세히(요약 뒤 따로 가는 note)가 저장되면 그 줄도 기록 줄기에 선다 — 서버에 생긴 그대로 요약 줄과
// 따로, 영수증과 함께. 넣지 않으면 "저장됨"이라고 한 직후 긴 글이 어디에도 보이지 않는다(다시 열어야
// 보였다). 순수: 같은 note가 이미 있으면(다시 읽기가 먼저 닿았으면) 그대로 둔다. 서버 ID를 못 받은
// 줄은 local- ID라 다시 읽기 전에는 삭제가 닿지 않는다.
export function addSavedNoteRow(rows = [], note = null, at = null) {
  const body = String(note?.body || "").trim();
  if (!body) return rows;
  const id = note.id ?? `local-note-${at || body.length}`;
  if (rows.some((row) => row?.id === id)) return rows;
  return [{ id, type: "note", msg: body, at: "방금", occurredAt: at, receipt: "saved", savedAt: at }, ...rows];
}
