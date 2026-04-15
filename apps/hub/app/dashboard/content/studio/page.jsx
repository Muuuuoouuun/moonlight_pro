"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SectionCard } from "@/components/dashboard/section-card";
import { getContentBrandReference, resolveContentBrand } from "@/lib/dashboard-contexts";

const templatePresets = [
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

const channelPresets = ["인스타그램", "인사이트", "뉴스레터", "랜딩"];

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
    all.push({ id: "cover", label: "표지", title: cover.title, body: cover.body });
  }
  slides.forEach((slide, index) => {
    all.push({
      id: `slide-${index + 1}`,
      label: `슬라이드 ${index + 1}`,
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
  const selectedBrand = resolveContentBrand(searchParams.get("brand"));
  const brandReference = getContentBrandReference(selectedBrand.value);
  const defaultTemplateId = brandReference.recommendedTemplateId || templatePresets[0].id;
  const defaultChannel = brandReference.recommendedChannel || channelPresets[0];
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [channel, setChannel] = useState(defaultChannel);
  const [draft, setDraft] = useState(buildDraft(defaultTemplateId));
  const [copied, setCopied] = useState(false);
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  const sectionCount = (draft.match(/^## /gm) || []).length;
  const selectedTemplate = templatePresets.find((item) => item.id === templateId) ?? templatePresets[0];
  const slides = useMemo(() => parseSlides(draft), [draft]);

  useEffect(() => {
    const nextTemplateId = brandReference.recommendedTemplateId || templatePresets[0].id;
    setTemplateId(nextTemplateId);
    setChannel(brandReference.recommendedChannel || channelPresets[0]);
    setDraft(buildDraft(nextTemplateId));
    setCopied(false);
  }, [
    brandReference.recommendedChannel,
    brandReference.recommendedTemplateId,
    selectedBrand.value,
  ]);

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
        kicker="스튜디오 상태"
        title="현재 초안 맥락"
        description={
          selectedBrand.value === "all"
            ? "스튜디오는 메시지, 포맷, 다음 핸드오프를 동시에 보이게 유지해야 합니다."
            : `${selectedBrand.label}을 선택했으므로 공용 행은 다른 곳에 남겨 두되, 이 스튜디오는 하나의 브랜드 보이스에 집중합니다.`
        }
      >
        <div className="studio-metric-grid">
          <div className="mini-metric">
            <span>브랜드 범위</span>
            <strong>{selectedBrand.label}</strong>
            <p>{brandReference.rule}</p>
          </div>
          <div className="mini-metric">
            <span>톤 가이드</span>
            <strong>{brandReference.toneKeywords}</strong>
            <p>{brandReference.forbiddenLanguage}</p>
          </div>
          <div className="mini-metric">
            <span>템플릿</span>
            <strong>{selectedTemplate.label}</strong>
            <p>{selectedTemplate.summary}</p>
          </div>
          <div className="mini-metric">
            <span>목표 채널</span>
            <strong>{channel}</strong>
            <p>{`권장 경로: ${brandReference.recommendedChannel}`}</p>
          </div>
          <div className="mini-metric">
            <span>발행 리듬</span>
            <strong>{brandReference.publishRhythm}</strong>
            <p>{brandReference.ctaPattern}</p>
          </div>
          <div className="mini-metric">
            <span>초안 크기</span>
            <strong>
              {wordCount}어절 / {sectionCount}장
            </strong>
            <p>캐러셀을 과하게 불리지 않고도 넘길 수 있는 최소 구조를 유지합니다.</p>
          </div>
        </div>
        <div className="status-note">
          <strong>{selectedBrand.label} 운영 노트</strong>
          <p>{brandReference.keyMessage}</p>
          <p className="status-note-subtle">{`CTA · ${brandReference.ctaPattern}`}</p>
          <p className="status-note-subtle">{`피해야 할 표현 · ${brandReference.forbiddenLanguage}`}</p>
        </div>
        <p className="context-footnote">{brandReference.status}</p>
      </SectionCard>

      <div className="editor-layout">
        <SectionCard
          kicker="초안"
          title="카드 카피"
          description="팀이 검토할 수 있고 다음 자동화가 다시 가공할 수 있는 형식으로 메시지를 씁니다."
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
                초안 초기화
              </button>
              <button className="button button-primary" onClick={copyDraft} type="button">
                {copied ? "복사됨" : "초안 복사"}
              </button>
              <span className="editor-status" role="status" aria-live="polite">
                {copied
                  ? "클립보드에 복사했습니다. 발행 핸드오프 준비가 끝났습니다."
                  : "후킹, 증거, CTA를 분명히 분리해 둡니다."}
              </span>
            </div>
          }
        >
          <div className="editor-frame">
            <div className="studio-option-grid">
              <div className="studio-option-stack">
                <span className="section-kicker">템플릿 프리셋</span>
                <p className="footnote">
                  {`${selectedBrand.label} 권장 · ${brandReference.recommendedTemplateLabel}`}
                </p>
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
                <span className="section-kicker">주 채널</span>
                <p className="footnote">{`권장 경로 · ${brandReference.recommendedChannel}`}</p>
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
              aria-label="카드뉴스 초안 편집기"
            />
            <p className="footnote">
              팁: 후킹, 증거, CTA를 분리해 두면 발행 자동화가 구조를 추측하지 않고도 초안을 다시 가공할 수 있습니다.
            </p>
          </div>
        </SectionCard>

        <div className="preview-frame">
          <SectionCard
            kicker="미리보기"
            title="발행 프레임"
            description="각 슬라이드는 하나의 메시지만 담아야 하며, 이 미리보기가 그 계약을 보이게 합니다."
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
            kicker="핸드오프"
            title="다음 레인이 필요로 하는 것"
            description="발행 레인과 자동화 레인이 다음에 무엇을 해야 하는지 이해할 수 있을 때만 이 편집기는 유효합니다."
          >
            <div className="template-grid">
              <div className="template-row">
                <div>
                  <strong>핵심 메시지</strong>
                  <p>{brandReference.keyMessage}</p>
                </div>
              </div>
              <div className="template-row">
                <div>
                  <strong>출력 대상</strong>
                  <p>{`${channel}을 먼저 보내고, 신호가 좋으면 인접 포맷으로 다시 씁니다.`}</p>
                </div>
              </div>
              <div className="template-row">
                <div>
                  <strong>템플릿 계약</strong>
                  <p>{`${selectedTemplate.summary} · ${brandReference.formatFocus}`}</p>
                </div>
              </div>
              <div className="template-row">
                <div>
                  <strong>다음 액션</strong>
                  <p>{brandReference.handoffNote}</p>
                </div>
              </div>
              <div className="template-row">
                <div>
                  <strong>이메일 핸드오프</strong>
                  <p>
                    이 초안이 스튜디오를 떠나기 전에 따뜻한 후속 메일이나 주간 브리프 템플릿과 짝지어 둡니다.
                  </p>
                </div>
                <Link className="button button-secondary" href="/dashboard/automations/email">
                  이메일 레인 열기
                </Link>
              </div>
              <div className="template-row">
                <div>
                  <strong>발행 큐로 보내기</strong>
                  <p>
                    슬라이드가 배포 준비가 됐다고 느껴지면 현재 초안을 발행 큐로 넘깁니다.
                  </p>
                </div>
                <Link className="button button-ghost" href="/dashboard/content/publish">
                  발행 레인
                </Link>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            kicker="규칙"
            title="스튜디오 가드레일"
            description="가벼운 체크리스트가 초안을 짧고 선명하며 재활용하기 쉽게 유지합니다."
          >
            <ul className="note-list">
              {handoffRules.map((rule) => (
                <li className="note-row" key={rule}>
                  <div>
                    <strong>{rule}</strong>
                    <p>이 규칙은 무시하기보다 따르기 쉬워야 합니다.</p>
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
