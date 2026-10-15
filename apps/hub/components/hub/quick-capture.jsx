"use client";

// 빠른 입력(할 일 · 정리 전 보관)의 단일 정본.
//
// 2026-09-19 이전에는 이 폼이 daily-brief.jsx 안에만 있어서 첫 화면을 벗어나면
// 한 줄 입력을 할 수 없었다. 운영자가 2.0 실사용을 시작하며 "자주·편하게"를
// 1순위로 지목해 전역으로 끌어낸다. CLAUDE.md "Primitives first" — 인라인 복제는
// 이미 두 번 드리프트 사고를 냈으므로 daily-brief도 이 컴포넌트를 쓴다.
//
// layout="inline"  : 첫 화면 Card 안에 박히는 기존 모양 (시각적으로 동일하게 유지)
// layout="compact" : 어디서든 C 로 열리는 Drawer presentation="compact" 안의 모양

import React from "react";
import { Iconed } from "./hub-icons";
import { Button, Card, Drawer, Kbd, TruthBadge } from "./hub-primitives";
import { createClientId } from "@/lib/pms-ui";
import { createQuickCaptureSession, shouldSubmitQuickTask, submitQuickCapture } from "@/lib/quick-task-capture";

const HINTS = {
  task: {
    idle: "Enter로 할 일 저장",
    placeholder: "지금 놓치면 안 되는 할 일을 한 줄로 입력",
    submit: "할 일 저장",
    saved: "할 일로 저장했습니다.",
  },
  inbox: {
    idle: "Enter로 정리 전에 보관",
    placeholder: "아직 분류하지 않을 메모·아이디어를 한 줄로 입력",
    submit: "정리 전 저장",
    saved: "정리 전에 보관했습니다.",
  },
};

export function QuickCaptureForm({
  layout = "inline",
  initialHint = "task",
  autoFocus = false,
  onNavigate,
  onSaved,
  onDone,
  inputId = "hub-quick-capture",
  inputClassName,
  session: providedSession,
  focusRef,
}) {
  const [ownSession] = React.useState(() => createQuickCaptureSession({ initialHint, createId: createClientId }));
  const session = providedSession || ownSession;
  const state = React.useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const { raw, hint } = state;
  const ownInputRef = React.useRef(null);
  const inputRef = focusRef || ownInputRef;

  React.useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus, inputRef]);
  // Refocus after React has re-enabled the field, not while it is still disabled.
  React.useEffect(() => {
    if (state.status !== 'saved') return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [state.status, inputRef]);

  async function submit(event) {
    event.preventDefault();
    // POST /api/hub/inbox 왕복·멱등 키·20초 제한·응답 유실 문구는 데스크톱 위젯과 공유한다.
    const { durable } = await submitQuickCapture(session);
    // 연속 입력이 기본값이다 — 저장 후 닫지 않고 포커스를 유지한다.
    if (durable) onSaved?.();
  }

  const saving = state.status === "saving";
  const message = state.status === 'error' ? state.error : state.status === 'preview' ? '저장하지 않았습니다. 입력은 남겨 두었습니다.' : saving ? '저장 중…' : state.status === 'saved' ? state.duplicate ? '이미 저장된 입력입니다.' : state.destinationType === 'work_order' ? HINTS.inbox.saved : HINTS.task.saved : HINTS[hint].idle;
  const compact = layout === "compact";
  const stateColor = state.status === "error"
    ? "var(--danger)"
    : state.status === "saved" ? "var(--fg-muted)" : "var(--fg-faint)";

  function changeHint(next) {
    if (saving || next === hint) return;
    session.setHint(next);
    inputRef.current?.focus();
  }

  const body = (
    <>
      <form
        aria-label="빠른 입력"
        onSubmit={submit}
        className="hub-stackable-row"
        style={{ display: "flex", alignItems: "flex-end", gap: 12, ...(compact ? { flexDirection: "column", alignItems: "stretch" } : null) }}
      >
        <div style={{ display: "flex", flex: compact ? "0 0 auto" : "1 1 360px", minWidth: 0, flexDirection: "column", gap: 8 }}>
          <div className="hub-stackable-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label
              htmlFor={inputId}
              className="mono"
              style={{ flex: 1, fontSize: 10.5, color: "var(--fg-dim)", letterSpacing: "0.1em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span>Quick Capture</span>
              <span style={{ fontSize: 10.5, color: "var(--fg-faint)", textTransform: "none", letterSpacing: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
                (Enter로 저장 <Kbd style={{ fontSize: 10.5, minWidth: 14, height: 16, padding: "0 4px", lineHeight: "14px" }}>↵</Kbd>)
              </span>
            </label>
            <div role="group" aria-label="저장 위치" style={{ display: "flex", gap: 4 }}>
              <Button type="button" variant={hint === "task" ? "secondary" : "ghost"} size="xs" aria-pressed={hint === "task"} disabled={saving} onClick={() => changeHint("task")}>할 일</Button>
              <Button type="button" variant={hint === "inbox" ? "secondary" : "ghost"} size="xs" aria-pressed={hint === "inbox"} disabled={saving} onClick={() => changeHint("inbox")}>정리 전</Button>
            </div>
          </div>
          <div className="hub-quick-capture__field" data-invalid={state.status === "error" ? "true" : undefined}>
            <input
              id={inputId}
              ref={inputRef}
              value={raw}
              onChange={(event) => session.setRaw(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !shouldSubmitQuickTask(event, saving)) event.preventDefault(); }}
              placeholder={HINTS[hint].placeholder}
              autoComplete="off"
              maxLength={4000}
              disabled={saving}
              className={`hub-quick-capture__input${inputClassName ? ` ${inputClassName}` : ""}`}
            />
            {raw && !saving && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="입력 지우기"
                onClick={() => {
                  session.setRaw("");
                  inputRef.current?.focus();
                }}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 20, height: 20, borderRadius: 999,
                  background: "var(--surface-3)", color: "var(--fg-dim)",
                  border: "none", padding: 0, margin: "0 10px", cursor: "pointer", flexShrink: 0,
                }}
              >
                <Iconed name="x" size={10} />
              </button>
            )}
          </div>
        </div>
        <Button
          type="submit" variant="primary" size="md" icon="plus"
          disabled={saving || !raw.trim()}
          style={{ height: 42, flexShrink: 0, ...(compact ? { width: "100%" } : { alignSelf: "flex-end" }) }}
        >
          {saving ? "저장 중" : HINTS[hint].submit}
        </Button>
      </form>
      <div style={{ marginTop: 6, minHeight: 18, display: "flex", alignItems: "center", gap: 8 }}>
        <span role={state.status === "error" ? "alert" : "status"} aria-live="polite" style={{ flex: 1, fontSize: 11.5, color: stateColor, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {state.status === "preview" && <TruthBadge state="preview" />}
          {message}
        </span>
        {state.status === "saved" && state.destinationType === "task" && (
          <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => { onDone?.(); onNavigate?.("dashboard/work/my"); }}>할 일 보기</Button>
        )}
        {state.status === "saved" && state.destinationType === "work_order" && (
          <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => { onDone?.(); onNavigate?.("dashboard/work/inbox"); }}>보관함 보기</Button>
        )}
      </div>
    </>
  );

  if (compact) return body;
  return <Card className="daily-brief__capture daily-brief__panel" style={{ padding: "16px 18px" }}>{body}</Card>;
}

// 어디서든 C 로 열리는 캡처 드로어. openRequest 가 증가할 때마다 열린다.
export function GlobalQuickCapture({ openRequest = 0, initialRaw = "", onInitialRawConsumed, onSharedDraftSaved, onNavigate, onSaved }) {
  const [open, setOpen] = React.useState(false);
  const [session] = React.useState(() => createQuickCaptureSession({ createId: createClientId }));
  const inputRef = React.useRef(null);
  // 0부터 센다: 셸은 이 창을 처음 열 때 지연 마운트하므로, 마운트 시점에 이미 들어온 요청도 열기다.
  const seen = React.useRef(0);
  const sharedDraftSavedRef = React.useRef(null);
  const saved = () => {
    const notifySharedSaved = sharedDraftSavedRef.current;
    sharedDraftSavedRef.current = null;
    onSaved?.();
    notifySharedSaved?.();
  };
  const close = () => { if (session.canClose()) setOpen(false); };

  React.useEffect(() => session.subscribe(() => {
    const state = session.snapshot();
    // Edits and retries belong to the share. Explicitly clearing it starts a new
    // capture; the successful settle also clears raw, but must retain its receipt.
    if (!state.raw.trim() && state.status !== 'saved') sharedDraftSavedRef.current = null;
  }), [session]);

  React.useEffect(() => {
    if (openRequest !== seen.current) {
      seen.current = openRequest;
      if (initialRaw && !session.snapshot().raw) {
        session.setRaw(initialRaw);
        // Freeze the intake callback so a newer URL cannot be consumed by this save.
        sharedDraftSavedRef.current = onSharedDraftSaved || null;
        // The session now owns this draft, including failed/uncertain saves.
        // Consume its parent seed so a later blank capture cannot replay it.
        onInitialRawConsumed?.(initialRaw);
      }
      setOpen(true);
    }
  }, [openRequest, initialRaw, onInitialRawConsumed, onSharedDraftSaved, session]);

  if (!open) return null;
  return (
    <Drawer
      title="빠른 입력"
      subtitle="한 줄로 저장하고 하던 일로 돌아간다"
      presentation="compact"
      initialFocusRef={inputRef}
      onClose={close}
    >
      <QuickCaptureForm
        layout="compact"
        session={session}
        focusRef={inputRef}
        inputId="hub-global-quick-capture"
        onNavigate={onNavigate}
        onSaved={saved}
        onDone={close}
      />
    </Drawer>
  );
}
