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
  { value: "all", label: "All" },
  { value: "idea", label: "Idea" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
];

const STAGE_TONE = {
  idea: "muted",
  draft: "warning",
  review: "blue",
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
    badge: index === 0 ? "Input" : index === 1 ? "Draft" : index === 2 ? "Review" : "Ship",
    tone: index === 0 ? "muted" : index === 1 ? "warning" : index === 2 ? "blue" : "green",
  }));
}

export default async function ContentQueuePage({ searchParams }) {
  const { contentAttention, contentPipeline, contentQueueRoster } = await getContentQueuePageData();
  const queueSummary = summarizePipeline(contentPipeline);
  const selectedBrand = resolveContentBrand(searchParams?.brand);
  const brandReference = getContentBrandReference(selectedBrand.value);
  const selectedStage = resolveStageFilter(searchParams?.stage);
  const filteredRoster =
    selectedStage.value === "all"
      ? contentQueueRoster
      : contentQueueRoster.filter((item) => item.stage === selectedStage.value);

  return (
    <>
      <section className="summary-grid" aria-label="Content queue summary">
        {queueSummary.map((item) => (
          <SummaryCard key={item.title} {...item} />
        ))}
      </section>

      <div className="stack">
        <ContentBrandReference reference={brandReference} compact />

        <SectionCard
          kicker="Queue"
          title="Every piece and its next move"
          description={
            selectedBrand.value === "all"
              ? "The queue should tell you what exists, where it is stuck, and what action gets it moving again."
              : `${selectedBrand.label} is selected. Queue rows stay shared until brand keys are added to the content model.`
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
                      <span>{item.meta}</span>
                      <p>{item.nextAction}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Roster"
          title="Who is moving what"
          description="The pipeline lanes show shape; this list shows accountability and the next concrete move."
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
            <p className="check-detail">No items in the {selectedStage.label.toLowerCase()} stage right now.</p>
          ) : (
            <div className="template-grid">
              {filteredRoster.map((item) => (
                <div className="template-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="check-detail">
                      <strong>Owner</strong> · {item.owner} · <strong>Due</strong> · {item.due}
                    </p>
                    <p className="check-detail">
                      <strong>Next</strong> · {item.nextAction}
                    </p>
                  </div>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={STAGE_TONE[item.stage] ?? "muted"}>
                      {item.stage}
                    </span>
                    <span className="endpoint-pill">
                      <span>brand</span>
                      <code>{item.brand}</code>
                    </span>
                    <Link
                      className="button button-ghost"
                      href={appendQueryParam(
                        "/dashboard/content/studio",
                        "brand",
                        item.brand === "all" ? "" : item.brand,
                      )}
                    >
                      Studio
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          kicker="Review"
          title="What should not drift"
          description="Review is where content quality survives or quietly falls apart."
        >
          <ul className="note-list">
            {contentAttention.map((item) => (
              <li className="note-row" key={`${item.title}-queue`}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.tone}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
