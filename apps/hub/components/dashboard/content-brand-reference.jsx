import { SectionCard } from "@/components/dashboard/section-card";

export function ContentBrandReference({ reference, compact = false }) {
  const items = compact
    ? [
        {
          label: "선택 범위",
          value: reference.label,
          detail: reference.rule,
        },
        {
          label: "톤 힌트",
          value: reference.toneKeywords,
          detail: "첫 문장을 고정하기 전에 톤이 먼저 보여야 합니다.",
        },
        {
          label: "주 채널",
          value: reference.primaryChannels,
          detail: "리뷰와 발행 handoff 동안 이 표면들은 계속 보여야 합니다.",
        },
        {
          label: "발행 리듬",
          value: reference.publishRhythm,
          detail: "시스템이 반복되기 시작하면 카피만큼 케이던스도 중요합니다.",
        },
      ]
    : [
        {
          label: "선택 범위",
          value: reference.label,
          detail: reference.rule,
        },
        {
          label: "톤 힌트",
          value: reference.toneKeywords,
          detail: "첫 문장을 고정하기 전에 톤이 먼저 보여야 합니다.",
        },
        {
          label: "핵심 메시지",
          value: reference.keyMessage,
          detail: "큐, 스튜디오, 발행 레인이 모두 강화해야 할 기준 문장입니다.",
        },
        {
          label: "주 채널",
          value: reference.primaryChannels,
          detail: "포맷과 리뷰 판단은 먼저 이 표면들을 기준으로 잡아야 합니다.",
        },
        {
          label: "포맷 포커스",
          value: reference.formatFocus,
          detail: "초안이 너무 많은 형태로 퍼지기 전에 브랜드 포맷 규칙을 먼저 적용합니다.",
        },
        {
          label: "발행 리듬",
          value: reference.publishRhythm,
          detail: "시스템이 반복되기 시작하면 카피만큼 케이던스도 중요합니다.",
        },
      ];

  return (
    <SectionCard
      kicker={reference.value === "all" ? "브랜드 시스템" : "선택 브랜드"}
      title={reference.title}
      description={reference.description}
    >
      <div className={`brand-reference-grid${compact ? " compact" : ""}`}>
        {items.map((item) => (
          <article className="brand-reference-item" key={`${reference.value}-${item.label}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
      <div className="brand-reference-meta">
        <p>
          <strong>디렉토리</strong> · {reference.directory} · <strong>포맷</strong> ·{" "}
          {reference.format}
        </p>
        <p>
          <strong>CTA</strong> · {reference.ctaPattern}
        </p>
        <p>
          <strong>피해야 할 표현</strong> · {reference.forbiddenLanguage}
        </p>
        <p>
          <strong>스튜디오 기본값</strong> · {reference.recommendedTemplateLabel} →{" "}
          {reference.recommendedChannel}
        </p>
      </div>
      <p className="context-footnote">{reference.status}</p>
    </SectionCard>
  );
}
