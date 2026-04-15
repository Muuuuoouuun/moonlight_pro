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
      <section className="page-head">
        <p className="eyebrow">Content · Campaigns</p>
        <h1>콘텐츠와 handoff 를 한 객체로 묶는 레인</h1>
        <p>
          Campaign 은 카드뉴스 brief 하나가 아니라, 같은 메시지가 content, publish, email, AI order 로 이어질 때의
          운영 단위입니다. 브랜드를 고르고 brief 를 만든 뒤 바로 handoff 까지 연결합니다.
        </p>
      </section>

      <ContentCampaignWorkspace
        initialCampaigns={campaignCards}
        initialRuns={campaignRuns}
        selectedBrand={selectedBrand.value}
        initialSelectedId={selectedCampaignId || null}
      />
    </div>
  );
}
