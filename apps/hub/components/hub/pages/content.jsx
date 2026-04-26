"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Progress, Tabs, Kbd, Placeholder, SectionTitle, EmptyState, Avatar } from "../hub-primitives";
import {
  CONTENT_QUEUE as FALLBACK_CONTENT_QUEUE,
  CAMPAIGNS as FALLBACK_CAMPAIGNS,
} from "../hub-data";

const STUDIO_DRAFT_DB = "moonlight-content-studio";
const STUDIO_DRAFT_STORE = "drafts";
const ACTIVE_DRAFT_KEY = "active";

function openStudioDraftDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(STUDIO_DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STUDIO_DRAFT_STORE)) {
        db.createObjectStore(STUDIO_DRAFT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readStudioDraft(key = ACTIVE_DRAFT_KEY) {
  const db = await openStudioDraftDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STUDIO_DRAFT_STORE, "readonly");
    const request = tx.objectStore(STUDIO_DRAFT_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function writeStudioDraft(key, draft) {
  const db = await openStudioDraftDb();
  if (!db) return false;

  return new Promise((resolve) => {
    const tx = db.transaction(STUDIO_DRAFT_STORE, "readwrite");
    tx.objectStore(STUDIO_DRAFT_STORE).put({
      ...draft,
      key,
      updatedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      resolve(false);
    };
  });
}

function parseVariantSlides(body) {
  if (!body || typeof body !== "string") return null;

  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed?.slides) ? parsed.slides : null;
  } catch {
    return null;
  }
}

function bodySummary(body) {
  if (!body) return "";
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}

function useContentLedger() {
  const [state, setState] = React.useState({
    source: "mock",
    syncState: "mock",
    items: [],
    variants: [],
    publishLogs: [],
    queue: FALLBACK_CONTENT_QUEUE,
    pipeline: [],
    attention: [],
    summary: null,
  });

  React.useEffect(() => {
    let active = true;

    async function loadLedger() {
      setState((s) => ({ ...s, syncState: "loading" }));
      try {
        const response = await fetch("/api/hub/content", { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!active || !response.ok || !data || data.status === "error") {
          if (active) setState((s) => ({ ...s, syncState: "mock" }));
          return;
        }

        if (data.source === "supabase") {
          setState({
            source: data.source,
            syncState: "live",
            items: Array.isArray(data.items) ? data.items : [],
            variants: Array.isArray(data.variants) ? data.variants : [],
            publishLogs: Array.isArray(data.publishLogs) ? data.publishLogs : [],
            queue: Array.isArray(data.queue) ? data.queue : [],
            pipeline: Array.isArray(data.pipeline) ? data.pipeline : [],
            attention: Array.isArray(data.attention) ? data.attention : [],
            summary: data.summary || null,
          });
        } else {
          setState((s) => ({ ...s, syncState: "mock" }));
        }
      } catch {
        if (active) setState((s) => ({ ...s, syncState: "mock" }));
      }
    }

    loadLedger();
    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function Studio() {
  const searchParams = useSearchParams();
  const itemParam = searchParams.get("item");
  const ledger = useContentLedger();
  const [mode, setMode] = React.useState('blog');
  const [contentId, setContentId] = React.useState(null);
  const [variantId, setVariantId] = React.useState(null);
  const [title, setTitle] = React.useState('결정을 기록하는 노트의 구조');
  const [body, setBody] = React.useState(
`1인 창업자에게 결정은 공기처럼 흐른다. 매일 수십 개. 그런데도 대부분 기억에
남지 않는다. 이 글에서 내가 쓰는 결정 노트의 네 칸 구조를 공유한다.

## 네 칸

1. 맥락 — 왜 지금 결정해야 하는가
2. 선택 — 무엇을 선택했는가 (그리고 무엇을 선택하지 않았는가)
3. 근거 — 어떤 데이터·직관·제약이 작용했는가
4. 회고 — 2주 후 이 결정은 어떻게 보이는가

## 한 가지 예시

지난달 가격 티어를 3개에서 2개로 줄였다. 맥락은 중간 티어 이탈률 38%. 선택은
단순화. 근거는 전환 분석과 '선택의 피로' 가설. 회고는 2주 후…`
  );
  const [slides, setSlides] = React.useState([
    { id: 's1', bg: 'oklch(0.35 0.04 280)', title: '결정 노트: 네 칸이면 충분하다', sub: '1인 창업자를 위한 기록법' },
    { id: 's2', bg: 'oklch(0.35 0.05 220)', title: '맥락', sub: '왜 지금 결정해야 하는가' },
    { id: 's3', bg: 'oklch(0.35 0.05 180)', title: '선택', sub: '무엇을 선택했고 무엇을 버렸나' },
    { id: 's4', bg: 'oklch(0.35 0.05 150)', title: '근거', sub: '데이터·직관·제약' },
    { id: 's5', bg: 'oklch(0.35 0.05 85)', title: '회고', sub: '2주 후 되돌아보기' },
    { id: 's6', bg: 'oklch(0.35 0.06 30)', title: '한 가지 예시', sub: '가격 티어 3→2' },
    { id: 's7', bg: 'oklch(0.28 0.01 250)', title: '저장하세요', sub: '@moonlight.pro' },
  ]);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const [drag, setDrag] = React.useState(null);
  const [extraSuggestions, setExtraSuggestions] = React.useState([]);
  const [pendingSend, setPendingSend] = React.useState(null); // 'publish' | 'schedule' | null
  const [lastSentAt, setLastSentAt] = React.useState(null);
  const [autoSave, setAutoSave] = React.useState(true);
  const [localMirror, setLocalMirror] = React.useState(true);
  const [saveState, setSaveState] = React.useState('idle');
  const [lastSavedAt, setLastSavedAt] = React.useState(null);
  const [localSavedAt, setLocalSavedAt] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const loadedItemRef = React.useRef(null);

  const formatTime = (d) => {
    try {
      return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    } catch {
      return d.toISOString().slice(11, 19);
    }
  };

  const variantType = mode === 'carousel' ? 'card_news' : 'blog_insight';
  const currentBodyPayload = React.useMemo(() => (
    mode === 'carousel'
      ? { slides, format: 'instagram-carousel', export: { target: 'google_drive' } }
      : body
  ), [body, mode, slides]);

  const applyDraft = React.useCallback((draft, { restored = false } = {}) => {
    if (!draft) return;
    if (draft.contentId) setContentId(draft.contentId);
    if (draft.variantId) setVariantId(draft.variantId);
    if (draft.mode === 'carousel' || draft.mode === 'blog') setMode(draft.mode);
    if (typeof draft.title === 'string') setTitle(draft.title);
    if (typeof draft.body === 'string') setBody(draft.body);
    if (Array.isArray(draft.slides) && draft.slides.length) setSlides(draft.slides);
    if (draft.updatedAt) setLocalSavedAt(draft.updatedAt);
    setDirty(false);
    if (restored) setSaveState('restored');
  }, []);

  React.useEffect(() => {
    let active = true;
    if (itemParam) return undefined;

    readStudioDraft(ACTIVE_DRAFT_KEY).then((draft) => {
      if (!active || !draft) return;
      applyDraft(draft, { restored: true });
    });

    return () => {
      active = false;
    };
  }, [applyDraft, itemParam]);

  React.useEffect(() => {
    if (!itemParam || loadedItemRef.current === itemParam || ledger.source !== "supabase") return;

    const item = ledger.items.find((candidate) => candidate.id === itemParam);
    if (!item) return;

    const variant = ledger.variants.find((candidate) => (
      candidate.id === item.variantId || candidate.contentId === item.id
    ));
    const nextMode = variant?.type === "card_news" ? "carousel" : "blog";
    const nextSlides = variant?.type === "card_news" ? parseVariantSlides(variant.body) : null;

    setContentId(item.id);
    setVariantId(variant?.id || item.variantId || null);
    setMode(nextMode);
    setTitle(variant?.title || item.title);
    if (nextMode === "carousel" && nextSlides) {
      setSlides(nextSlides);
    } else if (variant?.body && nextMode === "blog") {
      setBody(variant.body);
    }
    setLastSavedAt(variant?.updatedAt || item.updatedAt || null);
    setDirty(false);
    setSaveState("loaded");
    loadedItemRef.current = itemParam;
  }, [itemParam, ledger]);

  React.useEffect(() => {
    if (!localMirror) return undefined;

    const key = contentId ? `item:${contentId}` : ACTIVE_DRAFT_KEY;
    const draft = {
      contentId,
      variantId,
      mode,
      title,
      body,
      slides,
    };
    const timer = window.setTimeout(async () => {
      const ok = await writeStudioDraft(key, draft);
      if (key !== ACTIVE_DRAFT_KEY) await writeStudioDraft(ACTIVE_DRAFT_KEY, draft);
      if (ok) setLocalSavedAt(new Date().toISOString());
    }, 450);

    return () => window.clearTimeout(timer);
  }, [body, contentId, localMirror, mode, slides, title, variantId]);

  const saveDraft = React.useCallback(async (reason = "manual") => {
    if (!autoSave && reason === "autosave") return;

    const method = contentId && variantId ? "PATCH" : "POST";
    setSaveState("saving");

    try {
      const response = await fetch("/api/hub/content", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentId,
          variantId,
          title,
          body: currentBodyPayload,
          sourceIdea: title,
          summary: mode === "carousel" ? `${slides.length} card news slides` : bodySummary(body),
          excerpt: mode === "carousel" ? slides[0]?.sub || slides[0]?.title || "" : bodySummary(body),
          status: "draft",
          variantStatus: "draft",
          variantType,
          visibility: "private",
          previewKind: mode === "blog" ? "web_article" : "card_news",
          localMirror,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok && data.status !== "preview" && data.status !== "saved") {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      if (data.contentId) setContentId(data.contentId);
      if (data.variantId) setVariantId(data.variantId);
      setLastSavedAt(new Date().toISOString());
      setSaveState(data.status === "preview" ? "preview" : "saved");
      setDirty(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setSaveState("error");
      setExtraSuggestions(s => [{ tone: 'danger', text: `저장 실패 — ${msg}` }, ...s]);
    }
  }, [autoSave, body, contentId, currentBodyPayload, localMirror, mode, slides, title, variantId, variantType]);

  React.useEffect(() => {
    if (!autoSave || !dirty) return undefined;

    const timer = window.setTimeout(() => {
      saveDraft("autosave");
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [autoSave, dirty, saveDraft]);

  async function dispatchEmail(action) {
    setPendingSend(action);
    const startedAt = Date.now();
    const dryRun = action === 'schedule';
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: dryRun ? 'dry-run' : 'send',
          channel: 'resend',
          to: 'me@moonlight.pro',
          recipientEmail: 'me@moonlight.pro',
          subject: title,
          body,
          dryRun,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const elapsed = Date.now() - startedAt;
      if (elapsed < 100) await new Promise(r => setTimeout(r, 100 - elapsed));

      if (!response.ok && data.status !== 'preview' && data.status !== 'sent') {
        const msg = data.error || data.message || `HTTP ${response.status}`;
        setExtraSuggestions(s => [{ tone: 'danger', text: `발행 실패 — ${msg}` }, ...s]);
        return;
      }

      const now = new Date();
      setLastSentAt(now);
      if (dryRun) {
        const detail = data.message || data.status || 'ok';
        setExtraSuggestions(s => [{ tone: 'info', text: `dry-run · ${detail}` }, ...s]);
      } else {
        const id = data.id ?? data.preview?.id ?? 'preview';
        setExtraSuggestions(s => [{ tone: 'info', text: `발행 요청 — id: ${id}` }, ...s]);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setExtraSuggestions(s => [{ tone: 'danger', text: `발행 실패 — ${msg}` }, ...s]);
    } finally {
      setPendingSend(null);
    }
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.round(wordCount / 180));
  const saveLabel = saveState === "saving"
    ? "saving…"
    : saveState === "error"
    ? (localSavedAt ? `local saved · ${formatTime(new Date(localSavedAt))}` : "save failed")
    : lastSavedAt
    ? `cloud saved · ${formatTime(new Date(lastSavedAt))}`
    : localSavedAt
    ? `local mirror · ${formatTime(new Date(localSavedAt))}`
    : mode === 'blog'
    ? `${wordCount} words · ${readingTime}min read`
    : `${slides.length} slides · Google Drive export`;

  const moveSlide = (from, to) => {
    if (from === to) return;
    setSlides(s => { const n = s.slice(); const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
    setActiveSlide(to);
    setDirty(true);
  };
  const addSlide = () => {
    setSlides(s => [...s, { id: 'new-' + Date.now(), bg: 'oklch(0.3 0.02 250)', title: 'New slide', sub: '' }]);
    setDirty(true);
  };
  const updateSlide = (i, patch) => {
    setSlides(s => s.map((x, j) => j === i ? { ...x, ...patch } : x));
    setDirty(true);
  };
  const removeSlide = (i) => {
    setSlides(s => s.filter((_, j) => j !== i));
    setDirty(true);
  };

  const cur = slides[activeSlide] || slides[0];

  return (
    <div className="hub-studio-shell" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
            {[{k:'blog',l:'Blog / Insight'},{k:'carousel',l:'Card News'}].map(m => (
              <button key={m.k} onClick={() => { setMode(m.k); setDirty(true); }} style={{
                padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
                color: mode === m.k ? 'var(--fg)' : 'var(--fg-faint)',
                background: mode === m.k ? 'var(--surface-3)' : 'transparent',
              }}>{m.l}</button>
            ))}
          </div>
          <Badge tone="warning" size="xs">Draft</Badge>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            {mode === 'blog' ? <>Web article · <span className="mono">{contentId ? contentId.slice(0, 8) : 'LOCAL'}</span></> : <>Card News · <span className="mono">{variantId ? variantId.slice(0, 8) : 'LOCAL'}</span> · {slides.length} slides</>}
          </span>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
            {lastSentAt
              ? `sent · ${formatTime(lastSentAt)}`
              : saveLabel}
          </span>
          <IconButton
            icon="upload"
            tooltip={autoSave ? "Supabase autosave on" : "Supabase autosave off"}
            onClick={() => setAutoSave(v => !v)}
            style={{ color: autoSave ? 'var(--moon-200)' : 'var(--fg-faint)' }}
          />
          <IconButton
            icon="folder"
            tooltip={localMirror ? "Browser mirror on" : "Browser mirror off"}
            onClick={() => setLocalMirror(v => !v)}
            style={{ color: localMirror ? 'var(--moon-200)' : 'var(--fg-faint)' }}
          />
          <IconButton
            icon="check"
            tooltip="Save now"
            onClick={() => saveDraft("manual")}
            style={{ color: saveState === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}
          />
          <IconButton icon="eye" tooltip="Preview" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dispatchEmail('schedule')}
          >
            {pendingSend === 'schedule' ? 'Sending…' : 'Schedule'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="send"
            onClick={() => dispatchEmail('publish')}
          >
            {pendingSend === 'publish' ? 'Sending…' : 'Publish'}
          </Button>
        </div>

        {mode === 'blog' && (
          <>
            <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 4, flexShrink: 0 }}>
              {[
                { i: 'sparkle', t: 'AI' }, { t: '|' }, { l: 'H1' }, { l: 'H2' }, { l: 'B', style: { fontWeight: 700 } },
                { l: 'i', style: { fontStyle: 'italic' } }, { t: '|' }, { i: 'link' }, { i: 'upload', t: 'Image' },
              ].map((b, i) => b.t === '|' ? <div key={i} style={{ width: 1, background: 'var(--line-soft)', margin: '0 2px' }} /> : (
                <button key={i} style={{ height: 26, padding: '0 9px', borderRadius: 4, fontSize: 11.5, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, ...(b.style || {}) }}>
                  {b.i && <Iconed name={b.i} size={12} />}
                  {b.l && <span>{b.l}</span>}
                  {b.t && <span>{b.t}</span>}
                </button>
              ))}
            </div>
            <div className="scroll-y" style={{ flex: 1, padding: '40px 20px' }}>
              <div style={{ maxWidth: 680, margin: '0 auto' }}>
                <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4,
                }} />
                <div style={{ fontSize: 13, color: 'var(--fg-faint)', marginBottom: 28 }}>By Hyeon Park · Web article preview 우선 · n8n handoff 대기</div>
                <textarea value={body} onChange={e => { setBody(e.target.value); setDirty(true); }} style={{
                  width: '100%', minHeight: 420, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                  color: 'var(--fg)', fontSize: 15, lineHeight: 1.7, fontFamily: 'var(--font-sans)', letterSpacing: '-0.005em',
                }} />
                <div style={{
                  marginTop: 24,
                  padding: 18,
                  border: '1px solid var(--line-soft)',
                  borderRadius: 'var(--r-lg)',
                  background: 'var(--surface)',
                }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 12 }}>Web article preview</div>
                  <h3 style={{ margin: 0, fontSize: 22, fontWeight: 550, lineHeight: 1.25, color: 'var(--fg)' }}>{title}</h3>
                  <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.75, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap' }}>
                    {body.slice(0, 1200)}
                    {body.length > 1200 ? '…' : ''}
                  </div>
                </div>
                <div style={{ marginTop: 24 }}>
                  <Placeholder label="inline figure — decision note 4-box" h={220} />
                  <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 6 }}>Figure 1 · 네 칸 구조 다이어그램</div>
                </div>
              </div>
            </div>
          </>
        )}

        {mode === 'carousel' && (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 }}>
              {slides.map((s, i) => (
                <div key={s.id}
                  draggable onDragStart={() => setDrag(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => drag !== null && moveSlide(drag, i)}
                  onClick={() => setActiveSlide(i)}
                  style={{
                    width: 72, height: 72, flexShrink: 0, position: 'relative', cursor: 'grab',
                    borderRadius: 8, background: s.bg,
                    border: activeSlide === i ? '2px solid var(--moon-200)' : '1px solid var(--line-soft)',
                    display: 'flex', flexDirection: 'column', padding: 6, justifyContent: 'flex-end',
                    color: '#fff', fontSize: 8, lineHeight: 1.2,
                    opacity: drag === i ? 0.4 : 1,
                  }}>
                  <div style={{ fontWeight: 600 }}>{s.title.slice(0, 18)}</div>
                  <div style={{ position: 'absolute', top: 3, left: 6, fontSize: 8, color: 'rgba(255,255,255,0.6)' }} className="mono">{i + 1}</div>
                </div>
              ))}
              <button onClick={addSlide} style={{
                width: 72, height: 72, flexShrink: 0, border: '1px dashed var(--line)', borderRadius: 8,
                background: 'var(--surface-2)', color: 'var(--fg-muted)', fontSize: 20,
              }}>＋</button>
            </div>

            <div className="hub-studio-canvas scroll-y" style={{ flex: 1, padding: 'var(--section-gap)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div className="hub-carousel-preview" style={{
                  width: 420, height: 420, background: cur.bg, borderRadius: 12,
                  position: 'relative', overflow: 'hidden',
                  boxShadow: '0 20px 60px -20px oklch(0 0 0 / 0.5)',
                }}>
                  <div className="mono" style={{ position: 'absolute', top: 16, left: 18, fontSize: 11, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em' }}>
                    {String(activeSlide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                  </div>
                  <div style={{ position: 'absolute', bottom: 28, left: 28, right: 28, color: '#fff' }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{cur.sub}</div>
                    <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' }}>{cur.title}</div>
                  </div>
                  <div style={{ position: 'absolute', top: 18, right: 18, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>@moonlight.pro</div>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {slides.map((_, i) => (
                    <div key={i} style={{
                      width: i === activeSlide ? 16 : 6, height: 6, borderRadius: 999,
                      background: i === activeSlide ? 'var(--moon-200)' : 'var(--surface-3)',
                      transition: 'width .15s',
                    }} />
                  ))}
                </div>
              </div>

              <Card className="hub-studio-card" style={{ width: 320 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 10 }}>Slide {activeSlide + 1}</div>
                <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Title</label>
                <input value={cur.title} onChange={e => updateSlide(activeSlide, { title: e.target.value })}
                  style={{ width: '100%', marginTop: 4, marginBottom: 12, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none' }} />
                <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Subtitle</label>
                <input value={cur.sub} onChange={e => updateSlide(activeSlide, { sub: e.target.value })}
                  style={{ width: '100%', marginTop: 4, marginBottom: 12, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none' }} />
                <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Background</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                  {['oklch(0.35 0.04 280)','oklch(0.35 0.05 220)','oklch(0.35 0.05 180)','oklch(0.35 0.05 150)','oklch(0.35 0.05 85)','oklch(0.35 0.06 30)','oklch(0.28 0.01 250)','oklch(0.95 0 0)'].map(c => (
                    <button key={c} onClick={() => updateSlide(activeSlide, { bg: c })}
                      style={{ width: 26, height: 26, borderRadius: 6, background: c, border: cur.bg === c ? '2px solid var(--moon-200)' : '1px solid var(--line-soft)' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="outline" size="xs" icon="upload">Photo</Button>
                  <div style={{ flex: 1 }} />
                  <Button variant="ghost" size="xs" onClick={() => removeSlide(activeSlide)}>Delete</Button>
                </div>
                <div style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                  <Iconed name="sparkle" size={11} style={{ color: 'var(--moon-300)' }} /> 드래그로 순서 편집 · 썸네일 클릭으로 선택
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      <aside style={{ borderLeft: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Iconed name="sparkle" size={14} style={{ color: 'var(--moon-300)' }} />
          <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>Writer · Studio Agent</div>
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--fg-faint)', letterSpacing: '0.1em' }}>Suggestions</div>
          {[...extraSuggestions, ...(mode === 'blog' ? [
            { tone: 'info', text: '제목 A/B: "결정 노트: 네 칸이면 충분하다"' },
            { tone: 'moon', text: '"네 칸" 섹션 끝에 독자 질문 한 줄 추가 추천' },
            { tone: 'warning', text: '중복 표현 감지: "기억에 남지 않는다" (2회)' },
          ] : [
            { tone: 'info', text: '카드 1 훅 강화: 숫자를 앞에 — "4칸"' },
            { tone: 'moon', text: '카드 2–5 배경색 톤을 한 계열로 통일 추천' },
            { tone: 'warning', text: '마지막 카드 CTA 누락 — 저장/공유 유도' },
          ])].map((s, i) => (
            <div key={i} style={{
              padding: '10px 11px', background: 'var(--surface-2)',
              border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
              fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5,
            }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}><Dot tone={s.tone} /></div>
              {s.text}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Button variant="outline" size="xs">Apply</Button>
                <Button variant="ghost" size="xs">Skip</Button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--fg-faint)', letterSpacing: '0.1em', marginTop: 8 }}>Settings</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span>Channel</span><span style={{ color: 'var(--fg)' }}>{mode === 'blog' ? 'Email (Resend)' : 'Instagram + X'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span>Audience</span><span style={{ color: 'var(--fg)' }}>{mode === 'blog' ? '2,143 subscribers' : '공개'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span>Schedule</span><span style={{ color: 'var(--fg)' }}>오늘 18:00</span>
            </div>
          </div>
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)' }}>
            <Iconed name="sparkle" size={12} style={{ color: 'var(--moon-300)' }} />
            <input placeholder={mode === 'blog' ? 'Ask Writer…' : 'Ask Studio — slide copy, layout…'} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 12 }} />
            <Kbd>⏎</Kbd>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function Queue() {
  const router = useRouter();
  const [tab, setTab] = React.useState('all');
  const ledger = useContentLedger();
  const queue = ledger.source === "supabase"
    ? (Array.isArray(ledger.queue) ? ledger.queue : [])
    : (ledger.queue?.length ? ledger.queue : FALLBACK_CONTENT_QUEUE);
  const statusTone = { Draft: 'warning', Scheduled: 'info', Review: 'moon', Idea: 'neutral', Outline: 'neutral', Published: 'success' };
  const draftCount = queue.filter(c => c.status === 'Draft').length;
  const scheduledCount = queue.filter(c => c.status === 'Scheduled').length;
  const tabs = [
    { key: 'all', label: 'All', count: queue.length },
    { key: 'draft', label: 'Draft', count: draftCount },
    { key: 'scheduled', label: 'Scheduled', count: scheduledCount },
  ];
  const visibleQueue = tab === 'all'
    ? queue
    : queue.filter(c => c.status.toLowerCase() === tab);
  const activeLabel = tabs.find(t => t.key === tab)?.label || 'All';
  const openStudio = React.useCallback((id) => {
    router.push(`/dashboard/content/studio${id ? `?item=${encodeURIComponent(id)}` : '?new=draft'}`);
  }, [router]);
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Publishing queue</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {visibleQueue.length}{tab !== 'all' ? ` of ${queue.length}` : ''} items in pipeline
            <span className="mono" style={{ marginLeft: 8, color: ledger.syncState === 'live' ? 'var(--success)' : ledger.syncState === 'loading' ? 'var(--warning)' : 'var(--fg-faint)' }}>
              {ledger.syncState === 'live' ? 'live' : ledger.syncState === 'loading' ? 'syncing' : 'mock'}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Tabs className="hub-toolbar" tabs={tabs} active={tab} onChange={setTab} ariaLabel="Publishing queue filters" style={{ borderBottom: 'none' }} />
        <Button variant="primary" size="sm" icon="plus" onClick={() => openStudio()}>Draft</Button>
      </div>

      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 130px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>Title</span><span>Kind</span><span>Channel</span><span>Status</span><span>When</span><span style={{ textAlign: 'right' }}>Author</span>
        </div>
        {visibleQueue.length === 0 && (
          <EmptyState
            icon="queue"
            title={tab === 'all' ? '발행 큐가 비어 있습니다' : `${activeLabel} 항목이 없습니다`}
            description={tab === 'all'
              ? (ledger.syncState === 'live' ? 'Supabase content_items/content_variants 원장에 표시할 콘텐츠가 없습니다.' : '초안을 만들면 큐와 파이프라인에 표시됩니다.')
              : `${activeLabel} 상태의 콘텐츠가 생기면 이 필터에 표시됩니다.`}
            action={<Button variant="primary" size="sm" icon="plus" onClick={() => openStudio()}>Draft</Button>}
          />
        )}
        {visibleQueue.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 130px 80px',
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < visibleQueue.length - 1 ? '1px solid var(--line-soft)' : 'none',
            cursor: 'pointer',
          }}
            role="button"
            tabIndex={0}
            onClick={() => openStudio(c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openStudio(c.id);
              }
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Iconed name={c.kind === 'Newsletter' ? 'email' : c.kind === 'Blog' ? 'content' : c.kind === 'Reel' ? 'play' : 'send'} size={13} style={{ color: 'var(--fg-faint)' }} />
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.kind}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.channel}</span>
            <span><Badge tone={statusTone[c.status] || 'neutral'} size="xs">{c.status}</Badge></span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.when}</span>
            <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--fg-muted)' }}>{c.author}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const CAMPAIGN_WAR_ROOMS = {
  cm1: {
    pulse: {
      positioning: '1인 창업자가 봄 시즌 운영 리듬을 2주 안에 되찾게 만드는 cohort launch.',
      nextMove: 'Landing hero proof를 보강하고, 24시간 내 warm lead 8명에게 founder-note follow-up을 보냅니다.',
      risk: '신청 수는 좋지만 회사 리드와 개인 리드가 한 offer 안에서 섞여 메시지가 흐려질 수 있습니다.',
      ai: [
        { label: 'Push', detail: '개인 창업자용 pain copy를 첫 화면에 고정', tone: 'moon' },
        { label: 'Pause', detail: 'X thread 3번 소재는 proof 부족. 케이스 인용 전까지 보류', tone: 'warning' },
        { label: 'Ask', detail: '신청자 5명에게 "왜 지금인가" 한 문장 회수', tone: 'info' },
      ],
      metrics: [
        { label: 'Goal', value: '24 / 40', detail: '신청 60%', tone: 'moon' },
        { label: 'Pipeline', value: '₩18.0M', detail: '2 company deals', tone: 'success' },
        { label: 'Lead fit', value: '72%', detail: 'ICP match', tone: 'info' },
        { label: 'Risk', value: '2', detail: 'message split', tone: 'warning' },
      ],
    },
    strategy: {
      icp: '운영은 직접 하지만 콘텐츠, 리드, 루틴이 흩어진 1인 창업자와 boutique operator.',
      promise: '매일 아침 무엇을 해야 하는지 보이고, 발행과 follow-up이 끊기지 않는 운영 리듬.',
      wedge: 'Daily Brief + Content Queue + Revenue follow-up을 하나의 cohort ritual로 묶습니다.',
      enemy: '좋은 생각은 많은데, 실행 표면이 Notion, Gmail, 캘린더, Slack으로 흩어지는 상태.',
      proof: ['뉴스레터 #47 draft to send loop', 'Gmail to CRM 태깅 17건', '클래스인 deal follow-up 지연 감지'],
      decisions: [
        { label: '개인/회사 offer를 같은 랜딩에서 분기', status: 'Trial', owner: 'Me' },
        { label: '가격표보다 운영 리듬 proof를 먼저 노출', status: 'Committed', owner: 'Council' },
        { label: '신청 CTA는 "상담" 대신 "운영 리듬 점검"', status: 'Watch', owner: 'Me' },
      ],
    },
    surfaces: [
      { type: 'Landing', name: 'Spring Cohort landing', role: 'Primary conversion', status: 'Live', cta: '운영 리듬 점검 신청', signal: '24 signups', url: '/spring-cohort?utm_campaign=cm1' },
      { type: 'Insight', name: '1인 창업자의 운영 OS 만들기', role: 'Trust asset', status: 'Scheduled', cta: 'Daily Brief 보기', signal: 'Queue c2', url: '/insights/operating-os' },
      { type: 'Newsletter', name: '뉴스레터 #47', role: 'Warm audience push', status: 'Draft', cta: 'Cohort waitlist', signal: '2,143 subs', url: 'Email' },
      { type: 'X Thread', name: '결정 기록하기', role: 'Top-of-funnel hook', status: 'Scheduled', cta: 'Read the full note', signal: 'Queue c6', url: 'x.com' },
      { type: 'Referral', name: 'Founder intro link', role: 'Warm referral', status: 'Review', cta: '소개 코드로 신청', signal: '3 intros', url: '/spring-cohort/ref' },
    ],
    content: [
      { title: '뉴스레터 #47 · 4월 둘째 주', stage: 'Draft', channel: 'Email', action: '2번 섹션 proof 보강' },
      { title: '1인 창업자의 운영 OS 만들기', stage: 'Scheduled', channel: 'Web', action: '랜딩 CTA 연결 확인' },
      { title: 'Thread · 결정 기록하기', stage: 'Scheduled', channel: 'X', action: '첫 문장 A/B 준비' },
      { title: 'Cohort landing hero proof', stage: 'Review', channel: 'Web', action: '클래스인 신호 익명화' },
    ],
    audience: [
      { segment: 'Warm founders', count: 2143, fit: 78, next: 'Founder-note email', source: 'Newsletter' },
      { segment: 'Company operators', count: 47, fit: 63, next: 'Case-study CTA', source: 'LinkedIn/referral' },
      { segment: 'Personal coaching leads', count: 18, fit: 84, next: 'DM follow-up', source: 'X' },
    ],
    attribution: [
      { channel: 'Newsletter', spend: '₩0', leads: 14, pipeline: '₩4.2M', note: 'highest intent' },
      { channel: 'Referral', spend: '₩0', leads: 6, pipeline: '₩9.8M', note: 'best deal quality' },
      { channel: 'X', spend: '₩0', leads: 4, pipeline: '₩0.9M', note: 'top funnel only' },
      { channel: 'Landing direct', spend: '₩0', leads: 8, pipeline: '₩3.1M', note: 'CTA copy test needed' },
    ],
    automations: [
      { name: '뉴스레터 발행 → Resend', status: 'Active', ai: 'AI 교정', last: '어제', health: '1/1 ok' },
      { name: 'Gmail → CRM 리드 태깅', status: 'Active', ai: 'AI 분류', last: '3분 전', health: '15/17 ok' },
      { name: '리드 무응답 3일 → 리마인더', status: 'Active', ai: 'Follow-up draft', last: '오늘', health: '2/2 ok' },
      { name: 'Landing form → campaign_id 기록', status: 'Draft', ai: 'None', last: 'not live', health: 'needs webhook' },
    ],
    activity: [
      '오늘 11:02 · 클래스인 follow-up email 기록, campaign source 연결',
      '어제 18:00 · Resend dry-run 성공, newsletter CTA 대기',
      '어제 11:08 · Council이 referral conversion을 강한 신호로 표시',
    ],
  },
  cm2: {
    pulse: {
      positioning: '개인 브랜드 사이트를 신뢰 자산과 리드 캡처 표면으로 전환하는 launch system.',
      nextMove: 'About hero보다 proof strip을 먼저 다듬고, insight 2개를 landing CTA에 연결합니다.',
      risk: '브랜드 무드는 좋아졌지만 offer가 아직 "무엇을 맡길 수 있는가"까지 닿지 않습니다.',
      ai: [
        { label: 'Push', detail: 'Case link가 없는 주장에는 proof slot을 붙이기', tone: 'moon' },
        { label: 'Rewrite', detail: 'Hero headline을 역할 설명이 아니라 literal offer로 전환', tone: 'warning' },
        { label: 'Connect', detail: 'Contact form source를 campaign_id로 기록', tone: 'info' },
      ],
      metrics: [
        { label: 'Goal', value: '12 / 200', detail: '구독자 +6%', tone: 'warning' },
        { label: 'Surfaces', value: '4', detail: '2 draft', tone: 'moon' },
        { label: 'Lead fit', value: '58%', detail: 'too broad', tone: 'warning' },
        { label: 'Proof', value: '3', detail: 'case assets', tone: 'info' },
      ],
    },
    strategy: {
      icp: '운영형 창업자, 브랜드/콘텐츠/자동화가 한 번에 필요한 boutique client.',
      promise: '생각과 실행을 한 화면에서 움직이는 private operating system.',
      wedge: '공개 사이트는 미디어가 아니라 proof router가 됩니다.',
      enemy: '예쁜 포트폴리오인데 다음 행동과 신뢰 증거가 없는 상태.',
      proof: ['Hub screenshot reel', 'Revenue follow-up 기록', 'Automation flow canvas'],
      decisions: [
        { label: '랜딩 H1은 브랜드명이 아니라 literal offer 우선', status: 'Committed', owner: 'Me' },
        { label: 'Newsletter opt-in은 footer가 아니라 proof 뒤에 배치', status: 'Trial', owner: 'Writer' },
        { label: '광고는 아직 집행하지 않고 organic proof 먼저', status: 'Watch', owner: 'Council' },
      ],
    },
    surfaces: [
      { type: 'Landing', name: 'Personal brand home', role: 'Primary proof router', status: 'Draft', cta: '운영 상담 신청', signal: 'copy review', url: '/' },
      { type: 'Case', name: 'Moonlight Hub operating case', role: 'Proof asset', status: 'Draft', cta: 'View system', signal: 'screenshots ready', url: '/cases/moonlight-hub' },
      { type: 'Insight', name: '결정을 기록하는 노트의 구조', role: 'Trust asset', status: 'Review', cta: 'Subscribe', signal: 'Studio draft', url: '/insights/decision-note' },
      { type: 'Newsletter', name: 'Launch letter', role: 'Warm launch', status: 'Idea', cta: 'Forward to a founder', signal: 'outline only', url: 'Email' },
    ],
    content: [
      { title: 'Moonlight 대시보드 스크린샷 릴', stage: 'Review', channel: 'Instagram', action: '제품 맥락 캡션 추가' },
      { title: '결정을 기록하는 노트의 구조', stage: 'Draft', channel: 'Newsletter', action: 'case CTA 삽입' },
      { title: 'Personal site proof strip', stage: 'Idea', channel: 'Web', action: '3 proof cards 선별' },
    ],
    audience: [
      { segment: 'Founder operators', count: 86, fit: 72, next: 'Proof-led launch email', source: 'Newsletter' },
      { segment: 'Brand consulting leads', count: 24, fit: 55, next: 'Case study retarget', source: 'Referral' },
    ],
    attribution: [
      { channel: 'Newsletter', spend: '₩0', leads: 5, pipeline: '₩1.2M', note: 'small but warm' },
      { channel: 'Organic X', spend: '₩0', leads: 4, pipeline: '₩0.6M', note: 'needs offer clarity' },
      { channel: 'Direct', spend: '₩0', leads: 3, pipeline: '₩0', note: 'tracking incomplete' },
    ],
    automations: [
      { name: 'Contact form → lead 생성', status: 'Draft', ai: 'Lead summary', last: 'not live', health: 'needs form' },
      { name: 'Newsletter signup → welcome email', status: 'Planning', ai: 'Segment label', last: 'not live', health: 'provider pending' },
    ],
    activity: [
      '오늘 09:30 · proof strip copy review 필요',
      '어제 16:20 · case outline이 Studio draft로 이동',
      '2일 전 · Council이 광고 집행 보류 추천',
    ],
  },
  cm3: {
    pulse: {
      positioning: '연말 회고를 콘텐츠 자산으로 바꿔 다음 해 상담과 구독으로 이어지게 만드는 long-tail campaign.',
      nextMove: '첫 회고의 관찰 프레임을 정하고, 4편의 반복 구조를 고정합니다.',
      risk: '아직 시즌성이 멀어서 지금은 production rhythm보다 archive strategy가 더 중요합니다.',
      ai: [
        { label: 'Frame', detail: '회고 4편을 decision, revenue, rhythm, automation으로 분리', tone: 'moon' },
        { label: 'Hold', detail: '발행 스케줄은 11월 전까지 확정하지 않기', tone: 'neutral' },
        { label: 'Collect', detail: '매주 activity log에서 회고 후보 자동 수집', tone: 'info' },
      ],
      metrics: [
        { label: 'Goal', value: '0 / 4', detail: '회고 4편', tone: 'neutral' },
        { label: 'Assets', value: '6', detail: 'raw notes', tone: 'info' },
        { label: 'Readiness', value: '18%', detail: 'early', tone: 'warning' },
        { label: 'Runs', value: '0', detail: 'not active', tone: 'neutral' },
      ],
    },
    strategy: {
      icp: '한 해를 돌아보며 다음 해 운영 체계를 재설계하려는 creator-founder.',
      promise: '회고가 감상이 아니라 다음 운영 시스템의 입력이 됩니다.',
      wedge: 'Daily Brief, Decisions, Automations 로그를 회고의 raw material로 씁니다.',
      enemy: '좋은 일기처럼 읽히지만 아무 행동도 바꾸지 않는 연말 콘텐츠.',
      proof: ['Decision log', 'Automation runs', 'Revenue movement'],
      decisions: [
        { label: '시즌 전까지 archive만 수집', status: 'Committed', owner: 'Coach' },
        { label: '발행은 4편 series format으로 고정', status: 'Draft', owner: 'Writer' },
      ],
    },
    surfaces: [
      { type: 'Series', name: 'Year-end operating review', role: 'Editorial series', status: 'Draft', cta: 'Subscribe for review kit', signal: 'outline', url: '/insights/year-end' },
      { type: 'Template', name: 'Decision review kit', role: 'Lead magnet', status: 'Idea', cta: 'Download', signal: 'not scoped', url: '/resources/review-kit' },
    ],
    content: [
      { title: '가격 실험 회고', stage: 'Idea', channel: 'Blog', action: '결정 d3 연결' },
      { title: 'Weekly review template update', stage: 'Idea', channel: 'Newsletter', action: 'routine proof 수집' },
    ],
    audience: [
      { segment: 'Existing subscribers', count: 2143, fit: 61, next: 'Waitlist prompt', source: 'Newsletter' },
      { segment: 'Coaching alumni', count: 32, fit: 82, next: 'Personal note', source: 'CRM' },
    ],
    attribution: [
      { channel: 'Newsletter', spend: '₩0', leads: 0, pipeline: '₩0', note: 'not launched' },
      { channel: 'Search', spend: '₩0', leads: 0, pipeline: '₩0', note: 'future long-tail' },
    ],
    automations: [
      { name: 'Activity log → 회고 후보 수집', status: 'Planning', ai: 'Theme clustering', last: 'not live', health: 'needs rule' },
    ],
    activity: [
      '이번 주 · 회고 후보 6개 수집됨',
      '2일 전 · 가격 실험 회고가 Content Queue idea로 이동',
    ],
  },
};

const CAMPAIGN_TABS = [
  { key: 'pulse', label: 'Pulse' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'surfaces', label: 'Surfaces' },
  { key: 'content', label: 'Content' },
  { key: 'audience', label: 'Audience' },
  { key: 'attribution', label: 'Attribution' },
  { key: 'automation', label: 'Automation' },
];

function CampaignMetric({ item }) {
  return (
    <div style={{
      padding: 12,
      background: 'var(--surface-2)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-sm)',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <Dot tone={item.tone || 'moon'} size={6} />
        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</span>
      </div>
      <div className="mono" style={{ fontSize: 18, color: 'var(--fg)', lineHeight: 1 }}>{item.value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.detail}</div>
    </div>
  );
}

function CampaignLine({ label, value, tone = 'moon' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 13, color: tone === 'moon' ? 'var(--fg)' : 'var(--fg-muted)', lineHeight: 1.55 }}>{value}</span>
    </div>
  );
}

function CampaignTabPanel({ tab, campaign, detail }) {
  const sTone = { Active: 'success', Planning: 'warning', Draft: 'neutral', Live: 'success', Scheduled: 'info', Review: 'moon', Idea: 'neutral' };

  if (tab === 'strategy') {
    return (
      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, 0.85fr)', gap: 'var(--gap)' }}>
        <Card>
          <SectionTitle subtitle="브랜드 주장, ICP, offer, proof를 캠페인 기준으로 고정합니다.">Positioning Stack</SectionTitle>
          <CampaignLine label="ICP" value={detail.strategy.icp} />
          <CampaignLine label="Promise" value={detail.strategy.promise} />
          <CampaignLine label="Wedge" value={detail.strategy.wedge} />
          <CampaignLine label="Enemy" value={detail.strategy.enemy} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
          <Card>
            <SectionTitle>Proof Assets</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detail.strategy.proof.map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
                  <Iconed name="check" size={12} style={{ color: 'var(--moon-300)' }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionTitle subtitle="Master log는 Work > Decisions가 소유하고, 여기는 캠페인 관련 결정만 표시합니다.">Decision Bets</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {detail.strategy.decisions.map((item, i) => (
                <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '10px 0', borderBottom: i < detail.strategy.decisions.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.45 }}>{item.label}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Badge tone={item.status === 'Committed' ? 'success' : item.status === 'Trial' ? 'moon' : 'warning'} size="xs">{item.status}</Badge>
                    <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.owner}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (tab === 'surfaces') {
    return (
      <Card pad={false} className="hub-table-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
          <SectionTitle style={{ marginBottom: 0 }} subtitle="랜딩, 홍보, 광고, referral, 공개 콘텐츠를 이 캠페인 기준으로 묶습니다.">Connected Surfaces</SectionTitle>
        </div>
        {detail.surfaces.map((item, i) => (
          <div key={`${item.type}-${item.name}`} style={{
            display: 'grid',
            gridTemplateColumns: '96px minmax(180px, 1.2fr) minmax(150px, 0.9fr) minmax(130px, 0.8fr) minmax(130px, 0.7fr)',
            gap: 12,
            padding: '13px 18px',
            alignItems: 'center',
            borderBottom: i < detail.surfaces.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}>
            <Badge tone={sTone[item.status] || 'neutral'} size="xs">{item.type}</Badge>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.url}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.role}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.cta}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.signal}</span>
          </div>
        ))}
      </Card>
    );
  }

  if (tab === 'content') {
    return (
      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 'var(--gap)' }}>
        <Card pad={false} className="hub-table-card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <SectionTitle style={{ marginBottom: 0 }} subtitle="Studio와 Queue를 대체하지 않고, 캠페인에 묶인 소재만 보여줍니다.">Campaign Content</SectionTitle>
          </div>
          {detail.content.map((item, i) => (
            <div key={item.title} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px minmax(150px, 0.8fr)', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: i < detail.content.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Iconed name={item.channel === 'Email' || item.channel === 'Newsletter' ? 'email' : item.channel === 'Web' ? 'globe' : 'content'} size={13} style={{ color: 'var(--fg-faint)' }} />
                <span style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
              </div>
              <Badge tone={sTone[item.stage] || 'neutral'} size="xs">{item.stage}</Badge>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.channel}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.action}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SectionTitle subtitle="AI가 한 소재를 여러 표면으로 바꾸는 큐입니다.">Repurpose Queue</SectionTitle>
          {['Newsletter → X thread', 'Landing proof → ad hook', 'Case note → email intro'].map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <Iconed name="sparkle" size={12} style={{ color: 'var(--moon-300)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>{item}</span>
            </div>
          ))}
          <Button variant="outline" size="sm" icon="studio" style={{ marginTop: 12, width: '100%' }}>Open Studio</Button>
        </Card>
      </div>
    );
  }

  if (tab === 'audience') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'var(--gap)' }}>
        {detail.audience.map((item) => (
          <Card key={item.segment}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={item.segment} size={30} tone={item.fit >= 75 ? 'personal' : 'company'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.segment}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>{item.source}</div>
              </div>
              <span className="mono" style={{ fontSize: 16, color: 'var(--fg)' }}>{item.count}</span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>ICP fit</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{item.fit}%</span>
              </div>
              <Progress value={item.fit} tone={item.fit >= 75 ? 'moon' : 'warning'} />
            </div>
            <div style={{ marginTop: 12, padding: '9px 10px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', fontSize: 12, color: 'var(--fg-muted)' }}>
              Next: {item.next}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (tab === 'attribution') {
    return (
      <Card pad={false} className="hub-table-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
          <SectionTitle style={{ marginBottom: 0 }} subtitle="Revenue 전체가 아니라 이 캠페인이 만든 리드와 pipeline만 봅니다.">Campaign Attribution</SectionTitle>
        </div>
        {detail.attribution.map((item, i) => (
          <div key={item.channel} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px minmax(160px, 1fr)', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: i < detail.attribution.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--fg)' }}>{item.channel}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.spend}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg)' }}>{item.leads} leads</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--moon-200)' }}>{item.pipeline}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.note}</span>
          </div>
        ))}
      </Card>
    );
  }

  if (tab === 'automation') {
    return (
      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 'var(--gap)' }}>
        <Card pad={false} className="hub-table-card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <SectionTitle style={{ marginBottom: 0 }} subtitle="전체 flow builder는 Automations가 소유하고, 여기는 캠페인 관련 runtime만 표시합니다.">AI and Automation Runtime</SectionTitle>
          </div>
          {detail.automations.map((item, i) => (
            <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 150px 100px 90px', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: i < detail.automations.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Iconed name={item.ai === 'None' ? 'zap' : 'sparkle'} size={13} style={{ color: item.ai === 'None' ? 'var(--fg-faint)' : 'var(--moon-300)' }} />
                <span style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
              </div>
              <Badge tone={item.status === 'Active' ? 'success' : item.status === 'Draft' ? 'neutral' : 'warning'} size="xs">{item.status}</Badge>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.ai}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.last}</span>
              <span className="mono" style={{ fontSize: 11, color: item.health.includes('needs') ? 'var(--warning)' : 'var(--success)' }}>{item.health}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SectionTitle subtitle="approval이 필요한 자동 실행만 여기에 떠야 합니다.">Guardrails</SectionTitle>
          {['광고비 지출 전 수동 승인', '새 lead email 발송 전 dry-run', 'CTA 변경 시 decision 기록'].map((item) => (
            <div key={item} style={{ display: 'flex', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5, color: 'var(--fg-muted)' }}>
              <Iconed name="lock" size={12} style={{ color: 'var(--fg-faint)', marginTop: 2 }} />
              <span>{item}</span>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
        <Card>
          <SectionTitle subtitle="오늘 이 캠페인에서 움직여야 할 판단입니다.">Operator Pulse</SectionTitle>
          <div style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.55, marginBottom: 14 }}>{detail.pulse.positioning}</div>
          <CampaignLine label="Next move" value={detail.pulse.nextMove} />
          <CampaignLine label="Risk" value={detail.pulse.risk} tone="muted" />
        </Card>
        <Card>
          <SectionTitle subtitle="AI는 실행자가 아니라 campaign operator를 보조하는 판단 레이어입니다.">AI Recommendations</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {detail.pulse.ai.map((item) => (
              <div key={item.label} style={{ padding: 12, border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
                <Badge tone={item.tone} size="xs">{item.label}</Badge>
                <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5, marginTop: 8 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <SectionTitle subtitle="캠페인 단위 실행 기록입니다. 전체 로그는 Evolution/Automations가 소유합니다.">Recent Activity</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {detail.activity.map((item, i) => (
            <div key={item} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, padding: '10px 0', borderBottom: i < detail.activity.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <Dot tone={i === 0 ? 'moon' : 'neutral'} size={7} style={{ marginTop: 6 }} />
              <span style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function Campaigns() {
  const sTone = { Active: 'success', Planning: 'warning', Draft: 'neutral' };
  const [selectedId, setSelectedId] = React.useState(FALLBACK_CAMPAIGNS[0]?.id);
  const [tab, setTab] = React.useState('pulse');
  const [focusMode, setFocusMode] = React.useState(false);
  const selected = FALLBACK_CAMPAIGNS.find(c => c.id === selectedId) || FALLBACK_CAMPAIGNS[0];
  const detail = CAMPAIGN_WAR_ROOMS[selected.id] || CAMPAIGN_WAR_ROOMS.cm1;
  const activeTabLabel = CAMPAIGN_TABS.find(t => t.key === tab)?.label || 'Pulse';

  React.useEffect(() => {
    if (!focusMode) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  const toggleFocusMode = React.useCallback(() => {
    setFocusMode(v => !v);
  }, []);
  const selectCampaign = React.useCallback((id) => {
    setSelectedId(id);
    setTab('pulse');
    setFocusMode(false);
  }, []);
  const focusCampaign = React.useCallback((id) => {
    setSelectedId(id);
    setTab('pulse');
    setFocusMode(true);
  }, []);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Campaigns</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>Content 안에서 Revenue, Automations, Decisions를 캠페인 기준으로 묶는 war room</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus">Campaign</Button>
      </div>

      <div
        className="campaign-war-room"
        data-focus={focusMode ? 'true' : 'false'}
        style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 'var(--gap)', alignItems: 'start' }}
      >
        <aside className="campaign-war-room__list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FALLBACK_CAMPAIGNS.map(c => {
            const active = c.id === selected.id;
            const cDetail = CAMPAIGN_WAR_ROOMS[c.id] || detail;
            return (
              <div key={c.id} role="button" tabIndex={0} onClick={() => selectCampaign(c.id)} onDoubleClick={() => focusCampaign(c.id)} onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectCampaign(c.id);
                }
              }} style={{
                width: '100%',
                textAlign: 'left',
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 'var(--r-lg)',
              }}>
                <Card style={{
                  borderColor: active ? 'var(--line-strong)' : 'var(--line-soft)',
                  background: active ? 'var(--surface-2)' : 'var(--surface)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <Badge tone={sTone[c.status]} size="xs">{c.status}</Badge>
                        <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>ends {c.end}</span>
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    </div>
                    <button type="button" aria-label={`${c.name} 상세 확대`} title="Focus campaign" onClick={(e) => { e.stopPropagation(); focusCampaign(c.id); }} style={{
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--r-sm)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: active ? 'var(--moon-300)' : 'var(--fg-faint)',
                      background: active ? 'var(--surface-3)' : 'transparent',
                      border: '1px solid transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginTop: -4,
                    }}>
                      <Iconed name="chevronR" size={13} />
                    </button>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Goal · {c.goal}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--fg)' }}>{c.current} <span style={{ color: 'var(--fg-faint)' }}>/ {c.goal.match(/\d+/)?.[0] || '—'}</span></span>
                    </div>
                    <Progress value={c.progress} tone="moon" />
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                    {cDetail.pulse.nextMove}
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {c.channels.map(ch => <Badge key={ch} tone="neutral" variant="outline" size="xs">{ch}</Badge>)}
                  </div>
                </Card>
              </div>
            );
          })}
        </aside>

        <section
          className="campaign-war-room__detail"
          onDoubleClick={(e) => {
            if (e.target.closest('button, a, input, textarea, select')) return;
            toggleFocusMode();
          }}
          title={`${activeTabLabel} focus`}
          style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}
        >
          <Card pad={false} className="campaign-detail-frame">
            <div style={{ padding: 'var(--card-pad)', borderBottom: '1px solid var(--line-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--surface-3)',
                  border: '1px solid var(--line-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--moon-300)',
                  flexShrink: 0,
                }}>
                  <Iconed name="campaigns" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <Badge tone={sTone[selected.status]} size="xs">{selected.status}</Badge>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{selected.id.toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>scoped across Content · Revenue · Automations</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 550, letterSpacing: '-0.01em' }}>{selected.name}</h3>
                  <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5, maxWidth: 760 }}>{detail.pulse.positioning}</div>
                </div>
                <Button
                  variant={focusMode ? 'secondary' : 'outline'}
                  size="sm"
                  icon={focusMode ? 'x' : 'arrowUp'}
                  onClick={toggleFocusMode}
                >
                  {focusMode ? 'Exit focus' : 'Focus'}
                </Button>
                <Button variant="outline" size="sm" icon="decisions">Decision</Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 18 }}>
                {detail.pulse.metrics.map((item) => <CampaignMetric key={item.label} item={item} />)}
              </div>
            </div>

            <div className="hub-scroll-x" style={{ padding: '0 var(--card-pad)', overflowX: 'auto' }}>
              <Tabs
                tabs={CAMPAIGN_TABS}
                active={tab}
                onChange={setTab}
                ariaLabel={`${selected.name} campaign detail tabs`}
                style={{ minWidth: 720 }}
              />
            </div>
          </Card>

          <div className="campaign-tab-stage" data-focus={focusMode ? 'true' : 'false'} key={`${selected.id}-${tab}-${focusMode ? 'focus' : 'normal'}`}>
            <CampaignTabPanel tab={tab} campaign={selected} detail={detail} />
          </div>
        </section>
      </div>
    </div>
  );
}
