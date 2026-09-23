"use client";

// 연락 기록 폼 — 큐·고객 목록·첫 화면·고객 상세가 공유하는 단 하나의 기록창(스펙 §4.3).
//
// 이전에는 같은 최소 기록을 세 곳이 각자 그렸다: 고객 DB의 컨택 완료 시트, 고객 연락의
// 인라인 LogForm, 상세의 QuickLog. 진입점에 따라 필수 필드도 되돌리기 유무도 달랐다.
// 여기서 하나로 모으되 기존 저장 계약은 그대로 지킨다 — 즉시 반영 + 3.5초 되돌리기,
// 창이 닫히면 POST, 늦은 실패 시 입력 복원 + 원인 명명.
//
// 드로어 껍데기는 ContactRecordDrawer가 씌운다. 상세 안에서는 오버레이를 겹치지 않으려고
// 폼만 인라인으로 쓴다(CRM 지침 §6.2 — 활성 오버레이는 언제나 하나).
//
// pages/revenue.jsx를 import하지 않는다: 그 모듈은 자체 lazy 청크라 정적 교차 import 하나가
// Leads/Deals/Accounts 전체를 이 청크로 끌고 온다(followups.jsx가 같은 이유로 상수를 복제).

import React from "react";
import { Button, CheckboxRow, DateQuickPresets, Drawer, SegmentedControl, TextAreaField, TextField } from "./hub-primitives";
import { useUndoableAction } from "./use-undoable-action";
import { Iconed } from "./hub-icons";
import { requestPersonaChat } from "./persona-client";
import { parseContactOutcomeExtraction } from "@/lib/ai-workflow-client";
import {
  CONTACT_CHANNELS,
  FOLLOWUP_MODES,
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

// 드로어가 닫혀 폼이 언마운트돼도, 현재 열린 앱에서 미저장 원문을 다시 보여 준다.
const rawNoteRecoveries = new Map();
const rawNoteKey = (target) => JSON.stringify([target?.kind || "lead", target?.id || ""]);
const RAW_NOTE_ERROR = "요약은 저장됐지만 원문은 저장하지 못했습니다. 원문만 다시 저장하거나 복사해 두세요.";

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
export function ContactRecordForm({ target, preset, draft = null, onSaved, onUndone, onSummaryPersisted, onPersisted, onFailed, onDone, autoFocus = false, aiContext = null, initialError = "" }) {
  const [recoveredRawNote] = React.useState(() => rawNoteRecoveries.get(rawNoteKey(target)) || null);
  const [form, setForm] = React.useState(() => ({ ...EMPTY_FORM, ...(preset || {}), ...(draft || {}), ...(recoveredRawNote ? { body: recoveredRawNote.body } : {}) }));
  const [state, setState] = React.useState(initialError || recoveredRawNote ? "error" : "idle"); // idle | warn | error
  const [errorMsg, setErrorMsg] = React.useState(recoveredRawNote ? RAW_NOTE_ERROR : initialError || "");
  // 저장할 때마다 올린다 — AI 채우기 상자(자식 상태)를 새 기록에 맞게 비운다.
  const [recordSeq, setRecordSeq] = React.useState(0);
  // AI 응답은 몇 초 뒤에 온다. 그 사이 운영자가 고친 값을 클릭 시점 스냅샷으로 덮지 않도록
  // 최신 폼을 ref로 읽고, 반영은 함수형 업데이트로 한다.
  const formRef = React.useRef(form);
  formRef.current = form;
  const [showBody, setShowBody] = React.useState(!!recoveredRawNote);
  // 저장을 눌러 보기 전에는 필수 표시를 붉히지 않는다 — 빈 폼을 열자마자 꾸짖는 건 잔소리다.
  const [attempted, setAttempted] = React.useState(false);
  const [pendingUndo, setPendingUndo] = React.useState(null);
  // 요약 RPC 성공 뒤 원문 note만 실패하면, 같은 연락을 두 번 만들지 않고 note만 재시도한다.
  const [pendingRawNote, setPendingRawNote] = React.useState(() => recoveredRawNote && {
    activityId: recoveredRawNote.activityId,
    optimisticId: recoveredRawNote.optimisticId,
  });
  const [rawNoteSaving, setRawNoteSaving] = React.useState(false);
  const reactionRef = React.useRef(null);
  const summaryRef = React.useRef(null);
  const atRef = React.useRef(null);

  const edit = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    if (pendingRawNote && Object.hasOwn(patch, "body")) {
      const key = rawNoteKey(target);
      const recovery = rawNoteRecoveries.get(key);
      if (recovery) rawNoteRecoveries.set(key, { ...recovery, body: patch.body });
    }
    if (state === "warn") setState("idle");
  };
  const reset = () => {
    setForm({ ...EMPTY_FORM, ...(preset || {}) });
    setShowBody(false); setState("idle"); setErrorMsg(""); setAttempted(false);
    setRecordSeq((n) => n + 1);
  };

  const wantsReaction = reactionRequired(form.kind, { replied: form.replied });
  const channel = CONTACT_CHANNELS.find((c) => c.key === form.kind);
  const check = validateContactRecord(form);

  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();

  const restore = (snapshot) => setForm(snapshot.form);

  const persist = async (payload, snapshot) => {
    try {
      const resp = await fetch("/api/hub/revenue/contact-outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.status !== "saved") {
        // 늦은 실패 — 입력 복원 + 원인 명명 (낙관 행 제거는 onUndone이 담당)
        fail(snapshot, `${data.error || data.reason || "저장에 실패했습니다."} — 입력을 복원했습니다.`);
        return false;
      }
      onSummaryPersisted?.({ activityId: data.activityId || null, optimisticId: snapshot.optimisticId });
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
          // 원문을 되살려 보여 줘야 하므로 창을 닫지 않는다.
          return false;
        }
        rawNoteRecoveries.delete(rawNoteKey(target));
      }
      onPersisted?.({ activityId: data.activityId || null, optimisticId: snapshot.optimisticId });
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
      onPersisted?.(pendingRawNote);
      setPendingRawNote(null);
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
    onPersisted?.(pendingRawNote);
    setPendingRawNote(null);
    reset();
    onDone?.();
  };

  const fail = (snapshot, message) => {
    onUndone?.(snapshot.optimisticId);
    restore(snapshot);
    setState("error");
    setErrorMsg(message);
    onFailed?.({ optimisticId: snapshot.optimisticId, message, form: snapshot.form });
  };

  const save = ({ ignoreWarning = false } = {}) => {
    if (!check.ok) {
      setAttempted(true);
      if (check.missing.includes("reaction")) reactionRef.current?.querySelector("button")?.focus();
      else if (check.missing.includes("summary")) summaryRef.current?.focus();
      else if (check.missing.includes("at")) atRef.current?.focus();
      return;
    }
    if (check.warn && !ignoreWarning) {
      setState("warn");
      return;
    }

    const optimisticId = `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const snapshot = { optimisticId, form: { ...form, summary: form.summary.trim() } };
    const payload = buildContactRecordPayload(snapshot.form, target);

    onSaved?.({
      activityId: optimisticId,
      kind: snapshot.form.kind,
      summary: snapshot.form.summary,
      reaction: payload.reaction || null,
      nextAction: payload.dormant ? "기약 없음 (휴면)" : payload.nextAction || "",
      dormant: payload.dormant,
    });
    reset();

    const key = `contact-${optimisticId}`;
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
          onUndone?.(optimisticId);
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
    return filled;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {aiContext && <ContactAiAutofill key={recordSeq} target={target} aiContext={aiContext} onApply={applyExtraction} />}

      <SegmentedControl
        label="채널"
        options={CONTACT_CHANNELS.map((c) => ({ key: c.key, label: c.label }))}
        value={form.kind}
        onChange={(kind) => edit({ kind, ...(reactionRequired(kind) ? {} : { replied: false }) })}
        style={{ flexWrap: "wrap" }}
      />

      <TextField
        ref={summaryRef}
        label="한 줄 요약"
        required
        autoFocus={autoFocus}
        value={form.summary}
        onChange={(e) => edit({ summary: e.target.value })}
        placeholder="무슨 얘기가 오갔는지 한 줄"
        maxLength={500}
        hint="예) 결정권자 참석 합의, 계약 조건 이견 없음"
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
          <span className="hub-label">고객 반응<span className="hub-label__req"> · 필수</span></span>
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

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 15, display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-dim)" }}>다음 단계</div>

        <SegmentedControl
          label="후속 계획"
          options={FOLLOWUP_MODES.map((m) => ({ key: m.key, label: m.label }))}
          value={form.followup}
          onChange={(followup) => edit({ followup, ...(followup === "dated" ? {} : { at: "" }) })}
        />

        <TextField
          label="다음 행동"
          value={form.nextAction}
          onChange={(e) => edit({ nextAction: e.target.value })}
          placeholder="계약서 발송"
        />

        {form.followup === "dated" && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <TextField
              ref={atRef}
              label="날짜"
              required
              type="date"
              value={form.at}
              onChange={(e) => edit({ at: e.target.value })}
              className="mono"
              fieldStyle={{ flex: "1 1 170px" }}
              style={{ padding: "0 10px" }}
              error={attempted && !form.at ? "날짜를 고르거나 기약 없음을 선택하세요." : null}
            />
            {/* date picker 반복 마찰 제거 — 최고 빈도 액션이라 프리셋 1클릭. */}
            <DateQuickPresets onPick={(at) => edit({ at })} style={{ flexWrap: "wrap", gap: 4, paddingBottom: 1 }} />
          </div>
        )}
      </div>

      {/* 메시지 줄은 높이를 예약한다 — 경고가 나타날 때 저장 버튼이 튀면 오조작난다. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid var(--line-soft)", paddingTop: 15 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.45, minHeight: 18 }}>
          {showMissing && <span role="alert" style={{ color: "var(--fg-muted)" }}>위 필수 항목을 채우면 저장됩니다.</span>}
          {!showMissing && state === "warn" && (
            <span style={{ color: "var(--fg-muted)" }}>다음 행동이 비어 있습니다. 그래도 저장하려면 한 번 더 누르세요.</span>
          )}
          {!showMissing && state === "error" && <span role="alert" style={{ color: "var(--danger)" }}>{errorMsg}</span>}
          {pendingUndo && (
            <span role="status" aria-live="polite" style={{ color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {pendingUndo.label}
              <Button variant="ghost" size="xs" onClick={pendingUndo.undo}>되돌리기</Button>
            </span>
          )}
        </div>
        {/* 비활성 대신 항상 눌린다 — 왜 안 되는지 말하지 않는 죽은 버튼을 두지 않는다. */}
        {pendingRawNote && <Button variant="ghost" size="xs" onClick={skipRawNote} disabled={rawNoteSaving}>원문 저장 건너뛰기</Button>}
        <Button variant="primary" size="sm" disabled={rawNoteSaving} onClick={() => pendingRawNote ? retryRawNote() : save({ ignoreWarning: state === "warn" })}>{pendingRawNote ? "원문 저장 재시도" : "저장"}</Button>
      </div>
    </div>
  );
}

// 큐·목록·첫 화면에서 여는 껍데기. 상세 안에서는 이걸 쓰지 않고 폼만 인라인으로 쓴다.
export function ContactRecordDrawer({ target, preset, draft = null, onClose, onSaved, onUndone, onSummaryPersisted, onPersisted, onFailed, initialError = "" }) {
  if (!target?.id) return null;
  return (
    <Drawer
      title="연락 기록"
      subtitle={`${target.name || "고객"}${preset?.kind ? ` · ${channelLabel(preset.kind)}` : ""}`}
      presentation="compact"
      width="min(520px, 96vw)"
      onClose={onClose}
    >
      <ContactRecordForm
        target={target}
        preset={preset}
        draft={draft}
        autoFocus
        onSaved={onSaved}
        onUndone={onUndone}
        onSummaryPersisted={onSummaryPersisted}
        onPersisted={onPersisted}
        onFailed={onFailed}
        initialError={initialError}
        onDone={onClose}
      />
    </Drawer>
  );
}
