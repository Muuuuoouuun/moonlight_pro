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
