"use client";

import React from "react";
import { Iconed } from "./hub-icons";
import { Button } from "./hub-primitives";
import "./hub-toast.css";

const ToastContext = React.createContext(null);

const DEFAULT_DURATION = 3500;
const EXIT_DURATION = 150;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);

  const dismiss = React.useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_DURATION);
  }, []);

  const showToast = React.useCallback(
    (message, options = {}) => {
      const id = options.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const duration = options.duration ?? DEFAULT_DURATION;
      const tone = options.tone || "neutral"; // neutral | success | danger
      const action = options.action || null; // { label, onClick }

      setToasts((prev) => {
        // 동일 ID가 있으면 교체, 없으면 단일 또는 최신 2개 유지
        const filtered = prev.filter((t) => t.id !== id);
        return [...filtered.slice(-2), { id, message, tone, action, exiting: false }];
      });

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }

      return id;
    },
    [dismiss]
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
      <div className="hub-toast-viewport" aria-live="polite" aria-atomic="false">
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
