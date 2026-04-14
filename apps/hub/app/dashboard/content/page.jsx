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
      <section className="summary-grid" aria-label="콘텐츠 요약 지표">
        {contentSummary.map((metric) => (
          <SummaryCard key={metric.title} {...metric} />
        ))}
      </section>

      <div className="dashboard-grid">
        <div className="stack">
          <ContentBrandReference reference={brandReference} />

          <SectionCard
          kicker="파이프라인"
          title="콘텐츠 흐름"
          description={
            selectedBrand.value === "all"
              ? "생산 경로를 작게 유지해서 시스템 전체를 다시 해석하지 않아도 일이 앞으로 움직이게 합니다."
              : `${selectedBrand.label} 범위를 선택했습니다. 브랜드 메타데이터가 콘텐츠 테이블에 연결되기 전까지는 공용 행도 함께 보입니다.`
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
            kicker="변형본"
            title="현재 산출물 팩"
            description="포맷이 달라도 같은 운영 감각에서 나온 결과처럼 읽혀야 합니다."
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
            kicker="발행 레인"
            title="최근 배포 이력"
            description="발행은 무엇이, 언제, 어디로 나갔는지 바로 말해줘야 합니다."
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
            kicker="주의"
            title="운영 판단이 필요한 것"
            description="이 목록은 짧게 유지되어야 다음 움직임이 바로 보입니다."
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
            kicker="루프"
            title="다음 움직임"
            description="콘텐츠 레인은 언제나 다음 구체적 액션을 가리켜야 합니다."
          >
            <div className="template-grid">
              <div className="template-row">
                <div>
                  <strong>다음 카드뉴스 초안 시작</strong>
                  <p>템플릿과 채널이 이미 잡힌 상태로 바로 스튜디오에 들어갑니다.</p>
                </div>
                <Link className="button button-primary" href={studioHref}>
                  스튜디오
                </Link>
              </div>
              <div className="template-row">
                <div>
                  <strong>엔진 상태 점검</strong>
                  <p>최근 런이나 웹훅이 발행 루프를 느리게 만드는지 확인합니다.</p>
                </div>
                <Link className="button button-secondary" href="/dashboard/automations">
                  자동화
                </Link>
              </div>
              <div className="template-row">
                <div>
                  <strong>실패 루프 닫기</strong>
                  <p>콘텐츠 작업이 막히거나 핸드오프가 흐릴 때 로그를 검토합니다.</p>
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
