"use client";

// 데스크톱 빠른 입력 위젯 — `/widget` 페이지 한 장(2026-09-26 운영자 승인 목업 그대로).
//
// Windows 앱(apps/desktop)의 테두리 없는 380×200 창이 이 페이지를 띄운다. 창은 절대 크기를 바꾸지
// 않는다: 끌기 띠 32px · 입력 · 한 줄 영수증 20px · 구분선 · "오늘 첫 행동" 50px 칸.
// - 저장: 정리 전 메모(hint 'inbox')로 POST /api/hub/inbox — 전역 빠른 입력과 같은 submitQuickCapture.
// - 첫 행동: /api/hub/daily-brief의 signals[0] — Home과 같은 읽기(daily-brief-signals.js).
// - 앱 다리 `window.moonlightWidget`(widget-preload.js)이 있을 때만 고정·닫기·끌기·메인 창 열기를 쓴다.
//   다리는 마운트 뒤에 확인한다(SSR에는 없다). 브라우저로 /widget을 열면 평범한 카드와 링크다.
// - 이 페이지 안의 같은 origin 링크는 첫 행동 행 하나뿐이다. 위젯 창은 링크를 380×200 안에서 연다.

import React from "react";
import { Iconed } from "./hub-icons";
import { Button, IconButton, Kbd, SectionTitle, Skeleton, TextField, TruthBadge } from "./hub-primitives";
import { useDailyBriefSignals } from "./daily-brief-signals";
import { createClientId } from "@/lib/pms-ui";
import { createQuickCaptureSession, shouldSubmitQuickTask, submitQuickCapture } from "@/lib/quick-task-capture";
import { readHubPreferences, watchHubTheme, DEFAULT_HUB_PREFERENCES } from "@/lib/hub-preferences";

export const WIDGET_HOME_PATH = "/dashboard/home";
export const WIDGET_CAPTURE_HINT = "inbox";
// 세션이 끝나면(401) 위젯은 로그인 폼을 그리지 않는다 — 초안을 같은 origin의 localStorage에 잠깐 맡기고
// 로그인 화면으로 간다. 앱(apps/desktop/main.js)은 /login 이동을 보면 위젯을 숨기고 메인 창에서 로그인을
// 열며, 로그인 뒤 위젯을 다시 열면 /widget이 다시 마운트되어 초안을 되찾는다. 브라우저에서는 next로 돌아온다.
export const WIDGET_LOGIN_PATH = "/login?next=%2Fwidget";
export const WIDGET_DRAFT_KEY = "mlp.widgetDraft";

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export function stashWidgetDraft(raw, storage) {
  try {
    if (typeof raw === "string" && raw.trim()) storage.setItem(WIDGET_DRAFT_KEY, raw);
    else storage.removeItem(WIDGET_DRAFT_KEY);
  } catch { /* storage can be blocked */ }
}

export function takeWidgetDraft(storage) {
  try {
    const value = storage.getItem(WIDGET_DRAFT_KEY);
    if (value !== null) storage.removeItem(WIDGET_DRAFT_KEY);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function localStorageOrNull() {
  try { return window.localStorage; } catch { return null; }
}

function goToLogin(raw) {
  const storage = localStorageOrNull();
  if (storage) stashWidgetDraft(raw, storage);
  window.location.assign(WIDGET_LOGIN_PATH);
}

// 저장 봉투(DESIGN.md §8.1) → 영수증 한 줄의 종류. preview는 저장이 아니다 — "저장됨"을 절대 말하지 않는다.
export function widgetReceiptKind(snapshot) {
  const status = snapshot?.status;
  if (status === "saving") return "saving";
  if (status === "saved") return snapshot.duplicate ? "duplicate" : "saved";
  if (status === "preview") return "preview";
  if (status === "error") return "error";
  return "idle";
}

export const RECEIPT_COPY = Object.freeze({
  idle: "정리 전 메모로 보관합니다",
  saving: "저장 중…",
  saved: "저장됨 · 정리 전 메모",
  duplicate: "이미 저장된 메모입니다",
  preview: "저장하지 않았습니다",
  error: "저장 실패",
  kept: "입력은 남겨 두었습니다",
});

export function WidgetReceipt({ snapshot, onRetry }) {
  const kind = widgetReceiptKind(snapshot);
  const cls = `quick-widget__receipt quick-widget__receipt--${kind}`;
  if (kind === "error") {
    return (
      <div id="quick-widget-receipt" className={cls} role="alert">
        <span className="quick-widget__receipt-lead"><Iconed name="x" size={11} />{RECEIPT_COPY.error}</span>
        <span className="quick-widget__receipt-text">{RECEIPT_COPY.kept}</span>
        <Button variant="ghost" size="xs" onClick={onRetry}>다시 시도</Button>
      </div>
    );
  }
  return (
    <div id="quick-widget-receipt" className={cls} role="status" aria-live="polite">
      {kind === "saved" || kind === "duplicate" ? (
        <><span className="quick-widget__receipt-ok"><Iconed name="check" size={12} /></span>{RECEIPT_COPY[kind]}</>
      ) : kind === "preview" ? (
        <><TruthBadge state="preview" /><span>{RECEIPT_COPY.preview}</span></>
      ) : RECEIPT_COPY[kind]}
    </div>
  );
}

// 읽기 봉투 → 첫 행동 칸의 모양. partial도 행을 그린다(배지 없음). 0건은 조용한 한 줄.
export function firstActionView({ status, signals }) {
  if (status === "loading") return { kind: "loading" };
  if (status === "unauthorized") return { kind: "unauthorized" };
  if (status === "error") return { kind: "error" };
  if (status === "preview") return { kind: "preview" };
  const signal = Array.isArray(signals) ? signals[0] : null;
  if (!signal) return { kind: "empty" };
  return { kind: "row", signal, urgent: signal.tone === "danger" };
}

// 행 전체가 하나의 대상이다. 앱 안에서는 메인 창을 열고(위젯 창 안에서 대시보드를 열지 않는다),
// 브라우저에서는 평범한 링크다. "열기"는 보이는 모양일 뿐 — 링크 안에 button을 두지 않는다.
export function FirstActionRow({ signal, urgent, bridge }) {
  const onClick = bridge ? (event) => {
    event.preventDefault();
    bridge.openMain(WIDGET_HOME_PATH);
  } : undefined;
  const meta = [signal.kind, signal.meta].filter(Boolean).join(" · ");
  return (
    <a
      className="quick-widget__row hub-row"
      href={WIDGET_HOME_PATH}
      onClick={onClick}
      data-urgent={urgent ? "true" : undefined}
      aria-label={`오늘 첫 행동 열기: ${signal.title}${urgent ? " (지연)" : ""}`}
    >
      <div className="quick-widget__row-text">
        <div className="quick-widget__row-title">{signal.title}</div>
        <div className="quick-widget__row-meta">
          {urgent ? <span className="quick-widget__row-urgent"><Iconed name="clock" size={11} />지연</span> : null}
          <span className="quick-widget__row-meta-text">{urgent && meta ? `· ${meta}` : meta}</span>
        </div>
      </div>
      <span
        aria-hidden="true"
        className="hub-btn hub-btn--ghost quick-widget__open"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 30, padding: "0 11px", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", borderRadius: "var(--r-sm)" }}
      >
        열기<Iconed name="arrowRight" size={14} />
      </span>
    </a>
  );
}

export function FirstActionSlot({ status, signals, bridge = null, onRetry, onLogin }) {
  const view = firstActionView({ status, signals });
  let body;
  if (view.kind === "loading") {
    body = <Skeleton lines={2} width={["68%", "42%"]} style={{ padding: "11px 6px 0" }} />;
  } else if (view.kind === "unauthorized") {
    body = (
      <div className="quick-widget__slot-center">
        <span className="quick-widget__quiet">로그인이 필요합니다</span>
        <Button variant="ghost" size="xs" onClick={onLogin}>로그인</Button>
      </div>
    );
  } else if (view.kind === "error") {
    body = (
      <div className="quick-widget__slot-center">
        <TruthBadge state="error" reason="첫 행동을 불러오지 못했습니다" />
        <Button variant="ghost" size="xs" icon="refresh" onClick={onRetry}>다시 시도</Button>
      </div>
    );
  } else if (view.kind === "preview") {
    body = <div className="quick-widget__slot-center"><span className="quick-widget__quiet">연결 전이라 첫 행동을 읽지 않았습니다</span></div>;
  } else if (view.kind === "empty") {
    body = <div className="quick-widget__slot-center"><span className="quick-widget__quiet">오늘 첫 행동 없음</span></div>;
  } else {
    body = <FirstActionRow signal={view.signal} urgent={view.urgent} bridge={bridge} />;
  }
  return <div className="quick-widget__slot" data-slot={view.kind}>{body}</div>;
}

// 고정·닫기는 앱 다리가 있을 때만 그린다(브라우저 탭에는 닫을 창도, 고정할 창도 없다).
export function WidgetBar({ bridge = null, pinned = true, onPin, onClose }) {
  return (
    <header className="quick-widget__bar">
      <img src="/icon.svg" alt="" aria-hidden="true" width={14} height={14} />
      <h2 className="quick-widget__eyebrow">빠른 입력</h2>
      {bridge ? (
        <div className="quick-widget__actions">
          <IconButton
            icon="pin"
            size={26}
            iconSize={13}
            className="quick-widget__pin"
            aria-pressed={pinned ? "true" : "false"}
            tooltip="항상 위에 고정"
            onClick={onPin}
          />
          <IconButton icon="x" size={26} iconSize={13} tooltip="닫기 (Esc)" aria-label="닫기" onClick={onClose} />
        </div>
      ) : null}
    </header>
  );
}

// 셸과 같은 테마 규칙(자동은 기기 시계, 저장된 선택이 우선)이고, 메인 창에서 테마를 바꾸면
// 같은 origin의 localStorage `storage` 이벤트로 따라간다.
function useWidgetTheme() {
  const [preference, setPreference] = React.useState(DEFAULT_HUB_PREFERENCES.theme);
  const [theme, setTheme] = React.useState("light");

  useIsoLayoutEffect(() => {
    const read = () => {
      let storage = null;
      try { storage = window.localStorage; } catch { /* storage can be blocked */ }
      setPreference(readHubPreferences(storage).theme);
    };
    read();
    const onStorage = (event) => { if (event.key === null || event.key === "mlp.theme") read(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useIsoLayoutEffect(() => watchHubTheme(preference, setTheme), [preference]);
  return theme;
}

function readBridge() {
  const bridge = typeof window === "undefined" ? null : window.moonlightWidget;
  return bridge && typeof bridge.openMain === "function" ? bridge : null;
}

export function QuickWidget() {
  const theme = useWidgetTheme();
  const [bridge, setBridge] = React.useState(null);
  const [pinned, setPinned] = React.useState(true);
  useIsoLayoutEffect(() => {
    const found = readBridge();
    if (!found) return;
    setBridge(found);
    try { setPinned(found.isPinned() === true); } catch { /* keep default */ }
  }, []);

  const [session] = React.useState(() => createQuickCaptureSession({ initialHint: WIDGET_CAPTURE_HINT, createId: createClientId }));
  const snapshot = React.useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const inputRef = React.useRef(null);
  const saving = snapshot.status === "saving";

  // 로그인으로 밀려나기 전에 맡겨 둔 초안이 있으면 되찾는다(한 번만).
  useIsoLayoutEffect(() => {
    const storage = localStorageOrNull();
    const draft = storage ? takeWidgetDraft(storage) : "";
    if (draft && !session.snapshot().raw) session.setRaw(draft);
  }, [session]);

  const leaveForLogin = React.useCallback(() => goToLogin(session.snapshot().raw), [session]);
  // 저장 요청이 401로 돌아오면 세션이 끝난 것이다 — 실패 영수증 대신 로그인으로 간다(초안은 맡긴다).
  const fetchImpl = React.useCallback(async (input, init) => {
    const res = await fetch(input, init);
    if (res.status === 401) leaveForLogin();
    return res;
  }, [leaveForLogin]);

  // 창이 다시 보이거나 포커스를 받을 때만 다시 읽는다 — 타이머 없음.
  const [reloadKey, reload] = React.useReducer((value) => value + 1, 0);
  const brief = useDailyBriefSignals(reloadKey, { keepPrevious: true });
  React.useEffect(() => {
    if (brief.status === "unauthorized") leaveForLogin();
  }, [brief.status, leaveForLogin]);
  React.useEffect(() => {
    const onFocus = () => {
      reload();
      if (!document.activeElement || document.activeElement === document.body) inputRef.current?.focus();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => { inputRef.current?.focus(); }, []);
  // 저장 중에는 입력이 잠겨 포커스를 잃는다. 결과가 나오면(저장·preview·실패) 다시 입력 칸으로 — 연속 입력.
  React.useEffect(() => {
    if (snapshot.status === "saving" || snapshot.status === "idle") return undefined;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [snapshot.status]);

  const submit = React.useCallback(async () => {
    if (!session.snapshot().raw.trim()) return;
    await submitQuickCapture(session, { fetchImpl });
  }, [session, fetchImpl]);

  const togglePin = React.useCallback(async () => {
    if (!bridge) return;
    try {
      const applied = await bridge.pin(!pinned);
      setPinned(applied === true);
    } catch { /* keep the last known state */ }
  }, [bridge, pinned]);

  return (
    <div className={`hub-app quick-widget-page${bridge ? " is-app" : ""}`} data-theme={theme}>
      <main className="quick-widget" aria-label="빠른 입력 위젯">
        <WidgetBar bridge={bridge} pinned={pinned} onPin={togglePin} onClose={() => bridge?.close()} />

        <form
          className="quick-widget__capture"
          aria-label="빠른 입력"
          onSubmit={(event) => { event.preventDefault(); submit(); }}
        >
          <div className="quick-widget__input-wrap">
            <TextField
              ref={inputRef}
              className="quick-widget__input"
              aria-label="정리 전 메모"
              aria-describedby="quick-widget-receipt"
              placeholder="무엇이든 적고 Enter"
              autoComplete="off"
              maxLength={4000}
              value={snapshot.raw}
              disabled={saving}
              onChange={(event) => session.setRaw(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !shouldSubmitQuickTask(event, saving)) event.preventDefault(); }}
            />
            <span className="quick-widget__kbd" aria-hidden="true"><Kbd>Enter</Kbd></span>
          </div>
          <WidgetReceipt snapshot={snapshot} onRetry={submit} />
        </form>

        <div className="quick-widget__divider" />

        <section className="quick-widget__first" aria-label="오늘 첫 행동">
          <SectionTitle style={{ marginBottom: 6 }}>오늘 첫 행동</SectionTitle>
          <FirstActionSlot status={brief.status} signals={brief.signals} bridge={bridge} onRetry={reload} onLogin={leaveForLogin} />
        </section>
      </main>
    </div>
  );
}
