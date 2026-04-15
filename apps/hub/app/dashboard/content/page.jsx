import Link from "next/link";
import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  CONTENT_BRANDS,
  appendQueryParam,
  getContentBrandReference,
  getContentBrandLabel,
  resolveContentBrand,
} from "@/lib/dashboard-contexts";
import { getContentPageData } from "@/lib/server-data";

const CAMPAIGN_STATUS_LABEL = {
  active: "진행 중",
  scheduled: "예약",
  paused: "보류",
  completed: "완료",
  draft: "초안",
};

const RUN_STATUS_LABEL = {
  success: "성공",
  running: "실행 중",
  failure: "실패",
  queued: "대기",
};

const VARIANT_STATUS_LABEL = {
  published: "발행됨",
  ready: "준비됨",
  draft: "초안",
  queued: "대기",
  archived: "보관됨",
};

const TONE_LABEL = {
  warning: "주의",
  danger: "위험",
  blue: "정보",
  green: "정상",
  muted: "중립",
};

function getCampaignStatusLabel(status) {
  return CAMPAIGN_STATUS_LABEL[status] || status;
}

function getRunStatusLabel(status) {
  return RUN_STATUS_LABEL[status] || status;
}

function getVariantStatusLabel(status) {
  return VARIANT_STATUS_LABEL[status] || status;
}

function getToneLabel(tone) {
  return TONE_LABEL[tone] || tone;
}

export default async function ContentPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const selectedBrand = resolveContentBrand(params?.brand);
  const {
    contentAttention,
    contentCampaigns,
    contentPipeline,
    contentSummary,
    contentVariants,
    publishQueue,
  } = await getContentPageData(selectedBrand.value);
  const brandReference = getContentBrandReference(selectedBrand.value);
  const queueHref = appendQueryParam("/dashboard/content/queue", "brand", selectedBrand.value === "all" ? "" : selectedBrand.value);
  const studioHref = appendQueryParam("/dashboard/content/studio", "brand", selectedBrand.value === "all" ? "" : selectedBrand.value);
  const campaignHref = appendQueryParam("/dashboard/content/campaigns", "brand", selectedBrand.value === "all" ? "" : selectedBrand.value);

  return (
    <>
      <section className="summary-grid" aria-label="콘텐츠 요약 지표">
        {contentSummary.map((metric) => (
          <SummaryCard key={metric.title} {...metric} />
        ))}
      </section>

      <div className="dashboard-grid">
        <div className="stack">
          <ContentBrandReference reference={brandReference} />

          {selectedBrand.value === "all" ? (
            <SectionCard
              kicker="브랜드"
              title="브랜드 운영 레인"
              description="카피를 쓰기 전에 각 브랜드의 톤, 채널, 리듬이 이미 보여야 합니다."
            >
              <div className="project-grid">
                {CONTENT_BRANDS.filter((item) => item.value !== "all")
                  .slice(0, 4)
                  .map((item) => (
                    <article className="project-card" key={item.value}>
                      <div className="project-head">
                        <div>
                          <h3>{item.label}</h3>
                          <p>{item.toneKeywords}</p>
                        </div>
                        <span className="legend-chip" data-tone="blue">
                          {item.recommendedChannel}
                        </span>
                      </div>
                      <p className="check-detail">{item.keyMessage}</p>
                      <div className="detail-stack">
                        <div>
                          <dt>포맷</dt>
                          <dd>{item.formatFocus}</dd>
                        </div>
                        <div>
                          <dt>리듬</dt>
                          <dd>{item.publishRhythm}</dd>
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            kicker="캠페인"
            title="활성 캠페인 브리프"
            description="메시지, 배포, 후속 조치가 함께 움직이도록 캠페인은 콘텐츠 레인 가까이에 있어야 합니다."
            action={
              <>
                <Link className="button button-secondary" href={campaignHref}>
                  캠페인 열기
                </Link>
                <Link className="button button-primary" href="/dashboard/automations/email">
                  이메일 레인
                </Link>
              </>
            }
          >
            {contentCampaigns.length ? (
              <div className="template-grid">
                {contentCampaigns.map((campaign) => (
                  <div className="template-row" key={campaign.id}>
                    <div>
                      <strong>{campaign.title}</strong>
                      <p>{campaign.goal}</p>
                      <p className="check-detail">
                        <strong>기간</strong> · {campaign.window}
                      </p>
                      <p className="check-detail">
                        <strong>채널</strong> · {campaign.channel}
                      </p>
                      <p className="check-detail">
                        <strong>다음</strong> · {campaign.nextAction}
                      </p>
                      {campaign.runSummary ? (
                        <p className="check-detail">
                          <strong>실행</strong> · {campaign.runSummary}
                        </p>
                      ) : null}
                    </div>
                    <div className="inline-legend">
                      <span className="legend-chip" data-tone={campaign.status === "active" ? "green" : campaign.status === "scheduled" ? "blue" : "warning"}>
                        {getCampaignStatusLabel(campaign.status)}
                      </span>
                      {campaign.brand ? (
                        <span className="legend-chip" data-tone="blue">
                          {getContentBrandLabel(campaign.brand)}
                        </span>
                      ) : null}
                      {campaign.runStatus ? (
                        <span className="legend-chip" data-tone={campaign.runStatus === "success" ? "green" : campaign.runStatus === "running" ? "blue" : campaign.runStatus === "failure" ? "danger" : "warning"}>
                          {getRunStatusLabel(campaign.runStatus)}
                        </span>
                      ) : null}
                      <span className="legend-chip" data-tone="muted">
                        {campaign.handoff}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="check-detail">이 브랜드에 연결된 캠페인 브리프가 아직 없습니다.</p>
            )}
          </SectionCard>

          <SectionCard
            kicker="파이프라인"
            title="콘텐츠 흐름"
            description={
              selectedBrand.value === "all"
                ? "생산 경로를 작게 유지해야 시스템 전체를 다시 생각하지 않아도 일이 앞으로 움직입니다."
                : `${selectedBrand.label} 범위가 선택되었습니다. 브랜드 태그 행부터 먼저 좁혀지고, 공용 행은 메타데이터가 채워질 때까지 함께 보입니다.`
            }
            action={
              <>
                <Link className="button button-secondary" href={queueHref}>
                  큐 열기
                </Link>
                <Link className="button button-primary" href={studioHref}>
                  스튜디오 열기
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
                        {selectedBrand.value === "all" && item.brand ? (
                          <div className="inline-legend">
                            <span className="legend-chip" data-tone="muted">
                              {item.meta}
                            </span>
                            <span className="legend-chip" data-tone="blue">
                              {getContentBrandLabel(item.brand)}
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
            kicker="결과물"
            title="현재 출력 패키지"
            description="형식이 달라도 같은 운영 판단에서 나온 결과물처럼 읽혀야 합니다."
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
                      {getVariantStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="check-detail">{item.detail}</p>
                  {selectedBrand.value === "all" && item.brand ? (
                    <div className="inline-legend">
                      <span className="legend-chip" data-tone="blue">
                        {getContentBrandLabel(item.brand)}
                      </span>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="stack">
          <SectionCard
            kicker="발행 레인"
            title="최근 배포 이력"
            description="발행은 무엇이 움직였고, 언제 움직였고, 결과가 어디에 닿았는지를 말해줘야 합니다."
          >
            <div className="timeline">
              {publishQueue.map((item) => (
                <div className="timeline-item" key={`${item.title}-${item.time}`}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.status === "published" ? "green" : item.status === "queued" ? "warning" : "danger"}>
                      {item.channel}
                    </span>
                    {selectedBrand.value === "all" && item.brand ? (
                      <span className="legend-chip" data-tone="blue">
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
            kicker="판단"
            title="운영자 판단이 필요한 것"
            description="다음 움직임이 분명하게 남도록 이 목록은 충분히 짧아야 합니다."
          >
            <ul className="note-list">
              {contentAttention.map((item) => (
                <li className="note-row" key={item.title}>
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

          <SectionCard
            kicker="루프"
            title="다음 움직임"
            description="콘텐츠 레인은 항상 다음의 구체적인 액션을 가리켜야 합니다."
          >
            <div className="template-grid">
              <div className="template-row">
                <div>
                  <strong>다음 카드뉴스를 바로 초안으로 올립니다</strong>
                  <p>템플릿과 채널을 정한 상태로 곧바로 스튜디오로 넘어갑니다.</p>
                </div>
                <Link className="button button-primary" href={studioHref}>
                  스튜디오
                </Link>
              </div>
              <div className="template-row">
                <div>
                  <strong>머신 상태를 확인합니다</strong>
                  <p>최근 실행이나 웹훅이 발행 루프를 늦추고 있지는 않은지 점검합니다.</p>
                </div>
                <Link className="button button-secondary" href="/dashboard/automations">
                  자동화
                </Link>
              </div>
              <div className="template-row">
                <div>
                  <strong>실패 루프를 닫습니다</strong>
                  <p>콘텐츠 작업이 멈추거나 handoff가 흐려질 때 로그를 확인합니다.</p>
                </div>
                <Link className="button button-ghost" href="/dashboard/evolution/logs">
                  로그
                </Link>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
