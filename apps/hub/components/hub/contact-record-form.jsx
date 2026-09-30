"use client";

// 연락 기록 폼 — 큐·고객 목록·첫 화면·고객 상세가 공유하는 단 하나의 기록창(스펙 §4.3).
//
// 이전에는 같은 최소 기록을 세 곳이 각자 그렸다: 고객 DB의 컨택 완료 시트, 고객 연락의
// 인라인 LogForm, 상세의 QuickLog. 진입점에 따라 필수 필드도 되돌리기 유무도 달랐다.
// 여기서 하나로 모으되 기존 저장 계약은 그대로 지킨다 — 즉시 반영 + 3.5초 되돌리기,
// 창이 닫히면 POST, 늦은 실패 시 입력 복원 + 원인 명명.
//
// 2026-09-24 "30초 기록" 시트(운영자 승인 목업 01): 채널 다섯 개(통화·미팅·카톡·문자·메일·메모만),
// 한 줄 요약, 반응은 통화·미팅만 필수, 다음 약속 = 무엇 + 언제(내일·3일 뒤·다음 주·날짜…·
// 기약 없음). 다음 약속이 비면 한 번 알리고 기약 없음으로 저장한다. ⌘↵ 저장, 닫아도 입력은
// 남는다(같은 탭). 모든 새 prop은 선택이다 — 기존 호출처(고객 상세·첫 화면·에이전트)는 그대로다.
//
// 2026-09-30 넓은 기록창 ②(권장 · 화면 확인 뒤 확정): layout="wide"는 같은 상태 · 같은 저장 계약을
// 넓은 그릇에 다시 놓는다 — 요약 한 줄(필수) + 늘 펼친 자세히(선택)가 흐르는 칸에, 그 아래 제자리 띠
// (어떻게 · 반응 · 다음 약속 · 언제 · 저장). 기본("compact")은 지금 시트 그대로라 다른 호출처는 바뀌지
// 않는다. ⌘↵는 넓은 기록창 어디서나 저장이고(읽기 칸 · 발판 포함), 일부 저장(요약은 됐고 자세히는
// 아직) 동안에는 이미 저장된 요약 · 띠를 잠그고 자세히만 다시 보낸다.
//
// 2026-09-30 넓은 기록창 ⑥(Q-CR6 · 권장): 넓은 배치에 호출처가 memo를 주면 맨 위에 '연락 기록 | 메모'가
// 선다. 메모 모드는 어떻게 · 반응 · 다음 약속을 숨기고 호출처의 메모 칸(record-memo-pane.jsx — 일지 메모
// 작성기)을 같은 자리에 놓는다. 이 파일은 일지 메모 코드를 import하지 않는다 — 메모를 쓰지 않는 호출처
// (오늘 연락 · 첫 화면 · 에이전트)가 그 코드를 끌고 오지 않게. 연락 기록의 상태는 모드를 오가도 남는다.
//
// 2026-09-30 넓은 기록창 ③(Q-CR3 · Q-CR11 · 권장): layout="sheet"는 휴대폰의 전체 높이 시트에 놓이는 같은 두 칸
// (요약 + 자세히)이다. 아래 띠 대신 키보드 바로 위의 칩 줄(종류 · 반응, 약속)이 서고, 칩을 누르면 그 칸들이
// 펼쳐진다(자세히는 한 줄로 접힌다). 저장은 호출처가 준 머리 자리(saveSlot)에 선다 — 키보드가 가리지 않는다.
// 키보드 위의 저장 줄은 할 말(진행 · 되돌리기 · 빠진 칸 · 경고 · 실패)이 있을 때만 서고, 쉬는 동안 초안이 놓인 곳은
// 머리의 둘째 줄 자리(statusSlot)가 말한다. 시트와 넓은 기록창은 한 나무다 — 화면을 돌려 배치가 바뀌어도 글 칸이
// 다시 서지 않는다(커서 · 칸 높이가 남는다).
// 좁은 화면에서 '이 고객' 탭을 보는 동안(away) 기록 칸은 가려질 뿐 그대로 서 있다: 쓰던 글 · 되돌리기 · 실패
// 원인이 남고, 아래 줄이 '쓰던 기록 · N자'와 돌아갈 길을 보인다.
//
// 드로어 껍데기는 ContactRecordDrawer가 씌운다. 상세 안에서는 오버레이를 겹치지 않으려고
// 폼만 인라인으로 쓴다(CRM 지침 §6.2 — 활성 오버레이는 언제나 하나).
//
// pages/revenue.jsx를 import하지 않는다: 그 모듈은 자체 lazy 청크라 정적 교차 import 하나가
// Leads/Deals/Accounts 전체를 이 청크로 끌고 온다(followups.jsx가 같은 이유로 상수를 복제).

import React from "react";
import { createPortal } from "react-dom";
import { Button, CheckboxRow, Drawer, Kbd, SegmentedControl, Skeleton, TextAreaField, TextField, TruthBadge, useToast } from "./hub-primitives";
import { UNDO_WINDOW_MS, useUndoableAction } from "./use-undoable-action";
import { Iconed } from "./hub-icons";
import { requestPersonaChat } from "./persona-client";
import { parseContactOutcomeExtraction } from "@/lib/ai-workflow-client";
import {
  CONTACT_CHANNELS,
  REACTIONS,
  applyContactExtraction,
  buildContactRecordPayload,
  buildRawNoteWrite,
  channelLabel,
  detailFieldHeight,
  draftHintCopy,
  draftPlaceLabel,
  draftRestoredCopy,
  isPlainEnter,
  isSaveChord,
  memoModeContactNote,
  normalizeRecordMode,
  reactionRequired,
  recordAwayLabel,
  recordChannelOptions,
  recordDetailLines,
  recordDraftChars,
  recordModeOptions,
  recordModeSentence,
  recordSaveLine,
  recordSaveLineResting,
  recordSheetChips,
  saveChordReachesRecord,
  validateContactRecord,
} from "@/lib/sales-os/contact-record";
import { createRecordDraftStore, openRecordDraft } from "@/lib/sales-os/contact-record-draft";
import "./record-window.css";

const EMPTY_FORM = {
  kind: "call",
  reaction: null,
  replied: false,
  summary: "",
  body: "",
  nextAction: "",
  at: "",
  followup: "dated",
};

// 30초 기록 시트의 채널 — 방문·데모는 미팅이 대신한다(스펙 §4.3 "미팅·데모·방문"은 한 묶음).
// 다른 진입점이 방문·데모를 프리셋으로 넘기면 그 칸을 덧붙여 선택이 사라지지 않게 한다.
// 저장 어휘(kind)는 contact-record.js의 CONTACT_CHANNELS 그대로다.
const SHEET_CHANNELS = [
  { key: "call", label: "통화" },
  { key: "meeting", label: "미팅" },
  { key: "kakao", label: "카톡·문자" },
  { key: "email", label: "메일" },
  { key: "note", label: "메모만" },
];

// 다음 약속 "언제" — DateQuickPresets와 같은 로컬 날짜 계산(운영은 KST).
const WHEN_PRESETS = [
  { key: "d1", label: "내일", days: 1 },
  { key: "d3", label: "3일 뒤", days: 3 },
  { key: "d7", label: "다음 주", days: 7 },
];
const WHEN_OPTIONS = [
  ...WHEN_PRESETS.map(({ key, label }) => ({ key, label })),
  { key: "date", label: "날짜…" },
  { key: "dormant", label: "기약 없음" },
];

function localDateAfter(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 프리셋 중 폼 필드가 아닌 것 — 기록 후보(캘린더·통화)가 넘기는 실제 연락 시각·통화 길이·출처.
// 폼 상태에 섞지 않고 저장 직후 기록 행의 꼬리표로만 쓴다.
const CAPTURE_KEYS = ["occurredAt", "durationSec", "captureSource", "candidateId"];

function splitPreset(preset) {
  const form = {};
  const capture = {};
  Object.entries(preset || {}).forEach(([key, value]) => {
    if (CAPTURE_KEYS.includes(key)) capture[key] = value;
    else form[key] = value;
  });
  return { form, capture };
}

// 목업 기본값: 언제 = 3일 뒤. 호출처가 날짜나 다른 후속 상태를 넘기면 그걸 쓴다.
function baseForm(presetForm) {
  const base = { ...EMPTY_FORM, ...(presetForm || {}) };
  if (base.followup === "dated" && !base.at) base.at = localDateAfter(3);
  return base;
}

// 드로어가 닫혀 폼이 언마운트돼도, 현재 열린 앱에서 미저장 원문을 다시 보여 준다.
// 값: { activityId, optimisticId, summary, body } — summary는 이미 저장된 요약(넓은 기록창이 잠가 보인다).
const rawNoteRecoveries = new Map();
const rawNoteKey = (target) => JSON.stringify([target?.kind || "lead", target?.id || ""]);
// 자세히 칸의 높이 맞춤은 그리기 전에 끝나야 한 줄 늘 때마다 스크롤 막대가 번쩍이지 않는다.
// 서버 렌더(테스트 포함)에는 레이아웃 효과가 없으므로 그때만 일반 효과로 내려간다.
const useLayoutEffectOnClient = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

// 넓은 기록창의 긴 글 칸(자세히 · 메모) — 쓰는 만큼 길어지고(CSS의 최소 · 최대 높이 안에서), 그 뒤로는 칸
// 안에서 흐른다. 높이는 detailFieldHeight(순수)가 정한다. 재는 동안 칸이 잠깐 최소 높이로 줄어 흐르는 칸의
// 스크롤 위치가 따라 당겨지므로(글자 하나에 화면이 튄다) 재기 전 위치를 잡아 두었다가 되돌린다.
// 연락 기록의 자세히와 메모 모드의 메모 칸이 같은 규칙을 쓴다(record-memo-pane.jsx).
// 가려진 칸은 재지 않는다 — '이 고객' 탭을 보는 동안이나 칩 뒤 칸을 펼쳐 자세히가 접힌 동안 칸은 그려지지
// 않아 높이가 0으로 읽힌다(그대로 적으면 돌아왔을 때 긴 글이 최소 높이 칸에 갇힌다). 호출처가 그동안
// active를 끄고, 다시 보이면 켠다 — 켜지는 순간 다시 잰다. shape는 배치처럼 글은 그대로인데 칸의 최소
// 높이가 달라지는 값이다(화면을 돌려 시트 ↔ 넓은 기록창을 오갈 때) — 바뀌면 다시 잰다.
export function useGrowingDetail(ref, active, value, shape = "") {
  useLayoutEffectOnClient(() => {
    const el = ref.current;
    if (!active || !el) return;
    // 그려지지 않은 칸(display: none 안)은 상자가 없다 — 0을 높이로 적지 않는다.
    if (!el.getClientRects().length) return;
    const region = el.closest(".record-wide__scroll");
    const top = region ? region.scrollTop : 0;
    el.style.height = "auto";
    el.style.height = `${detailFieldHeight(el)}px`;
    if (!region) return;
    if (region.scrollTop !== top) region.scrollTop = top;
    // 글 끝에서 쓰는 중이면 새로 자란 줄이 흐르는 칸 아래에 걸리지 않게 칸 끝까지 따라 내려간다.
    if (document.activeElement === el && el.selectionStart >= el.value.length) {
      const under = el.getBoundingClientRect().bottom - region.getBoundingClientRect().bottom;
      if (under > 0) region.scrollTop += under + 12;
    }
  }, [ref, active, value, shape]);
}

const RAW_NOTE_ERROR = "요약은 저장됐지만 원문은 저장하지 못했습니다. 원문만 다시 저장하거나 복사해 두세요.";
// 긴 글 칸의 이름은 배치마다 다르다 — 좁은 시트는 접어 둔 '원문 붙여넣기', 넓은 기록창은 늘 펼친
// '자세히'다. 같은 일부 저장(요약은 됐고 긴 글은 아직)을 그 화면의 칸 이름으로 말한다.
const RAW_NOTE_COPY = {
  compact: {
    failed: RAW_NOTE_ERROR,
    empty: "다시 저장할 원문을 입력하세요.",
    again: "원문 저장 실패",
    kept: "원문은 이 창에 남아 있습니다.",
    retry: "원문 저장 재시도",
    skip: "원문 저장 건너뛰기",
  },
  wide: {
    failed: "요약은 저장됐고 자세히는 저장하지 못했어요. 자세히만 다시 저장하거나 복사해 두세요.",
    empty: "다시 저장할 자세히 내용을 입력하세요.",
    again: "자세히를 저장하지 못했어요",
    kept: "자세히는 이 창에 남아 있어요.",
    retry: "자세히 다시 저장",
    skip: "건너뛰기",
  },
};

// 쓰던 입력 — 닫아도 같은 탭에서 되살린다(스펙 §4.3 신뢰 계약 ②, 키 crm-record:<종류>:<id>).
// sessionStorage가 막힌 창(사생활 보호 등)에서는 이 앱이 열려 있는 동안만 기억한다.
// 읽기·쓰기는 초안이 실제로 놓인 곳("tab" | "memory")을 돌려주고, 화면은 그 곳을 그대로 말한다
// (draftHintCopy) — 메모리 사본뿐인데 "이 탭"이라고 하지 않는다. 저장소 규칙은
// lib/sales-os/contact-record-draft.js가 소유한다(막힌 창·중간에 막히는 창을 시험으로 고정).
const DRAFT_FIELDS = ["kind", "reaction", "replied", "summary", "body", "nextAction", "at", "followup"];
export const recordDraftStore = createRecordDraftStore(() => window.sessionStorage);
const draftKey = (target) => `crm-record:${target?.kind || "lead"}:${target?.id || ""}`;

function pickDraft(form) {
  return Object.fromEntries(DRAFT_FIELDS.map((key) => [key, form?.[key] ?? EMPTY_FORM[key]]));
}

function sameDraft(a, b) {
  return DRAFT_FIELDS.every((key) => (a?.[key] ?? EMPTY_FORM[key]) === (b?.[key] ?? EMPTY_FORM[key]));
}

// 저장된 고객이 아니면(id 없음) 초안 키가 없다 — 아무것도 두지 않고 어디에도 남는다고 말하지 않는다.
const readDraft = (target) => (target?.id ? recordDraftStore.read(draftKey(target)) : null);
const writeDraft = (target, form) => (target?.id ? recordDraftStore.write(draftKey(target), pickDraft(form)) : null);
const clearDraft = (target) => { if (target?.id) recordDraftStore.clear(draftKey(target)); };

// 일부 저장 뒤 아직 못 보낸 긴 글(원문 · 자세히). 요청이 가는 동안은 메모리에만 들고, 실패가 확인되면
// (durable) 초안과 같은 탭 저장소에도 둔다 — 그 상태에서 새로고침해도 긴 글이 남는다. 요청이 가는
// 중에는 탭에 두지 않는다: 저장됐는데 새로고침 뒤 "일부 저장"이라고 말하면 같은 글을 두 번 보내게 된다.
const rawNoteDraftKey = (target) => `${draftKey(target)}:rawnote`;
function recallRawNote(target) {
  const held = rawNoteRecoveries.get(rawNoteKey(target));
  if (held) return held;
  const stored = target?.id ? recordDraftStore.read(rawNoteDraftKey(target))?.value : null;
  return stored && typeof stored.body === "string" && stored.body.trim() ? stored : null;
}
function holdRawNote(target, value, { durable = false } = {}) {
  rawNoteRecoveries.set(rawNoteKey(target), value);
  if (durable && target?.id) recordDraftStore.write(rawNoteDraftKey(target), value);
}
function dropRawNote(target) {
  rawNoteRecoveries.delete(rawNoteKey(target));
  if (target?.id) recordDraftStore.clear(rawNoteDraftKey(target));
}

// 토스트 되돌리기(undoMode="toast")의 지연 저장. 시트는 저장을 누르는 즉시 닫히므로 폼의
// 언마운트 flush(useUndoableAction)에 기대면 되돌리기 창이 사라진다 — 모듈 스코프 타이머로
// 3.5초를 지키고, 탭을 닫으면(pagehide) 즉시 보낸다(use-undoable-action과 같은 최선 노력).
const detachedTimers = new Map();
let detachedPagehideBound = false;

function flushDetached() {
  detachedTimers.forEach(({ timerId, run }) => {
    clearTimeout(timerId);
    try { run(); } catch { /* 콜백 자신의 에러 처리에 맡긴다 */ }
  });
  detachedTimers.clear();
}

function scheduleDetached(key, run, delay = UNDO_WINDOW_MS) {
  if (typeof window !== "undefined" && !detachedPagehideBound) {
    detachedPagehideBound = true;
    window.addEventListener("pagehide", flushDetached);
  }
  const timerId = setTimeout(() => {
    detachedTimers.delete(key);
    run();
  }, delay);
  detachedTimers.set(key, { timerId, run });
}

function cancelDetached(key) {
  const entry = detachedTimers.get(key);
  if (!entry) return false;
  clearTimeout(entry.timerId);
  detachedTimers.delete(key);
  return true;
}

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function describeCapture(capture) {
  const parts = [];
  const at = capture?.occurredAt ? new Date(capture.occurredAt) : null;
  if (at && !Number.isNaN(at.getTime())) parts.push(KST_TIME.format(at));
  const secs = Number(capture?.durationSec);
  if (Number.isFinite(secs) && secs > 0) parts.push(secs < 60 ? `${Math.round(secs)}초` : `${Math.round(secs / 60)}분`);
  return parts.join(" · ");
}

// 대화·통화 원문에서 폼을 채우는 AI 보조(3a0c18f). 저장 계약은 그대로 — AI는 폼만 채우고,
// 운영자가 확인한 뒤 같은 저장 버튼을 누른다. 추출을 폼에 얹는 규칙(발신형 채널의 회신 판정
// 포함)은 순수 함수 applyContactExtraction(lib/sales-os/contact-record.js)이 소유한다.
function ContactAiAutofill({ target, aiContext, onApply }) {
  const [aiOpen, setAiOpen] = React.useState(false);
  const [aiInput, setAiInput] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiNotice, setAiNotice] = React.useState("");

  const handleAiExtract = async () => {
    const raw = aiInput.trim();
    if (!raw) return;
    setAiLoading(true);
    setAiNotice("");
    try {
      const res = await requestPersonaChat({
        personaId: "sales",
        mode: "extract-contact-outcome",
        draft: `[고객 맥락]
고객: ${target?.name || "미지정"}
현재 상태: ${aiContext || "미지정"}

[통화·미팅·대화 원문]
${raw}

위 원문을 분석하여 아래 형식으로 정확하게 추출해줘:
[채널]: 통화 | 카카오 | 미팅 | 방문 | 데모 | 이메일 중 1개
[고객 반응]: 긍정 | 중립 | 우려 | 거절 | 무응답 중 1개
[회신 여부]: 예 | 아니오 (카카오·이메일일 때 원문에 상대가 실제로 보낸 답장이 있으면 '예')
[1줄 요약]: 120자 이내의 사실 중심 핵심 요약
[다음 행동]: 구체적 후속 액션 (없거나 기약 없으면 '없음')
[다음 일정]: YYYY-MM-DD (특정 날짜 언급 없으면 '없음')
[기약 없음]: 예 | 아니오 (다음 약속 없이 종결 또는 휴면이면 '예')`,
      });
      if (res?.state === "done" && res.text) {
        const filled = onApply(parseContactOutcomeExtraction(res.text));
        setAiNotice(`폼에 ${filled}개 항목을 자동 채웠습니다. 내용을 확인한 뒤 저장하세요.`);
      } else {
        setAiNotice("추출 응답을 받지 못했습니다. 원문을 확인 후 다시 시도하세요.");
      }
    } catch {
      setAiNotice("추출 중 오류가 발생했습니다. 직접 입력할 수도 있습니다.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ background: "var(--surface-2)", borderRadius: "var(--r)", padding: "10px 12px", border: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Iconed name="sparkle" size={13} style={{ color: "var(--fg-muted)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>대화·메모에서 폼 자동 채우기</span>
        </div>
        <Button variant="ghost" size="xs" aria-expanded={aiOpen} onClick={() => { setAiOpen((v) => !v); setAiNotice(""); }}>
          {aiOpen ? "접기" : "AI로 채우기"}
        </Button>
      </div>
      {aiOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <TextAreaField
            label="대화 / 통화 메모 원문"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="카카오톡 대화, 전화 통화 요약, 미팅 녹취 메모를 붙여넣으면 채널·반응·요약·다음 행동을 폼에 자동 입력합니다."
            rows={3}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div role="status" aria-live="polite" style={{ fontSize: 11, color: aiNotice ? "var(--fg-muted)" : "var(--fg-dim)", flex: 1 }}>
              {aiNotice || "추출 후 폼 내용을 확인하고 저장하세요"}
            </div>
            <Button variant="primary" size="xs" onClick={handleAiExtract} disabled={aiLoading || !aiInput.trim()}>
              {aiLoading ? "추출 중…" : "추출 및 폼 채우기"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// 저장 줄의 글자 자리 — 무엇을 보일지는 recordSaveLine(순수)이 정하고 여기는 그리기만 한다.
// 앞선 저장의 진행과 지금 폼에 대한 말은 각자 자기 줄에 선다(한 문장으로 잇지 않는다).
const SAVE_NOTE_TONE = {
  missing: { role: "alert", color: "var(--fg-muted)" },
  warn: { role: "status", color: "var(--fg-muted)" },
  error: { role: "alert", color: "var(--danger)" },
  hint: { role: undefined, color: "var(--fg-dim)" },
};

// 실패 원인에 제목(note.title — 넓은 기록창의 "저장 못 함" · "일부 저장")이 있으면 1px 위급 레일 +
// 제목 글자 한 곳으로 그린다. 원인 문장은 본문색이다(빨강은 레일과 제목뿐, DESIGN §5.2).
// 제목이 없으면 지금처럼 원인 문장이 위급 색 한 줄이다.
export function RecordSaveLine({ line, onUndo }) {
  const { progress, note } = line || {};
  const tone = SAVE_NOTE_TONE[note?.tone] || SAVE_NOTE_TONE.hint;
  const railed = note?.tone === "error" && Boolean(note.title) && Boolean(note.text);
  return (
    <div style={{ flex: "1 1 200px", minWidth: 0, fontSize: 12, lineHeight: 1.45, minHeight: 18, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      {progress && (
        <span role="status" aria-live="polite" style={{ color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {progress.label}
          {progress.canUndo && onUndo && <Button variant="ghost" size="xs" onClick={onUndo}>되돌리기</Button>}
        </span>
      )}
      {railed ? (
        <span role="alert" style={{ display: "flex", flexWrap: "wrap", gap: "0 8px", paddingLeft: 10, boxShadow: "inset 1px 0 0 var(--danger)", color: "var(--fg)" }}>
          <span style={{ color: "var(--danger)", fontWeight: 500 }}>{note.title}</span>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{note.text}</span>
        </span>
      ) : note?.text && <span role={tone.role} style={{ color: tone.color }}>{note.text}</span>}
    </div>
  );
}

// 휴대폰 시트에서 칩을 누르면 펼쳐지는 칸들 — 어떻게 · 반응 · 다음 약속 · 언제. 넓은 기록창의 아래 띠와 같은
// 값 · 같은 규칙(반응은 묻는 채널에서만 필수, 발신 채널은 회신 받음)이고 놓이는 모양만 다르다: 한 줄씩 세로로,
// 세그먼트는 좁은 화면에서도 가로로 선다. 상태는 폼의 것이다 — 여기는 그리기만 한다.
export function RecordSheetFields({ form, channelOptions, wantsReaction, reactionMissing, replyToggle = null, whenKey, dateError = null, onEdit, onChannel, onWhen, refs = {} }) {
  return (
    <div className="record-sheet__fields" role="group" aria-label="어떻게 · 반응 · 다음 약속">
      <div className="record-sheet__field">
        <span className="hub-label" aria-hidden="true">어떻게</span>
        <div ref={refs.how} className="record-sheet__ctl">
          <SegmentedControl label="어떻게 연락했나" options={channelOptions} value={form.kind} onChange={onChannel} size="md" style={{ flexWrap: "wrap" }} />
        </div>
        {replyToggle}
      </div>
      {wantsReaction && (
        <div ref={refs.reaction} className="record-sheet__field">
          <span className="hub-label">반응<span className="hub-label__req"> · 필수</span></span>
          <SegmentedControl
            label="고객 반응"
            options={REACTIONS.map((r) => ({ key: r.key, label: r.label }))}
            value={form.reaction}
            onChange={(reaction) => onEdit({ reaction })}
            size="md"
            fill
            invalid={reactionMissing}
          />
          {reactionMissing && <p className="hub-field-msg hub-field-msg--error record-wide__msg" role="alert">반응을 하나 고르세요.</p>}
        </div>
      )}
      <div className="record-sheet__field">
        <TextField
          label="다음 약속"
          value={form.nextAction}
          onChange={(e) => onEdit({ nextAction: e.target.value })}
          placeholder="무엇을 — 예) 견적서 보내기"
        />
        <div ref={refs.when} className="record-sheet__ctl">
          <SegmentedControl label="언제" options={WHEN_OPTIONS} value={whenKey} onChange={onWhen} size="md" style={{ flexWrap: "wrap" }} />
        </div>
        {whenKey === "date" && (
          <TextField
            ref={refs.at}
            label="날짜"
            required
            type="date"
            value={form.at}
            onChange={(e) => onEdit({ at: e.target.value })}
            className="mono"
            style={{ padding: "0 10px" }}
            error={dateError}
          />
        )}
      </div>
    </div>
  );
}

// 주 버튼의 자리 — 연락 기록과 메모 칸이 같이 쓴다(record-memo-pane.jsx).
//   slot === undefined — 제자리(저장 줄 끝). 넓은 기록창 · 좁은 시트 · 머리 자리를 주지 않은 호출처.
//   slot === null      — 머리 자리를 받기로 했지만 아직 서지 않았다(첫 그리기 한 박자). 그리지 않는다 —
//                        제자리에 잠깐 섰다가 머리로 옮겨 가며 번쩍이지 않게.
//   slot(요소)          — 그 자리(휴대폰 시트의 머리)에 그린다. 버튼은 하나이고 상태도 폼의 것 그대로다.
export function RecordPrimarySlot({ slot, children }) {
  if (slot === undefined) return children;
  return slot ? createPortal(children, slot) : null;
}

// '이 고객' 탭을 보는 동안 기록 칸 자리에 남는 한 줄 — 쓰던 글이 그대로 있다는 것과 돌아갈 길.
// 앞서 누른 저장이 아직 가는 중이면(progress) 그 진행과 되돌리기를 대신 보인다.
export function RecordAwayBar({ label, progress = null, onUndo, onReturn }) {
  return (
    <div className="record-wide__away">
      {progress
        ? <RecordSaveLine line={{ progress, note: null }} onUndo={onUndo} />
        : <span className="record-wide__away-text num">{label}</span>}
      <Button variant="secondary" size="md" onClick={onReturn}>쓰기로 돌아가기</Button>
    </div>
  );
}

// onSummaryPersisted: 연락 요약 RPC가 저장된 즉시 불린다 — 낙관 행을 서버 ID로 바꾼다.
// onPersisted: 선택 원문까지 저장되거나 운영자가 건너뛴 뒤 불린다 — "기록됨" 확인은 여기서 띄운다.
// onFailed({ optimisticId, message, form }): 늦은 실패. 폼이 이미 언마운트됐을 수 있으므로
// (드로어를 닫았거나 언마운트 flush) 부모가 표시를 되돌리고 입력을 되살릴 책임을 진다.
// draft·initialError: 실패 뒤 다시 연 기록창이 입력과 원인을 그대로 보여 주게 한다. draft는
// 첫 상태에만 쓰고 저장 뒤 초기화는 preset 기준이다. initialError 없이 넘긴 draft는 호출처가
// 미리 채운 씨앗이다 — 같은 고객에 쓰던 초안이 있으면 초안이 이기고 씨앗은 빈 칸만 채운다.
// 모든 콜백은 두 번째 인자로 target을 받는다(선택) — 고른 고객으로 연 기록창에서도 부모가 누구의
// 기록인지 안다. undoMode="toast"면 저장을 누르는 즉시 창을 닫고 되돌리기를 토스트로 준다.
// onSending({ optimisticId }): 되돌리기 창이 닫혀 요청이 나가는 순간. onPartial({ activityId,
// optimisticId }): 요약은 저장됐고 긴 글(원문 · 자세히)만 실패했을 때 — 둘 다 부모의 기록 줄
// 영수증(기록 중 → 저장 중 → 저장됨 · 일부 저장)을 위한 것이고 선택이다.
// layout="wide"(넓은 기록창): children은 자세히 아래 흐르는 칸에 놓인다(호출처의 보조 입력).
// memo(넓은 기록창만): ({ saveRef, contactLine }) => 메모 칸. 주면 맨 위에 '연락 기록 | 메모'가 서고,
// mode="memo"일 때 그 칸이 요약 · 자세히 · 띠 자리를 대신한다. 모드는 호출처가 든다(mode · onModeChange) —
// 드로어 제목처럼 폼 밖의 것도 모드를 따라가야 해서다. saveRef.current에 메모 저장 함수를 두면 ⌘↵가 부른다.
// layout="sheet"(휴대폰 전체 높이 시트): 넓은 기록창과 같은 두 칸 · 같은 메모 모드에 아래 띠 대신 칩 줄.
// saveSlot: 주 버튼이 설 머리 자리(RecordPrimarySlot — undefined면 제자리). statusSlot: 쉬는 저장 줄 대신
// 초안이 놓인 곳('초안 · 이 탭')이 설 머리의 둘째 줄 자리 — 주면 시트의 저장 줄은 할 말(진행 · 빠진 칸 · 경고 ·
// 실패)이 있을 때만 키보드 위에 선다. away: 좁은 화면에서 '이 고객' 탭을
// 보는 중 — 기록 칸은 가려진 채 서 있고 아래 줄만 보인다. onReturn(): 그 줄의 '쓰기로 돌아가기'.
// onAttention(): 저장이 막혔거나(빠진 칸 · 빈 약속 경고) 실패해 기록 칸을 봐야 할 때 — 호출처가 쓰기 탭으로 돌린다.
export function ContactRecordForm({ target, preset, draft = null, onSaved, onUndone, onSending, onSummaryPersisted, onPartial, onPersisted, onFailed, onDone, autoFocus = false, aiContext = null, initialError = "", undoMode = "inline", layout = "compact", children = null, mode = "contact", onModeChange, memo = null, saveSlot, statusSlot, away = false, onReturn, onAttention }) {
  const toast = useToast();
  const sheet = layout === "sheet";
  // 넓은 기록창의 말과 규칙(두 칸 · 메모 모드 · 일부 저장 잠금 · 어디서나 ⌘↵)은 휴대폰 시트도 같다.
  const wide = layout === "wide" || sheet;
  // 메모 모드는 넓은 기록창(휴대폰 시트 포함)에서, 메모 칸을 준 호출처만 — 좁은 시트는 지금 그대로다.
  const memoAvailable = wide && typeof memo === "function";
  const memoMode = memoAvailable && normalizeRecordMode(mode) === "memo";
  // 앞서 누른 연락 기록의 답이 메모를 쓰는 중에 올 수 있다 — 그때 어느 모드였는지는 최신 값으로 읽는다.
  const memoModeRef = React.useRef(memoMode);
  memoModeRef.current = memoMode;
  const memoSaveRef = React.useRef(null);
  const noteCopy = wide ? RAW_NOTE_COPY.wide : RAW_NOTE_COPY.compact;
  const { form: presetForm, capture } = React.useMemo(() => splitPreset(preset), [preset]);
  const [recoveredRawNote] = React.useState(() => recallRawNote(target));
  // 쓰던 입력 — 실패 뒤 다시 연 창(draft + initialError)은 그 입력이 이긴다. 그 밖의 draft는
  // 호출처가 미리 채운 씨앗(했어요 · 기록의 약속 문구)이라, 쓰던 초안이 있으면 초안이 이긴다.
  const [opening] = React.useState(() => {
    const failed = Boolean(draft && initialError);
    const found = failed || recoveredRawNote ? null : readDraft(target);
    return { place: found?.place || null, ...openRecordDraft({ stored: found?.value || null, draft, failed }) };
  });
  const [storedDraft, setStoredDraft] = React.useState(opening.restored ? opening.values : null);
  // 초안이 놓이는 곳 — 저장된 고객이 아니면(id 없음) 초안을 두지 않으므로 아무 말도 하지 않는다.
  const [draftPlace, setDraftPlace] = React.useState(() => (target?.id ? opening.place || recordDraftStore.probe() : null));
  const [form, setForm] = React.useState(() => ({ ...baseForm(presetForm), ...(opening.values || {}), ...(recoveredRawNote ? { body: recoveredRawNote.body } : {}) }));
  // 씨앗만 얹은 첫 폼 — 운영자가 쓴 글이 아니므로 그대로면 초안으로 두지 않는다.
  const [seedForm] = React.useState(() => (opening.seeded ? form : null));
  const [state, setState] = React.useState(initialError || recoveredRawNote ? "error" : "idle"); // idle | warn | error
  const [errorMsg, setErrorMsg] = React.useState(recoveredRawNote ? noteCopy.failed : initialError || "");
  // 저장할 때마다 올린다 — AI 채우기 상자(자식 상태)를 새 기록에 맞게 비운다.
  const [recordSeq, setRecordSeq] = React.useState(0);
  // AI 응답은 몇 초 뒤에 온다. 그 사이 운영자가 고친 값을 클릭 시점 스냅샷으로 덮지 않도록
  // 최신 폼을 ref로 읽고, 반영은 함수형 업데이트로 한다.
  const formRef = React.useRef(form);
  formRef.current = form;
  const [showBody, setShowBody] = React.useState(!!recoveredRawNote || Boolean(storedDraft?.body));
  // 저장을 눌러 보기 전에는 필수 표시를 붉히지 않는다 — 빈 폼을 열자마자 꾸짖는 건 잔소리다.
  const [attempted, setAttempted] = React.useState(false);
  const [pendingUndo, setPendingUndo] = React.useState(null);
  // 요약 RPC 성공 뒤 원문 note만 실패하면, 같은 연락을 두 번 만들지 않고 note만 재시도한다.
  // summary는 이미 저장된 요약이다 — 넓은 기록창이 잠긴 칸에 그대로 보인다.
  const [pendingRawNote, setPendingRawNote] = React.useState(() => recoveredRawNote && {
    activityId: recoveredRawNote.activityId,
    optimisticId: recoveredRawNote.optimisticId,
    summary: recoveredRawNote.summary || "",
  });
  const [rawNoteSaving, setRawNoteSaving] = React.useState(false);
  // "언제"를 운영자가 직접 골랐는지 — 기본값(3일 뒤)만 남은 채 무엇이 비면 기약 없음으로 저장하고,
  // 직접 고른 날짜는 무엇이 비어도 날짜만 약속으로 남긴다(목업 경고 문구가 둘을 나눠 말한다).
  const [whenTouched, setWhenTouched] = React.useState(() => Boolean(draft || storedDraft || presetForm.at));
  const [datePicking, setDatePicking] = React.useState(false);
  // 휴대폰 시트 — 어떻게 · 반응 · 다음 약속 · 언제는 칩 줄 뒤에 접혀 있다가 칩을 누르면 펼쳐진다.
  const [fieldsOpen, setFieldsOpen] = React.useState(false);
  const howRef = React.useRef(null);
  const whenRef = React.useRef(null);
  const rootRef = React.useRef(null);
  const reactionRef = React.useRef(null);
  const summaryRef = React.useRef(null);
  const detailRef = React.useRef(null);
  const atRef = React.useRef(null);
  // 기록 소요 시간 — 시트는 연 순간부터, 인라인 폼은 첫 입력부터 잰다. 되살린 입력은 재지 않는다.
  const startedAtRef = React.useRef(null);
  const timingValidRef = React.useRef(!draft && !recoveredRawNote && !storedDraft);
  React.useEffect(() => {
    if (autoFocus && startedAtRef.current == null) startedAtRef.current = Date.now();
  }, [autoFocus]);

  // 쓰던 입력을 탭 안에 남긴다 — 프리셋(또는 미리 채운 씨앗) 그대로면(아무것도 안 썼으면) 남기지 않는다.
  // 저장한 입력은 reset()이 프리셋으로 되돌리므로 여기서 지워진다(되살아나 두 번 저장되지 않게).
  const untouched = sameDraft(form, baseForm(presetForm)) || Boolean(seedForm && sameDraft(form, seedForm));
  const targetDraftKey = draftKey(target);
  React.useEffect(() => {
    if (pendingRawNote) return;
    if (untouched) clearDraft(target);
    else {
      const place = writeDraft(target, form);
      if (place) setDraftPlace(place);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target은 키로만 비교한다(호출처가 매 렌더 새 객체를 넘긴다)
  }, [form, presetForm, targetDraftKey, pendingRawNote]);

  const edit = (patch) => {
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    setForm((f) => ({ ...f, ...patch }));
    if (pendingRawNote && Object.hasOwn(patch, "body")) {
      // 못 보낸 긴 글을 고치면 되살릴 사본도 따라간다(메모리 + 탭).
      const recovery = recallRawNote(target);
      if (recovery) holdRawNote(target, { ...recovery, body: patch.body }, { durable: true });
    }
    if (state === "warn") setState("idle");
  };
  const reset = () => {
    setForm(baseForm(presetForm));
    setShowBody(false); setState("idle"); setErrorMsg(""); setAttempted(false);
    setWhenTouched(Boolean(presetForm.at)); setDatePicking(false); setStoredDraft(null); setFieldsOpen(false);
    startedAtRef.current = autoFocus ? Date.now() : null;
    timingValidRef.current = true;
    setRecordSeq((n) => n + 1);
  };

  const wantsReaction = reactionRequired(form.kind, { replied: form.replied });
  const channel = CONTACT_CHANNELS.find((c) => c.key === form.kind);
  const channelOptions = SHEET_CHANNELS.some((c) => c.key === form.kind)
    ? SHEET_CHANNELS
    : [...SHEET_CHANNELS, { key: form.kind, label: channelLabel(form.kind) }];
  // 메모 모드가 있는 기록창에서는 '메모만'을 메모 모드가 대신한다(이미 골라 둔 값이면 남긴다).
  const wideChannelOptions = recordChannelOptions(channelOptions, form.kind, { memoMode: memoAvailable });

  // 다음 약속이 비었는가 — 비면 한 번 알린 뒤 기약 없음으로(직접 고른 날짜면 날짜만) 저장한다.
  const promiseEmpty = !String(form.nextAction || "").trim() && form.followup !== "dormant";
  const dateOnlyPromise = promiseEmpty && whenTouched && form.followup === "dated";
  const effective = promiseEmpty && !dateOnlyPromise ? { ...form, followup: "dormant", at: "" } : form;
  const check = validateContactRecord(effective);

  const whenKey = form.followup === "dormant"
    ? "dormant"
    : form.followup !== "dated"
      ? null
      : datePicking
        ? "date"
        : WHEN_PRESETS.find((p) => form.at === localDateAfter(p.days))?.key || (form.at ? "date" : null);
  const pickWhen = (key) => {
    setWhenTouched(true);
    if (key === "dormant") {
      setDatePicking(false);
      edit({ followup: "dormant", at: "" });
      return;
    }
    if (key === "date") {
      setDatePicking(true);
      edit({ followup: "dated" });
      requestAnimationFrame(() => atRef.current?.focus());
      return;
    }
    const preset = WHEN_PRESETS.find((p) => p.key === key);
    setDatePicking(false);
    edit({ followup: "dated", at: localDateAfter(preset?.days ?? 3) });
  };

  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();

  const restore = (snapshot) => setForm(snapshot.form);

  // 저장된 기록 행에 꼬리표 — 기록 소요 초·후보 출처·실제 연락 시각. 기록 자체는 이미 저장됐으므로
  // 이 요청의 실패가 저장 결과를 바꾸지 않는다. 다만 실제 연락 시각을 못 남기면 기록 시각이 저장
  // 시각으로 남는다는 사실은 말한다(주간 막대가 어느 날에 서는지가 달라진다).
  const annotate = (activityId, snapshot) => {
    const cap = snapshot.capture || {};
    const body = {
      action: "annotate-activity",
      activityId,
      occurredAt: cap.occurredAt || null,
      capture: {
        recordSeconds: snapshot.recordSeconds,
        source: cap.captureSource || "sheet",
        candidateId: cap.candidateId || null,
        durationSec: cap.durationSec ?? null,
      },
    };
    if (!activityId || (!body.occurredAt && body.capture.recordSeconds == null && !body.capture.candidateId)) return;
    fetch("/api/hub/followups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (d?.status !== "saved" && body.occurredAt) toast.error("기록은 저장됐지만 실제 연락 시각을 남기지 못했어요 — 저장한 시각으로 남아요.");
      })
      .catch(() => {
        if (body.occurredAt) toast.error("기록은 저장됐지만 실제 연락 시각을 남기지 못했어요 — 저장한 시각으로 남아요.");
      });
  };

  const persist = async (payload, snapshot) => {
    // 요청이 나간다 — 부모의 기록 줄이 "기록 중"(보내기 전)에서 "저장 중"으로 넘어간다.
    onSending?.({ optimisticId: snapshot.optimisticId }, target);
    try {
      const resp = await fetch("/api/hub/revenue/contact-outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.status !== "saved") {
        // 늦은 실패 — 입력 복원 + 원인 명명 (낙관 행 제거는 onUndone이 담당).
        // preview(백엔드 미구성)도 여기다: 저장되지 않았으므로 "기록됨"을 말하지 않는다.
        fail(snapshot, `${data.status === "preview" ? "Preview · 연결 필요 — 저장되지 않았습니다" : data.error || data.reason || "저장에 실패했습니다."} — 입력을 복원했습니다.`);
        return false;
      }
      onSummaryPersisted?.({ activityId: data.activityId || null, optimisticId: snapshot.optimisticId }, target);
      annotate(data.activityId || null, snapshot);
      // 붙여넣은 원문은 요약이 저장된 뒤에 별도 note로 남긴다. 아직 원자 저장이 아니라
      // (RPC v2는 1b) 이 단계가 실패해도 요약 기록은 이미 남아 있다 — 그 사실을 말해 준다.
      const note = buildRawNoteWrite(snapshot.form, target);
      let savedNote = null;
      if (note) {
        const held = {
          activityId: data.activityId || null,
          optimisticId: snapshot.optimisticId,
          summary: snapshot.form.summary,
          body: snapshot.form.body,
        };
        holdRawNote(target, held);
        const noteResp = await fetch("/api/hub/revenue/activity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(note),
        }).catch(() => null);
        const noteData = await noteResp?.json().catch(() => ({})) ?? {};
        if (!noteResp?.ok || noteData.status !== "saved") {
          // 실패가 확인됐다 — 이제 탭에도 둔다(새로고침해도 긴 글이 남는다).
          holdRawNote(target, held, { durable: true });
          setPendingRawNote({ activityId: held.activityId, optimisticId: held.optimisticId, summary: held.summary });
          // 기록은 생겼고 긴 글만 빠졌다 — 부모의 기록 줄은 "일부 저장"이다(저장됨이 아니다).
          onPartial?.({ activityId: data.activityId || null, optimisticId: snapshot.optimisticId }, target);
          setState("error");
          setErrorMsg(noteCopy.failed);
          setForm((f) => ({ ...f, body: snapshot.form.body }));
          setShowBody(true);
          // '이 고객' 탭을 보고 있었다면 쓰기로 돌린다 — 원인과 다시 저장은 기록 칸에 있다.
          onAttention?.();
          // 시트가 이미 닫혔으면(토스트 되돌리기) 여기서 말한다 — 같은 고객 기록창을 다시 열면 원문이 남아 있다.
          if (undoMode === "toast") toast.error(`${RAW_NOTE_ERROR} 같은 고객의 기록창을 다시 열면 원문이 남아 있어요.`);
          // 원문을 되살려 보여 줘야 하므로 창을 닫지 않는다.
          return false;
        }
        dropRawNote(target);
        savedNote = { id: noteData.id || null, body: note.body };
      }
      // note: 자세히가 따로 저장됐으면 그 줄(서버 ID · 본문)도 넘긴다 — 부모가 기록 줄기에 세운다.
      onPersisted?.({ activityId: data.activityId || null, optimisticId: snapshot.optimisticId, ...(savedNote ? { note: savedNote } : {}) }, target);
      return true;
    } catch (err) {
      fail(snapshot, `${err instanceof Error ? err.message : String(err)} — 입력을 복원했습니다.`);
      return false;
    }
  };

  const retryRawNote = async () => {
    if (!pendingRawNote || rawNoteSaving) return;
    const note = buildRawNoteWrite(form, target);
    if (!note) {
      setState("error");
      setErrorMsg(noteCopy.empty);
      // '이 고객' 탭에서 누른 다시 저장이면 쓰기로 돌린다 — 이유는 가려진 기록 칸에 있다.
      onAttention?.();
      return;
    }
    setRawNoteSaving(true);
    const recovery = recallRawNote(target);
    if (recovery) holdRawNote(target, { ...recovery, body: form.body }, { durable: true });
    try {
      const response = await fetch("/api/hub/revenue/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(note),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== "saved") throw new Error(data.error || data.reason || noteCopy.again);
      dropRawNote(target);
      onPersisted?.({ activityId: pendingRawNote.activityId, optimisticId: pendingRawNote.optimisticId, note: { id: data.id || null, body: note.body } }, target);
      setPendingRawNote(null);
      clearDraft(target);
      reset();
      onDone?.();
    } catch (error) {
      setState("error");
      setErrorMsg(`${error instanceof Error ? error.message : String(error)} — ${noteCopy.kept}`);
      // 다시 보낸 자세히도 실패했다 — 가려진 탭에서 조용히 묻히지 않게 쓰기로 돌린다(글은 그대로 있다).
      onAttention?.();
    } finally {
      setRawNoteSaving(false);
    }
  };

  const skipRawNote = () => {
    if (!pendingRawNote) return;
    dropRawNote(target);
    // 긴 글 없이 끝낸다 — 요약은 이미 저장돼 있으므로 기록 줄은 "저장됨"으로 풀린다(note 없음).
    onPersisted?.({ activityId: pendingRawNote.activityId, optimisticId: pendingRawNote.optimisticId }, target);
    setPendingRawNote(null);
    clearDraft(target);
    reset();
    onDone?.();
  };

  const fail = (snapshot, message) => {
    onUndone?.(snapshot.optimisticId, target);
    restore(snapshot);
    setState("error");
    setErrorMsg(message);
    onAttention?.();
    onFailed?.({ optimisticId: snapshot.optimisticId, message, form: snapshot.form, target });
  };

  const save = ({ ignoreWarning = false } = {}) => {
    if (!check.ok) {
      setAttempted(true);
      const focusMissing = () => {
        if (check.missing.includes("reaction")) reactionRef.current?.querySelector("button")?.focus();
        else if (check.missing.includes("summary")) summaryRef.current?.focus();
        else if (check.missing.includes("at")) atRef.current?.focus();
      };
      // 빠진 칸이 가려져 있으면 먼저 드러낸다 — 휴대폰 시트의 반응 · 날짜는 칩 줄 뒤에 접혀 있고, '이 고객'
      // 탭에서는 기록 칸 전체가 가려져 있다. 드러난 다음(한 프레임 뒤)에 커서를 둔다.
      const folded = sheet && !fieldsOpen && check.missing.some((key) => key !== "summary");
      if (folded) setFieldsOpen(true);
      onAttention?.();
      if (folded || away) requestAnimationFrame(focusMissing);
      else focusMissing();
      return;
    }
    if ((promiseEmpty || check.warn) && !ignoreWarning) {
      setState("warn");
      // 경고는 저장 줄에 선다 — '이 고객' 탭에서 누른 저장이면 쓰기로 돌아와 보인다.
      onAttention?.();
      return;
    }

    const optimisticId = `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const summary = form.summary.trim();
    const recordSeconds = timingValidRef.current && startedAtRef.current != null
      ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      : null;
    // 되돌리기·실패 복원은 운영자가 쓴 그대로(form)로, 저장은 빈 약속을 푼 값(effective)으로.
    const snapshot = { optimisticId, form: { ...form, summary }, capture, recordSeconds };
    const payload = buildContactRecordPayload({ ...effective, summary }, target);

    onSaved?.({
      activityId: optimisticId,
      kind: snapshot.form.kind,
      summary: snapshot.form.summary,
      reaction: payload.reaction || null,
      nextAction: payload.dormant ? "기약 없음 (휴면)" : payload.nextAction || "",
      dormant: payload.dormant,
    }, target);
    clearDraft(target);

    const key = `contact-${optimisticId}`;

    if (undoMode === "toast") {
      // 시트는 바로 닫고, 3.5초 되돌리기는 토스트가 든다. 문구는 "기록 중"이다 — 서버가 saved로
      // 답하기 전에 "저장됨"을 말하지 않는다(Save envelope). 확인은 onPersisted가 띄운다.
      scheduleDetached(key, () => { persist(payload, snapshot); });
      toast(`기록 중 · ${target?.name || "고객"}`, {
        id: key,
        duration: UNDO_WINDOW_MS,
        action: {
          label: "되돌리기",
          onClick: () => {
            if (!cancelDetached(key)) return; // 이미 보냈으면 되돌릴 수 없다
            onUndone?.(optimisticId, target);
            writeDraft(target, snapshot.form);
            toast("되돌렸어요 · 쓰던 내용은 기록창에 남아 있어요", { id: `${key}-undone` });
          },
        },
      });
      reset();
      onDone?.();
      return;
    }

    reset();
    scheduleUndoable(key, () => {
      // 되돌리기 창이 닫혔다 — 이제야 요청이 나간다. 답이 올 때까지는 "저장 중"이고
      // 되돌리기 버튼은 없다(죽은 버튼 방지).
      setPendingUndo((cur) => (cur?.key === key ? { key, phase: "sending", undo: null } : cur));
      // 저장이 확인된 뒤에만 닫는다 — 먼저 닫으면 늦은 실패의 입력 복원·원인 표시가
      // 사라진 컴포넌트에서 일어나 운영자에게 보이지 않는다.
      persist(payload, snapshot).then((ok) => {
        setPendingUndo((cur) => (cur?.key === key ? null : cur));
        // 그 사이 메모 모드로 옮겨 쓰고 있으면 창을 닫지 않는다 — 쓰던 메모 밑에서 창이 접히지 않게.
        if (ok && !memoModeRef.current) onDone?.();
      });
    });
    // 문구는 "기록 중"이다 — 이 3.5초 동안은 아무것도 보내지 않았다. "기록됨"은 서버가 saved로
    // 답한 뒤 호출처(onPersisted)가 말한다(Save envelope, 토스트 모드와 같은 말).
    setPendingUndo({
      key,
      phase: "pending",
      undo: () => {
        // 되돌리기는 진짜 취소다 — 창이 열려 있는 동안은 네트워크가 나가지 않았다.
        if (cancelUndoable(key)) {
          onUndone?.(optimisticId, target);
          restore(snapshot);
        }
        setPendingUndo(null);
      },
    });
  };

  const showMissing = attempted && !check.ok;

  const applyExtraction = (extracted) => {
    const { filled } = applyContactExtraction(formRef.current, extracted);
    setForm((f) => applyContactExtraction(f, extracted).form);
    setState((s) => (s === "warn" ? "idle" : s));
    if (extracted?.dormant || extracted?.nextAt) setWhenTouched(true);
    return filled;
  };

  const primaryAction = () => (pendingRawNote ? retryRawNote() : save({ ignoreWarning: state === "warn" }));

  // ⌘↵ / Ctrl+↵ 저장 — 한글 조합 중이면 조합을 끝내는 Enter이므로 무시한다(isSaveChord).
  const onKeyDown = (e) => {
    if (!isSaveChord(e)) return;
    // 호출처가 끼운 보조 입력(넓은 기록창의 children)의 ⌘↵는 그 입력의 것이다 — 연락 기록을 저장하지 않는다.
    if (e.target?.closest?.("[data-record-slot]")) return;
    // 메모 모드의 ⌘↵는 메모 저장이다 — 보이지 않는 연락 기록을 저장하지 않는다.
    if (memoMode) {
      e.preventDefault();
      memoSaveRef.current?.();
      return;
    }
    if (rawNoteSaving) return;
    e.preventDefault();
    primaryAction();
  };

  // 넓은 기록창의 ⌘↵는 어디서나 저장이다 — 읽기 칸의 기록 줄, 발판의 '고객 정보로', 빈 곳을 누른 뒤에도.
  // 폼 안에서 난 것은 위 onKeyDown이 이미 받았고, 위에 뜬 다른 창(⌘K 등)의 ⌘↵는 받지 않는다
  // (saveChordReachesRecord). 좁은 시트는 포커스 가둠 안이 전부 폼이라 창 리스너가 필요 없다.
  const saveChordRef = React.useRef(onKeyDown);
  saveChordRef.current = onKeyDown;
  React.useEffect(() => {
    if (!wide) return undefined;
    const onWindowKey = (e) => {
      const root = rootRef.current;
      if (!root || e.defaultPrevented) return;
      const shell = root.closest('[role="dialog"]');
      const reaches = saveChordReachesRecord({
        inForm: root.contains(e.target),
        inShell: Boolean(shell?.contains(e.target)),
        onBody: e.target === document.body,
      });
      if (reaches) saveChordRef.current(e);
    };
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  }, [wide]);

  // 요약 칸의 Enter는 저장이 아니라 자세히로 내려간다(넓은 기록창). 조합 중 Enter는 isPlainEnter가 거른다.
  const onSummaryKeyDown = (e) => {
    if (!isPlainEnter(e)) return;
    e.preventDefault();
    detailRef.current?.focus();
  };

  // 일부 저장 — 넓은 기록창은 이미 저장된 것(요약 · 어떻게 · 반응 · 약속)을 잠그고 자세히만 남긴다.
  // 여기서 새로 쓴 요약은 어디에도 가지 않으므로 받지 않는다. 커서는 다시 보낼 자세히로 옮긴다
  // (읽기 칸 등 기록 칸 밖을 보고 있었다면 건드리지 않는다).
  const locked = wide && Boolean(pendingRawNote);
  // 휴대폰 시트에서 칩 뒤 칸을 펼친 동안 자세히는 한 줄로 접힌다(가려질 뿐 — 글은 그대로).
  const folded = sheet && fieldsOpen && !locked;

  // 넓은 기록창의 자세히 — 쓰는 만큼 길어진다(useGrowingDetail). 메모 모드에서는 자세히 칸이 없고,
  // 돌아오면 칸이 다시 서므로 그때 다시 잰다. 가려진 동안('이 고객' 탭 · 접힌 자세히)은 재지 않고 —
  // 그 사이 되돌리기가 글을 되살려도 0을 높이로 적지 않는다 — 다시 보이는 순간과 배치가 바뀔 때 다시 잰다.
  useGrowingDetail(detailRef, wide && !memoMode && !away && !folded, form.body, layout);

  React.useEffect(() => {
    if (!locked) return;
    const active = document.activeElement;
    if (!active || active === document.body || rootRef.current?.contains(active)) detailRef.current?.focus();
  }, [locked]);

  const captureLine = describeCapture(capture);
  const warnCopy = dateOnlyPromise
    ? "무엇을 할지 비어 있어요 — 한 번 더 누르면 날짜만 약속으로 저장돼요."
    : "다음 약속이 비어 있어요 — 한 번 더 누르면 '기약 없음'으로 저장돼요.";
  // 초안은 운영자가 쓰기 시작한 순간부터 놓인다(위 effect) — 그 전에는 "어디에 남을지"만 말한다.
  // 쉬는 글자는 기록창으로 연 폼(autoFocus)만 보인다.
  const saveLine = recordSaveLine({
    pending: pendingUndo,
    showMissing,
    state,
    warnCopy,
    errorMsg,
    // 넓은 기록창은 실패를 레일 + 제목 한 곳으로 그린다 — 기록은 생겼고 긴 글만 빠졌으면 "일부 저장"이다.
    errorTitle: wide ? (pendingRawNote ? "일부 저장" : "저장 못 함") : "",
    draftHint: autoFocus ? draftHintCopy(draftPlace, { dirty: !untouched }) : "",
  });

  // 두 배치가 같이 쓰는 조각 — 배치가 달라도 글자와 동작은 하나다.
  const restoredLine = storedDraft && (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-muted)" }}>
      <Iconed name="edit" size={12} />
      <span style={{ flex: 1 }}>{draftRestoredCopy(draftPlace)}</span>
      <Button variant="ghost" size="xs" onClick={() => { clearDraft(target); reset(); }}>지우기</Button>
    </div>
  );
  const captureNote = captureLine && (
    <span style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>
      <span className="mono">{captureLine}</span> · 이 시각으로 기록돼요
    </span>
  );
  const pickChannel = (kind) => edit({ kind, ...(reactionRequired(kind) ? {} : { replied: false }) });
  // 발신 채널은 회신을 받았을 때만 반응을 묻는다 — 보낸 사실에 통화 결과를 붙이지 않는다.
  const replyToggle = channel?.promptsReply && (
    <CheckboxRow
      checked={form.replied}
      onChange={(replied) => edit({ replied, ...(replied ? {} : { reaction: null }) })}
      text="회신을 받았어요"
    />
  );
  const reactionMissing = attempted && !form.reaction;
  const dateError = attempted && !form.at ? "날짜를 고르거나 기약 없음을 선택하세요." : null;
  // 저장 줄 — 비활성 대신 항상 눌린다(왜 안 되는지 말하지 않는 죽은 버튼을 두지 않는다).
  // 주 버튼은 하나다: 제자리(저장 줄 끝)이거나, 휴대폰 시트에서는 호출처가 준 머리 자리다(RecordPrimarySlot).
  // 시트의 머리 버튼은 실패 뒤 '다시 저장'이라고 말한다 — 원인 줄이 키보드 위 칩 줄에 있어 버튼과 떨어져 있다.
  const saveStatus = (
    <>
      <RecordSaveLine line={saveLine} onUndo={pendingUndo?.undo} />
      {pendingRawNote && <Button variant="ghost" size="xs" onClick={skipRawNote} disabled={rawNoteSaving}>{noteCopy.skip}</Button>}
    </>
  );
  const savePrimary = (
    <RecordPrimarySlot slot={sheet ? saveSlot : undefined}>
      <Button variant="primary" size={wide ? "md" : "sm"} disabled={rawNoteSaving} onClick={primaryAction}>
        {pendingRawNote ? noteCopy.retry : sheet && state === "error" ? "다시 저장" : "저장"}
        {!pendingRawNote && !sheet && <Kbd style={{ background: "transparent", color: "inherit", borderColor: "currentColor", boxShadow: "none", opacity: 0.7 }}>⌘↵</Kbd>}
      </Button>
    </RecordPrimarySlot>
  );
  const saveControls = <>{saveStatus}{savePrimary}</>;
  // 휴대폰 시트의 쉬는 저장 줄 — 머리에 둘째 줄 자리(statusSlot)를 받았고 할 말이 없으면(진행 · 빠진 칸 ·
  // 경고 · 실패 · 일부 저장 없음) 키보드 위의 줄을 비운다: 남는 것은 칩 줄 하나다. 초안이 놓인 곳은 쓰기
  // 시작한 뒤에만 머리에 선다('초안 · 이 탭') — 아직 서버에 없다는 사실은 그 말이 한다.
  const primaryInHead = sheet && saveSlot !== undefined;
  const statusInHead = primaryInHead && statusSlot !== undefined && !pendingRawNote && recordSaveLineResting(saveLine);
  const headStatus = statusInHead && autoFocus && !untouched ? draftPlaceLabel(draftPlace) : "";

  // '이 고객' 탭을 보는 동안 기록 칸 자리에 남는 줄 — 쓰던 글이 몇 자인지와 돌아갈 길. 돌아오면 커서를 쓰던
  // 자리에 둔다(요약이 비었으면 요약, 아니면 자세히 — 칸이 다시 선 다음 프레임에).
  const returnToWriting = () => {
    onReturn?.();
    requestAnimationFrame(() => ((form.summary.trim() && !fieldsOpen && detailRef.current) || summaryRef.current || detailRef.current)?.focus());
  };
  const awayBar = away && (
    <RecordAwayBar
      label={recordAwayLabel({ mode: "contact", chars: recordDraftChars(form), dirty: !untouched })}
      progress={pendingUndo ? saveLine.progress : null}
      onUndo={pendingUndo?.undo}
      onReturn={returnToWriting}
    />
  );

  // 모드 전환(Q-CR6) — 쓰기 칸 맨 위 제자리. 머리 문장이 저장의 결과를 미리 말한다(recordModeSentence).
  // 연락 기록의 상태(쓰던 글 · 앞선 저장의 진행 · 실패 원인)는 모드를 오가도 이 폼에 그대로 남는다.
  const pickMode = (next) => {
    if (normalizeRecordMode(next) === (memoMode ? "memo" : "contact")) return;
    // 메모를 쓰다 돌아온 빈 연락 기록은 지금부터 잰다(기록 소요 시간에 메모 쓴 시간을 섞지 않는다).
    if (next === "contact" && untouched) startedAtRef.current = Date.now();
    onModeChange?.(normalizeRecordMode(next));
  };
  // 메모를 쓰는 동안 실패한 연락 기록의 이름("저장 못 함" · "일부 저장") — 전환 칸과 메모 칸 위의 원인 줄이 같이 쓴다.
  const contactIssue = state === "error" ? saveLine.note?.title || "" : "";
  const modeBar = memoAvailable && (
    <div className="record-wide__mode">
      {/* 이 창의 가장 큰 갈림이라 아래 띠의 칸(어떻게 · 반응)과 읽기 칸의 거르기보다 한 단계 크게 선다. */}
      <SegmentedControl
        label="무엇을 남기나"
        size="md"
        fill={sheet}
        options={recordModeOptions({ mode: memoMode ? "memo" : "contact", contactIssue })}
        value={memoMode ? "memo" : "contact"}
        onChange={pickMode}
      />
      <span className="record-wide__say" aria-live="polite">{recordModeSentence(memoMode ? "memo" : "contact")}</span>
    </div>
  );
  const rootClass = sheet ? "record-wide record-sheet" : "record-wide";

  // 메모 모드 — 같은 칸, 다른 기록. 요약 · 자세히 · 띠 자리를 호출처의 메모 칸이 대신한다(어떻게 · 반응 ·
  // 다음 약속 없음). 앞서 누른 연락 기록이 아직 가는 중이면 그 진행(기록 중 · 되돌리기 → 저장 중)을 메모 칸의
  // 띠 위에 그대로 보인다 — 모드를 옮겼다고 되돌리기가 사라지지 않는다. 그 연락 기록이 실패했으면 같은 자리에
  // 원인 줄(레일 + 제목)이 선다(memoModeContactNote) — 보이지 않는 모드의 저장 실패를 흐린 글자에만 두지 않는다.
  // 이 분기는 모든 훅 뒤에 있어야 한다 — 같은 폼이 두 모드를 오가므로 분기 아래에 훅을 두면 순서가 어긋난다.
  if (memoMode) {
    const contactNote = memoModeContactNote(contactIssue);
    // 같은 진행을 '이 고객' 탭의 돌아가기 줄도 보인다(contactProgress · onContactUndo) — 띠가 가려져 있어도
    // 3.5초 되돌리기가 닿는다.
    const contactProgress = pendingUndo && saveLine.progress ? { ...saveLine.progress, label: `연락 기록 · ${saveLine.progress.label}` } : null;
    const contactLine = contactProgress
      ? <div className="record-wide__save"><RecordSaveLine line={{ progress: contactProgress, note: null }} onUndo={pendingUndo.undo} /></div>
      : contactNote
        ? <div className="record-wide__save"><RecordSaveLine line={{ progress: null, note: contactNote }} /></div>
        : null;
    // 휴대폰 시트에서는 전환 칸이 메모 칸의 흐르는 칸 맨 위에 선다(head) — 키보드가 오른 좁은 높이를 제자리
    // 줄이 하나 더 차지하지 않게. 머리 자리의 주 버튼 · 가려진 동안의 줄 · 돌아가기도 메모 칸이 그린다.
    return (
      <div ref={rootRef} className={rootClass} data-record-mode="memo" data-away={away ? "true" : undefined} onKeyDown={onKeyDown}>
        {!sheet && modeBar}
        {memo({ saveRef: memoSaveRef, contactLine, contactProgress, onContactUndo: pendingUndo?.undo, sheet, head: sheet ? modeBar : null, saveSlot: sheet ? saveSlot : undefined, away, onReturn, onAttention })}
      </div>
    );
  }

  // 넓은 기록창 · 휴대폰 시트 — 요약 한 줄 + 자세히만 흐르고 그 아래는 제자리다: 넓은 기록창은 아래 띠
  // (어떻게 · 반응 · 다음 약속 · 언제 · 저장), 시트는 키보드 바로 위의 칩 줄. 자세히가 아무리 길어져도 저장 줄이
  // 화면 밖으로 밀리지 않는다. 두 배치는 한 나무다(같은 자리에 같은 칸 — 다른 것은 자리에 놓이는 것뿐이다):
  // 쓰는 중에 화면을 돌려 600px를 넘나들어도 글 칸이 다시 서지 않아 커서와 칸 높이가 그대로 남는다.
  if (wide) {
    const summaryField = locked ? (
      // 일부 저장 — 요약은 이미 기록에 남았다. 고칠 수 없는 칸으로 보이고, 새 글을 받지 않는다.
      <TextField
        label="요약 · 한 줄"
        readOnly
        value={pendingRawNote.summary || ""}
        placeholder="요약은 이미 기록에 남았어요"
        className="record-wide__summary"
        hint="이 요약은 이미 기록에 남았어요 · 자세히만 다시 저장하면 돼요"
      />
    ) : (
      <TextField
        ref={summaryRef}
        label="요약 · 한 줄"
        required
        autoFocus={autoFocus}
        value={form.summary}
        onChange={(e) => edit({ summary: e.target.value })}
        onKeyDown={onSummaryKeyDown}
        placeholder="예) 견적 받아보고 다음 주 원장회의에서 결정"
        maxLength={500}
        showCount
        className="record-wide__summary"
        hint="ClassIn에 옮길 수 있는 줄은 이것뿐이에요"
        error={attempted && !form.summary.trim() ? "요약이 없으면 나중에 이 기록을 읽을 수 없습니다." : null}
      />
    );
    // 숨어 있던 '원문 붙여넣기'를 늘 펼친 칸이다 — 같은 form.body, 같은 저장(요약 뒤 별도 note).
    const detailField = (
      <TextAreaField
        ref={detailRef}
        label="자세히"
        autoFocus={autoFocus && locked}
        value={form.body}
        // 휴대폰 시트는 여섯 줄에서 시작한다(키보드 위에 남는 높이) — 쓰는 만큼 길어지는 것은 같다.
        rows={sheet ? 6 : 10}
        onChange={(e) => edit({ body: e.target.value })}
        placeholder={"대화 내용, 상대가 중요하게 보는 것, 우려, 다음에 할 일.\n카톡 · 통화 받아쓰기를 붙여 넣어도 돼요. 비워 둬도 되고, 쓰는 만큼 칸이 길어져요."}
        maxLength={20000}
        showCount
        className="record-wide__detail"
        // 시트에서 칩 뒤 칸을 펼친 동안은 가린다 — 칸을 걷지 않으므로 글 · 커서 자리 · 칸 높이가 남는다.
        fieldStyle={folded ? { display: "none" } : undefined}
        hint={locked ? "아직 저장되지 않았어요 · 고친 뒤 다시 저장할 수 있어요" : "선택 · Moonlight에만 남아요 · 비워 두면 요약만 저장돼요"}
      />
    );
    const autofill = aiContext && !locked && <ContactAiAutofill key={recordSeq} target={target} aiContext={aiContext} onApply={applyExtraction} />;
    const slotted = children && <div data-record-slot="">{children}</div>;

    // 휴대폰 시트 — 아래 띠 대신 키보드 바로 위의 칩 줄이 어떻게 · 반응과 약속을 요약한다. 칩을 누르면 그
    // 칸들이 펼쳐지고 자세히는 한 줄로 접힌다(글은 그대로 — 칸을 걷지 않고 가릴 뿐이다). 저장은 머리 자리에
    // 선다. 일부 저장 중에는 넓은 기록창처럼 요약을 잠그고 자세히만 남긴다(칩 · 칸 없음).
    const lines = recordDetailLines(form.body);
    const closeFields = () => {
      setFieldsOpen(false);
      requestAnimationFrame(() => detailRef.current?.focus());
    };
    let bottom;
    if (sheet) {
      const chips = recordSheetChips(form, {
        kindLabel: channelOptions.find((c) => c.key === form.kind)?.label,
        whenLabel: WHEN_PRESETS.find((p) => p.key === whenKey)?.label,
      });
      // 칩은 버튼이라 누르면 글쓰기 칸에서 커서가 빠진다(키보드가 내려간다). 펼친 칸의 고른 값에 커서를 둔다 —
      // 글 칸이 아니라 키보드는 다시 오르지 않는다.
      const openFields = (key) => {
        setFieldsOpen(true);
        requestAnimationFrame(() => {
          const group = (key === "promise" ? whenRef : howRef).current;
          (group?.querySelector('button[aria-pressed="true"]') || group?.querySelector("button"))?.focus();
          group?.scrollIntoView?.({ block: "nearest" });
        });
      };
      const showChips = !locked && !fieldsOpen;
      // 줄은 둘까지다: 저장 줄(할 말이 있을 때만 — 쉬는 동안은 머리의 둘째 줄이 초안 자리를 말한다) + 칩 줄.
      // 둘 다 없으면(쉬는 중에 칸을 펼친 동안) 빈 띠를 남기지 않는다.
      bottom = (!statusInHead || showChips) && (
        <div key="bar" className="record-sheet__bar" role="group" aria-label={locked ? "자세히 다시 저장" : "저장 · 어떻게 · 반응 · 약속 요약"}>
          {!statusInHead && <div className="record-sheet__line">{saveStatus}{!primaryInHead && savePrimary}</div>}
          {showChips && (
            <div className="record-sheet__chips">
              {chips.map((chip) => (
                <Button key={chip.key} variant="outline" size="sm" iconRight="chevronD" aria-expanded={false} className="record-sheet__chip" onClick={() => openFields(chip.key)}>
                  <span className="record-sheet__chip-text">{chip.label}</span>
                  {chip.date && <span className="mono">{chip.date}</span>}
                </Button>
              ))}
            </div>
          )}
        </div>
      );
    } else {
      bottom = (
        <div key="band" className="record-wide__band" role="group" aria-label={locked ? "자세히 다시 저장" : "어떻게 · 반응 · 다음 약속 · 저장"}>
          {!locked && (
            <>
              <div className="record-wide__row">
                <span className="record-wide__k" aria-hidden="true">어떻게</span>
                <div className="record-wide__ctl">
                  <SegmentedControl label="어떻게 연락했나" options={wideChannelOptions} value={form.kind} onChange={pickChannel} style={{ flexWrap: "wrap" }} />
                  {replyToggle}
                  {wantsReaction && (
                    <span ref={reactionRef} className="record-wide__pair">
                      <span className="record-wide__k record-wide__k--in">반응 <small>필수</small></span>
                      <SegmentedControl
                        label="고객 반응"
                        options={REACTIONS.map((r) => ({ key: r.key, label: r.label }))}
                        value={form.reaction}
                        onChange={(reaction) => edit({ reaction })}
                        invalid={reactionMissing}
                        style={{ flexWrap: "wrap" }}
                      />
                      {reactionMissing && <span className="hub-field-msg hub-field-msg--error record-wide__msg" role="alert">반응을 하나 고르세요.</span>}
                    </span>
                  )}
                </div>
              </div>
              <div className="record-wide__row">
                <span className="record-wide__k" aria-hidden="true">다음 약속</span>
                <div className="record-wide__ctl">
                  <TextField
                    aria-label="다음 약속 · 무엇을"
                    value={form.nextAction}
                    onChange={(e) => edit({ nextAction: e.target.value })}
                    placeholder="무엇을 — 예) 견적서 보내기"
                    className="record-wide__field"
                    fieldClassName="record-wide__grow"
                  />
                </div>
              </div>
              <div className="record-wide__row">
                <span className="record-wide__k" aria-hidden="true">언제</span>
                <div className="record-wide__ctl">
                  <SegmentedControl label="언제" options={WHEN_OPTIONS} value={whenKey} onChange={pickWhen} style={{ flexWrap: "wrap" }} />
                  {whenKey === "date" && (
                    <TextField
                      ref={atRef}
                      aria-label="날짜"
                      required
                      type="date"
                      value={form.at}
                      onChange={(e) => edit({ at: e.target.value })}
                      className="mono record-wide__field"
                      fieldStyle={{ flex: "0 1 190px" }}
                      style={{ padding: "0 10px" }}
                      error={dateError}
                    />
                  )}
                </div>
              </div>
            </>
          )}
          <div className="record-wide__save">{saveControls}</div>
        </div>
      );
    }

    return (
      <div ref={rootRef} className={rootClass} data-away={away ? "true" : undefined} onKeyDown={onKeyDown}>
        {!sheet && modeBar}
        <div className="record-wide__scroll">
          {/* 전환 칸(연락 기록 | 메모)은 시트에서 흐르는 칸 맨 위에 선다 — 글을 쓰기 시작하면 위로 비킨다. */}
          {sheet && modeBar}
          {restoredLine}
          {captureNote}
          {summaryField}
          {folded && (
            <Button variant="outline" size="md" iconRight="chevronD" aria-expanded={false} onClick={closeFields} style={{ width: "100%", justifyContent: "space-between" }}>
              <span className="record-sheet__fold-text">{lines ? <>자세히 <span className="num">{lines}</span>줄 · 펼치기</> : "자세히 · 비어 있음 · 쓰기"}</span>
            </Button>
          )}
          {detailField}
          {folded && (
            <RecordSheetFields
              form={form}
              channelOptions={wideChannelOptions}
              wantsReaction={wantsReaction}
              reactionMissing={reactionMissing}
              replyToggle={replyToggle}
              whenKey={whenKey}
              dateError={dateError}
              onEdit={edit}
              onChannel={pickChannel}
              onWhen={pickWhen}
              refs={{ how: howRef, reaction: reactionRef, when: whenRef, at: atRef }}
            />
          )}
          {autofill}
          {slotted}
        </div>

        {bottom}
        {/* 머리의 주 버튼 · 초안 자리는 제자리(포털)에 선다 — 저장 줄이 섰다 걷혀도 버튼이 다시 서지 않는다(커서가 남는다). */}
        {primaryInHead && savePrimary}
        {headStatus && statusSlot ? createPortal(<span> · {headStatus}</span>, statusSlot) : null}
        {awayBar}
      </div>
    );
  }

  return (
    <div onKeyDown={onKeyDown} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {restoredLine}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SegmentedControl
          label="어떻게 연락했나"
          options={channelOptions}
          value={form.kind}
          onChange={pickChannel}
          size="md"
          style={{ flexWrap: "wrap", alignSelf: "flex-start" }}
        />
        {captureNote}
      </div>

      <TextField
        ref={summaryRef}
        label="무슨 얘기"
        required
        autoFocus={autoFocus}
        value={form.summary}
        onChange={(e) => edit({ summary: e.target.value })}
        placeholder="예) 견적 받아보고 다음 주 원장회의에서 결정"
        maxLength={500}
        hint="한 줄이면 충분해요"
        error={attempted && !form.summary.trim() ? "요약이 없으면 나중에 이 기록을 읽을 수 없습니다." : null}
      />

      {/* 붙여넣기는 선택 — 긴 원문을 요약으로 줄이라고 강요하지 않는다(CRM 지침 §1). */}
      {showBody ? (
        <TextAreaField
          label="원문 붙여넣기"
          value={form.body}
          rows={4}
          onChange={(e) => edit({ body: e.target.value })}
          placeholder="메시지·메모 원문을 그대로 붙여넣으세요"
          hint="요약과 별개로 메모 기록에 남습니다."
        />
      ) : (
        <Button variant="ghost" size="xs" icon="plus" onClick={() => setShowBody(true)} style={{ alignSelf: "flex-start" }}>
          원문 붙여넣기
        </Button>
      )}

      {aiContext && <ContactAiAutofill key={recordSeq} target={target} aiContext={aiContext} onApply={applyExtraction} />}

      {replyToggle}

      {wantsReaction && (
        <div ref={reactionRef}>
          <span className="hub-label">반응<span className="hub-label__req"> · 필수</span></span>
          <SegmentedControl
            label="고객 반응"
            options={REACTIONS.map((r) => ({ key: r.key, label: r.label }))}
            value={form.reaction}
            onChange={(reaction) => edit({ reaction })}
            size="md"
            invalid={reactionMissing}
            style={{ flexWrap: "wrap" }}
          />
          {reactionMissing && (
            <p className="hub-field-msg hub-field-msg--error" role="alert">반응을 하나 고르세요.</p>
          )}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 15, display: "flex", flexDirection: "column", gap: 10 }}>
        <TextField
          label="다음 약속"
          value={form.nextAction}
          onChange={(e) => edit({ nextAction: e.target.value })}
          placeholder="무엇을 — 예) 견적서 보내기"
        />
        <SegmentedControl
          label="언제"
          options={WHEN_OPTIONS}
          value={whenKey}
          onChange={pickWhen}
          size="md"
          style={{ flexWrap: "wrap", alignSelf: "flex-start" }}
        />
        {whenKey === "date" && (
          <TextField
            ref={atRef}
            label="날짜"
            required
            type="date"
            value={form.at}
            onChange={(e) => edit({ at: e.target.value })}
            className="mono"
            fieldStyle={{ maxWidth: 220 }}
            style={{ padding: "0 10px" }}
            error={dateError}
          />
        )}
      </div>

      {/* 메시지 줄은 높이를 예약한다 — 경고가 나타날 때 저장 버튼이 튀면 오조작난다.
          앞선 저장의 진행과 지금 폼에 대한 말이 겹칠 때만 두 줄이 된다(RecordSaveLine). */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--line-soft)", paddingTop: 15 }}>
        {saveControls}
      </div>
    </div>
  );
}

const TARGET_KIND_LABEL = { lead: "리드", deal: "거래", account: "계약 고객" };

// 대상 없이 연 기록창의 고객 고르기 — 이름·학원으로 찾는다. 검색어가 없으면 호출처가 준
// 제안(오늘 챙길 사람)을 먼저 보인다. 읽기 실패는 "찾는 고객 없음"으로 위장하지 않는다.
function ContactTargetPicker({ searchTargets, suggestions = [], initialQuery = "", onPick }) {
  const [query, setQuery] = React.useState(initialQuery);
  const [result, setResult] = React.useState({ status: "idle", targets: [] });
  const seqRef = React.useRef(0);

  React.useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResult({ status: "idle", targets: [] });
      return undefined;
    }
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setResult((r) => ({ ...r, status: "loading" }));
    const timer = setTimeout(async () => {
      let next;
      try {
        next = await searchTargets(term);
      } catch {
        next = { status: "error", targets: [] };
      }
      if (seqRef.current !== seq) return;
      setResult({ status: next?.status || "error", targets: Array.isArray(next?.targets) ? next.targets : [] });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, searchTargets]);

  const term = query.trim();
  const list = term ? result.targets : suggestions;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TextField
        label="고객"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름·학원 검색"
        maxLength={40}
      />
      {!term && suggestions.length > 0 && (
        <span className="hub-label" style={{ marginBottom: 0 }}>오늘 챙길 사람</span>
      )}
      {term && result.status === "loading" && <Skeleton lines={2} height={14} label="고객 찾는 중" />}
      {term && result.status === "error" && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--danger)" }}>
          <TruthBadge state="error" />
          고객 목록을 읽지 못했어요 — 없는 게 아니라 못 읽은 거예요. 다시 입력해 보세요.
        </div>
      )}
      {term && result.status === "preview" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-muted)" }}>
          <TruthBadge state="preview" />
          고객 데이터가 연결되지 않아 찾을 수 없어요.
        </div>
      )}
      {term && result.status === "partial" && <TruthBadge state="partial" reason="일부 목록만 찾았어요" style={{ alignSelf: "flex-start" }} />}
      {term && ["live", "partial"].includes(result.status) && list.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
          맞는 고객이 없어요 — 새 고객은 고객 탭에서 먼저 만들어 주세요.
        </div>
      )}
      {!term && suggestions.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--fg-dim)" }}>이름이나 학원 이름을 입력하세요.</div>
      )}
      {list.length > 0 && result.status !== "loading" && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {list.map((t) => (
            <li key={`${t.kind}:${t.id}`}>
              <button
                type="button"
                className="hub-row"
                onClick={() => onPick(t)}
                style={{
                  width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", border: 0, borderRadius: "var(--r-sm)", textAlign: "left",
                  color: "var(--fg)", font: "inherit", cursor: "pointer",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  {t.org && t.org !== t.name && <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>{t.org}</span>}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--fg-dim)", whiteSpace: "nowrap" }}>{TARGET_KIND_LABEL[t.kind] || ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 큐·목록·첫 화면에서 여는 껍데기. 상세 안에서는 이걸 쓰지 않고 폼만 인라인으로 쓴다.
// 새 prop(전부 선택): searchTargets(q) → { status, targets } 를 주면 대상 없이도 열리고 고객을
// 먼저 고른다(suggestions·initialQuery는 그 첫 화면). subtitle은 부제 덮어쓰기, aiContext는
// AI 채우기, undoMode는 되돌리기 위치("inline" 기본 · "toast").
export function ContactRecordDrawer({ target, preset, draft = null, onClose, onSaved, onUndone, onSummaryPersisted, onPersisted, onFailed, initialError = "", searchTargets = null, suggestions = [], initialQuery = "", subtitle = null, aiContext = null, undoMode = "inline" }) {
  const [picked, setPicked] = React.useState(null);
  const pickable = typeof searchTargets === "function";
  const effectiveTarget = target?.id ? target : picked;
  if (!effectiveTarget?.id && !pickable) return null;

  const channelSuffix = preset?.kind ? ` · ${channelLabel(preset.kind)}` : "";
  const defaultSubtitle = effectiveTarget
    ? `${effectiveTarget.name || "고객"}${effectiveTarget.org && effectiveTarget.org !== effectiveTarget.name ? ` · ${effectiveTarget.org}` : ""}${channelSuffix}`
    : "누구와 연락했나요?";

  return (
    <Drawer
      title="연락 기록"
      subtitle={target?.id && subtitle ? subtitle : defaultSubtitle}
      presentation="compact"
      width="min(520px, 96vw)"
      onClose={onClose}
    >
      {effectiveTarget?.id ? (
        <>
          {picked && !target?.id && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-muted)" }}>
              <Iconed name="leads" size={12} />
              <span style={{ flex: 1, minWidth: 0 }}>{picked.name}{picked.org && picked.org !== picked.name ? ` · ${picked.org}` : ""}</span>
              <Button variant="ghost" size="xs" onClick={() => setPicked(null)}>다른 고객</Button>
            </div>
          )}
          <ContactRecordForm
            key={`${effectiveTarget.kind || "lead"}:${effectiveTarget.id}`}
            target={effectiveTarget}
            preset={preset}
            draft={draft}
            autoFocus
            aiContext={aiContext}
            undoMode={undoMode}
            onSaved={onSaved}
            onUndone={onUndone}
            onSummaryPersisted={onSummaryPersisted}
            onPersisted={onPersisted}
            onFailed={onFailed}
            initialError={initialError}
            onDone={onClose}
          />
        </>
      ) : (
        <ContactTargetPicker
          searchTargets={searchTargets}
          suggestions={suggestions}
          initialQuery={initialQuery}
          onPick={setPicked}
        />
      )}
    </Drawer>
  );
}
