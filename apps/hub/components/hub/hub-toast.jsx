"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { Button } from "./hub-primitives";
import "./hub-toast.css";

const ToastContext = React.createContext(null);

const DEFAULT_DURATION = 3500;
// 오류는 원인을 읽고 다음 행동을 정해야 해서 두 배 남짓 오래 둔다(닫기 버튼으로 먼저 닫을 수 있다).
const DANGER_DURATION = 7000;
// 가리킨 뒤 다시 흘러가기 시작할 때 최소한 이만큼은 남긴다 — 손을 떼자마자 사라지지 않게.
const RESUME_FLOOR = 1200;
const EXIT_DURATION = 150;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);
  // id → { timeout, remaining, start, pausable }. 행동(되돌리기 등)이 붙은 알림은 그 행동의 유효 시간과
  // 맞물려 있으므로 멈추지 않는다 — 멈춘 채 창이 닫히면 눌러도 아무 일도 없는 버튼이 남는다.
  const timers = React.useRef(new Map());
  const reading = React.useRef({ hovered: false, focused: false });

  const clearTimer = React.useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer?.timeout) clearTimeout(timer.timeout);
    timers.current.delete(id);
  }, []);

  const dismiss = React.useCallback((id) => {
    clearTimer(id);
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_DURATION);
  }, [clearTimer]);

  const startTimer = React.useCallback((id, ms, pausable) => {
    const paused = pausable && (reading.current.hovered || reading.current.focused);
    const timeout = paused ? null : setTimeout(() => dismiss(id), ms);
    timers.current.set(id, { timeout, remaining: ms, start: Date.now(), pausable });
  }, [dismiss]);

  // 가리키거나 키보드로 들어오면 읽는 동안 멈춘다(WCAG 2.2.1), 떠나면 남은 시간부터 다시 센다.
  const pauseTimers = React.useCallback(() => {
    for (const timer of timers.current.values()) {
      if (!timer.pausable || !timer.timeout) continue;
      clearTimeout(timer.timeout);
      timer.timeout = null;
      timer.remaining -= Date.now() - timer.start;
    }
  }, []);
  const resumeTimers = React.useCallback(() => {
    if (reading.current.hovered || reading.current.focused) return;
    for (const [id, timer] of timers.current) {
      if (timer.pausable && !timer.timeout) startTimer(id, Math.max(timer.remaining, RESUME_FLOOR), true);
    }
  }, [startTimer]);

  const enter = React.useCallback(() => {
    reading.current.hovered = true;
    pauseTimers();
  }, [pauseTimers]);
  const leave = React.useCallback(() => {
    reading.current.hovered = false;
    resumeTimers();
  }, [resumeTimers]);
  const focus = React.useCallback(() => {
    reading.current.focused = true;
    pauseTimers();
  }, [pauseTimers]);
  const blur = React.useCallback((event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    reading.current.focused = false;
    resumeTimers();
  }, [resumeTimers]);

  const showToast = React.useCallback(
    (message, options = {}) => {
      const id = options.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const tone = options.tone || "neutral"; // neutral | success | danger
      const duration = options.duration ?? (tone === "danger" ? DANGER_DURATION : DEFAULT_DURATION);
      const action = options.action || null; // { label, onClick }

      setToasts((prev) => {
        // 동일 ID가 있으면 교체, 없으면 단일 또는 최신 2개 유지
        const filtered = prev.filter((t) => t.id !== id);
        return [...filtered.slice(-2), { id, message, tone, action, exiting: false }];
      });

      clearTimer(id);
      if (duration > 0) startTimer(id, duration, !action);

      return id;
    },
    [clearTimer, startTimer]
  );

  const contextValue = React.useMemo(() => {
    const fn = (message, options) => showToast(message, options);
    fn.success = (message, options) => showToast(message, { ...options, tone: "success" });
    fn.error = (message, options) => showToast(message, { ...options, tone: "danger" });
    fn.info = (message, options) => showToast(message, { ...options, tone: "neutral" });
    fn.dismiss = dismiss;
    return fn;
  }, [showToast, dismiss]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        className="hub-toast-viewport"
        aria-live="polite"
        aria-atomic="false"
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={focus}
        onBlur={blur}
      >
        {toasts.map((t) => {
          const isDanger = t.tone === "danger";
          const isSuccess = t.tone === "success";
          const iconName = isDanger ? "x" : isSuccess ? "check" : "bell";
          const iconCls = isDanger
            ? "hub-toast-item__icon--danger"
            : isSuccess
            ? "hub-toast-item__icon--success"
            : "hub-toast-item__icon--neutral";

          return (
            <div
              key={t.id}
              role={isDanger ? "alert" : "status"}
              className="hub-toast-item"
              data-exiting={t.exiting ? "true" : "false"}
            >
              <span className={`hub-toast-item__icon ${iconCls}`}>
                <Iconed name={iconName} size={15} />
              </span>
              <span className="hub-toast-item__message">{t.message}</span>
              {t.action && (
                <span className="hub-toast-item__action">
                  <Button
                    variant="ghost"
                    size="xs"
                    style={{
                      color: "var(--moon-200)",
                      fontWeight: 600,
                      padding: "2px 8px",
                      height: 24,
                    }}
                    onClick={() => {
                      t.action.onClick?.();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </Button>
                </span>
              )}
              <button
                type="button"
                className="hub-toast-item__close"
                aria-label="알림 닫기"
                onClick={() => dismiss(t.id)}
              >
                <Iconed name="x" size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // 안전한 fallback: ToastProvider 밖에서도 에러 없이 console 로깅만
    const fallback = (msg) => { if (typeof console !== "undefined") console.log("[toast]", msg); };
    fallback.success = fallback;
    fallback.error = fallback;
    fallback.info = fallback;
    fallback.dismiss = () => {};
    return fallback;
  }
  return ctx;
}
