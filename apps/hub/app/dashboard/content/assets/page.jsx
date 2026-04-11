import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getContentBrandReference, resolveContentBrand } from "@/lib/dashboard-contexts";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

export default async function ContentAssetsPage({ searchParams }) {
  const [assets, variants, readyCount, draftCount, archivedCount] = await Promise.all([
    fetchRows("content_assets", { limit: 8, order: "created_at.desc" }),
    fetchRows("content_variants", { limit: 8, order: "created_at.desc" }),
    countRows("content_assets", [["asset_type", "neq.placeholder"]]),
    countRows("content_variants", [["status", "eq.draft"]]),
    countRows("content_variants", [["status", "eq.archived"]]),
  ]);
  const selectedBrand = resolveContentBrand(searchParams?.brand);
  const brandReference = getContentBrandReference(selectedBrand.value);

  const assetRows =
    assets?.map((asset) => ({
      title: asset.asset_type || "asset",
      meta: asset.storage_path || "Pending storage path",
      status: "ready",
      detail: `Captured ${formatTimestamp(asset.created_at)}`,
    })) || [];
  const variantCount = variants?.length ?? 0;
  const draftVariantCount = (variants || []).filter((item) => item.status === "draft").length;
  const archivedVariantCount = (variants || []).filter((item) => item.status === "archived").length;

  return (
    <>
      <section className="summary-grid" aria-label="Content asset summary">
        <SummaryCard
          title="Captured Assets"
          value={String(readyCount ?? assetRows.length)}
          detail="Outputs that are reusable or ready for the next publish pass."
          badge="Library"
        />
        <SummaryCard
          title="Draft Assets"
          value={String(draftCount ?? draftVariantCount)}
          detail="Variants still waiting for a clearer message or final visual pass."
          badge="Draft"
          tone="warning"
        />
        <SummaryCard
          title="Archived"
          value={String(archivedCount ?? archivedVariantCount)}
          detail="Past source material that can still be repurposed later."
          badge="Archive"
          tone="muted"
        />
        <SummaryCard
          title="Variant Links"
          value={String(variantCount)}
          detail="Current output formats connected to the content lane."
          badge="Pack"
          tone="blue"
        />
      </section>

      <div className="stack">
        <ContentBrandReference reference={brandReference} compact />

        <div className="split-grid">
          <SectionCard
            kicker="Library"
            title="Current asset shelf"
            description={
              selectedBrand.value === "all"
                ? "Assets should be easy to reuse without turning the workspace into a file graveyard."
                : `${selectedBrand.label} is selected. Asset rows remain shared until brand metadata is stored with each content asset.`
            }
          >
            <div className="timeline">
              {(assetRows.length
                ? assetRows
                : [
                    {
                      title: "Asset lane waiting for data",
                      meta: "content assets",
                      status: "ready",
                      detail: "Once assets are generated, this shelf will show output type and storage path.",
                    },
                  ]
              ).map((asset) => (
                <div className="timeline-item" key={`${asset.title}-${asset.meta}`}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={asset.status === "ready" ? "green" : "warning"}>
                      {asset.status}
                    </span>
                  </div>
                  <strong>{asset.title}</strong>
                  <p>{asset.meta}</p>
                  <span className="muted tiny">{asset.detail}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Rules"
            title="How the library stays useful"
            description="An asset system is only good when the next person can tell what is reusable and what is stale."
          >
            <ul className="note-list">
              <li className="note-row">
                <div>
                  <strong>Name by use, not by mood</strong>
                  <p>An asset should say what it is for, not just when it was made.</p>
                </div>
              </li>
              <li className="note-row">
                <div>
                  <strong>Keep source material close</strong>
                  <p>The draft, export, and reuse note should remain traceable from the same workspace.</p>
                </div>
              </li>
              <li className="note-row">
                <div>
                  <strong>Archive aggressively</strong>
                  <p>If something is outdated, mark it instead of letting it quietly confuse the next pass.</p>
                </div>
              </li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
