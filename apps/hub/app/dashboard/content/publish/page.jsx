import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  getContentBrandLabel,
  getContentBrandReference,
  resolveContentBrand,
} from "@/lib/dashboard-contexts";
import { getContentPublishPageData } from "@/lib/server-data";

export default async function ContentPublishPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const selectedBrand = resolveContentBrand(params?.brand);
  const { publishQueue, publishSummary } = await getContentPublishPageData(selectedBrand.value);
  const brandReference = getContentBrandReference(selectedBrand.value);

  return (
    <>
      <section className="summary-grid" aria-label="발행 요약">
        <SummaryCard
          title="대기 중"
          value={String(publishSummary.queuedCount)}
          detail="다음 배포 패스에 올라간 작업 수입니다."
          badge="큐"
          tone="warning"
        />
        <SummaryCard
          title="발행 완료"
          value={String(publishSummary.publishedCount)}
          detail="주 채널로 이미 출고된 항목 수입니다."
          badge="라이브"
        />
        <SummaryCard
          title="채널"
          value={String(publishSummary.channelCount)}
          detail="현재 콘텐츠 레인이 실제로 쓰고 있는 배포 표면 수입니다."
          badge="경로"
          tone="blue"
        />
        <SummaryCard
          title="실패"
          value={String(publishSummary.failedCount)}
          detail="콘텐츠가 식기 전에 재시도 경로가 필요한 발행 단계입니다."
          badge="관찰"
          tone="danger"
        />
      </section>

      <div className="stack">
        <ContentBrandReference reference={brandReference} compact />

        <div className="split-grid">
          <SectionCard
            kicker="이력"
            title="최근 발행 이벤트"
            description={
              selectedBrand.value === "all"
                ? "발행 레인은 작업이 어디로 갔는지, 무엇이 아직 후속 대응을 필요로 하는지 설명해줘야 합니다."
                : `${selectedBrand.label} 범위가 선택되었습니다. 브랜드 태그가 있는 발행 행부터 먼저 좁혀지고, 오래된 공용 행은 발행 로그 백필이 끝날 때까지 함께 보입니다.`
            }
          >
            <div className="timeline">
              {publishQueue.map((item) => (
                <div className="timeline-item" key={`${item.title}-${item.time}-publish`}>
                  <div className="inline-legend">
                    <span
                      className="legend-chip"
                      data-tone={
                        item.status === "published"
                          ? "green"
                          : item.status === "queued"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {item.channel}
                    </span>
                    {selectedBrand.value === "all" && item.brand ? (
                      <span className="legend-chip" data-tone="muted">
                        {getContentBrandLabel(item.brand)}
                      </span>
                    ) : null}
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <span className="muted tiny">{item.time}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="후속 조치"
            title="발행 레인이 확인해야 할 것"
            description="콘텐츠를 출고하는 것으로 루프가 끝나지 않습니다. 그다음 반응이 중요합니다."
          >
            <ul className="note-list">
              <li className="note-row">
                <div>
                  <strong>배포와 후속 조치를 맞춥니다</strong>
                  <p>주제가 반응하면 같은 날 리드와 운영자 큐도 함께 움직여야 합니다.</p>
                </div>
              </li>
              <li className="note-row">
                <div>
                  <strong>채널 맥락을 기록합니다</strong>
                  <p>어디에 출고됐는지 충분히 보여야 나중에 이긴 패턴을 재사용할 수 있습니다.</p>
                </div>
              </li>
              <li className="note-row">
                <div>
                  <strong>실패 루프를 빠르게 닫습니다</strong>
                  <p>발행 단계가 실패하면 콘텐츠가 식기 전에 재시도 경로를 분명하게 만들어야 합니다.</p>
                </div>
              </li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
