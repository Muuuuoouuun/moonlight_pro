import Link from "next/link";
import { StatusRibbon } from "@com-moon/ui";
import { ContentBrandReference } from "@/components/dashboard/content-brand-reference";
import { SectionCard } from "@/components/dashboard/section-card";
import {
  getContentBrandLabel,
  getContentBrandReference,
  resolveContentBrand,
} from "@/lib/dashboard-contexts";
import { getContentPublishPageData } from "@/lib/server-data";

function statusToRibbonCell(item) {
  const status =
    item.status === "published"
      ? "ok"
      : item.status === "queued"
        ? "warn"
        : item.status === "failed"
          ? "risk"
          : "muted";
  return { status, label: `${item.title} · ${item.channel} · ${item.time}` };
}

export default async function ContentPublishPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const selectedBrand = resolveContentBrand(params?.brand);
  const { publishQueue, publishSummary } = await getContentPublishPageData(
    selectedBrand.value,
  );
  const brandReference = getContentBrandReference(selectedBrand.value);
  const ribbonCells = publishQueue.slice(0, 24).map(statusToRibbonCell);

  return (
    <>
      {/* ── Compact status strip (replaces summary-grid) ───────── */}
      <section className="publish-strip" aria-label="발행 상태 스트립">
        <div className="publish-strip__metrics">
          <div className="publish-strip__metric">
            <strong>{publishSummary.queuedCount}</strong>
            <span>대기</span>
          </div>
          <div className="publish-strip__metric" data-tone="ok">
            <strong>{publishSummary.publishedCount}</strong>
            <span>발행</span>
          </div>
          <div className="publish-strip__metric" data-tone="accent">
            <strong>{publishSummary.channelCount}</strong>
            <span>채널</span>
          </div>
          <div className="publish-strip__metric" data-tone="risk">
            <strong>{publishSummary.failedCount}</strong>
            <span>실패</span>
          </div>
        </div>
        {ribbonCells.length > 0 ? (
          <div className="publish-strip__ribbon">
            <StatusRibbon
              cells={ribbonCells}
              ariaLabel="최근 발행 이벤트의 성공·실패 타임라인"
              cellWidth={12}
              height={18}
            />
            <p className="publish-strip__note">최근 {ribbonCells.length}건 발행 상태</p>
          </div>
        ) : null}
      </section>

      <div className="stack">
        <ContentBrandReference reference={brandReference} compact />

        {/* ── Publish cards — visual card-news thumbnails ───────── */}
        <SectionCard
          kicker="이력"
          title="발행 타임라인"
          description={
            selectedBrand.value === "all"
              ? "발행은 무엇이 어디에 갔고, 후속 대응이 필요한지 말해야 합니다."
              : `${selectedBrand.label} 범위가 선택되었습니다.`
          }
        >
          <div className="publish-grid">
            {publishQueue.map((item) => (
              <article
                className="publish-card"
                key={`${item.title}-${item.time}`}
                data-status={item.status}
              >
                {/* Mini card-news frame */}
                <div className="publish-card__frame">
                  <span className="publish-card__channel">{item.channel}</span>
                  <h3 className="publish-card__title">{item.title}</h3>
                </div>

                <div className="publish-card__meta">
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
                      {item.status === "published"
                        ? "발행됨"
                        : item.status === "queued"
                          ? "대기 중"
                          : "실패"}
                    </span>
                    {selectedBrand.value === "all" && item.brand ? (
                      <span className="legend-chip" data-tone="muted">
                        {getContentBrandLabel(item.brand)}
                      </span>
                    ) : null}
                  </div>
                  <p>{item.detail}</p>
                  <span className="publish-card__time">{item.time}</span>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        {/* ── Quick actions ───────────────────────────────────────── */}
        <div className="publish-actions">
          <Link
            className="studio__handoff-btn studio__handoff-btn--primary"
            href="/dashboard/content/studio"
          >
            스튜디오에서 다음 카드 만들기
          </Link>
          <Link className="studio__handoff-btn" href="/dashboard/automations/email">
            이메일 레인 →
          </Link>
          <Link className="studio__handoff-btn" href="/dashboard/content/queue">
            큐로 돌아가기 →
          </Link>
        </div>
      </div>
    </>
  );
}
