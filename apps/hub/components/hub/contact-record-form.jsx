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
// 드로어 껍데기는 ContactRecordDrawer가 씌운다. 상세 안에서는 오버레이를 겹치지 않으려고
// 폼만 인라인으로 쓴다(CRM 지침 §6.2 — 활성 오버레이는 언제나 하나).
//
// pages/revenue.jsx를 import하지 않는다: 그 모듈은 자체 lazy 청크라 정적 교차 import 하나가
// Leads/Deals/Accounts 전체를 이 청크로 끌고 온다(followups.jsx가 같은 이유로 상수를 복제).

import React from "react";
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
  reactionRequired,
  validateContactRecord,
} from "@/lib/sales-os/contact-record";

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
const rawNoteRecoveries = new Map();
const rawNoteKey = (target) => JSON.stringify([target?.kind || "lead", target?.id || ""]);
const RAW_NOTE_ERROR = "요약은 저장됐지만 원문은 저장하지 못했습니다. 원문만 다시 저장하거나 복사해 두세요.";

// 쓰던 입력 — 닫아도 같은 탭에서 되살린다(스펙 §4.3 신뢰 계약 ②, 키 crm-record:<종류>:<id>).
// sessionStorage가 막힌 창(사생활 보호 등)에서는 이 앱이 열려 있는 동안만 기억한다.
const DRAFT_FIELDS = ["kind", "reaction", "replied", "summary", "body", "nextAction", "at", "followup"];
const draftMemory = new Map();
const draftKey = (target) => `crm-record:${target?.kind || "lead"}:${target?.id || ""}`;

function pickDraft(form) {
  return Object.fromEntries(DRAFT_FIELDS.map((key) => [key, form?.[key] ?? EMPTY_FORM[key]]));
}

function sameDraft(a, b) {
  return DRAFT_FIELDS.every((key) => (a?.[key] ?? EMPTY_FORM[key]) === (b?.[key] ?? EMPTY_FORM[key]));
}

function readDraft(target) {
  if (!target?.id) return null;
  const key = draftKey(target);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* 저장소가 막혀도 메모리 사본으로 계속한다 */
  }
  return draftMemory.get(key) || null;
}

function writeDraft(target, form) {
  if (!target?.id) return;
  const key = draftKey(target);
  const value = pickDraft(form);
  draftMemory.set(key, value);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 메모리 사본이 남는다 */
  }
}

function clearDraft(target) {
  if (!target?.id) return;
  const key = draftKey(target);
  draftMemory.delete(key);
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* 무시 — 메모리 사본은 이미 지웠다 */
  }
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

// onSummaryPersisted: 연락 요약 RPC가 저장된 즉시 불린다 — 낙관 행을 서버 ID로 바꾼다.
// onPersisted: 선택 원문까지 저장되거나 운영자가 건너뛴 뒤 불린다 — "기록됨" 확인은 여기서 띄운다.
// onFailed({ optimisticId, message, form }): 늦은 실패. 폼이 이미 언마운트됐을 수 있으므로
// (드로어를 닫았거나 언마운트 flush) 부모가 표시를 되돌리고 입력을 되살릴 책임을 진다.
// draft·initialError: 실패 뒤 다시 연 기록창이 입력과 원인을 그대로 보여 주게 한다. draft는
// 첫 상태에만 쓰고 저장 뒤 초기화는 preset 기준이다.
// 모든 콜백은 두 번째 인자로 target을 받는다(선택) — 고른 고객으로 연 기록창에서도 부모가 누구의
// 기록인지 안다. undoMode="toast"면 저장을 누르는 즉시 창을 닫고 되돌리기를 토스트로 준다.
export function ContactRecordForm({ target, preset, draft = null, onSaved, onUndone, onSummaryPersisted, onPersisted, onFailed, onDone, autoFocus = false, aiContext = null, initialError = "", undoMode = "inline" }) {
  const toast = useToast();
  const { form: presetForm, capture } = React.useMemo(() => splitPreset(preset), [preset]);
  const [recoveredRawNote] = React.useState(() => rawNoteRecoveries.get(rawNoteKey(target)) || null);
  // 쓰던 입력 — 호출처가 draft를 넘기지 않았을 때만 되살린다(실패 뒤 다시 연 창은 그 draft가 이긴다).
  const [storedDraft, setStoredDraft] = React.useState(() => (draft || recoveredRawNote ? null : readDraft(target)));
  const [form, setForm] = React.useState(() => ({ ...baseForm(presetForm), ...(storedDraft || {}), ...(draft || {}), ...(recoveredRawNote ? { body: recoveredRawNote.body } : {}) }));
  const [state, setState] = React.useState(initialError || recoveredRawNote ? "error" : "idle"); // idle | warn | error
  const [errorMsg, setErrorMsg] = React.useState(recoveredRawNote ? RAW_NOTE_ERROR : initialError || "");
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
  const [pendingRawNote, setPendingRawNote] = React.useState(() => recoveredRawNote && {
    activityId: recoveredRawNote.activityId,
    optimisticId: recoveredRawNote.optimisticId,
  });
  const [rawNoteSaving, setRawNoteSaving] = React.useState(false);
  // "언제"를 운영자가 직접 골랐는지 — 기본값(3일 뒤)만 남은 채 무엇이 비면 기약 없음으로 저장하고,
  // 직접 고른 날짜는 무엇이 비어도 날짜만 약속으로 남긴다(목업 경고 문구가 둘을 나눠 말한다).
  const [whenTouched, setWhenTouched] = React.useState(() => Boolean(draft || storedDraft || presetForm.at));
  const [datePicking, setDatePicking] = React.useState(false);
  const reactionRef = React.useRef(null);
  const summaryRef = React.useRef(null);
  const atRef = React.useRef(null);
  // 기록 소요 시간 — 시트는 연 순간부터, 인라인 폼은 첫 입력부터 잰다. 되살린 입력은 재지 않는다.
  const startedAtRef = React.useRef(null);
  const timingValidRef = React.useRef(!draft && !recoveredRawNote && !storedDraft);
  React.useEffect(() => {
    if (autoFocus && startedAtRef.current == null) startedAtRef.current = Date.now();
  }, [autoFocus]);

  // 쓰던 입력을 탭 안에 남긴다 — 프리셋 그대로면(아무것도 안 썼으면) 남기지 않는다.
  // 저장한 입력은 reset()이 프리셋으로 되돌리므로 여기서 지워진다(되살아나 두 번 저장되지 않게).
  const targetDraftKey = draftKey(target);
  React.useEffect(() => {
    if (pendingRawNote) return;
    if (sameDraft(form, baseForm(presetForm))) clearDraft(target);
    else writeDraft(target, form);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target은 키로만 비교한다(호출처가 매 렌더 새 객체를 넘긴다)
  }, [form, presetForm, targetDraftKey, pendingRawNote]);

  const edit = (patch) => {
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    setForm((f) => ({ ...f, ...patch }));
    if (pendingRawNote && Object.hasOwn(patch, "body")) {
      const key = rawNoteKey(target);
      const recovery = rawNoteRecoveries.get(key);
      if (recovery) rawNoteRecoveries.set(key, { ...recovery, body: patch.body });
    }
    if (state === "warn") setState("idle");
  };
  const reset = () => {
    setForm(baseForm(presetForm));
    setShowBody(false); setState("idle"); setErrorMsg(""); setAttempted(false);
    setWhenTouched(Boolean(presetForm.at)); setDatePicking(false); setStoredDraft(null);
    startedAtRef.current = autoFocus ? Date.now() : null;
    timingValidRef.current = true;
    setRecordSeq((n) => n + 1);
  };

  const wantsReaction = reactionRequired(form.kind, { replied: form.replied });
  const channel = CONTACT_CHANNELS.find((c) => c.key === form.kind);
  const channelOptions = SHEET_CHANNELS.some((c) => c.key === form.kind)
    ? SHEET_CHANNELS
    : [...SHEET_CHANNELS, { key: form.kind, label: channelLabel(form.kind) }];

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
      if (note) {
        rawNoteRecoveries.set(rawNoteKey(target), {
          activityId: data.activityId || null,
          optimisticId: snapshot.optimisticId,
          body: snapshot.form.body,
        });
        const noteResp = await fetch("/api/hub/revenue/activity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(note),
        }).catch(() => null);
        const noteData = await noteResp?.json().catch(() => ({})) ?? {};
        if (!noteResp?.ok || noteData.status !== "saved") {
          setPendingRawNote({ activityId: data.activityId || null, optimisticId: snapshot.optimisticId });
          setState("error");
          setErrorMsg(RAW_NOTE_ERROR);
          setForm((f) => ({ ...f, body: snapshot.form.body }));
          setShowBody(true);
          // 시트가 이미 닫혔으면(토스트 되돌리기) 여기서 말한다 — 같은 고객 기록창을 다시 열면 원문이 남아 있다.
          if (undoMode === "toast") toast.error(`${RAW_NOTE_ERROR} 같은 고객의 기록창을 다시 열면 원문이 남아 있어요.`);
          // 원문을 되살려 보여 줘야 하므로 창을 닫지 않는다.
          return false;
        }
        rawNoteRecoveries.delete(rawNoteKey(target));
      }
      onPersisted?.({ activityId: data.activityId || null, optimisticId: snapshot.optimisticId }, target);
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
      setErrorMsg("다시 저장할 원문을 입력하세요.");
      return;
    }
    setRawNoteSaving(true);
    const key = rawNoteKey(target);
    const recovery = rawNoteRecoveries.get(key);
    if (recovery) rawNoteRecoveries.set(key, { ...recovery, body: form.body });
    try {
      const response = await fetch("/api/hub/revenue/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(note),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== "saved") throw new Error(data.error || data.reason || "원문 저장 실패");
      rawNoteRecoveries.delete(key);
      onPersisted?.(pendingRawNote, target);
      setPendingRawNote(null);
      clearDraft(target);
      reset();
      onDone?.();
    } catch (error) {
      setState("error");
      setErrorMsg(`${error instanceof Error ? error.message : String(error)} — 원문은 이 창에 남아 있습니다.`);
    } finally {
      setRawNoteSaving(false);
    }
  };

  const skipRawNote = () => {
    if (!pendingRawNote) return;
    rawNoteRecoveries.delete(rawNoteKey(target));
    onPersisted?.(pendingRawNote, target);
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
    onFailed?.({ optimisticId: snapshot.optimisticId, message, form: snapshot.form, target });
  };

  const save = ({ ignoreWarning = false } = {}) => {
    if (!check.ok) {
      setAttempted(true);
      if (check.missing.includes("reaction")) reactionRef.current?.querySelector("button")?.focus();
      else if (check.missing.includes("summary")) summaryRef.current?.focus();
      else if (check.missing.includes("at")) atRef.current?.focus();
      return;
    }
    if ((promiseEmpty || check.warn) && !ignoreWarning) {
      setState("warn");
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
      setPendingUndo((cur) => (cur?.key === key ? null : cur)); // 창 닫힘 — 죽은 버튼 방지
      // 저장이 확인된 뒤에만 닫는다 — 먼저 닫으면 늦은 실패의 입력 복원·원인 표시가
      // 사라진 컴포넌트에서 일어나 운영자에게 보이지 않는다.
      persist(payload, snapshot).then((ok) => { if (ok) onDone?.(); });
    });
    setPendingUndo({
      key,
      label: "기록됨",
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

  // ⌘↵ / Ctrl+↵ 저장 — 한글 조합 중이면 조합을 끝내는 Enter이므로 무시한다.
  const onKeyDown = (e) => {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.nativeEvent?.isComposing) return;
    if (rawNoteSaving) return;
    e.preventDefault();
    primaryAction();
  };

  const captureLine = describeCapture(capture);
  const warnCopy = dateOnlyPromise
    ? "무엇을 할지 비어 있어요 — 한 번 더 누르면 날짜만 약속으로 저장돼요."
    : "다음 약속이 비어 있어요 — 한 번 더 누르면 '기약 없음'으로 저장돼요.";

  return (
    <div onKeyDown={onKeyDown} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {storedDraft && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-muted)" }}>
          <Iconed name="edit" size={12} />
          <span style={{ flex: 1 }}>쓰던 내용을 불러왔어요</span>
          <Button variant="ghost" size="xs" onClick={() => { clearDraft(target); reset(); }}>지우기</Button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SegmentedControl
          label="어떻게 연락했나"
          options={channelOptions}
          value={form.kind}
          onChange={(kind) => edit({ kind, ...(reactionRequired(kind) ? {} : { replied: false }) })}
          size="md"
          style={{ flexWrap: "wrap", alignSelf: "flex-start" }}
        />
        {captureLine && (
          <span style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>
            <span className="mono">{captureLine}</span> · 이 시각으로 기록돼요
          </span>
        )}
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

      {/* 발신 채널은 회신을 받았을 때만 반응을 묻는다 — 보낸 사실에 통화 결과를 붙이지 않는다. */}
      {channel?.promptsReply && (
        <CheckboxRow
          checked={form.replied}
          onChange={(replied) => edit({ replied, ...(replied ? {} : { reaction: null }) })}
          text="회신을 받았어요"
        />
      )}

      {wantsReaction && (
        <div ref={reactionRef}>
          <span className="hub-label">반응<span className="hub-label__req"> · 필수</span></span>
          <SegmentedControl
            label="고객 반응"
            options={REACTIONS.map((r) => ({ key: r.key, label: r.label }))}
            value={form.reaction}
            onChange={(reaction) => edit({ reaction })}
            size="md"
            invalid={attempted && !form.reaction}
            style={{ flexWrap: "wrap" }}
          />
          {attempted && !form.reaction && (
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
            error={attempted && !form.at ? "날짜를 고르거나 기약 없음을 선택하세요." : null}
          />
        )}
      </div>

      {/* 메시지 줄은 높이를 예약한다 — 경고가 나타날 때 저장 버튼이 튀면 오조작난다. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--line-soft)", paddingTop: 15 }}>
        <div style={{ flex: "1 1 200px", minWidth: 0, fontSize: 12, lineHeight: 1.45, minHeight: 18 }}>
          {showMissing && <span role="alert" style={{ color: "var(--fg-muted)" }}>위 필수 항목을 채우면 저장됩니다.</span>}
          {!showMissing && state === "warn" && (
            <span role="status" style={{ color: "var(--fg-muted)" }}>{warnCopy}</span>
          )}
          {!showMissing && state === "error" && <span role="alert" style={{ color: "var(--danger)" }}>{errorMsg}</span>}
          {pendingUndo && (
            <span role="status" aria-live="polite" style={{ color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {pendingUndo.label}
              <Button variant="ghost" size="xs" onClick={pendingUndo.undo}>되돌리기</Button>
            </span>
          )}
          {!showMissing && state === "idle" && !pendingUndo && autoFocus && (
            <span style={{ color: "var(--fg-dim)" }}>입력은 닫아도 남아요</span>
          )}
        </div>
        {/* 비활성 대신 항상 눌린다 — 왜 안 되는지 말하지 않는 죽은 버튼을 두지 않는다. */}
        {pendingRawNote && <Button variant="ghost" size="xs" onClick={skipRawNote} disabled={rawNoteSaving}>원문 저장 건너뛰기</Button>}
        <Button variant="primary" size="sm" disabled={rawNoteSaving} onClick={primaryAction}>
          {pendingRawNote ? "원문 저장 재시도" : "저장"}
          {!pendingRawNote && <Kbd style={{ background: "transparent", color: "inherit", borderColor: "currentColor", boxShadow: "none", opacity: 0.7 }}>⌘↵</Kbd>}
        </Button>
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
