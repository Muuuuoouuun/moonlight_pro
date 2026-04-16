"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getContentBrandReference,
  resolveContentBrand,
} from "@/lib/dashboard-contexts";

/**
 * Content Studio — slide-first authoring workbench.
 *
 * Slides are first-class structured objects, not markdown strings.
 * The left rail lets the operator drag to reorder slides, the middle
 * pane edits one slide at a time, and the right pane shows the live
 * 1080² frame. Drafts autosave to localStorage so a browser refresh
 * never eats work-in-progress.
 */

const SLIDE_KINDS = [
  { value: "cover", label: "표지" },
  { value: "body", label: "본문" },
  { value: "cta", label: "CTA" },
];

const CHANNEL_PRESETS = ["인스타그램", "인사이트", "뉴스레터", "랜딩"];

const TEMPLATE_PRESETS = [
  {
    id: "hook-proof-cta",
    label: "후킹 / 증거 / CTA",
    summary: "짧고 선명한 카드뉴스 기본형",
  },
  {
    id: "problem-shift-action",
    label: "문제 / 전환 / 행동",
    summary: "문제 인식에서 행동 유도까지 밀어주는 구조",
  },
  {
    id: "ops-note",
    label: "운영자 노트",
    summary: "운영 메모를 퍼블릭 톤으로 바꾸는 구조",
  },
];

const HANDOFF_RULES = [
  "한 장에는 한 메시지만",
  "첫 장 훅은 설명보다 긴장감 먼저",
  "마지막 CTA는 하나만",
  "핸드오프 메모는 동사형으로",
];

// Guardrail: storage version lets us invalidate older shapes safely.
const STORAGE_VERSION = 1;
const STORAGE_KEY_LEGACY = "cm_hub_content_studio_draft_v1";
const DRAFTS_KEY = "cm_studio_drafts_v2";
const MAX_DRAFTS = 10;

function createSlideId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function blankSlide(kind = "body", patch = {}) {
  return {
    id: createSlideId(),
    kind,
    title: "",
    bullets: [""],
    style: { bg: "default", align: "left", emphasis: "normal" },
    ...patch,
  };
}

const STYLE_BG_OPTIONS = [
  { value: "default", label: "기본" },
  { value: "dark", label: "다크" },
  { value: "accent", label: "액센트" },
  { value: "warm", label: "따뜻한" },
];

const STYLE_ALIGN_OPTIONS = [
  { value: "left", label: "좌측" },
  { value: "center", label: "중앙" },
];

const STYLE_EMPHASIS_OPTIONS = [
  { value: "normal", label: "보통" },
  { value: "bold", label: "강조" },
];

function buildTemplate(templateId) {
  if (templateId === "problem-shift-action") {
    return {
      coverTitle: "왜 운영은 자꾸 복잡해질까",
      coverSubtitle: "한번 늘어난 작업은 스스로 줄어들지 않습니다.",
      slides: [
        blankSlide("body", {
          title: "지금 겪는 마찰",
          bullets: [
            "반복해서 겪는 마찰을 먼저 적는다",
            "숫자보다 감각을 먼저 건드린다",
          ],
        }),
        blankSlide("body", {
          title: "시야를 바꾸기",
          bullets: [
            "문제를 도구 부족이 아니라 흐름 부족으로 재정의",
            "같은 사실, 다른 프레임",
          ],
        }),
        blankSlide("body", {
          title: "가장 작은 행동",
          bullets: [
            "오늘 바로 적용 가능한 문장 하나",
            "행동 단위로 끊어 쓴다",
          ],
        }),
        blankSlide("cta", {
          title: "다음 액션",
          bullets: ["지금 멈춰 있는 작업 하나를 흐름으로 다시 적어보세요."],
        }),
      ],
    };
  }

  if (templateId === "ops-note") {
    return {
      coverTitle: "이번 주 운영 메모",
      coverSubtitle: "가장 강하게 반응한 주제는 무엇이었는가",
      slides: [
        blankSlide("body", {
          title: "신호를 만든 콘텐츠",
          bullets: ["어떤 콘텐츠가 신호를 만들었는지 기록"],
        }),
        blankSlide("body", {
          title: "후속 액션으로 이어진 경로",
          bullets: ["그 반응이 리드·후속으로 어떻게 이어졌는지"],
        }),
        blankSlide("body", {
          title: "다음 주 결론",
          bullets: ["다음 주에 무엇을 더 밀지 한 줄"],
        }),
        blankSlide("cta", {
          title: "다음 액션",
          bullets: ["반응이 있었던 주제를 다시 한 번 더 민다."],
        }),
      ],
    };
  }

  // Default: hook-proof-cta
  return {
    coverTitle: "카드뉴스 제목을 입력하세요",
    coverSubtitle: "핵심 메시지를 한 문장으로 요약",
    slides: [
      blankSlide("body", {
        title: "독자가 즉시 공감할 문제",
        bullets: ["설명보다 긴장감을 먼저 만든다", "짧고 구체적으로"],
      }),
      blankSlide("body", {
        title: "통찰 / 근거",
        bullets: ["문장은 짧게", "여백은 넉넉하게"],
      }),
      blankSlide("body", {
        title: "행동 하나로 닫기",
        bullets: ["CTA는 반드시 하나만"],
      }),
      blankSlide("cta", {
        title: "다음 액션",
        bullets: ["다음 액션을 한 문장으로 적으세요."],
      }),
    ],
  };
}

function buildInitialDoc(brand, templateId, channel) {
  const template = buildTemplate(templateId);
  const cover = blankSlide("cover", {
    title: template.coverTitle,
    bullets: [template.coverSubtitle].filter(Boolean),
  });
  return {
    version: STORAGE_VERSION,
    brand,
    channel,
    templateId,
    slides: [cover, ...template.slides],
    activeSlideId: cover.id,
    updatedAt: Date.now(),
  };
}

function renderAsMarkdown(doc) {
  const lines = [];
  doc.slides.forEach((slide) => {
    if (slide.kind === "cover") {
      if (slide.title) lines.push(`# ${slide.title}`);
      slide.bullets.filter(Boolean).forEach((bullet) => lines.push(bullet));
      lines.push("");
    } else if (slide.kind === "body") {
      if (slide.title) lines.push(`## ${slide.title}`);
      slide.bullets.filter(Boolean).forEach((bullet) => lines.push(`- ${bullet}`));
      lines.push("");
    } else if (slide.kind === "cta") {
      lines.push("**CTA**");
      slide.bullets.filter(Boolean).forEach((bullet) => lines.push(bullet));
    }
  });
  return lines.join("\n").trim();
}

function createDraftId() {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function draftTitle(doc) {
  const cover = doc.slides?.find((s) => s.kind === "cover");
  return cover?.title || "무제 초안";
}

function loadDraftsStore() {
  if (typeof window === "undefined") return null;
  try {
    // Migration: if old v1 key exists, promote it into the new structure.
    const legacyRaw = window.localStorage.getItem(STORAGE_KEY_LEGACY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && legacy.version === STORAGE_VERSION && Array.isArray(legacy.slides) && legacy.slides.length > 0) {
        const id = createDraftId();
        const store = {
          drafts: [{ ...legacy, id, updatedAt: legacy.updatedAt || Date.now() }],
          activeDraftId: id,
        };
        window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(store));
        window.localStorage.removeItem(STORAGE_KEY_LEGACY);
        return store;
      }
      window.localStorage.removeItem(STORAGE_KEY_LEGACY);
    }

    const raw = window.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.drafts) || parsed.drafts.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistDraftsStore(store) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors — autosave is best-effort.
  }
}

function formatSavedTime(ts) {
  if (!ts) return "저장 전";
  const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (delta < 3) return "방금 저장";
  if (delta < 60) return `${delta}초 전 저장`;
  if (delta < 3600) return `${Math.floor(delta / 60)}분 전 저장`;
  return `${Math.floor(delta / 3600)}시간 전 저장`;
}

export default function ContentStudioPage() {
  const searchParams = useSearchParams();
  const brandParam = searchParams.get("brand");
  const selectedBrand = resolveContentBrand(brandParam);
  const brandReference = getContentBrandReference(selectedBrand.value);
  const defaultTemplateId =
    brandReference.recommendedTemplateId || TEMPLATE_PRESETS[0].id;
  const defaultChannel =
    brandReference.recommendedChannel || CHANNEL_PRESETS[0];

  const [drafts, setDrafts] = useState([]);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [doc, setDoc] = useState(() =>
    buildInitialDoc(selectedBrand.value, defaultTemplateId, defaultChannel),
  );
  const [savedAt, setSavedAt] = useState(null);
  const [handoffNote, setHandoffNote] = useState(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const hasHydratedRef = useRef(false);

  // Hydrate from localStorage exactly once on first client render. Reads
  // the multi-draft store (migrating legacy v1 key if needed).
  useEffect(() => {
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    const store = loadDraftsStore();
    if (store && store.drafts.length > 0) {
      setDrafts(store.drafts);
      const activeId = store.activeDraftId || store.drafts[0].id;
      setActiveDraftId(activeId);
      const active = store.drafts.find((d) => d.id === activeId) || store.drafts[0];
      setDoc({
        ...active,
        brand: selectedBrand.value,
        updatedAt: Date.now(),
      });
      setSavedAt(active.updatedAt || null);
    } else {
      // First visit — seed one draft from the initial doc.
      const id = createDraftId();
      const initial = { ...buildInitialDoc(selectedBrand.value, defaultTemplateId, defaultChannel), id };
      setDrafts([initial]);
      setActiveDraftId(id);
      setDoc(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave: whenever doc changes, persist the full drafts array.
  useEffect(() => {
    if (!hasHydratedRef.current || !activeDraftId) return undefined;
    const id = window.setTimeout(() => {
      setDrafts((prev) => {
        const updated = prev.map((d) =>
          d.id === activeDraftId ? { ...doc, id: activeDraftId, updatedAt: Date.now() } : d,
        );
        persistDraftsStore({ drafts: updated, activeDraftId });
        return updated;
      });
      setSavedAt(Date.now());
    }, 600);
    return () => window.clearTimeout(id);
  }, [doc, activeDraftId]);

  // Brand change from URL — reset draft to the brand-recommended template
  // preset. We don't want stale brand-specific copy bleeding across brands.
  useEffect(() => {
    if (!hasHydratedRef.current) return;
    setDoc((prev) => {
      if (prev.brand === selectedBrand.value) return prev;
      return buildInitialDoc(
        selectedBrand.value,
        brandReference.recommendedTemplateId || prev.templateId,
        brandReference.recommendedChannel || prev.channel,
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand.value]);

  const activeSlide = useMemo(
    () =>
      doc.slides.find((slide) => slide.id === doc.activeSlideId) ??
      doc.slides[0],
    [doc],
  );

  const selectedTemplate = useMemo(
    () =>
      TEMPLATE_PRESETS.find((template) => template.id === doc.templateId) ??
      TEMPLATE_PRESETS[0],
    [doc.templateId],
  );

  const slideCounts = useMemo(() => {
    const counts = { cover: 0, body: 0, cta: 0 };
    doc.slides.forEach((slide) => {
      counts[slide.kind] = (counts[slide.kind] || 0) + 1;
    });
    return counts;
  }, [doc.slides]);

  const updateActiveSlide = useCallback((patch) => {
    setDoc((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) =>
        slide.id === prev.activeSlideId ? { ...slide, ...patch } : slide,
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  const addSlide = useCallback((kind) => {
    setDoc((prev) => {
      const slide = blankSlide(kind);
      return {
        ...prev,
        slides: [...prev.slides, slide],
        activeSlideId: slide.id,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const removeSlide = useCallback((slideId) => {
    setDoc((prev) => {
      if (prev.slides.length <= 1) return prev;
      const nextSlides = prev.slides.filter((slide) => slide.id !== slideId);
      const nextActiveId =
        prev.activeSlideId === slideId
          ? nextSlides[0].id
          : prev.activeSlideId;
      return {
        ...prev,
        slides: nextSlides,
        activeSlideId: nextActiveId,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const setActiveSlide = useCallback((slideId) => {
    setDoc((prev) => ({ ...prev, activeSlideId: slideId }));
  }, []);

  const moveSlide = useCallback((fromId, toId) => {
    setDoc((prev) => {
      if (fromId === toId) return prev;
      const fromIndex = prev.slides.findIndex((slide) => slide.id === fromId);
      const toIndex = prev.slides.findIndex((slide) => slide.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev.slides];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...prev, slides: next, updatedAt: Date.now() };
    });
  }, []);

  const resetDraft = useCallback(() => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "현재 초안을 버리고 선택한 템플릿의 기본값으로 되돌립니다. 계속할까요?",
      );
      if (!ok) return;
    }
    const reset = { ...buildInitialDoc(selectedBrand.value, doc.templateId, doc.channel), id: activeDraftId };
    setDoc(reset);
    setHandoffNote(null);
  }, [activeDraftId, doc.channel, doc.templateId, selectedBrand.value]);

  const applyTemplate = useCallback(
    (templateId) => {
      setDoc({ ...buildInitialDoc(selectedBrand.value, templateId, doc.channel), id: activeDraftId });
      setHandoffNote(null);
    },
    [activeDraftId, doc.channel, selectedBrand.value],
  );

  const setChannel = useCallback((channel) => {
    setDoc((prev) => ({ ...prev, channel, updatedAt: Date.now() }));
  }, []);

  const updateSlideStyle = useCallback((field, value) => {
    setDoc((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) =>
        slide.id === prev.activeSlideId
          ? { ...slide, style: { ...(slide.style || { bg: "default", align: "left", emphasis: "normal" }), [field]: value } }
          : slide,
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  const switchDraft = useCallback((draftId) => {
    // Persist current doc into drafts before switching.
    setDrafts((prev) => {
      const updated = prev.map((d) =>
        d.id === activeDraftId ? { ...doc, id: activeDraftId, updatedAt: Date.now() } : d,
      );
      persistDraftsStore({ drafts: updated, activeDraftId: draftId });
      const next = updated.find((d) => d.id === draftId);
      if (next) {
        setDoc({ ...next, brand: selectedBrand.value });
        setSavedAt(next.updatedAt || null);
      }
      setActiveDraftId(draftId);
      return updated;
    });
    setHandoffNote(null);
  }, [activeDraftId, doc, selectedBrand.value]);

  const createNewDraft = useCallback(() => {
    if (drafts.length >= MAX_DRAFTS) {
      setHandoffNote({ tone: "warn", message: `초안은 최대 ${MAX_DRAFTS}개까지 만들 수 있습니다.` });
      return;
    }
    const id = createDraftId();
    const newDoc = { ...buildInitialDoc(selectedBrand.value, defaultTemplateId, defaultChannel), id };
    setDrafts((prev) => {
      const updated = prev.map((d) =>
        d.id === activeDraftId ? { ...doc, id: activeDraftId, updatedAt: Date.now() } : d,
      );
      const next = [...updated, newDoc];
      persistDraftsStore({ drafts: next, activeDraftId: id });
      return next;
    });
    setActiveDraftId(id);
    setDoc(newDoc);
    setHandoffNote(null);
  }, [activeDraftId, defaultChannel, defaultTemplateId, doc, drafts.length, selectedBrand.value]);

  const deleteCurrentDraft = useCallback(() => {
    if (drafts.length <= 1) return;
    if (typeof window !== "undefined" && !window.confirm("이 초안을 삭제할까요?")) return;
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== activeDraftId);
      const nextActive = next[0];
      persistDraftsStore({ drafts: next, activeDraftId: nextActive.id });
      setActiveDraftId(nextActive.id);
      setDoc({ ...nextActive, brand: selectedBrand.value });
      setSavedAt(nextActive.updatedAt || null);
      return next;
    });
    setHandoffNote(null);
  }, [activeDraftId, drafts.length, selectedBrand.value]);

  const copyMarkdown = useCallback(async () => {
    try {
      const markdown = renderAsMarkdown(doc);
      await navigator.clipboard.writeText(markdown);
      setHandoffNote({
        tone: "ok",
        message: "마크다운으로 복사했습니다. 발행 도구에 그대로 붙여 넣으세요.",
      });
    } catch {
      setHandoffNote({
        tone: "risk",
        message: "클립보드 접근이 차단되어 있습니다. 브라우저 권한을 확인하세요.",
      });
    }
  }, [doc]);

  const sendToPublishQueue = useCallback(async () => {
    // Fire-and-forget to the hub's content intake. Server may not exist
    // in preview mode — fall back to a clipboard-style local note if 404.
    const payload = {
      brand: doc.brand,
      channel: doc.channel,
      template: doc.templateId,
      slides: doc.slides,
      createdAt: Date.now(),
    };
    try {
      const response = await fetch("/api/content/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setHandoffNote({
          tone: "ok",
          message: "발행 큐로 보냈습니다. 큐 탭에서 다음 단계를 점검하세요.",
        });
        return;
      }
      if (response.status === 404) {
        setHandoffNote({
          tone: "warn",
          message:
            "큐 인테이크가 아직 열려 있지 않습니다. 복사 경로를 사용하거나 발행 레인에서 직접 등록하세요.",
        });
        return;
      }
      setHandoffNote({
        tone: "risk",
        message: `큐 전송이 실패했습니다 (${response.status}).`,
      });
    } catch (error) {
      setHandoffNote({
        tone: "warn",
        message:
          "네트워크 경로가 막혀 전송하지 못했습니다. 프리뷰 환경에서는 복사 후 수동 등록을 사용하세요.",
      });
    }
  }, [doc]);

  const addBullet = useCallback(() => {
    setDoc((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) =>
        slide.id === prev.activeSlideId
          ? { ...slide, bullets: [...slide.bullets, ""] }
          : slide,
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  const updateBullet = useCallback((index, value) => {
    setDoc((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) =>
        slide.id === prev.activeSlideId
          ? {
              ...slide,
              bullets: slide.bullets.map((bullet, bulletIndex) =>
                bulletIndex === index ? value : bullet,
              ),
            }
          : slide,
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  const removeBullet = useCallback((index) => {
    setDoc((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) => {
        if (slide.id !== prev.activeSlideId) return slide;
        if (slide.bullets.length <= 1) return slide;
        return {
          ...slide,
          bullets: slide.bullets.filter(
            (_, bulletIndex) => bulletIndex !== index,
          ),
        };
      }),
      updatedAt: Date.now(),
    }));
  }, []);

  return (
    <div className="studio">
      {/* ── Header row ────────────────────────────────────────────── */}
      <header className="studio__header">
        <div className="studio__scope">
          <p className="studio__scope-kicker">브랜드</p>
          <strong>{selectedBrand.label}</strong>
          <span>{brandReference.toneKeywords}</span>
        </div>

        <div className="studio__controls">
          <label className="studio__control">
            <span>템플릿</span>
            <select
              value={doc.templateId}
              onChange={(event) => applyTemplate(event.target.value)}
            >
              {TEMPLATE_PRESETS.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>

          <label className="studio__control">
            <span>채널</span>
            <select
              value={doc.channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              {CHANNEL_PRESETS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>

          <p className="studio__saved" aria-live="polite">
            {formatSavedTime(savedAt)}
          </p>
        </div>
      </header>

      {/* ── Three-column workbench ────────────────────────────────── */}
      <div className="studio__grid">
        {/* Left rail — draft switcher + slide list (drag reorder) */}
        <aside className="studio__rail" aria-label="슬라이드 목록">
          <div className="studio__drafts">
            <label className="studio__drafts-label">
              <span>초안</span>
              <select
                className="studio__drafts-select"
                value={activeDraftId || ""}
                onChange={(event) => switchDraft(event.target.value)}
              >
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {draftTitle(d)}
                  </option>
                ))}
              </select>
            </label>
            <div className="studio__drafts-actions">
              <button
                type="button"
                className="studio__drafts-btn"
                onClick={createNewDraft}
                title="새 초안"
              >
                + 새 초안
              </button>
              <button
                type="button"
                className="studio__drafts-btn studio__drafts-btn--danger"
                onClick={deleteCurrentDraft}
                disabled={drafts.length <= 1}
                title="현재 초안 삭제"
              >
                삭제
              </button>
            </div>
          </div>

          <div className="studio__rail-head">
            <strong>슬라이드</strong>
            <span>
              {doc.slides.length}장 · 표지 {slideCounts.cover} · 본문 {slideCounts.body} · CTA {slideCounts.cta}
            </span>
          </div>

          <ol className="studio__slide-list">
            {doc.slides.map((slide, index) => (
              <SlideRailItem
                key={slide.id}
                slide={slide}
                index={index}
                isActive={slide.id === doc.activeSlideId}
                canRemove={doc.slides.length > 1}
                onSelect={() => setActiveSlide(slide.id)}
                onRemove={() => removeSlide(slide.id)}
                onMove={moveSlide}
              />
            ))}
          </ol>

          <div className="studio__rail-add">
            <button
              type="button"
              className="studio__rail-add-btn"
              onClick={() => addSlide("body")}
            >
              + 본문
            </button>
            <button
              type="button"
              className="studio__rail-add-btn"
              onClick={() => addSlide("cta")}
            >
              + CTA
            </button>
          </div>
        </aside>

        {/* Middle — editor */}
        <section className="studio__editor" aria-label="슬라이드 편집기">
          <div className="studio__editor-head">
            <div className="studio__editor-kind">
              {SLIDE_KINDS.map((kind) => (
                <button
                  key={kind.value}
                  type="button"
                  className="studio__editor-kind-btn"
                  data-active={activeSlide.kind === kind.value}
                  onClick={() => updateActiveSlide({ kind: kind.value })}
                >
                  {kind.label}
                </button>
              ))}
            </div>
            <span className="studio__editor-pos">
              {doc.slides.findIndex((slide) => slide.id === activeSlide.id) + 1}/{doc.slides.length}
            </span>
          </div>

          <div className="studio__style-row">
            <span className="studio__style-label">스타일</span>
            <div className="studio__style-controls">
              <div className="studio__style-group">
                {STYLE_BG_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="studio__style-btn"
                    data-active={(activeSlide.style?.bg || "default") === opt.value}
                    onClick={() => updateSlideStyle("bg", opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="studio__style-group">
                {STYLE_ALIGN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="studio__style-btn"
                    data-active={(activeSlide.style?.align || "left") === opt.value}
                    onClick={() => updateSlideStyle("align", opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="studio__style-group">
                {STYLE_EMPHASIS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="studio__style-btn"
                    data-active={(activeSlide.style?.emphasis || "normal") === opt.value}
                    onClick={() => updateSlideStyle("emphasis", opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="studio__field">
            <span>제목</span>
            <input
              type="text"
              value={activeSlide.title}
              onChange={(event) => updateActiveSlide({ title: event.target.value })}
              placeholder={
                activeSlide.kind === "cover"
                  ? "표지 제목 — 독자를 멈춰 세우는 문장"
                  : activeSlide.kind === "cta"
                    ? "CTA 제목 — 보통 생략"
                    : "이 슬라이드의 한 줄 메시지"
              }
            />
          </label>

          <div className="studio__bullets">
            <div className="studio__bullets-head">
              <span>본문</span>
              <button
                type="button"
                className="studio__bullets-add"
                onClick={addBullet}
              >
                + 한 줄 추가
              </button>
            </div>
            {activeSlide.bullets.map((bullet, index) => (
              <div className="studio__bullet-row" key={`${activeSlide.id}-${index}`}>
                <textarea
                  value={bullet}
                  onChange={(event) => updateBullet(index, event.target.value)}
                  placeholder={
                    activeSlide.kind === "cta"
                      ? "행동 하나를 동사형으로 적으세요"
                      : "짧게, 여백은 넉넉하게"
                  }
                  rows={bullet.length > 80 ? 3 : 2}
                />
                {activeSlide.bullets.length > 1 ? (
                  <button
                    type="button"
                    className="studio__bullet-del"
                    onClick={() => removeBullet(index)}
                    aria-label="이 줄 삭제"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="studio__editor-foot">
            <span>브랜드 규칙 · {brandReference.rule}</span>
            <span>피할 표현 · {brandReference.forbiddenLanguage}</span>
          </div>
        </section>

        {/* Right — preview */}
        <aside className="studio__preview" aria-label="발행 미리보기">
          <div className="studio__preview-head">
            <span className="studio__preview-chip">{doc.channel}</span>
            <span className="studio__preview-chip">{selectedTemplate.label}</span>
          </div>

          <div
            className="studio__preview-stage"
            data-kind={activeSlide.kind}
            data-bg={activeSlide.style?.bg || "default"}
            data-align={activeSlide.style?.align || "left"}
            data-emphasis={activeSlide.style?.emphasis || "normal"}
          >
            {activeSlide.title ? (
              <h2>{activeSlide.title}</h2>
            ) : (
              <h2 className="studio__preview-empty">제목을 입력하세요</h2>
            )}
            <div className="studio__preview-body">
              {activeSlide.bullets.map((bullet, index) =>
                bullet ? <p key={index}>{bullet}</p> : null,
              )}
            </div>
            <div className="studio__preview-foot">
              <span>{selectedBrand.label}</span>
              <span>
                {doc.slides.findIndex((slide) => slide.id === activeSlide.id) + 1} / {doc.slides.length}
              </span>
            </div>
          </div>

          <div className="studio__preview-rail">
            {doc.slides.map((slide, index) => (
              <button
                type="button"
                key={slide.id}
                className="studio__preview-thumb"
                data-active={slide.id === activeSlide.id}
                onClick={() => setActiveSlide(slide.id)}
                aria-label={`${index + 1}번째 슬라이드 열기`}
              >
                <span>{index + 1}</span>
                <strong>{slide.title || "(무제)"}</strong>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Handoff bar ───────────────────────────────────────────── */}
      <section className="studio__handoff" aria-label="핸드오프 액션">
        <div className="studio__handoff-actions">
          <button
            type="button"
            className="studio__handoff-btn studio__handoff-btn--primary"
            onClick={sendToPublishQueue}
          >
            발행 큐로 보내기
          </button>
          <button
            type="button"
            className="studio__handoff-btn"
            onClick={copyMarkdown}
          >
            마크다운 복사
          </button>
          <button
            type="button"
            className="studio__handoff-btn"
            onClick={() => setAssetPickerOpen(true)}
          >
            에셋 열기
          </button>
          <Link className="studio__handoff-link" href="/dashboard/automations/email">
            이메일 레인 →
          </Link>
          <Link className="studio__handoff-link" href="/dashboard/content/publish">
            발행 레인 →
          </Link>
          <button
            type="button"
            className="studio__handoff-btn studio__handoff-btn--ghost"
            onClick={resetDraft}
          >
            초기화
          </button>
        </div>
        {handoffNote ? (
          <p className={`studio__handoff-note studio__handoff-note--${handoffNote.tone}`}>
            {handoffNote.message}
          </p>
        ) : (
          <ul className="studio__handoff-rules">
            {HANDOFF_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        )}
      </section>

      {assetPickerOpen ? (
        <AssetPickerStub onClose={() => setAssetPickerOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * SlideRailItem — draggable slide row. Uses native HTML5 drag so we
 * don't pull in a dnd library for three rows.
 */
function SlideRailItem({
  slide,
  index,
  isActive,
  canRemove,
  onSelect,
  onRemove,
  onMove,
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <li
      className="studio__slide-row"
      data-active={isActive ? "true" : undefined}
      data-kind={slide.kind}
      data-drag-over={isDragOver ? "true" : undefined}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/x-slide-id", slide.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        const fromId = event.dataTransfer.getData("text/x-slide-id");
        if (fromId && fromId !== slide.id) {
          onMove(fromId, slide.id);
        }
      }}
    >
      <button
        type="button"
        className="studio__slide-grip"
        aria-label="슬라이드 드래그 핸들"
        tabIndex={-1}
      >
        ⋮⋮
      </button>
      <button
        type="button"
        className="studio__slide-body"
        onClick={onSelect}
      >
        <span className="studio__slide-index">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="studio__slide-kind">
          {SLIDE_KINDS.find((kind) => kind.value === slide.kind)?.label ??
            slide.kind}
        </span>
        <strong className="studio__slide-title">
          {slide.title || "(무제)"}
        </strong>
      </button>
      <button
        type="button"
        className="studio__slide-remove"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="슬라이드 삭제"
      >
        ×
      </button>
    </li>
  );
}

function AssetPickerStub({ onClose }) {
  useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="studio-assets"
      role="dialog"
      aria-modal="true"
      aria-label="에셋 픽커"
    >
      <button
        type="button"
        className="studio-assets__scrim"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="studio-assets__panel">
        <header className="studio-assets__head">
          <strong>에셋 라이브러리</strong>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className="studio-assets__body">
          <p>
            에셋 저장소 연결이 아직 열려 있지 않습니다. 공용 이미지·폰트·로고는
            현재 <Link href="/dashboard/content/assets">에셋 레인</Link>에서 열
            수 있습니다. 프리뷰 환경에서 이 모달은 자리표시자입니다.
          </p>
        </div>
      </div>
    </div>
  );
}
