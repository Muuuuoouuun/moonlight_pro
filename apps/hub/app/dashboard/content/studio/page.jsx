"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SectionCard } from "@/components/dashboard/section-card";
import { getContentBrandReference, resolveContentBrand } from "@/lib/dashboard-contexts";

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

const handoffRules = [
  "한 장에는 한 메시지만 남기기",
  "첫 장 훅은 설명보다 긴장감이 먼저",
  "마지막 CTA는 하나만 남기기",
  "자동화에 넘길 메모는 명사형보다 동사형이 좋기",
];

function buildDraft(templateId) {
  if (templateId === "problem-shift-action") {
    return `# 왜 운영은 자꾸 복잡해질까

한번 늘어난 작업은 스스로 줄어들지 않습니다.

## 슬라이드 1
- 지금 팀이나 개인이 반복해서 겪는 마찰을 먼저 적습니다.
- 숫자보다 감각을 먼저 건드립니다.

## 슬라이드 2
- 시야를 바꿉니다.
- 문제를 도구 부족이 아니라 흐름 부족으로 다시 정의합니다.

## 슬라이드 3
- 가장 작은 행동 하나를 제안합니다.
- 오늘 바로 적용 가능한 문장으로 마무리합니다.

**CTA**
지금 멈춰 있는 작업 하나를 흐름으로 다시 적어보세요.`;
  }

  if (templateId === "ops-note") {
    return `# 이번 주 운영 메모

이번 주에 가장 강하게 반응한 주제는 무엇이었는지 적습니다.

## 슬라이드 1
- 어떤 콘텐츠가 신호를 만들었는지 기록합니다.

## 슬라이드 2
- 그 반응이 리드나 후속 액션으로 어떻게 이어졌는지 적습니다.

## 슬라이드 3
- 다음 주에 무엇을 더 밀어야 하는지 결론을 남깁니다.

**CTA**
반응이 있었던 주제를 다시 한 번 더 밀어봅니다.`;
  }

  return `# 카드뉴스 제목을 입력하세요

핵심 메시지를 한 문장으로 요약하세요.

## 슬라이드 1
- 독자가 즉시 공감할 문제를 적습니다.
- 설명보다 긴장감을 먼저 만듭니다.

## 슬라이드 2
- 통찰이나 근거를 짧게 보여줍니다.
- 문장은 짧게, 여백은 넉넉하게 유지합니다.

## 슬라이드 3
- 행동 하나로 닫습니다.
- CTA는 반드시 하나만 남깁니다.

**CTA**
다음 액션을 한 문장으로 적으세요.`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      cta = { title: "CTA", body: [] };
      current = null;
      continue;
    }

    if (cta) {
      if (line.trim()) cta.body.push(line.trim());
      continue;
    }

    if (current) {
      if (line.trim()) current.body.push(line.replace(/^- /, "").trim());
    } else if (line.trim()) {
      cover.body.push(line.trim());
    }
  }

  if (current) slides.push(current);

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

export default function ContentStudioPage() {
  const searchParams = useSearchParams();
  const [templateId, setTemplateId] = useState(templatePresets[0].id);
  const [channel, setChannel] = useState(channelPresets[0]);
  const [draft, setDraft] = useState(buildDraft(templatePresets[0].id));
  const [copied, setCopied] = useState(false);

  const selectedBrand = resolveContentBrand(searchParams.get("brand"));
  const brandReference = getContentBrandReference(selectedBrand.value);
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  const sectionCount = (draft.match(/^## /gm) || []).length;
  const selectedTemplate = templatePresets.find((item) => item.id === templateId) ?? templatePresets[0];
  const slides = useMemo(() => parseSlides(draft), [draft]);

  function applyTemplate(nextTemplateId) {
    setTemplateId(nextTemplateId);
    setDraft(buildDraft(nextTemplateId));
    setCopied(false);
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="stack">
      <SectionCard
        kicker="Studio status"
        title="Current drafting context"
        description={
          selectedBrand.value === "all"
            ? "The studio should keep the message, format, and next handoff visible at the same time."
            : `${selectedBrand.label} is selected, so the studio keeps one brand voice in focus while shared rows remain visible elsewhere.`
        }
      >
        <div className="studio-metric-grid">
          <div className="mini-metric">
            <span>Brand scope</span>
            <strong>{selectedBrand.label}</strong>
            <p>{brandReference.rule}</p>
          </div>
          <div className="mini-metric">
            <span>Template</span>
            <strong>{selectedTemplate.label}</strong>
            <p>{selectedTemplate.summary}</p>
          </div>
          <div className="mini-metric">
            <span>Target channel</span>
            <strong>{channel}</strong>
            <p>Draft is being shaped for this distribution surface first.</p>
          </div>
          <div className="mini-metric">
            <span>Draft size</span>
            <strong>
              {wordCount} words / {sectionCount} slides
            </strong>
            <p>Enough structure to hand off without bloating the carousel.</p>
          </div>
        </div>
        <p className="context-footnote">{brandReference.status}</p>
      </SectionCard>

      <div className="editor-layout">
        <SectionCard
          kicker="Draft"
          title="Card copy"
          description="Write the message in a format the team can review and the next automation can reshape."
          action={
            <div className="editor-toolbar">
              <button
                className="button button-secondary"
                onClick={() => {
                  setDraft(buildDraft(templateId));
                  setCopied(false);
                }}
                type="button"
              >
                Reset draft
              </button>
              <button className="button button-primary" onClick={copyDraft} type="button">
                {copied ? "Copied" : "Copy draft"}
              </button>
              <span className="editor-status" role="status" aria-live="polite">
                {copied
                  ? "Copied to clipboard. Ready for publish handoff."
                  : "Keep the hook, proof, and CTA clearly separated."}
              </span>
            </div>
          }
        >
          <div className="editor-frame">
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

            <textarea
              className="editor-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck="false"
              aria-label="Card news draft editor"
            />
            <p className="footnote">
              Tip: keep the hook, the proof, and the CTA separated so the publish automation can reshape
              the draft without guessing the structure.
            </p>
          </div>
        </SectionCard>

        <div className="preview-frame">
          <SectionCard
            kicker="Preview"
            title="Publish frame"
            description="Each slide should hold a single message; the preview makes that contract visible."
          >
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
                slides.map((slide) => (
                  <div className="preview-card" key={slide.id}>
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
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Handoff"
            title="What the next lane needs"
            description="The editor is only useful if the publish and automation lanes can understand what to do next."
          >
            <div className="template-grid">
              <div className="template-row">
                <div>
                  <strong>Export target</strong>
                  <p>{channel} first, then repurpose into adjacent formats if the signal is good.</p>
                </div>
              </div>
              <div className="template-row">
                <div>
                  <strong>Template contract</strong>
                  <p>{selectedTemplate.summary}</p>
                </div>
              </div>
              <div className="template-row">
                <div>
                  <strong>Next action</strong>
                  <p>
                    Approve the hook in the {selectedBrand.label} tone, then send the draft into
                    publish or automation review.
                  </p>
                </div>
              </div>
              <div className="template-row">
                <div>
                  <strong>Email handoff</strong>
                  <p>
                    Pair this draft with a warm follow-up or weekly brief template before it
                    leaves the studio.
                  </p>
                </div>
                <Link className="button button-secondary" href="/dashboard/automations/email">
                  Open email lane
                </Link>
              </div>
              <div className="template-row">
                <div>
                  <strong>Send to publish queue</strong>
                  <p>
                    Drop the current draft into the publish queue when the slides feel ready for
                    distribution.
                  </p>
                </div>
                <Link className="button button-ghost" href="/dashboard/content/publish">
                  Publish lane
                </Link>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            kicker="Rules"
            title="Studio guardrails"
            description="A lightweight checklist keeps drafts short, sharp, and easy to repurpose."
          >
            <ul className="note-list">
              {handoffRules.map((rule) => (
                <li className="note-row" key={rule}>
                  <div>
                    <strong>{rule}</strong>
                    <p>The studio should make this rule easier to follow than to ignore.</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
