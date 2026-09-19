"use client";

import React from "react";
import { Button } from "./hub-primitives";
import { Iconed } from "./hub-icons";
import { pushEscLayer, popEscLayer, isTopEscLayer } from "./esc-layers";
import { MAX_MEMO_CHARS, memoCapturePayload, newMemoDraft } from "@/lib/memo-capture";
import { quickMemoDraftKey, readQuickMemoDraft, writeQuickMemoDraft } from "@/lib/quick-memo";
import { MEMO_SAVED_EVENT, memoHref, saveMemoAndVerify } from "@/lib/memo-save";
import { contentIdeaHref, prepareMemoIdea, saveMemoAsIdeaAndVerify } from "@/lib/quick-memo-content";
import { notifyContentLedgerChanged } from "@/lib/content-ledger-cache";
import styles from "./quick-memo.module.css";

const FOCUSABLE = 'button:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]';

export function QuickMemo({ draftContext, openRequest = 0, blocked = false, route, onNavigate, fetchImpl = fetch }) {
  const [draft, setDraft] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [storageError, setStorageError] = React.useState("");
  const [receipt, setReceipt] = React.useState(null);
  const [ideaReceipt, setIdeaReceipt] = React.useState(null);
  const [toast, setToast] = React.useState(false);
  const [mobile, setMobile] = React.useState(false);
  const [otherDialog, setOtherDialog] = React.useState(false);
  const root = React.useRef(null);
  const panel = React.useRef(null);
  const input = React.useRef(null);
  const opener = React.useRef(null);
  const launchArea = React.useRef(null);
  const returnFocus = React.useRef(null);
  const current = React.useRef(null);
  const busyRef = React.useRef(false);
  const alive = React.useRef(false);
  const routeRef = React.useRef(route);
  const closeRef = React.useRef(null);
  const consumedOpenRequest = React.useRef(0);
  const key = quickMemoDraftKey(draftContext);
  const unavailable = blocked || otherDialog;
  const shown = open && !unavailable;
  routeRef.current = route;

  // Measure against a fixed anchor so expansion cannot chase the pointer.
  // Proximity listens without adding an invisible hit area over the page.
  React.useEffect(() => {
    if (shown || unavailable) return;
    const media = matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let pointer = null;
    const update = () => {
      frame = 0;
      const anchor = launchArea.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const dx = pointer ? Math.max(rect.left - pointer.x, 0, pointer.x - rect.right) : Infinity;
      const dy = pointer ? Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom) : Infinity;
      const overButton = pointer && opener.current?.matches(":hover");
      anchor.dataset.near = media.matches && (overButton || Math.hypot(dx, dy) <= 64) ? "true" : "false";
    };
    const move = event => {
      pointer = event.pointerType === "mouse" ? { x: event.clientX, y: event.clientY } : null;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const reset = () => { cancelAnimationFrame(frame); pointer = null; update(); };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    media.addEventListener("change", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      media.removeEventListener("change", reset);
    };
  }, [shown, unavailable]);

  const persist = React.useCallback(() => {
    if (!current.current) return;
    try {
      writeQuickMemoDraft(sessionStorage, key, current.current);
      if (alive.current) setStorageError("");
    } catch {
      if (alive.current) setStorageError("이 탭에 임시 보관할 수 없어요. 떠나기 전에 저장해 주세요.");
    }
  }, [key]);

  React.useEffect(() => {
    alive.current = true;
    try { current.current = readQuickMemoDraft(sessionStorage, key) || newMemoDraft(); }
    catch {
      current.current = newMemoDraft();
      setStorageError("이 탭에 임시 보관할 수 없어요. 떠나기 전에 저장해 주세요.");
    }
    setDraft(current.current);
    const flush = () => persist();
    window.addEventListener("pagehide", flush);
    return () => { alive.current = false; persist(); window.removeEventListener("pagehide", flush); };
  }, [key, persist]);

  React.useEffect(() => {
    const media = matchMedia("(max-width: 639px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Reserve the visual viewport above the software keyboard, including iOS pan.
  React.useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      root.current?.style.setProperty("--memo-keyboard", `${Math.max(0, innerHeight - (viewport?.height || innerHeight) - (viewport?.offsetTop || 0))}px`);
      root.current?.style.setProperty("--memo-viewport", `${viewport?.height || innerHeight}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, []);

  // Existing page dialogs are independently owned; observe only their presence.
  React.useEffect(() => {
    const app = root.current?.closest(".hub-app");
    if (!app) return;
    const update = () => setOtherDialog(Array.from(app.querySelectorAll('[role="dialog"], [aria-modal="true"], .hub-project-detail-sheet'))
      .some(el => !root.current?.contains(el) && el.getClientRects().length > 0));
    const observer = new MutationObserver(update);
    observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-modal", "hidden"] });
    update();
    return () => observer.disconnect();
  }, []);

  function launch() {
    if (unavailable || !current.current) return;
    returnFocus.current = document.activeElement;
    setOpen(true);
    setToast(false);
  }
  function close(restore = true) {
    persist();
    setOpen(false);
    if (restore) requestAnimationFrame(() => {
      const target = returnFocus.current;
      (target?.isConnected && !target.closest('[inert]') ? target : opener.current)?.focus({ preventScroll: true });
    });
  }
  closeRef.current = close;

  React.useEffect(() => {
    if (unavailable) setOpen(false);
  }, [unavailable]);
  React.useEffect(() => {
    if (!openRequest || openRequest === consumedOpenRequest.current || blocked) return;
    consumedOpenRequest.current = openRequest;
    // Command palette unmounts before this frame; its ESC layer is released.
    const frame = requestAnimationFrame(() => {
      if (blocked || !current.current) return;
      const app = root.current?.closest(".hub-app");
      if (app?.querySelector('[role="dialog"], [aria-modal="true"], .hub-project-detail-sheet')) return;
      returnFocus.current = opener.current;
      setOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [openRequest, blocked]);

  // `M` → 어디서든 빠른 메모. 지금까지 키보드 경로는 ⌘K 팔레트뿐이라 떠오른 생각을
  // 적는 데 항상 두 단계가 필요했다. hub-app 의 `C`(빠른 입력)와 같은 가드를 쓴다:
  // 입력 요소 안이거나, 팔레트·다른 대화상자가 떠 있으면(unavailable) 양보한다.
  React.useEffect(() => {
    if (shown || unavailable) return;
    const onKey = event => {
      if (event.key !== "m" && event.key !== "M") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
      const target = event.target;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      launch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  React.useEffect(() => {
    if (!shown) return;
    const layer = pushEscLayer();
    const frame = requestAnimationFrame(() => input.current?.focus());
    const onKey = event => {
      if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229 && isTopEscLayer(layer)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
    };
    const outside = event => {
      if (!root.current?.contains(event.target)) closeRef.current(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      cancelAnimationFrame(frame);
      popEscLayer(layer);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [shown]);

  React.useEffect(() => {
    if (!shown || !mobile) return;
    const shell = root.current?.closest(".hub-app")?.querySelector(".hub-shell");
    if (!shell) return;
    const wasInert = shell.inert;
    shell.inert = true;
    return () => { shell.inert = wasInert; };
  }, [shown, mobile]);
  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(false), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function update(patch) {
    if (busyRef.current) return;
    if (patch.body !== undefined && (patch.body.length > MAX_MEMO_CHARS || patch.body.includes("\0"))) {
      setError("본문은 100,000자 이하의 텍스트로 입력하세요. 기존 내용은 유지했습니다.");
      return;
    }
    const hadUncertainSave = Boolean(error);
    current.current = { ...current.current, ...patch, id: crypto.randomUUID(), destination: undefined, ideaContentId: undefined, ideaVariantId: undefined };
    setDraft(current.current);
    setReceipt(null);
    setIdeaReceipt(null);
    setError(hadUncertainSave ? "내용을 바꾸면 새 메모로 저장합니다. 이전 저장이 완료됐을 수 있으니 메모 목록을 확인하세요." : "");
    persist();
  }

  async function save(event, destination = current.current?.destination) {
    event?.preventDefault();
    if (busyRef.current) return;
    let payload;
    try { payload = memoCapturePayload(current.current); }
    catch (failure) { setError(failure.message); return; }
    if (destination === "idea") {
      current.current = prepareMemoIdea(current.current);
      setDraft(current.current);
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    persist();
    const submittedRoute = routeRef.current;
    try {
      const result = destination === "idea"
        ? await saveMemoAsIdeaAndVerify(current.current, fetchImpl)
        : await saveMemoAndVerify(payload, fetchImpl);
      if (!alive.current) return;
      current.current = newMemoDraft();
      setDraft(current.current);
      setReceipt(result.id);
      setIdeaReceipt(result.contentId || null);
      setToast(true);
      // Only return focus if the user is still working in this panel.
      closeRef.current(submittedRoute === routeRef.current && panel.current?.contains(document.activeElement));
      window.dispatchEvent(new CustomEvent(MEMO_SAVED_EVENT, { detail: { id: result.id } }));
      if (result.contentId) notifyContentLedgerChanged();
    } catch (failure) {
      if (alive.current) {
        setError(failure.message);
        if (failure.id) setReceipt(failure.id);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function keyDown(event) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
    if (mobile && event.key === "Tab") {
      const nodes = Array.from(panel.current.querySelectorAll(FOCUSABLE));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }

  const openSaved = event => {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setToast(false);
    onNavigate(memoHref(receipt).slice(1));
  };
  const openIdea = event => {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setToast(false);
    onNavigate(contentIdeaHref(ideaReceipt).slice(1));
  };
  const launcherStatus = busy ? "저장 중" : error ? "저장 확인 필요" : draft?.body ? "작성 중" : "";

  return <div ref={root} className={styles.root} hidden={unavailable}>
    {shown && mobile ? <div className={styles.backdrop} onClick={() => close()} aria-hidden="true" /> : null}
    {shown && draft ? <section ref={panel} role="dialog" aria-modal={mobile || undefined} aria-labelledby="quick-memo-title" className={styles.panel} onKeyDown={keyDown}>
      <header className={styles.header}><h2 id="quick-memo-title">빠른 메모</h2><Button onClick={() => close()} aria-label="빠른 메모 접기">접기</Button></header>
      <form onSubmit={save}>
        <label className={styles.srOnly} htmlFor="quick-memo-body">메모 본문</label>
        <textarea ref={input} id="quick-memo-body" rows={5} value={draft.body} disabled={busy} onChange={event => update({ body: event.target.value })} placeholder="생각나는 대로 적어두세요." aria-describedby="quick-memo-status" />
        <div className={styles.actions}>
          <label><span className={styles.srOnly}>기록 범위</span><select aria-label="빠른 메모 기록 범위" value={draft.scope} disabled={busy} onChange={event => update({ scope: event.target.value })}><option value="personal">개인</option><option value="company">회사 업무</option></select></label>
          <Button type="submit" variant="primary" disabled={busy || !draft.body.trim()}>{busy ? "저장 확인 중…" : draft.destination === "idea" ? "소재 보내기 재시도" : "저장"}</Button>
        </div>
        {draft.destination !== "idea" ? <Button type="button" className={styles.sendIdea} disabled={busy || !draft.body.trim()} onClick={event => save(event, "idea")}>콘텐츠 소재로 보내기</Button> : null}
      </form>
      <p className={styles.hint}>소재로 보내면 원문 메모를 저장하고 콘텐츠에 연결해요.</p>
      <p className={styles.hint}>Ctrl/⌘ + Enter로 저장 · Enter는 줄바꿈</p>
      <p id="quick-memo-status" className={styles.hint}>{storageError || "이 탭에 임시 보관 · 탭을 닫기 전에 저장하세요."}</p>
      {error ? <p className={styles.feedback} role="alert">{error} {receipt ? <a href={memoHref(receipt)} onClick={openSaved}>저장된 메모 확인</a> : null}</p> : null}
    </section> : null}
    {toast && receipt ? <div className={styles.toast} role="status">{ideaReceipt ? "소재함에 연결했어요" : "메모를 저장했어요"} <a href={ideaReceipt ? contentIdeaHref(ideaReceipt) : memoHref(receipt)} onClick={ideaReceipt ? openIdea : openSaved}>열기</a></div> : null}
    {!shown ? <div ref={launchArea} className={styles.launchArea}>
      <button ref={opener} type="button" className={styles.launcher} onClick={launch} disabled={!draft} title="빠른 메모 · M" aria-label={`빠른 메모 · 단축키 M${launcherStatus ? ` · ${launcherStatus}` : ""}`} aria-haspopup="dialog" aria-expanded={false}>
        <span className={styles.launcherLabel} aria-hidden="true"><span>빠른 메모{launcherStatus ? <span className={styles.badge}>{launcherStatus}</span> : null}</span></span>
        <span className={styles.launcherIcon} aria-hidden="true"><Iconed name="edit" size={20} />{launcherStatus ? <span className={styles.statusDot} data-attention={Boolean(error)} /> : null}</span>
      </button>
    </div> : null}
    <span className={styles.srOnly} role="status" aria-live="polite">{!shown && error ? error : ""}</span>
  </div>;
}
