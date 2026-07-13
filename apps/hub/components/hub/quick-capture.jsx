"use client";

import React from "react";

import { createDurableTaskClient } from "@/lib/durable-task-client";
import { Button, Card, Kbd } from "./hub-primitives";

function failureMessage(result) {
  if (result?.requiresUnlock) return "저장 권한을 확인하려면 이 화면에서 잠금을 해제하세요.";
  return result?.error || "저장하지 못했습니다. 원문을 유지했으니 다시 시도할 수 있습니다.";
}

export function QuickCapture({ onSaved }) {
  const client = React.useMemo(() => createDurableTaskClient(), []);
  const inputRef = React.useRef(null);
  const [text, setText] = React.useState("");
  const [destination, setDestination] = React.useState("task");
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState(null);
  const [requiresUnlock, setRequiresUnlock] = React.useState(false);
  const [secret, setSecret] = React.useState("");
  const [unlockPending, setUnlockPending] = React.useState(false);

  React.useEffect(() => {
    function focusCapture(event) {
      const target = event.target;
      if (!target) return;
      const isInDialog = Boolean(target.closest?.('[role="dialog"]'));
      const isTyping = target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      );
      if (
        event.key.toLowerCase() === "n"
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !isTyping
        && !isInDialog
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", focusCapture);
    return () => window.removeEventListener("keydown", focusCapture);
  }, []);

  async function saveCapture() {
    const raw = text.trim();
    if (!raw) {
      setFeedback({ tone: "error", message: "기록할 내용을 먼저 입력하세요." });
      inputRef.current?.focus();
      return;
    }

    setPending(true);
    setFeedback({ tone: "pending", message: "원장에 저장하는 중…" });
    const result = await client.submit({ destination, text: raw });
    setPending(false);

    if (result.status === "saved" || result.status === "duplicate") {
      setText("");
      setRequiresUnlock(false);
      setFeedback({
        tone: "success",
        message: result.status === "duplicate" ? "이미 저장된 기록을 확인했습니다." : "원장에 저장했습니다.",
      });
      onSaved?.(result);
      return;
    }

    if (result.requiresUnlock) setRequiresUnlock(true);
    setFeedback({ tone: "error", message: failureMessage(result) });
  }

  function submitCapture(event) {
    event.preventDefault();
    if (!pending) void saveCapture();
  }

  async function submitUnlock(event) {
    event.preventDefault();
    if (!secret || unlockPending) return;

    setUnlockPending(true);
    const result = await client.unlockSession({
      secret,
      onSecretConsumed: () => setSecret(""),
    });
    setUnlockPending(false);

    if (!result.unlocked) {
      setFeedback({ tone: "error", message: "잠금을 해제하지 못했습니다. secret을 확인해 주세요." });
      return;
    }

    setRequiresUnlock(false);
    setFeedback({ tone: "pending", message: "잠금을 해제했습니다. 같은 기록을 다시 저장합니다…" });
    await saveCapture();
  }

  return (
    <Card className="quick-capture" style={{ padding: 0, overflow: "hidden" }}>
      <form onSubmit={submitCapture} className="quick-capture__form">
        <div className="quick-capture__heading">
          <div>
            <label htmlFor="quick-capture-text" className="quick-capture__label">빠른 기록</label>
            <div className="quick-capture__hint">문득 떠오른 일과 메모를 원문 그대로 먼저 남깁니다.</div>
          </div>
          <Kbd>N</Kbd>
        </div>

        <div className="quick-capture__main">
          <input
            ref={inputRef}
            id="quick-capture-text"
            aria-keyshortcuts="N"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={pending}
            maxLength={500}
            autoComplete="off"
            placeholder="예: 원장님께 견적 후속 연락"
            style={{ minHeight: 44, fontSize: 16 }}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={pending || !text.trim()}
            style={{ minHeight: 44 }}
          >
            {pending ? "저장 중…" : "저장"}
          </Button>
        </div>

        <div className="quick-capture__destinations" role="group" aria-label="저장 위치">
          <button
            type="button"
            aria-pressed={destination === "task"}
            disabled={pending}
            onClick={() => setDestination("task")}
            style={{ minHeight: 44 }}
          >
            할 일
          </button>
          <button
            type="button"
            aria-pressed={destination === "inbox"}
            disabled={pending}
            onClick={() => setDestination("inbox")}
            style={{ minHeight: 44 }}
          >
            정리 전
          </button>
        </div>

        <div className="quick-capture__feedback" aria-live="polite" aria-atomic="true">
          {feedback?.tone === "error" ? (
            <span role="alert">{feedback.message}</span>
          ) : (
            <span>{feedback?.message || "Enter로 저장 · 실패하면 원문과 재시도 키를 유지합니다."}</span>
          )}
        </div>
      </form>

      {requiresUnlock && (
        <form className="quick-capture__unlock" onSubmit={submitUnlock}>
          <label htmlFor="quick-capture-secret">쓰기 잠금 해제</label>
          <div className="quick-capture__unlock-row">
            <input
              id="quick-capture-secret"
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              disabled={unlockPending}
              autoComplete="current-password"
              placeholder="Hub write secret"
              style={{ minHeight: 44, fontSize: 16 }}
            />
            <Button
              type="submit"
              variant="secondary"
              size="md"
              disabled={unlockPending || !secret}
              style={{ minHeight: 44 }}
            >
              {unlockPending ? "확인 중…" : "잠금 해제"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
