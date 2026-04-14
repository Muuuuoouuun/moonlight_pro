import Link from "next/link";
import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  appendQueryParam,
  getContentBrandReference,
  resolveContentBrand,
} from "@/lib/dashboard-contexts";
import { getContentPageData } from "@/lib/server-data";

export default async function ContentPage({ searchParams }) {
  const { contentAttention, contentPipeline, contentSummary, contentVariants, publishQueue } =
    await getContentPageData();
  const selectedBrand = resolveContentBrand(searchParams?.brand);
  const brandReference = getContentBrandReference(selectedBrand.value);
  const queueHref = appendQueryParam("/dashboard/content/queue", "brand", selectedBrand.value === "all" ? "" : selectedBrand.value);
  const studioHref = appendQueryParam("/dashboard/content/studio", "brand", selectedBrand.value === "all" ? "" : selectedBrand.value);

  return (
    <>
      <section className="summary-grid" aria-label="Content summary metrics">
        {contentSummary.map((metric) => (
          <SummaryCard key={metric.title} {...metric} />
        ))}
      </section>

      <div className="dashboard-grid">
        <div className="stack">
          <ContentBrandReference reference={brandReference} />

          <SectionCard
          kicker="Pipeline"
          title="Content flow"
          description={
            selectedBrand.value === "all"
              ? "Keep the production path small enough that work moves without rethinking the whole system."
              : `${selectedBrand.label} scope is selected. Shared rows stay visible until brand metadata is wired into the content tables.`
          }
          action={
            <>
              <Link className="button button-secondary" href={queueHref}>
                Open queue
              </Link>
              <Link className="button button-primary" href={studioHref}>
                Open studio
              </Link>
            </>
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
            kicker="Variants"
            title="Current output pack"
            description="Different formats should still read like they came from the same operating mind."
          >
            <div className="project-grid">
              {contentVariants.map((item) => (
                <article className="project-card" key={item.title}>
                  <div className="project-head">
                    <div>
                      <h3>{item.title}</h3>
                      <p>
                        {item.type} · {item.channel}
                      </p>
                    </div>
                    <span className="legend-chip" data-tone={item.status === "published" ? "green" : item.status === "ready" ? "blue" : "warning"}>
                      {item.status}
                    </span>
                  </div>
                  <p className="check-detail">{item.detail}</p>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="stack">
          <SectionCard
            kicker="Publish lane"
            title="Recent distribution history"
            description="Publishing should say what moved, when it moved, and where the result landed."
          >
            <div className="timeline">
              {publishQueue.map((item) => (
                <div className="timeline-item" key={`${item.title}-${item.time}`}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.status === "published" ? "green" : item.status === "queued" ? "warning" : "danger"}>
                      {item.channel}
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <span className="muted tiny">{item.time}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Attention"
            title="What needs operator judgment"
            description="This list should stay short enough that the next move stays obvious."
          >
            <ul className="note-list">
              {contentAttention.map((item) => (
                <li className="note-row" key={item.title}>
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

          <SectionCard
            kicker="Loop"
            title="Next move"
            description="The content lane should always point at the next concrete action."
          >
            <div className="template-grid">
              <div className="template-row">
                <div>
                  <strong>Draft the next card-news piece</strong>
                  <p>Move straight into the studio with a template and channel already selected.</p>
                </div>
                <Link className="button button-primary" href={studioHref}>
                  Studio
                </Link>
              </div>
              <div className="template-row">
                <div>
                  <strong>Inspect the machine</strong>
                  <p>Check whether recent runs or webhooks are slowing the publish loop down.</p>
                </div>
                <Link className="button button-secondary" href="/dashboard/automations">
                  Automations
                </Link>
              </div>
              <div className="template-row">
                <div>
                  <strong>Close the failure loop</strong>
                  <p>Review the logs when content work stalls or the handoff feels unclear.</p>
                </div>
                <Link className="button button-ghost" href="/dashboard/evolution/logs">
                  Logs
                </Link>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
