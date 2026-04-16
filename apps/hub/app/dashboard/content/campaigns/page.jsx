import { ContentCampaignWorkspace } from "@/components/dashboard/content-campaign-workspace";
import { resolveContentBrand } from "@/lib/dashboard-contexts";
import { getContentCampaignsPageData } from "@/lib/server-data";

export default async function ContentCampaignsPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const selectedBrand = resolveContentBrand(params?.brand);
  const { campaignCards, campaignRuns } = await getContentCampaignsPageData(selectedBrand.value);
  const selectedCampaignId = Array.isArray(params?.campaign) ? params.campaign[0] : params?.campaign;

  return (
    <div className="app-page">
      <ContentCampaignWorkspace
        initialCampaigns={campaignCards}
        initialRuns={campaignRuns}
        selectedBrand={selectedBrand.value}
        initialSelectedId={selectedCampaignId || null}
      />
    </div>
  );
}
