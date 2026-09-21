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
import { Button, Card, Drawer, Kbd } from "./hub-primitives";
import { createClientId } from "@/lib/pms-ui";
import { createQuickCaptureSession, shouldSubmitQuickTask } from "@/lib/quick-task-capture";

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
  React.useEffect(() => { if (state.status === 'saved') inputRef.current?.focus(); }, [state.status, inputRef]);

  async function submit(event) {
    event.preventDefault();
    const capture = session.begin();
    if (!capture.ok) return;
    try {
      const response = await fetch("/api/hub/inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(capture.payload),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(error => { if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw error; return {}; });

      if (session.settle({ ok: response.ok, data, error: !response.ok && !data.error && !data.status ? `저장 실패 (${response.status})` : null })) {
        onSaved?.();
        // 연속 입력이 기본값이다 — 저장 후 닫지 않고 포커스를 유지한다.
      }
    } catch (error) {
      session.settle({ ok: false, error: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? '저장 응답을 확인하지 못했습니다. 입력을 보관했으니 같은 요청으로 다시 시도하세요.' : error instanceof Error ? error.message : null });
    }
  }

  const saving = state.status === "saving";
  const message = state.status === 'error' ? state.error : saving ? '저장 중…' : state.status === 'saved' ? state.duplicate ? '이미 저장된 입력입니다.' : state.destinationType === 'work_order' ? HINTS.inbox.saved : HINTS.task.saved : HINTS[hint].idle;
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
            className={inputClassName}
            style={{
              width: "100%", padding: "9px 12px", fontSize: 14.5, lineHeight: 1.4,
              color: "var(--fg)", background: "var(--surface-2)",
              border: `1px solid ${state.status === "error" ? "var(--danger-line)" : "var(--line-soft)"}`,
              borderRadius: "var(--r-sm)",
            }}
          />
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
        <span role={state.status === "error" ? "alert" : "status"} aria-live="polite" style={{ flex: 1, fontSize: 11.5, color: stateColor }}>
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
export function GlobalQuickCapture({ openRequest = 0, onNavigate, onSaved }) {
  const [open, setOpen] = React.useState(false);
  const [session] = React.useState(() => createQuickCaptureSession({ createId: createClientId }));
  const inputRef = React.useRef(null);
  const seen = React.useRef(openRequest);
  const close = () => { if (session.canClose()) setOpen(false); };

  React.useEffect(() => {
    if (openRequest !== seen.current) { seen.current = openRequest; setOpen(true); }
  }, [openRequest]);

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
        autoFocus
        session={session}
        focusRef={inputRef}
        inputId="hub-global-quick-capture"
        onNavigate={onNavigate}
        onSaved={onSaved}
        onDone={close}
      />
    </Drawer>
  );
}
