import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  getContentBrandLabel,
  getContentBrandReference,
  resolveContentBrand,
} from "@/lib/dashboard-contexts";
import { formatTimestamp, getContentAssetsPageData } from "@/lib/server-data";

const ASSET_STATUS_LABEL = {
  ready: "준비됨",
  archived: "보관됨",
  draft: "초안",
};

function getAssetStatusLabel(status) {
  return ASSET_STATUS_LABEL[status] || status;
}

export default async function ContentAssetsPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const selectedBrand = resolveContentBrand(params?.brand);
  const { contentAssets, assetSummary } = await getContentAssetsPageData(selectedBrand.value);
  const brandReference = getContentBrandReference(selectedBrand.value);

  return (
    <>
      <section className="summary-grid" aria-label="콘텐츠 에셋 요약">
        <SummaryCard
          title="확보된 에셋"
          value={String(assetSummary.capturedCount)}
          detail="재사용 가능하거나 다음 발행 패스에 바로 쓸 수 있는 결과물입니다."
          badge="라이브러리"
        />
        <SummaryCard
          title="초안 에셋"
          value={String(assetSummary.draftCount)}
          detail="더 선명한 메시지나 마지막 비주얼 검수가 필요한 변형 결과물입니다."
          badge="초안"
          tone="warning"
        />
        <SummaryCard
          title="보관"
          value={String(assetSummary.archivedCount)}
          detail="나중에 다시 전용할 수 있는 과거 원본 자료입니다."
          badge="보관"
          tone="muted"
        />
        <SummaryCard
          title="변형 연결"
          value={String(assetSummary.variantCount)}
          detail="현재 콘텐츠 레인과 연결된 출력 포맷 수입니다."
          badge="패키지"
          tone="blue"
        />
      </section>

      <div className="stack">
        <ContentBrandReference reference={brandReference} compact />

        <div className="split-grid">
          <SectionCard
            kicker="라이브러리"
            title="현재 에셋 선반"
            description={
              selectedBrand.value === "all"
                ? "에셋은 작업 공간을 파일 무덤으로 만들지 않으면서도 쉽게 재사용할 수 있어야 합니다."
                : `${selectedBrand.label} 범위가 선택되었습니다. 브랜드 키가 있는 행부터 먼저 좁혀지고, 오래된 공용 행은 백필이 끝날 때까지 함께 보입니다.`
            }
          >
            <div className="timeline">
              {(contentAssets.length
                ? contentAssets
                : [
                    {
                      title: "에셋 레인이 데이터를 기다리는 중입니다",
                      source: "콘텐츠 에셋",
                      status: "ready",
                      kind: "공용 레인",
                      detail: "에셋이 생성되면 이 선반에 출력 유형, 브랜드 범위, 저장 경로가 표시됩니다.",
                    },
                  ]
              ).map((asset) => (
                <div className="timeline-item" key={`${asset.title}-${asset.source}`}>
                  <div className="inline-legend">
                    <span
                      className="legend-chip"
                      data-tone={
                        asset.status === "ready"
                          ? "green"
                          : asset.status === "archived"
                            ? "muted"
                            : "warning"
                      }
                    >
                      {getAssetStatusLabel(asset.status)}
                    </span>
                    {selectedBrand.value === "all" && asset.brand ? (
                      <span className="legend-chip" data-tone="muted">
                        {getContentBrandLabel(asset.brand)}
                      </span>
                    ) : null}
                  </div>
                  <strong>{asset.title}</strong>
                  <p>{`${asset.kind} · ${asset.source}`}</p>
                  <span className="muted tiny">
                    {asset.createdAt ? `확보 ${formatTimestamp(asset.createdAt)} · ` : ""}
                    {asset.detail}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="원칙"
            title="라이브러리를 계속 쓸모 있게 유지하는 법"
            description="다음 사람이 무엇을 재사용할 수 있고 무엇이 오래된 것인지 바로 구분할 수 있어야 에셋 시스템이 살아 있습니다."
          >
            <ul className="note-list">
              <li className="note-row">
                <div>
                  <strong>분위기가 아니라 용도로 이름 짓습니다</strong>
                  <p>에셋은 언제 만들었는지가 아니라 무엇에 쓰는지 말해줘야 합니다.</p>
                </div>
              </li>
              <li className="note-row">
                <div>
                  <strong>원본을 가까이 둡니다</strong>
                  <p>초안, 익스포트, 재사용 노트는 같은 작업 공간에서 추적 가능해야 합니다.</p>
                </div>
              </li>
              <li className="note-row">
                <div>
                  <strong>보관 처리를 망설이지 않습니다</strong>
                  <p>오래된 결과물은 조용히 혼란을 만들게 두지 말고 명시적으로 표시해야 합니다.</p>
                </div>
              </li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
