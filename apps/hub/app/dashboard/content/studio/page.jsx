"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import {
  buildContentStudioHref,
  CONTENT_BRANDS,
  getContentBrandReference,
  getProjectStudioConfig,
  resolveContentBrand,
  resolveWorkContext,
  WORK_CONTEXTS,
} from "@/lib/dashboard-contexts";

const templatePresets = [
  {
    id: "hook-proof-cta",
    label: "Hook / Proof / CTA",
    summary: "짧고 선명한 카드뉴스 기본형",
  },
  {
    id: "problem-shift-action",
    label: "Problem / Shift / Action",
    summary: "문제 인식에서 행동 유도까지 밀어주는 구조",
  },
  {
    id: "ops-note",
    label: "Operator Note",
    summary: "운영 메모를 퍼블릭 톤으로 바꾸는 구조",
  },
];

const channelPresets = ["Instagram", "Insights", "Newsletter", "Landing"];

function resolveTemplatePreset(value, fallback) {
  return templatePresets.find((item) => item.id === value)?.id || fallback || templatePresets[0].id;
}

function resolveChannelPreset(value, fallback) {
  return channelPresets.find((item) => item === value) || fallback || channelPresets[0];
}

function buildDraft(templateId, { selectedProject, selectedBrand, studioConfig }) {
  const projectLabel =
    selectedProject.value === "all" ? "이번 프로젝트" : selectedProject.label;
  const brandLabel =
    selectedBrand.value === "all" ? "공용 브랜드 톤" : `${selectedBrand.label} 톤`;
  const storyAngle = studioConfig.storyAngle;
  const operatorPrompt = studioConfig.operatorPrompt;

  if (templateId === "problem-shift-action") {
    return `# ${projectLabel}가 지금 잡아야 할 문제

${brandLabel}으로 ${storyAngle}

## 슬라이드 1
- 지금 독자가 반복해서 겪는 마찰을 먼저 적습니다.
- ${operatorPrompt}

## 슬라이드 2
- 문제를 다른 각도에서 다시 보게 만듭니다.
- 도구보다 흐름, 기능보다 결과를 강조합니다.

## 슬라이드 3
- 오늘 바로 해볼 수 있는 행동 하나를 제안합니다.
- 설명보다 추진력을 남기는 문장으로 닫습니다.

**CTA**
지금 가장 막히는 지점을 한 줄로 적고, 그걸 바꾸는 첫 액션을 제안하세요.`;
  }

  if (templateId === "ops-note") {
    return `# ${projectLabel} 운영 메모

${brandLabel}으로 ${storyAngle}

## 슬라이드 1
- 이번 주 실제로 움직인 변화 한 가지를 적습니다.
- 왜 이 변화가 중요했는지 한 문장으로 남깁니다.

## 슬라이드 2
- 그 판단이 다음 실행을 어떻게 바꿨는지 적습니다.
- ${operatorPrompt}

## 슬라이드 3
- 다음 주에 더 밀어야 할 행동 하나만 남깁니다.
- 읽는 사람이 바로 따라 할 수 있게 동사형으로 씁니다.

**CTA**
이번 주 바뀐 판단 하나를 바로 실행 가능한 문장으로 정리하세요.`;
  }

  return `# ${projectLabel}에서 지금 꺼낼 한 문장

${brandLabel}으로 ${storyAngle}

## 슬라이드 1
- 독자가 즉시 공감할 문제를 적습니다.
- 설명보다 긴장감이 먼저 오게 만듭니다.

## 슬라이드 2
- 통찰이나 근거를 짧게 보여줍니다.
- 숫자보다 장면, 기능보다 결과를 먼저 남깁니다.

## 슬라이드 3
- 행동 하나로 닫습니다.
- ${operatorPrompt}

**CTA**
지금 가장 먼저 해볼 액션 한 줄로 마무리하세요.`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeImportedText(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function normalizeCardLine(line) {
  return String(line || "")
    .replace(/^[-*]\s*/, "")
    .trim();
}

function buildDraftSections(value) {
  const lines = value.split("\n");
  const slides = [];
  let cover = { title: "", body: [] };
  let current = null;
  let cta = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("# ")) {
      cover = { title: line.replace(/^# /, "").trim(), body: [] };
      continue;
    }

    if (line.startsWith("## ")) {
      if (current) slides.push(current);
      current = { title: line.replace(/^## /, "").trim(), body: [] };
      continue;
    }

    if (/^\*\*CTA\*\*$/i.test(line.trim())) {
      if (current) {
        slides.push(current);
        current = null;
      }
      cta = { title: "CTA", body: [] };
      continue;
    }

    if (cta) {
      if (line.trim()) cta.body.push(line.trim());
      continue;
    }

    if (current) {
      if (line.trim()) current.body.push(normalizeCardLine(line));
    } else if (line.trim()) {
      cover.body.push(line.trim());
    }
  }

  if (current) slides.push(current);

  return { cover, slides, cta };
}

function serializeDraftSections({ cover, slides, cta }) {
  const sections = [];

  if (cover?.title || cover?.body?.length) {
    const coverLines = [];

    if (cover?.title) {
      coverLines.push(`# ${cover.title}`);
    }

    if (cover?.body?.length) {
      if (coverLines.length) {
        coverLines.push("");
      }
      coverLines.push(...cover.body);
    }

    sections.push(coverLines.join("\n"));
  }

  for (const slide of slides || []) {
    const slideLines = [`## ${slide.title || "슬라이드"}`];

    if (slide.body?.length) {
      slideLines.push(...slide.body.map((line) => `- ${normalizeCardLine(line)}`));
    }

    sections.push(slideLines.join("\n"));
  }

  if (cta?.body?.length) {
    sections.push(["**CTA**", ...cta.body].join("\n"));
  }

  return sections.filter(Boolean).join("\n\n").trim();
}

function renderPreview(value) {
  return escapeHtml(value)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.*)$/gm, "<p>• $1</p>")
    .replace(/\n/g, "<br />");
}

function parseSlides(value) {
  const { cover, slides, cta } = buildDraftSections(value);

  const all = [];
  if (cover.title || cover.body.length) {
    all.push({ id: "cover", label: "Cover", title: cover.title, body: cover.body });
  }
  slides.forEach((slide, index) => {
    all.push({
      id: `slide-${index + 1}`,
      label: `Slide ${index + 1}`,
      title: slide.title,
      body: slide.body,
    });
  });
  if (cta) {
    all.push({ id: "cta", label: "CTA", title: cta.title, body: cta.body });
  }

  return all;
}

function reorderMessageSlidesInDraft(value, sourceId, targetId) {
  const sections = buildDraftSections(value);
  const sourceIndex = Number.parseInt(String(sourceId).replace("slide-", ""), 10) - 1;
  const targetIndex = Number.parseInt(String(targetId).replace("slide-", ""), 10) - 1;

  if (
    !Number.isFinite(sourceIndex) ||
    !Number.isFinite(targetIndex) ||
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex ||
    sourceIndex >= sections.slides.length ||
    targetIndex >= sections.slides.length
  ) {
    return null;
  }

  const nextSlides = [...sections.slides];
  const [moved] = nextSlides.splice(sourceIndex, 1);
  nextSlides.splice(targetIndex, 0, moved);

  return {
    draft: serializeDraftSections({
      cover: sections.cover,
      slides: nextSlides,
      cta: sections.cta,
    }),
    activeSlideId: `slide-${targetIndex + 1}`,
  };
}

function convertLooseTextToDraft(value, fileName) {
  const normalized = normalizeImportedText(value);
  if (!normalized) {
    return "";
  }

  if (/^# |^## |\*\*CTA\*\*/m.test(normalized)) {
    return normalized;
  }

  const baseName = fileName.replace(/\.[^.]+$/, "").trim() || "업로드 템플릿";
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return normalized;
  }

  const [firstBlock, ...restBlocks] = blocks;
  const firstLines = firstBlock
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const cover = {
    title: firstLines[0] || baseName,
    body: firstLines.slice(1),
  };
  const slideBlocks = restBlocks.length
    ? restBlocks
    : [firstLines.slice(1).join("\n") || firstLines[0] || baseName];
  const slides = slideBlocks.map((block, index) => {
    const lines = block
      .split("\n")
      .map((line) => normalizeCardLine(line))
      .filter(Boolean);

    return {
      title: `슬라이드 ${index + 1}`,
      body: lines,
    };
  });

  return serializeDraftSections({
    cover,
    slides,
    cta: null,
  });
}

function draftFromStructuredTemplate(data, fileName) {
  if (typeof data?.draft === "string" && data.draft.trim()) {
    return {
      draft: convertLooseTextToDraft(data.draft, fileName),
      templateId: resolveTemplatePreset(data.templateId || data.template, ""),
    };
  }

  const textCandidate = [data?.content, data?.body, data?.text].find(
    (value) => typeof value === "string" && value.trim(),
  );
  if (textCandidate) {
    return {
      draft: convertLooseTextToDraft(textCandidate, fileName),
      templateId: resolveTemplatePreset(data.templateId || data.template, ""),
    };
  }

  const rawSlides = Array.isArray(data?.slides)
    ? data.slides
    : Array.isArray(data?.cards)
      ? data.cards
      : [];

  if (!rawSlides.length) {
    return null;
  }

  function toBodyLines(value) {
    if (Array.isArray(value)) {
      return value.map((line) => normalizeCardLine(line)).filter(Boolean);
    }

    return String(value || "")
      .split("\n")
      .map((line) => normalizeCardLine(line))
      .filter(Boolean);
  }

  return {
    draft: serializeDraftSections({
      cover: {
        title: data?.title || fileName.replace(/\.[^.]+$/, "") || "업로드 템플릿",
        body:
          typeof data?.summary === "string" && data.summary.trim() ? [data.summary.trim()] : [],
      },
      slides: rawSlides.map((item, index) => ({
        title: item?.title || item?.label || `슬라이드 ${index + 1}`,
        body: toBodyLines(item?.body || item?.text || item?.copy || ""),
      })),
      cta:
        typeof data?.cta === "string" && data.cta.trim()
          ? { title: "CTA", body: [data.cta.trim()] }
          : Array.isArray(data?.cta) && data.cta.length
            ? { title: "CTA", body: data.cta.map((line) => String(line).trim()).filter(Boolean) }
            : null,
    }),
    templateId: resolveTemplatePreset(data.templateId || data.template, ""),
  };
}

async function importTemplateFile(file) {
  const fileName = file?.name || "uploaded-template";
  const raw = normalizeImportedText(await file.text());

  if (!raw) {
    throw new Error("비어 있는 파일은 가져올 수 없습니다.");
  }

  if (fileName.toLowerCase().endsWith(".json")) {
    try {
      const parsed = JSON.parse(raw);
      const structured = draftFromStructuredTemplate(parsed, fileName);

      if (structured?.draft) {
        return structured;
      }

      throw new Error("지원되는 JSON 템플릿 형식을 찾지 못했습니다.");
    } catch {
      throw new Error("JSON 템플릿 형식을 해석하지 못했습니다.");
    }
  }

  return {
    draft: convertLooseTextToDraft(raw, fileName),
    templateId: "",
  };
}

function buildSlideCopy(slide) {
  return [slide.title, ...slide.body].filter(Boolean).join("\n");
}

function isReorderableSlideId(slideId) {
  return typeof slideId === "string" && slideId.startsWith("slide-");
}

export default function ContentStudioPage() {
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const brandParam = searchParams.get("brand");
  const templateParam = searchParams.get("template");
  const channelParam = searchParams.get("channel");

  const selectedProject = resolveWorkContext(projectParam);
  const studioConfig = useMemo(
    () => getProjectStudioConfig(selectedProject.value),
    [selectedProject.value],
  );
  const selectedBrand = resolveContentBrand(brandParam || studioConfig.brand);
  const brandReference = getContentBrandReference(selectedBrand.value);
  const initialTemplateId = resolveTemplatePreset(templateParam, studioConfig.templateId);
  const initialChannel = resolveChannelPreset(channelParam, studioConfig.channel);

  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [channel, setChannel] = useState(initialChannel);
  const [draft, setDraft] = useState(
    buildDraft(initialTemplateId, { selectedProject, selectedBrand, studioConfig }),
  );
  const [copiedTarget, setCopiedTarget] = useState("");
  const [activeSlideId, setActiveSlideId] = useState("");
  const [draggedSlideId, setDraggedSlideId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const [isUploadActive, setIsUploadActive] = useState(false);
  const [uploadedTemplateName, setUploadedTemplateName] = useState("");
  const [studioNotice, setStudioNotice] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setTemplateId(initialTemplateId);
    setChannel(initialChannel);
    setDraft(buildDraft(initialTemplateId, { selectedProject, selectedBrand, studioConfig }));
    setCopiedTarget("");
    setUploadedTemplateName("");
    setStudioNotice("");
  }, [
    brandParam,
    channelParam,
    initialChannel,
    initialTemplateId,
    projectParam,
    selectedBrand.value,
    selectedProject.value,
    studioConfig,
    templateParam,
  ]);

  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  const selectedTemplate =
    templatePresets.find((item) => item.id === templateId) ?? templatePresets[0];
  const slides = useMemo(() => parseSlides(draft), [draft]);
  const previewSlides = slides.length
    ? slides
    : [{ id: "draft", label: "Draft", title: "Live preview", body: [draft] }];
  const activeSlide =
    previewSlides.find((item) => item.id === activeSlideId) ?? previewSlides[0] ?? null;
  const messageSlides = slides.filter((item) => item.id.startsWith("slide-"));
  const readySlides = previewSlides.filter((item) => item.title || item.body.length).length;
  const hasCta = slides.some((item) => item.id === "cta" && item.body.length > 0);
  const denseSlides = messageSlides.filter(
    (item) => item.body.length > 3 || item.body.join(" ").length > 180,
  );
  const handoffLabel =
    hasCta && messageSlides.length >= 3 && denseSlides.length === 0
      ? "Ready to hand off"
      : denseSlides.length
        ? "Needs tightening"
        : "Drafting";
  const projectLinks = WORK_CONTEXTS.map((item) => ({
    ...item,
    href: buildContentStudioHref({
      project: item.value,
      template: item.value === "all" ? templateId : getProjectStudioConfig(item.value).templateId,
      channel: item.value === "all" ? channel : getProjectStudioConfig(item.value).channel,
    }),
  }));
  const brandLinks = CONTENT_BRANDS.map((item) => ({
    ...item,
    href: buildContentStudioHref({
      project: selectedProject.value,
      brand: item.value,
      template: templateId,
      channel,
    }),
  }));
  useEffect(() => {
    if (!previewSlides.length) {
      setActiveSlideId("");
      return;
    }

    if (previewSlides.some((item) => item.id === activeSlideId)) {
      return;
    }

    setActiveSlideId(previewSlides[0].id);
  }, [activeSlideId, previewSlides]);

  function applyTemplate(nextTemplateId) {
    setTemplateId(nextTemplateId);
    setDraft(buildDraft(nextTemplateId, { selectedProject, selectedBrand, studioConfig }));
    setCopiedTarget("");
    setStudioNotice(
      `${templatePresets.find((item) => item.id === nextTemplateId)?.label || "템플릿"} 적용됨.`,
    );
  }

  async function copyText(value, target) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      setStudioNotice(
        target === "draft"
          ? "초안 전체를 복사했습니다."
          : target === "slide"
            ? "현재 카드를 복사했습니다."
            : "복사했습니다.",
      );
      window.setTimeout(() => setCopiedTarget(""), 1400);
    } catch {
      setCopiedTarget("error");
      setStudioNotice("클립보드 복사에 실패했습니다. 브라우저 권한을 확인하세요.");
      window.setTimeout(() => setCopiedTarget(""), 1400);
    }
  }

  function focusSlide(slideId) {
    setActiveSlideId(slideId);
    document.getElementById(`studio-preview-${slideId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  function reorderSlides(sourceId, targetId) {
    const next = reorderMessageSlidesInDraft(draft, sourceId, targetId);

    setDraggedSlideId("");
    setDropTargetId("");

    if (!next || next.draft === draft) {
      return;
    }

    setDraft(next.draft);
    setActiveSlideId(next.activeSlideId);
    setStudioNotice("카드 순서를 업데이트했습니다.");
  }

  function handleSlideDragStart(event, slideId) {
    if (!isReorderableSlideId(slideId)) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", slideId);
    setDraggedSlideId(slideId);
    setDropTargetId(slideId);
  }

  function handleSlideDragOver(event, slideId) {
    if (!isReorderableSlideId(slideId) || !draggedSlideId || draggedSlideId === slideId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(slideId);
  }

  function handleSlideDrop(event, slideId) {
    if (!isReorderableSlideId(slideId)) {
      return;
    }

    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedSlideId;
    reorderSlides(sourceId, slideId);
  }

  function handleSlideDragEnd() {
    setDraggedSlideId("");
    setDropTargetId("");
  }

  function moveActiveSlide(direction) {
    if (!isReorderableSlideId(activeSlideId)) {
      return;
    }

    const currentIndex = Number.parseInt(activeSlideId.replace("slide-", ""), 10) - 1;
    const nextIndex = currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= messageSlides.length) {
      return;
    }

    reorderSlides(activeSlideId, `slide-${nextIndex + 1}`);
  }

  async function handleTemplateImport(files) {
    const file = Array.from(files || [])[0];

    if (!file) {
      return;
    }

    try {
      const imported = await importTemplateFile(file);
      setDraft(imported.draft);
      setActiveSlideId("");
      setCopiedTarget("");
      setDraggedSlideId("");
      setDropTargetId("");
      setUploadedTemplateName(file.name);
      setStudioNotice(`"${file.name}" 템플릿을 불러왔습니다.`);

      if (imported.templateId) {
        setTemplateId(imported.templateId);
      }
    } catch (error) {
      setStudioNotice(error instanceof Error ? error.message : String(error));
    }
  }

  function handleUploadInputChange(event) {
    void handleTemplateImport(event.target.files);
    event.target.value = "";
  }

  function handleUploadDrop(event) {
    event.preventDefault();
    setIsUploadActive(false);
    void handleTemplateImport(event.dataTransfer.files);
  }

  const activeMessageSlideIndex = isReorderableSlideId(activeSlideId)
    ? Number.parseInt(activeSlideId.replace("slide-", ""), 10) - 1
    : -1;

  return (
    <div className="stack">
      <SectionCard
        className="studio-panel studio-panel--cockpit"
        kicker="Brand content studio"
        title="브랜드 콘텐츠 제작에만 집중하는 작업 화면"
        description="불필요한 운영 정보는 빼고, 지금 어떤 브랜드 톤으로 어떤 카드 메시지를 만드는지만 바로 보이게 정리했습니다."
      >
        <div className="studio-compact-context">
          <div className="view-switcher-group">
            <span className="section-kicker">Project</span>
            <div className="context-switcher">
              {projectLinks.map((item) => (
                <Link
                  className="context-link"
                  data-active={item.value === selectedProject.value ? "true" : "false"}
                  href={item.href}
                  key={item.value}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="view-switcher-group">
            <span className="section-kicker">Brand</span>
            <div className="context-switcher">
              {brandLinks.map((item) => (
                <Link
                  className="context-link"
                  data-active={item.value === selectedBrand.value ? "true" : "false"}
                  href={item.href}
                  key={item.value}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="studio-focus-strip">
            <div className="studio-focus-chip">
              <span>Tone</span>
              <strong>{selectedBrand.label}</strong>
            </div>
            <div className="studio-focus-chip">
              <span>Template</span>
              <strong>{selectedTemplate.label}</strong>
            </div>
            <div className="studio-focus-chip">
              <span>Channel</span>
              <strong>{channel}</strong>
            </div>
            <div className="studio-focus-chip">
              <span>Status</span>
              <strong>{handoffLabel}</strong>
            </div>
          </div>
        </div>
        <p className="context-footnote">
          {studioConfig.storyAngle} · {brandReference.rule}
        </p>
      </SectionCard>

      <div className="editor-layout">
        <SectionCard
          className="studio-panel studio-panel--draft"
          kicker="Write"
          title="브랜드 메시지 작성"
          description={`${selectedBrand.label} 톤을 유지한 채, 카드마다 한 메시지만 남도록 바로 편집합니다.`}
          action={
            <div className="editor-toolbar">
              <button
                className="button button-secondary"
                onClick={() => {
                  setDraft(buildDraft(templateId, { selectedProject, selectedBrand, studioConfig }));
                  setCopiedTarget("");
                }}
                type="button"
              >
                Reset draft
              </button>
              <button
                className="button button-primary"
                onClick={() => void copyText(draft, "draft")}
                type="button"
              >
                {copiedTarget === "draft" ? "Copied" : "Copy draft"}
              </button>
              <button
                className="button button-ghost"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Upload template
              </button>
              <span className="editor-status" role="status" aria-live="polite">
                {studioNotice || "Keep the hook, proof, and CTA clearly separated."}
              </span>
            </div>
          }
        >
          <div className="editor-frame">
            <input
              ref={fileInputRef}
              accept=".md,.markdown,.txt,.json,application/json,text/markdown,text/plain"
              className="studio-upload-input"
              hidden
              onChange={handleUploadInputChange}
              type="file"
            />
            <div className="studio-option-grid">
              <div className="studio-option-stack">
                <span className="section-kicker">Template preset</span>
                <div className="studio-button-row">
                  {templatePresets.map((template) => (
                    <button
                      key={template.id}
                      className="studio-toggle"
                      data-active={template.id === templateId}
                      onClick={() => applyTemplate(template.id)}
                      type="button"
                    >
                      <strong>{template.label}</strong>
                      <span>{template.summary}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="studio-option-stack">
                <span className="section-kicker">Primary channel</span>
                <div className="studio-chip-row">
                  {channelPresets.map((item) => (
                    <button
                      key={item}
                      className="studio-chip-toggle"
                      data-active={item === channel}
                      onClick={() => setChannel(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="studio-upload-stack">
              <div className="studio-upload-meta">
                <span className="section-kicker">Quick import</span>
                <p>
                  `.md`, `.txt`, `.json` 템플릿을 바로 가져와 현재 초안을 교체할 수 있습니다.
                </p>
              </div>
              <div
                className="studio-upload-zone"
                data-active={isUploadActive ? "true" : "false"}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsUploadActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsUploadActive(false);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsUploadActive(true);
                }}
                onDrop={handleUploadDrop}
              >
                <div>
                  <strong>템플릿 파일 드롭</strong>
                  <p>마크다운 구조가 있으면 그대로, 일반 텍스트면 카드 구조로 감싸서 불러옵니다.</p>
                </div>
                <div className="studio-upload-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Choose file
                  </button>
                  <span className="composer-helper-chip">
                    {uploadedTemplateName ? `Last import · ${uploadedTemplateName}` : "No import yet"}
                  </span>
                </div>
              </div>
            </div>

            <textarea
              className="editor-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck="false"
              aria-label="Card news draft editor"
            />
            <p className="footnote">
              {studioConfig.operatorPrompt}
            </p>
          </div>
        </SectionCard>

        <div className="preview-frame">
          <SectionCard
            className="studio-panel studio-panel--preview"
            kicker="Preview"
            title="슬라이드 흐름과 결과 확인"
            description="오른쪽에서는 순서와 밀도를 바로 확인하고, 왼쪽에서는 즉시 수정합니다."
            action={
              activeSlide ? (
                <div className="studio-nav-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => void copyText(buildSlideCopy(activeSlide), "slide")}
                    type="button"
                  >
                    {copiedTarget === "slide" ? "Slide copied" : "Copy active slide"}
                  </button>
                  <button
                    className="button button-ghost"
                    disabled={activeMessageSlideIndex <= 0}
                    onClick={() => moveActiveSlide(-1)}
                    type="button"
                  >
                    Move up
                  </button>
                  <button
                    className="button button-ghost"
                    disabled={
                      activeMessageSlideIndex === -1 || activeMessageSlideIndex >= messageSlides.length - 1
                    }
                    onClick={() => moveActiveSlide(1)}
                    type="button"
                  >
                    Move down
                  </button>
                </div>
              ) : null
            }
          >
            <div className="studio-slide-nav studio-slide-nav--single">
              {previewSlides.map((slide) => {
                const slideReady = Boolean(slide.title || slide.body.length);

                return (
                  <button
                    key={slide.id}
                    type="button"
                    className="studio-slide-chip"
                    data-active={slide.id === activeSlideId ? "true" : "false"}
                    data-dragging={draggedSlideId === slide.id ? "true" : undefined}
                    data-drop-target={
                      dropTargetId === slide.id && draggedSlideId && draggedSlideId !== slide.id
                        ? "true"
                        : undefined
                    }
                    data-state={slideReady ? "ready" : "empty"}
                    draggable={isReorderableSlideId(slide.id)}
                    onDragEnd={handleSlideDragEnd}
                    onDragOver={(event) => handleSlideDragOver(event, slide.id)}
                    onDragStart={(event) => handleSlideDragStart(event, slide.id)}
                    onDrop={(event) => handleSlideDrop(event, slide.id)}
                    onClick={() => focusSlide(slide.id)}
                  >
                    <div className="studio-slide-chip-meta">
                      <span>{slide.label}</span>
                      <strong>{slide.body.length} lines</strong>
                    </div>
                    <p>{slide.title || "메시지를 추가하세요."}</p>
                  </button>
                );
              })}
            </div>

            <div className="studio-slide-stack">
              {slides.length === 0 ? (
                <div className="preview-card">
                  <div className="preview-head">
                    <span className="chip">1080 × 1080</span>
                    <span className="chip">{channel}</span>
                  </div>
                  <div
                    className="preview-stage"
                    dangerouslySetInnerHTML={{ __html: renderPreview(draft) }}
                  />
                </div>
              ) : (
                previewSlides.map((slide) => (
                  <div
                    className="preview-card"
                    data-active={slide.id === activeSlideId ? "true" : "false"}
                    data-dragging={draggedSlideId === slide.id ? "true" : undefined}
                    data-drop-target={
                      dropTargetId === slide.id && draggedSlideId && draggedSlideId !== slide.id
                        ? "true"
                        : undefined
                    }
                    id={`studio-preview-${slide.id}`}
                    key={slide.id}
                    draggable={isReorderableSlideId(slide.id)}
                    onDragEnd={handleSlideDragEnd}
                    onDragOver={(event) => handleSlideDragOver(event, slide.id)}
                    onDragStart={(event) => handleSlideDragStart(event, slide.id)}
                    onDrop={(event) => handleSlideDrop(event, slide.id)}
                    onClick={() => setActiveSlideId(slide.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveSlideId(slide.id);
                      }
                    }}
                  >
                    <div className="preview-head">
                      <span className="chip">{slide.label}</span>
                      <span className="chip">{channel}</span>
                    </div>
                    <div className="preview-stage">
                      {slide.title ? <h2>{slide.title}</h2> : null}
                      {slide.body.map((line, index) => (
                        <p key={`${slide.id}-${index}`}>{line}</p>
                      ))}
                      {slide.body.length === 0 && !slide.title ? (
                        <p className="muted">빈 슬라이드 — 메시지를 추가하세요.</p>
                      ) : null}
                    </div>
                    <div className="preview-foot">
                      <span className="chip">{selectedBrand.label}</span>
                      <span className="chip">{selectedTemplate.label}</span>
                      <span className="chip">{slide.body.length} lines</span>
                      {isReorderableSlideId(slide.id) ? (
                        <span className="chip">Drag to reorder</span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
