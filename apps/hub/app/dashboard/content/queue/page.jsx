import Link from "next/link";
import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  appendQueryParam,
  getContentBrandReference,
  resolveContentBrand,
} from "@/lib/dashboard-contexts";
import { getContentQueuePageData } from "@/lib/server-data";

const STAGE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "idea", label: "아이디어" },
  { value: "draft", label: "초안" },
  { value: "review", label: "리뷰" },
];

const STAGE_TONE = {
  idea: "muted",
  draft: "warning",
  review: "blue",
};

const STAGE_LABEL = {
  idea: "아이디어",
  draft: "초안",
  review: "리뷰",
};

const TONE_LABEL = {
  warning: "주의",
  danger: "위험",
  blue: "정보",
  green: "정상",
  muted: "중립",
};

function resolveStageFilter(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return STAGE_OPTIONS.find((option) => option.value === normalized) ?? STAGE_OPTIONS[0];
}

function summarizePipeline(contentPipeline) {
  return contentPipeline.map((stage, index) => ({
    title: stage.title,
    value: String(stage.items.length),
    detail: stage.note,
    badge: index === 0 ? "투입" : index === 1 ? "초안" : index === 2 ? "리뷰" : "발행",
    tone: index === 0 ? "muted" : index === 1 ? "warning" : index === 2 ? "blue" : "green",
  }));
}

function getBrandLabel(value) {
  const resolved = resolveContentBrand(value);
  return resolved.value === "all" && value && value !== "all" ? value : resolved.label;
}

function getStageLabel(value) {
  return STAGE_LABEL[value] || value;
}

function getToneLabel(value) {
  return TONE_LABEL[value] || value;
}

export default async function ContentQueuePage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const selectedBrand = resolveContentBrand(params?.brand);
  const { contentAttention, contentPipeline, contentQueueRoster } = await getContentQueuePageData(
    selectedBrand.value,
  );
  const queueSummary = summarizePipeline(contentPipeline);
  const brandReference = getContentBrandReference(selectedBrand.value);
  const selectedStage = resolveStageFilter(params?.stage);
  const brandScopedRoster =
    selectedBrand.value === "all"
      ? contentQueueRoster
      : contentQueueRoster.filter((item) => item.brand === selectedBrand.value);
  const filteredRoster =
    selectedStage.value === "all"
      ? brandScopedRoster
      : brandScopedRoster.filter((item) => item.stage === selectedStage.value);

  return (
    <>
      <section className="summary-grid" aria-label="콘텐츠 큐 요약">
        {queueSummary.map((item) => (
          <SummaryCard key={item.title} {...item} />
        ))}
      </section>

      <div className="stack">
        <ContentBrandReference reference={brandReference} compact />

        <SectionCard
          kicker="큐"
          title="모든 콘텐츠와 다음 움직임"
          description={
            selectedBrand.value === "all"
              ? "큐는 지금 무엇이 있고, 어디에서 막혔고, 어떤 액션이 다시 움직이게 하는지 말해줘야 합니다."
              : `${selectedBrand.label} 범위가 선택되었습니다. 브랜드 태그 행부터 먼저 좁혀지고, 공용 행은 메타데이터가 채워질 때까지 함께 보입니다.`
          }
        >
          <div className="lane-grid">
            {contentPipeline.map((stage) => (
              <article className="lane-column" key={stage.title}>
                <div className="lane-head">
                  <div>
                    <strong>{stage.title}</strong>
                    <p>{stage.note}</p>
                  </div>
                  <span className="lane-count">{stage.items.length}</span>
                </div>

                <div className="lane-list">
                  {stage.items.map((item) => (
                    <div className="lane-item" key={`${stage.title}-${item.title}`}>
                      <strong>{item.title}</strong>
                      {selectedBrand.value === "all" && item.brand ? (
                        <div className="inline-legend">
                          <span className="legend-chip" data-tone="muted">
                            {item.meta}
                          </span>
                          <span className="legend-chip" data-tone="blue">
                            {getBrandLabel(item.brand)}
                          </span>
                        </div>
                      ) : (
                        <span>{item.meta}</span>
                      )}
                      <p>{item.nextAction}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="로스터"
          title="누가 무엇을 움직이는가"
          description="파이프라인 레인이 형태를 보여준다면, 이 목록은 책임과 다음 구체적 액션을 보여줍니다."
          action={
            <div className="inline-legend">
              {STAGE_OPTIONS.map((option) => {
                const href = appendQueryParam(
                  appendQueryParam(
                    "/dashboard/content/queue",
                    "brand",
                    selectedBrand.value === "all" ? "" : selectedBrand.value,
                  ),
                  "stage",
                  option.value === "all" ? "" : option.value,
                );
                return (
                  <Link
                    key={option.value}
                    className="legend-chip"
                    data-tone={selectedStage.value === option.value ? "blue" : "muted"}
                    href={href}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          }
        >
          {filteredRoster.length === 0 ? (
            <p className="check-detail">현재 {selectedStage.label} 단계에 있는 항목이 없습니다.</p>
          ) : (
            <div className="template-grid">
              {filteredRoster.map((item) => (
                <div className="template-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="check-detail">
                      <strong>담당</strong> · {item.owner} · <strong>기한</strong> · {item.due}
                    </p>
                    <p className="check-detail">
                      <strong>다음</strong> · {item.nextAction}
                    </p>
                  </div>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={STAGE_TONE[item.stage] ?? "muted"}>
                      {getStageLabel(item.stage)}
                    </span>
                    {selectedBrand.value === "all" ? (
                      <span className="legend-chip" data-tone="blue">
                        {getBrandLabel(item.brand)}
                      </span>
                    ) : null}
                    <Link
                      className="button button-ghost"
                      href={appendQueryParam(
                        "/dashboard/content/studio",
                        "brand",
                        item.brand === "all" ? "" : item.brand,
                      )}
                    >
                      스튜디오
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          kicker="리뷰"
          title="흘러가면 안 되는 것"
          description="리뷰는 콘텐츠 품질이 살아남거나 조용히 무너지는 갈림길입니다."
        >
          <ul className="note-list">
            {contentAttention.map((item) => (
              <li className="note-row" key={`${item.title}-queue`}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {getToneLabel(item.tone)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
