"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Progress, Tabs, Kbd, Placeholder, SectionTitle, EmptyState, Avatar, SyncBadge, SegmentedControl } from "../hub-primitives";
import { usePageCreateHotkey } from "../use-crm-keyboard";
import { getWorkspace, filterContentByWorkspace, filterBrandsByWorkspace } from "../workspace-map";
import { shouldRestoreActiveStudioDraft } from "@/lib/content-studio-routing";

const STUDIO_DRAFT_DB = "moonlight-content-studio";
const STUDIO_DRAFT_STORE = "drafts";
const ACTIVE_DRAFT_KEY = "active";

// Card-news slide backgrounds — content colors baked into exported slides, so they are
// deliberately theme-independent raw values (not --surface/--moon theme tokens).
// `seed` is addSlide's default background, kept distinct from the 8 swatch-picker tones.
const SLIDE_PALETTE = {
  plum:  'oklch(0.35 0.04 280)',
  blue:  'oklch(0.35 0.05 220)',
  teal:  'oklch(0.35 0.05 180)',
  green: 'oklch(0.35 0.05 150)',
  amber: 'oklch(0.35 0.05 85)',
  rust:  'oklch(0.35 0.06 30)',
  ink:   'oklch(0.28 0.01 250)',
  paper: 'oklch(0.95 0 0)',
  seed:  'oklch(0.3 0.02 250)',
};
const SLIDE_SWATCHES = [
  SLIDE_PALETTE.plum,
  SLIDE_PALETTE.blue,
  SLIDE_PALETTE.teal,
  SLIDE_PALETTE.green,
  SLIDE_PALETTE.amber,
  SLIDE_PALETTE.rust,
  SLIDE_PALETTE.ink,
  SLIDE_PALETTE.paper,
];

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

function statusKeyOf(item) {
  if (item?.statusKey) return item.statusKey;
  return String(item?.status || "").toLowerCase();
}

function chooseDefaultBrand(brands = [], preferred) {
  if (!brands.length) return null;
  if (preferred) {
    const byPreferred = brands.find((brand) => brand.id === preferred || brand.key === preferred);
    if (byPreferred) return byPreferred;
  }
  return (
    brands.find((brand) => brand.kind === "content") ||
    brands.find((brand) => brand.key === "classmoon") ||
    brands.find((brand) => brand.key === "moonpm") ||
    brands[0]
  );
}

function handoffEventLabel(event, status) {
  if (event === "manual_exported") return "Manual export";
  if (event === "asset_exported") return "Asset export";
  if (status === "failed") return "Failed";
  if (status === "published") return "Published";
  return "Handoff";
}

function handoffTone(status) {
  // §5.3: 실패만 danger — published(완료)·큐 상태는 중립, 라벨이 말한다.
  return status === "failed" ? "danger" : "neutral";
}

function useContentLedger() {
  const [state, setState] = React.useState({
    source: "preview",
    syncState: "preview",
    brands: [],
    items: [],
    variants: [],
    assets: [],
    publishLogs: [],
    campaigns: [],
    queue: [],
    pipeline: [],
    attention: [],
    summary: null,
    ideaQueue: [],
    cadence: null,
  });

  React.useEffect(() => {
    let active = true;

    async function loadLedger() {
      setState((s) => ({ ...s, syncState: "loading" }));
      try {
        const response = await fetch("/api/hub/content", { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!active || !response.ok || !data || data.status === "error") {
          // 라이브 read 실패는 error — preview("미구성")로 뭉개면 큐가 0건이 사실처럼 보인다.
          if (active) setState((s) => ({ ...s, syncState: "error" }));
          return;
        }

        if (data.source === "supabase") {
          setState({
            source: data.source,
            syncState: data.status === "partial" ? "partial" : "live",
            brands: Array.isArray(data.brands) ? data.brands : [],
            items: Array.isArray(data.items) ? data.items : [],
            variants: Array.isArray(data.variants) ? data.variants : [],
            assets: Array.isArray(data.assets) ? data.assets : [],
            publishLogs: Array.isArray(data.publishLogs) ? data.publishLogs : [],
            campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
            queue: Array.isArray(data.queue) ? data.queue : [],
            pipeline: Array.isArray(data.pipeline) ? data.pipeline : [],
            attention: Array.isArray(data.attention) ? data.attention : [],
            summary: data.summary || null,
            ideaQueue: Array.isArray(data.ideaQueue) ? data.ideaQueue : [],
            cadence: data.cadence || null,
          });
        } else {
          setState((s) => ({ ...s, source: "preview", syncState: "preview", campaigns: [], queue: [] }));
        }
      } catch {
        if (active) setState((s) => ({ ...s, syncState: "error" }));
      }
    }

    loadLedger();
    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function Studio({ workspace }) {
  const ws = getWorkspace(workspace);
  const searchParams = useSearchParams();
  const itemParam = searchParams.get("item");
  const newParam = searchParams.get("new");
  const brandParam = searchParams.get("brand");
  const ledger = useContentLedger();
  const [mode, setMode] = React.useState('blog');
  const [selectedBrandId, setSelectedBrandId] = React.useState("");
  const [contentId, setContentId] = React.useState(null);
  const [variantId, setVariantId] = React.useState(null);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [slides, setSlides] = React.useState([
    { id: 'draft-1', bg: 'oklch(0.3 0.02 250)', title: '', sub: '' },
  ]);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const [drag, setDrag] = React.useState(null);
  const [extraSuggestions, setExtraSuggestions] = React.useState([]);
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = React.useState(() => new Set());
  const [pendingSend, setPendingSend] = React.useState(null); // 'publish' | 'schedule' | null
  const [lastSentAt, setLastSentAt] = React.useState(null);
  const [localHandoffLogs, setLocalHandoffLogs] = React.useState([]);
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

  // Scope the brand picker to this workspace's brands (브랜드 part shouldn't offer ClassIn/회사 brands).
  const brands = ws ? filterBrandsByWorkspace(ledger.brands || [], workspace) : (ledger.brands || []);
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) || chooseDefaultBrand(brands, brandParam);
  const variantType = mode === 'carousel' ? 'card_news' : 'blog';
  const currentBodyPayload = React.useMemo(() => (
    mode === 'carousel'
      ? { slides, format: 'instagram-carousel', export: { target: 'google_drive' } }
      : body
  ), [body, mode, slides]);

  const applyDraft = React.useCallback((draft, { restored = false } = {}) => {
    if (!draft) return;
    if (draft.contentId) setContentId(draft.contentId);
    if (draft.variantId) setVariantId(draft.variantId);
    if (draft.brandId) setSelectedBrandId(draft.brandId);
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
    if (!shouldRestoreActiveStudioDraft({ itemParam, newParam })) return undefined;

    readStudioDraft(ACTIVE_DRAFT_KEY).then((draft) => {
      if (!active || !draft) return;
      applyDraft(draft, { restored: true });
    });

    return () => {
      active = false;
    };
  }, [applyDraft, itemParam, newParam]);

  React.useEffect(() => {
    const nextBrand = chooseDefaultBrand(brands, brandParam);
    if (!selectedBrandId && nextBrand?.id) {
      setSelectedBrandId(nextBrand.id);
    }
  }, [brandParam, brands, selectedBrandId]);

  React.useEffect(() => {
    if (!itemParam || loadedItemRef.current === itemParam || ledger.source !== "supabase") return;

    const item = ledger.items.find((candidate) => candidate.id === itemParam);
    if (!item) return;

    const variant = ledger.variants.find((candidate) => (
      candidate.id === item.variantId || candidate.contentId === item.id
    ));
    const nextMode = variant?.type === "card_news" ? "carousel" : "blog";
    const nextSlides = variant?.type === "card_news" ? parseVariantSlides(variant.body) : null;
    const isUnsupportedType = Boolean(variant?.type) && !["blog", "blog_insight", "card_news"].includes(variant.type);

    setContentId(item.id);
    setVariantId(variant?.id || item.variantId || null);
    setSelectedBrandId(item.brandId || "");
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
    if (isUnsupportedType) {
      setExtraSuggestions(s => [{
        tone: 'neutral',
        text: `Studio는 아직 "${variant.type}" 타입 편집을 지원하지 않습니다 — Blog 모드로 임시 표시 중입니다.`,
      }, ...s]);
    }
    loadedItemRef.current = itemParam;
  }, [itemParam, ledger]);

  React.useEffect(() => {
    if (!localMirror) return undefined;

    const key = contentId ? `item:${contentId}` : ACTIVE_DRAFT_KEY;
    const draft = {
      contentId,
      variantId,
      brandId: selectedBrand?.id || selectedBrandId || null,
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
  }, [body, contentId, localMirror, mode, selectedBrand, selectedBrandId, slides, title, variantId]);

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
          brandId: selectedBrand?.id || null,
          brandKey: selectedBrand?.key || null,
          title,
          body: currentBodyPayload,
          sourceIdea: title,
          sourceType: "idea",
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
      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setSaveState("error");
      setExtraSuggestions(s => [{ tone: 'danger', text: `저장 실패 — ${msg}` }, ...s]);
      return null;
    }
  }, [autoSave, body, contentId, currentBodyPayload, localMirror, mode, selectedBrand, slides, title, variantId, variantType]);

  React.useEffect(() => {
    if (!autoSave || !dirty) return undefined;

    const timer = window.setTimeout(() => {
      saveDraft("autosave");
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [autoSave, dirty, saveDraft]);

  async function recordHandoff(action) {
    setPendingSend(action);
    const startedAt = Date.now();
    const isSchedule = action === 'schedule';
    const channel = mode === 'blog' ? 'Web' : 'Instagram';
    const exportProfile = mode === 'blog' ? 'web-article-handoff' : 'google-drive-carousel';

    try {
      const needsSave = dirty || !contentId || !variantId;
      const saved = needsSave ? await saveDraft("handoff") : null;
      if (needsSave && !saved) {
        throw new Error("초안 저장이 완료되지 않아 handoff를 중단했습니다.");
      }

      const nextContentId = saved?.contentId || contentId;
      const nextVariantId = saved?.variantId || variantId;
      const serializedBody = typeof currentBodyPayload === "string"
        ? currentBodyPayload
        : JSON.stringify(currentBodyPayload);
      const encodedSize = typeof TextEncoder !== "undefined"
        ? new TextEncoder().encode(serializedBody).length
        : serializedBody.length;

      if (!nextContentId || !nextVariantId) {
        throw new Error("초안을 먼저 저장해야 handoff를 기록할 수 있습니다.");
      }

      const response = await fetch('/api/hub/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: isSchedule ? 'handoff' : 'export',
          handoffAction: action,
          event: isSchedule ? 'handoff_requested' : 'manual_exported',
          status: isSchedule ? 'queued' : 'published',
          provider: isSchedule ? 'n8n' : 'manual',
          contentId: nextContentId,
          variantId: nextVariantId,
          brandId: selectedBrand?.id || null,
          brandKey: selectedBrand?.key || null,
          title,
          channel,
          targetChannel: mode === 'blog' ? 'MoonPM Web' : 'Instagram carousel',
          variantType,
          exportProfile,
          recordAsset: !isSchedule,
          assetType: mode === 'blog' ? 'html' : 'source',
          mimeType: mode === 'blog' ? 'text/html' : 'application/json',
          sizeBytes: encodedSize,
          note: isSchedule
            ? 'Studio toolbar handoff request. External delivery is handled by automation.'
            : 'Studio toolbar manual export log. No external delivery was sent from the Hub.',
        }),
      });
      const data = await response.json().catch(() => ({}));
      const elapsed = Date.now() - startedAt;
      if (elapsed < 100) await new Promise(r => setTimeout(r, 100 - elapsed));

      if (!response.ok && data.status !== 'preview' && data.status !== 'logged') {
        const msg = data.error || data.message || `HTTP ${response.status}`;
        setExtraSuggestions(s => [{ tone: 'danger', text: `handoff 실패 — ${msg}` }, ...s]);
        return;
      }

      if (data.status === 'preview') {
        setExtraSuggestions(s => [{ tone: 'neutral', text: '기록이 연결되지 않아 handoff 기록을 만들지 않았습니다.' }, ...s]);
        return;
      }

      const now = new Date();
      setLastSentAt(now);
      setLocalHandoffLogs(s => [{
        id: data.logId || `local-${Date.now()}`,
        variantId: nextVariantId,
        contentId: nextContentId,
        channel,
        status: isSchedule ? 'queued' : 'published',
        event: isSchedule ? 'handoff_requested' : 'manual_exported',
        provider: isSchedule ? 'n8n' : 'manual',
        targetChannel: mode === 'blog' ? 'MoonPM Web' : 'Instagram carousel',
        exportProfile,
        when: formatTime(now),
        createdAt: now.toISOString(),
      }, ...s]);
      const detail = data.assetId ? ` · asset ${String(data.assetId).slice(0, 8)}` : '';
      setExtraSuggestions(s => [{
        tone: 'neutral',
        text: isSchedule
          ? `handoff queued · ${String(data.logId || 'preview').slice(0, 8)}`
          : `manual export logged · ${String(data.logId || 'preview').slice(0, 8)}${detail}`,
      }, ...s]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setExtraSuggestions(s => [{ tone: 'danger', text: `handoff 실패 — ${msg}` }, ...s]);
    } finally {
      setPendingSend(null);
    }
  }

  const handoffLogs = React.useMemo(() => {
    const allLogs = [...localHandoffLogs, ...(ledger.publishLogs || [])];
    const seen = new Set();

    return allLogs
      .filter((log) => (
        (variantId && log.variantId === variantId) ||
        (contentId && log.contentId === contentId)
      ))
      .filter((log) => {
        const key = log.id || `${log.event}-${log.createdAt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [contentId, ledger.publishLogs, localHandoffLogs, variantId]);

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
    setSlides(s => [...s, { id: 'new-' + Date.now(), bg: SLIDE_PALETTE.seed, title: 'New slide', sub: '' }]);
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
  const applyToolbarAction = (tool) => {
    if (!tool) return;
    if (tool === 'ai') {
      setExtraSuggestions(s => [{ tone: 'neutral', text: 'AI 제안 생성은 아직 실행 경로에 연결되지 않았습니다.' }, ...s]);
      return;
    }
    const snippets = {
      h1: '\n# 새 섹션\n',
      h2: '\n## 새 소제목\n',
      bold: '**강조**',
      italic: '_기울임_',
      link: '[링크](https://moonlight.pro)',
      image: '\n![설명](image-url)\n',
    };
    setBody(prev => `${prev}${snippets[tool] || ''}`);
    setDirty(true);
  };

  const cur = slides[activeSlide] || slides[0];
  const baseSuggestions = [];
  const suggestions = [
    ...extraSuggestions.map((s, i) => ({ ...s, key: `extra-${i}`, extraIndex: i })),
    ...baseSuggestions.filter(s => !dismissedSuggestionKeys.has(s.key)),
  ];

  return (
    <div className="hub-studio-shell" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* 페이지 타이틀 계약(§11): 브레드크럼만으로 대체 금지 — 에디터라도 h2 하나는 가진다. */}
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, whiteSpace: 'nowrap' }}>스튜디오</h2>
          <SegmentedControl
            options={[{ key: 'blog', label: 'Blog / Insight' }, { key: 'carousel', label: 'Card News' }]}
            value={mode}
            onChange={(k) => { setMode(k); setDirty(true); }}
          />
          {/* Draft는 라이프사이클 단계 — 경고색이 아니라 중립 (§5.2). */}
          <Badge tone="neutral" size="xs">Draft</Badge>
          {ws && (
            <span
              title={`${ws.label} 워크스페이스 스코프`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 22,
                padding: '0 9px',
                borderRadius: 999,
                border: '1px solid var(--line-soft)',
                background: 'var(--surface-2)',
                color: 'var(--fg-muted)',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>스코프</span>
              {ws.label}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            {mode === 'blog' ? <>Web article · <span className="mono">{contentId ? contentId.slice(0, 8) : 'LOCAL'}</span></> : <>Card News · <span className="mono">{variantId ? variantId.slice(0, 8) : 'LOCAL'}</span> · {slides.length} slides</>}
          </span>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
            {lastSentAt
              ? `handoff · ${formatTime(lastSentAt)}`
              : saveLabel}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <IconButton
              icon="upload"
              tooltip={autoSave ? "Supabase autosave on" : "Supabase autosave off — 클릭해서 켜기"}
              onClick={() => setAutoSave(v => !v)}
              style={{ color: autoSave ? 'var(--moon-200)' : 'var(--fg-faint)' }}
            />
            {!autoSave && <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>OFF</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <IconButton
              icon="folder"
              tooltip={localMirror ? "Browser mirror on" : "Browser mirror off — 클릭해서 켜기"}
              onClick={() => setLocalMirror(v => !v)}
              style={{ color: localMirror ? 'var(--moon-200)' : 'var(--fg-faint)' }}
            />
            {!localMirror && <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>OFF</span>}
          </div>
          <IconButton
            icon="check"
            tooltip="Save now"
            onClick={() => saveDraft("manual")}
            style={{ color: saveState === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => recordHandoff('schedule')}
          >
            {pendingSend === 'schedule' ? 'Queuing…' : 'Schedule'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="send"
            onClick={() => recordHandoff('publish')}
          >
            {pendingSend === 'publish' ? 'Logging…' : 'Publish'}
          </Button>
        </div>

        {mode === 'blog' && (
          <>
            <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 4, flexShrink: 0 }}>
              {[
                { i: 'sparkle', t: 'AI', action: 'ai' }, { t: '|' }, { l: 'H1', action: 'h1' }, { l: 'H2', action: 'h2' }, { l: 'B', action: 'bold', style: { fontWeight: 700 } },
                { l: 'i', action: 'italic', style: { fontStyle: 'italic' } }, { t: '|' }, { i: 'link', action: 'link' }, { i: 'upload', t: 'Image', action: 'image' },
              ].map((b, i) => b.t === '|' ? <div key={i} style={{ width: 1, background: 'var(--line-soft)', margin: '0 2px' }} /> : (
                <button key={i} onClick={() => applyToolbarAction(b.action)} style={{ height: 26, padding: '0 9px', borderRadius: 4, fontSize: 11.5, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, ...(b.style || {}) }}>
                  {b.i && <Iconed name={b.i} size={12} />}
                  {b.l && <span>{b.l}</span>}
                  {b.t && <span>{b.t}</span>}
                </button>
              ))}
            </div>
            <div className="scroll-y" style={{ flex: 1, padding: '40px 20px' }}>
              <div style={{ maxWidth: 680, margin: '0 auto' }}>
                {/* 에디터 캔버스 예외: 타이틀·본문은 캐럿이 포커스 표식 (my-work.jsx:842 패턴) — outline 제거 유지 */}
                <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4,
                }} />
                <div style={{ fontSize: 13, color: 'var(--fg-faint)', marginBottom: 28 }}>By 문준혁 · Web article preview 우선 · n8n handoff 대기</div>
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
                  role="button"
                  tabIndex={0}
                  aria-label={`슬라이드 ${i + 1} 선택`}
                  aria-pressed={activeSlide === i}
                  draggable onDragStart={() => setDrag(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => drag !== null && moveSlide(drag, i)}
                  onClick={() => setActiveSlide(i)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveSlide(i); } }}
                  style={{
                    width: 72, height: 72, flexShrink: 0, position: 'relative', cursor: 'grab',
                    borderRadius: 8, background: s.bg,
                    // 선택은 1px 보더 + Moonstone 외곽 outline(§5.3) — 2px 보더는 금지이고
                    // 1px↔2px 전환은 선택할 때마다 1px 레이아웃 시프트를 만들었다.
                    border: activeSlide === i ? '1px solid var(--moon-200)' : '1px solid var(--line-soft)',
                    outline: activeSlide === i ? '1px solid var(--moon-200)' : 'none',
                    outlineOffset: 1,
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
                  style={{ width: '100%', marginTop: 4, marginBottom: 12, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg)', fontSize: 13 }} />
                <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Subtitle</label>
                <input value={cur.sub} onChange={e => updateSlide(activeSlide, { sub: e.target.value })}
                  style={{ width: '100%', marginTop: 4, marginBottom: 12, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg)', fontSize: 13 }} />
                <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Background</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                  {SLIDE_SWATCHES.map(c => (
                    <button key={c} onClick={() => updateSlide(activeSlide, { bg: c })}
                      aria-label={`배경색 ${c}`}
                      style={{ width: 26, height: 26, borderRadius: 6, background: c, border: cur.bg === c ? '1px solid var(--moon-200)' : '1px solid var(--line-soft)', outline: cur.bg === c ? '1px solid var(--moon-200)' : 'none', outlineOffset: 1 }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="outline"
                    size="xs"
                    icon="upload"
                    onClick={() => {
                      addSlide();
                      setExtraSuggestions(s => [{ tone: 'neutral', text: '빈 슬라이드를 추가했습니다 — 사진 업로드는 아직 미배선입니다.' }, ...s]);
                    }}
                  >
                    Photo
                  </Button>
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
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--fg-faint)', letterSpacing: '0.1em' }}>Brand</div>
          <div style={{
            padding: 10,
            background: 'var(--surface-2)',
            border: '1px solid var(--line-soft)',
            borderRadius: 'var(--r-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {brands.length === 0 && (
                <Badge tone="neutral" variant="outline" size="xs">Workspace default</Badge>
              )}
              {brands.map((brand) => {
                const active = selectedBrand?.id === brand.id;
                return (
                  <button
                    key={brand.id}
                    onClick={() => {
                      setSelectedBrandId(brand.id);
                      setDirty(true);
                    }}
                    style={{
                      minHeight: 28,
                      padding: '5px 8px',
                      borderRadius: 'var(--r-sm)',
                      border: active ? '1px solid var(--line-strong)' : '1px solid var(--line-soft)',
                      background: active ? 'var(--surface-3)' : 'transparent',
                      color: active ? 'var(--fg)' : 'var(--fg-muted)',
                      fontSize: 11.5,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span className="mono" style={{ color: active ? 'var(--moon-200)' : 'var(--fg-faint)' }}>{brand.glyph}</span>
                    {brand.name}
                  </button>
                );
              })}
            </div>
            {selectedBrand && (
              <>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                  {selectedBrand.description || selectedBrand.voice}
                </div>
                {(selectedBrand.philosophy || selectedBrand.direction) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)' }}>
                    {selectedBrand.philosophy && (
                      <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                        <span className="mono" style={{ color: 'var(--fg-faint)', marginRight: 6 }}>철학</span>{selectedBrand.philosophy}
                      </div>
                    )}
                    {selectedBrand.direction && (
                      <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                        <span className="mono" style={{ color: 'var(--fg-faint)', marginRight: 6 }}>방향</span>{selectedBrand.direction}
                      </div>
                    )}
                  </div>
                )}
                {(selectedBrand.keywords || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {selectedBrand.keywords.slice(0, 5).map((keyword) => (
                      <Badge key={keyword} tone={selectedBrand.tone || 'neutral'} variant="outline" size="xs">{keyword}</Badge>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(selectedBrand.rules || []).slice(0, 3).map((rule) => (
                    <div key={rule} style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 6, fontSize: 11.5, color: 'var(--fg-faint)', lineHeight: 1.35 }}>
                      <Dot tone={selectedBrand.tone || 'moon'} size={5} style={{ marginTop: 5 }} />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--fg-faint)', letterSpacing: '0.1em' }}>Suggestions</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{
              padding: '10px 11px', background: 'var(--surface-2)',
              border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
              fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5,
            }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}><Dot tone={s.tone} /></div>
              {s.text}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    if (mode === 'blog') {
                      setBody(prev => `${prev}\n\n> 적용한 제안: ${s.text}`);
                    } else {
                      updateSlide(activeSlide, { sub: s.text.slice(0, 64) });
                    }
                    setDirty(true);
                    if (typeof s.extraIndex === 'number') {
                      setExtraSuggestions(prev => prev.filter((_, idx) => idx !== s.extraIndex));
                    } else {
                      setDismissedSuggestionKeys(prev => new Set([...prev, s.key]));
                    }
                  }}
                >
                  Apply
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if (typeof s.extraIndex === 'number') {
                      setExtraSuggestions(prev => prev.filter((_, idx) => idx !== s.extraIndex));
                    } else {
                      setDismissedSuggestionKeys(prev => new Set([...prev, s.key]));
                    }
                  }}
                >
                  Skip
                </Button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--fg-faint)', letterSpacing: '0.1em', marginTop: 8 }}>Handoff history</div>
          <div style={{
            padding: 10,
            background: 'var(--surface-2)',
            border: '1px solid var(--line-soft)',
            borderRadius: 'var(--r-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {handoffLogs.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-faint)', lineHeight: 1.45 }}>
                Schedule 또는 Publish를 누르면 Supabase publish_logs에 기록됩니다.
              </div>
            )}
            {handoffLogs.map((log) => (
              <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <Badge tone={handoffTone(log.status)} size="xs">{handoffEventLabel(log.event, log.status)}</Badge>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.provider || 'hub'} · {log.channel || log.targetChannel || 'Web'}
                    </span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.exportProfile || log.targetChannel || 'content handoff'}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{log.when}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--fg-faint)', letterSpacing: '0.1em', marginTop: 8 }}>Settings</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span>Channel</span><span style={{ color: 'var(--fg)' }}>{mode === 'blog' ? 'Web handoff' : 'Instagram handoff'}</span>
            </div>
            {/* Audience·Schedule은 아직 어느 원장에도 배선돼 있지 않다 — 지어낸 값("2,143
                subscribers"·"오늘 18:00")을 라이브 Brand 옆에 실데이터처럼 두지 않는다(7차 정체성). */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span>Audience</span><span style={{ color: 'var(--fg-faint)' }}>— 미연결</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span>Brand</span><span style={{ color: 'var(--fg)' }}>{selectedBrand?.name || 'Workspace'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span>Schedule</span><span style={{ color: 'var(--fg-faint)' }}>— 미연결</span>
            </div>
          </div>
        </div>
        {/* "Ask Writer/Studio" 입력은 핸들러가 전혀 없는 死 어포던스였다(⏎ 힌트까지 걸고
            무반응) — AI 배선이 생기기 전까지 렌더하지 않는다(7차 사용성, §13). */}
      </aside>
    </div>
  );
}

export function Queue({ workspace }) {
  const ws = getWorkspace(workspace);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState('all');
  const [brandFilter, setBrandFilter] = React.useState(() => searchParams.get('brand') || 'all');
  const ledger = useContentLedger();
  // Scope the brand filter pills + queue items to this workspace (pass-through when unscoped).
  const brands = ws ? filterBrandsByWorkspace(ledger.brands || [], workspace) : (ledger.brands || []);
  const queueSource = Array.isArray(ledger.queue) ? ledger.queue : [];
  const queue = filterContentByWorkspace(queueSource, workspace);
  // 큐 lifecycle은 카테고리 — semantic 색 금지(§5.2/§5.3). 현재 단계(Ready/Review)만
  // Moonstone으로 살짝 밝히고 나머지는 라벨이 전달한다.
  const statusTone = {
    Inbox: 'neutral',
    Drafting: 'neutral',
    Ready: 'moon',
    'Handed off': 'neutral',
    Watch: 'neutral',
    Archived: 'neutral',
    Draft: 'neutral',
    Scheduled: 'neutral',
    Review: 'neutral',
    Idea: 'neutral',
    Outline: 'neutral',
    Published: 'neutral',
  };
  const tabs = [
    { key: 'all', label: 'All', count: queue.length },
    { key: 'idea', label: 'Inbox', count: queue.filter(c => statusKeyOf(c) === 'idea').length },
    { key: 'draft', label: 'Drafting', count: queue.filter(c => statusKeyOf(c) === 'draft').length },
    { key: 'review', label: 'Ready', count: queue.filter(c => statusKeyOf(c) === 'review').length },
    { key: 'scheduled', label: 'Handed off', count: queue.filter(c => statusKeyOf(c) === 'scheduled').length },
    { key: 'published', label: 'Watch', count: queue.filter(c => statusKeyOf(c) === 'published').length },
  ];
  const filteredByBrand = brandFilter === 'all'
    ? queue
    : queue.filter(c => c.brandId === brandFilter || c.brandKey === brandFilter);
  const cadence = ledger.cadence;
  const visibleQueueBase = tab === 'all'
    ? filteredByBrand
    : filteredByBrand.filter(c => statusKeyOf(c) === tab);
  const visibleQueue = tab === 'idea'
    ? [...visibleQueueBase].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    : visibleQueueBase;
  const activeLabel = tabs.find(t => t.key === tab)?.label || 'All';
  const openStudio = React.useCallback((id) => {
    const brandParam = brandFilter !== 'all' ? `&brand=${encodeURIComponent(brandFilter)}` : '';
    router.push(`/dashboard/content/studio${id ? `?item=${encodeURIComponent(id)}` : '?new=draft'}${id ? '' : brandParam}`);
  }, [brandFilter, router]);
  const createDraft = React.useCallback(() => openStudio(), [openStudio]);
  usePageCreateHotkey(createDraft);
  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Publishing queue</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {visibleQueue.length}{tab !== 'all' ? ` of ${queue.length}` : ''} items in pipeline
            <SyncBadge state={ledger.syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Tabs className="hub-toolbar" tabs={tabs} active={tab} onChange={setTab} ariaLabel="Publishing queue filters" style={{ borderBottom: 'none' }} />
        <Button variant="primary" size="sm" icon="plus" onClick={createDraft}>Draft <Kbd>N</Kbd></Button>
      </div>

      {cadence && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          padding: '12px 16px', border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-lg)', background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>이번 주 발행</span>
            <span className="stat" style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)' }}>
              {cadence.published}<span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>/{cadence.goal}</span>
            </span>
            <Badge tone="neutral" size="xs">
              {cadence.behind ? `${cadence.remaining}건 남음` : '목표 달성'}
            </Badge>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--line-soft)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)' }}>아이디어 큐</span>
            <span className="mono" style={{ fontSize: 15, color: 'var(--fg)' }}>{cadence.queueDepth}</span>
            {cadence.queueDepth < 10 && <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>· 10개 이상 권장</span>}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 28 }} aria-hidden="true">
            {(cadence.recentWeeks || []).map((w) => (
              <div
                key={w.week}
                title={`${w.week} · ${w.count}건`}
                style={{
                  width: 18,
                  height: Math.max(3, Math.min(28, (w.count / Math.max(cadence.goal, 1)) * 28)),
                  borderRadius: 3,
                  background: w.current ? 'var(--moon-300)' : 'var(--surface-3)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {brands.length > 0 && (
        <div className="hub-toolbar" style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', paddingBottom: 2 }}>
          {[{ id: 'all', key: 'all', name: 'All brands', glyph: '◐', tone: 'moon' }, ...brands].map((brand) => {
            const active = brandFilter === brand.id || brandFilter === brand.key;
            const count = brand.id === 'all'
              ? queue.length
              : queue.filter((item) => item.brandId === brand.id || item.brandKey === brand.key).length;
            return (
              <button
                key={brand.id}
                onClick={() => setBrandFilter(brand.id)}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 'var(--r-sm)',
                  border: active ? '1px solid var(--line-strong)' : '1px solid var(--line-soft)',
                  background: active ? 'var(--surface-3)' : 'var(--surface)',
                  color: active ? 'var(--fg)' : 'var(--fg-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <span className="mono" style={{ color: active ? 'var(--moon-200)' : 'var(--fg-faint)' }}>{brand.glyph}</span>
                {brand.name}
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 120px 130px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>Title</span><span>Kind</span><span>Channel</span><span>Brand</span><span>Lane</span><span>When</span><span style={{ textAlign: 'right' }}>Author</span>
        </div>
        {visibleQueue.length === 0 && ws && (
          <EmptyState
            icon="queue"
            title={`${ws.label} — 아직 연결된 콘텐츠가 없습니다.`}
            description="콘텐츠에 워크스페이스 태그가 붙으면 여기에 모입니다."
            action={<Button variant="primary" size="sm" icon="plus" onClick={createDraft}>Draft <Kbd>N</Kbd></Button>}
          />
        )}
        {visibleQueue.length === 0 && !ws && (
          <EmptyState
            icon="queue"
            title={tab === 'all' ? '발행 큐가 비어 있습니다' : `${activeLabel} 항목이 없습니다`}
            description={tab === 'all'
              ? (ledger.syncState === 'error'
                  ? '콘텐츠 원장을 읽지 못했습니다 — 비어 보여도 실제 콘텐츠가 있을 수 있습니다. 새로고침으로 재시도하세요.'
                  : ledger.syncState === 'live' ? 'Supabase content_items/content_variants 기록에 표시할 콘텐츠가 없습니다.' : '초안을 만들면 큐와 파이프라인에 표시됩니다.')
              : `${activeLabel} 상태의 콘텐츠가 생기면 이 필터에 표시됩니다.`}
            action={<Button variant="primary" size="sm" icon="plus" onClick={createDraft}>Draft <Kbd>N</Kbd></Button>}
          />
        )}
        {visibleQueue.map((c, i) => (
          <div key={c.id} className="hub-row" style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 120px 130px 80px',
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
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Iconed name={c.kind === 'Newsletter' ? 'email' : c.kind === 'Blog' ? 'content' : c.kind === 'Reel' ? 'play' : 'send'} size={13} style={{ color: 'var(--fg-faint)' }} />
              {c.rank != null && (
                <span className="mono" title="아이디어 랭크" style={{ fontSize: 10.5, color: 'var(--moon-300)', flexShrink: 0 }}>{Math.round(c.rank)}</span>
              )}
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.kind}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.channel}</span>
            <span>
              <Badge tone={c.brandTone || 'neutral'} variant="outline" size="xs">{c.brandGlyph || '•'} {c.brandName || '—'}</Badge>
            </span>
            <span><Badge tone={statusTone[c.statusLabel || c.status] || 'neutral'} size="xs">{c.statusLabel || c.status}</Badge></span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.when}</span>
            <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--fg-muted)' }}>{c.author}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const CAMPAIGN_WAR_ROOMS = {};

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
      <div className="stat" style={{ fontSize: 18, color: 'var(--fg)', lineHeight: 1 }}>{item.value}</div>
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
  const router = useRouter();
  // 콘텐츠 lifecycle은 카테고리 — semantic 색 금지(§5.2/§5.3), 라벨이 상태를 전달한다.
  const sTone = { Active: 'neutral', Planning: 'neutral', Draft: 'neutral', Live: 'neutral', Scheduled: 'neutral', Review: 'neutral', Idea: 'neutral' };

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
                    <Badge tone="neutral" size="xs">{item.status}</Badge>
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
          <Button
            variant="outline"
            size="sm"
            icon="studio"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => router.push(`/dashboard/content/studio?new=draft&campaign=${encodeURIComponent(campaign.id)}`)}
          >
            Open Studio
          </Button>
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
              <Avatar name={item.segment} size={30} tone="neutral" />
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
              <Progress value={item.fit} tone="moon" />
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
              <Badge tone="neutral" size="xs">{item.status}</Badge>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.ai}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{item.last}</span>
              <span className="mono" style={{ fontSize: 11, color: item.health.includes('needs') ? 'var(--fg)' : 'var(--fg-muted)' }}>{item.health}</span>
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

// Live campaigns (real Supabase rows) don't have curated war-room content yet —
// the deep strategy/surfaces/audience/attribution breakdown is a separate,
// larger data-model decision (see docs/personal-os audit, 2026-07-10). Rather
// so a real campaign gets an honest placeholder until that model is built.
function buildPreviewCampaignDetail(campaign) {
  return {
    pulse: {
      positioning: '아직 전략이 작성되지 않았습니다.',
      nextMove: 'Strategy 탭에서 ICP·promise·wedge를 정의하면 다음 행동이 표시됩니다.',
      risk: '',
      ai: [],
      metrics: [
        { label: 'Goal', value: `${campaign?.current ?? 0} / ${campaign?.goal || '—'}`, detail: campaign?.status || '', tone: 'neutral' },
      ],
    },
    strategy: { icp: '', promise: '', wedge: '', enemy: '', proof: [], decisions: [] },
    surfaces: [],
    content: [],
    audience: [],
    attribution: [],
    automations: [],
    activity: [],
  };
}

export function Campaigns() {
  const router = useRouter();
  // 캠페인 lifecycle도 중립 — done/paused는 라벨·아이콘 몫(§5.3).
  const sTone = { Active: 'neutral', Planning: 'neutral', Draft: 'neutral', Paused: 'neutral', Completed: 'neutral' };
  const ledger = useContentLedger();
  const [campaigns, setCampaigns] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [tab, setTab] = React.useState('pulse');
  const [focusMode, setFocusMode] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  React.useEffect(() => {
    const nextCampaigns = Array.isArray(ledger.campaigns) ? ledger.campaigns : [];
    setCampaigns(nextCampaigns);
    setSelectedId((prev) => (nextCampaigns.some((c) => c.id === prev) ? prev : nextCampaigns[0]?.id || null));
  }, [ledger.syncState, ledger.campaigns]);

  const selected = campaigns.find(c => c.id === selectedId) || campaigns[0] || null;
  // Campaign rows without an attached war-room ledger use an honest empty detail.
  const detail = selected
    ? (CAMPAIGN_WAR_ROOMS[selected.id] || buildPreviewCampaignDetail(selected))
    : null;
  const activeTabLabel = CAMPAIGN_TABS.find(t => t.key === tab)?.label || 'Pulse';
  const createCampaign = async () => {
    if (creating) return;
    setCreating(true);
    const localId = `local-campaign-${Date.now()}`;
    const next = {
      id: localId,
      name: '새 캠페인',
      status: 'Draft',
      channels: ['Email'],
      progress: 0,
      end: '미정',
      goal: '목표 설정',
      current: 0,
    };
    setCampaigns(prev => [next, ...prev]);
    setSelectedId(localId);
    setTab('pulse');
    setFocusMode(true);
    try {
      const res = await fetch('/api/hub/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'campaign', name: next.name }),
      });
      const data = await res.json().catch(() => null);
      if (data?.status === 'saved' && data?.campaign?.id) {
        const savedId = data.campaign.id;
        setCampaigns(prev => prev.map(c => (c.id === localId ? { ...c, id: savedId } : c)));
        setSelectedId(savedId);
      } else {
        setCampaigns(prev => prev.filter(c => c.id !== localId));
        setSelectedId(null);
        setFocusMode(false);
        setCreateError(`캠페인 생성 실패 (${data?.status || res.status}) — 다시 시도하세요.`);
      }
    } catch {
      setCampaigns(prev => prev.filter(c => c.id !== localId));
      setSelectedId(null);
      setFocusMode(false);
      setCreateError('캠페인 생성 실패 — 네트워크를 확인하고 다시 시도하세요.');
    } finally {
      setCreating(false);
    }
  };
  const createCampaignRef = React.useRef(createCampaign);
  createCampaignRef.current = createCampaign;
  const creatingRef = React.useRef(creating);
  creatingRef.current = creating;
  const createCampaignHotkey = React.useCallback(() => {
    if (!creatingRef.current) createCampaignRef.current();
  }, []);
  usePageCreateHotkey(createCampaignHotkey);

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
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            Content 안에서 Revenue, Automations, Decisions를 캠페인 기준으로 묶는 war room
            <SyncBadge state={ledger.syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus" onClick={() => { setCreateError(null); createCampaign(); }} disabled={creating}>Campaign <Kbd>N</Kbd></Button>
      </div>

      {createError && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', padding: '0 2px' }}>{createError}</div>
      )}

      {!selected && (
        <EmptyState
          icon="campaigns"
          title="캠페인이 없습니다"
          description={ledger.syncState === 'live' ? 'Supabase campaigns 기록이 비어 있습니다.' : '캠페인을 만들면 war room에 표시됩니다.'}
          action={<Button variant="primary" size="sm" icon="plus" onClick={createCampaign} disabled={creating}>Campaign</Button>}
        />
      )}

      {selected && (
      <div
        className="campaign-war-room"
        data-focus={focusMode ? 'true' : 'false'}
        style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 'var(--gap)', alignItems: 'start' }}
      >
        <aside className="campaign-war-room__list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {campaigns.map(c => {
            const active = c.id === selected.id;
            const cDetail = CAMPAIGN_WAR_ROOMS[c.id] || buildPreviewCampaignDetail(c);
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
                <Button
                  variant="outline"
                  size="sm"
                  icon="decisions"
                  onClick={() => router.push(`/dashboard/work/decisions?new=decision&campaign=${encodeURIComponent(selected.id)}`)}
                >
                  Decision
                </Button>
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
      )}
    </div>
  );
}
