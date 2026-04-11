import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getContentBrandReference, resolveContentBrand } from "@/lib/dashboard-contexts";
import { getContentPageData } from "@/lib/server-data";

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
  const { contentAttention, contentPipeline } = await getContentPageData();
  const queueSummary = summarizePipeline(contentPipeline);
  const selectedBrand = resolveContentBrand(searchParams?.brand);
  const brandReference = getContentBrandReference(selectedBrand.value);

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
