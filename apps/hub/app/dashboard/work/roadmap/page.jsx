import { SectionCard } from "@/components/dashboard/section-card";
import { HubSyncBadge } from "@/components/dashboard/hub-sync-badge";
import {
  NewSinceDot,
  SinceLastVisitProvider,
} from "@/components/dashboard/since-last-visit";
import { bucketRoadmapByHorizon, ROADMAP_HORIZON_WINDOW } from "@/lib/dashboard-data";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getRoadmapPageData } from "@/lib/server-data";

const HORIZONS = [
  {
    key: "now",
    title: "NOW",
    window: `≤ ${ROADMAP_HORIZON_WINDOW.NOW_DAYS}일`,
  },
  {
    key: "next",
    title: "NEXT",
    window: `${ROADMAP_HORIZON_WINDOW.NOW_DAYS}–${ROADMAP_HORIZON_WINDOW.NEXT_DAYS}일`,
  },
  {
    key: "later",
    title: "LATER",
    window: `> ${ROADMAP_HORIZON_WINDOW.NEXT_DAYS}일`,
  },
];

function HorizonCard({ row }) {
  return (
    <li>
      <article className="hub-roadmap__card">
        <div className="hub-roadmap__card-head">
          <div>
            <h3 className="hub-roadmap__card-title">{row.title}</h3>
            <p className="hub-roadmap__card-meta">
              {row.lane} · {row.source}
            </p>
          </div>
          {row.slipLabel ? (
            <span
              className="hub-roadmap__slip-chip"
              data-tone={row.slipTone || "ok"}
              title={`Due: ${row.due}`}
            >
              {row.slipLabel}
            </span>
          ) : (
            <span className="hub-roadmap__slip-chip" title="No due date">
              no due
            </span>
          )}
        </div>
        <p className="hub-roadmap__card-detail">{row.detail}</p>
        <div className="hub-roadmap__progress" aria-label={`Progress ${row.progress}%`}>
          <div className="hub-roadmap__progress-track" aria-hidden="true">
            <span style={{ width: `${row.progress}%` }} />
          </div>
          <span className="hub-roadmap__progress-number">{row.progress}%</span>
          {row.dueAt ? <NewSinceDot at={row.dueAt} /> : null}
        </div>
      </article>
    </li>
  );
}

export default async function WorkRoadmapPage({ searchParams }) {
  const {
    roadmapRows,
    shippingRows,
    roadmapAlerts,
    githubConnection,
    githubTotals,
    githubLastSyncAt,
    hasGitHubData,
  } = await getRoadmapPageData();

  const selectedProject = resolveWorkContext(searchParams?.project);
  const scopedRoadmap = scopeMappedItemsByWorkContext(
    roadmapRows,
    selectedProject.value,
    (item) => [item.title, item.lane, item.source, item.detail],
  );
  const scopedShipping = scopeMappedItemsByWorkContext(
    shippingRows,
    selectedProject.value,
    (item) => [item.title, item.detail, item.repository],
  );
  const scopedAlerts = scopeMappedItemsByWorkContext(
    roadmapAlerts,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );

  const horizon = bucketRoadmapByHorizon(scopedRoadmap.items);
  const horizonCounts = {
    now: horizon.now.length,
    next: horizon.next.length,
    later: horizon.later.length,
  };
  const slipCount = horizon.now.filter((row) => row.slipTone === "slip").length;

  const syncTone =
    githubConnection?.tone === "danger"
      ? "danger"
      : githubConnection?.tone === "warning"
        ? "warning"
        : "green";

  const scopeNote =
    selectedProject.value === "all"
      ? "Hub 마일스톤과 GitHub 마일스톤이 한 지평선 보드에 섞여 있습니다."
      : `${selectedProject.label} 로드맵 컨텍스트가 활성화됐습니다.`;

  return (
    <SinceLastVisitProvider scope="roadmap">
      <div className="app-page">
        <section className="page-head">
          <p className="eyebrow">Work OS</p>
          <h1>Roadmap · 지평선 보드</h1>
          <p>
            Now / Next / Later 한 눈에. 슬립 위험과 다음 전환 후보가 판단 구역 안에 머무르도록,
            마일스톤을 시간 압력으로 정렬합니다.
          </p>
          <div className="page-head-meta">
            <HubSyncBadge syncAt={githubLastSyncAt} tone={syncTone} label="GitHub sync" />
            <p className="page-context">
              <strong>{selectedProject.label}</strong>
              <span>{scopeNote}</span>
            </p>
          </div>
        </section>

        <section aria-label="Roadmap heat strip">
          <ul className="hub-kpi-strip">
            <li
              className="hub-kpi-strip__cell hub-rim"
              data-rim={horizonCounts.now ? "alert" : "default"}
            >
              <span className="hub-kpi-strip__label">Now</span>
              <span className="hub-kpi-strip__value">
                {String(horizonCounts.now).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                ≤ {ROADMAP_HORIZON_WINDOW.NOW_DAYS}일 안
              </span>
            </li>
            <li className="hub-kpi-strip__cell hub-rim" data-rim="default">
              <span className="hub-kpi-strip__label">Next</span>
              <span className="hub-kpi-strip__value">
                {String(horizonCounts.next).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                다음 판단 구역
              </span>
            </li>
            <li
              className="hub-kpi-strip__cell hub-rim"
              data-rim={slipCount ? "danger" : "default"}
            >
              <span className="hub-kpi-strip__label">슬립</span>
              <span className="hub-kpi-strip__value">
                {String(slipCount).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                이미 마감 초과
              </span>
            </li>
            <li className="hub-kpi-strip__cell hub-rim" data-rim="default">
              <span className="hub-kpi-strip__label">이번 주 머지</span>
              <span className="hub-kpi-strip__value">
                {String(githubTotals.mergedPullCount || 0).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                {hasGitHubData ? "배송 모멘텀 활성" : "GitHub 미연결"}
              </span>
            </li>
          </ul>
        </section>

        <section aria-label="Horizon board">
          <div className="hub-roadmap__horizon">
            {HORIZONS.map((h) => {
              const rows = horizon[h.key];
              return (
                <div
                  key={h.key}
                  className="hub-roadmap__column"
                  data-horizon={h.key}
                >
                  <div className="hub-roadmap__column-head">
                    <div>
                      <p className="hub-roadmap__column-title">{h.title}</p>
                      <span className="hub-roadmap__column-window">{h.window}</span>
                    </div>
                    <span className="hub-roadmap__column-count">
                      {String(rows.length).padStart(2, "0")}
                    </span>
                  </div>
                  {rows.length ? (
                    <ul className="hub-roadmap__card-list">
                      {rows.map((row) => (
                        <HorizonCard key={`${row.source}-${row.lane}-${row.title}`} row={row} />
                      ))}
                    </ul>
                  ) : (
                    <p className="hub-roadmap__empty">
                      {h.key === "now"
                        ? "이 구간에 마일스톤 없음 — 여유 상태"
                        : h.key === "next"
                          ? "다음 판단 구역이 비어 있습니다"
                          : "미정 또는 장기 보관"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="split-grid">
          <SectionCard
            kicker="Risks"
            title="무엇이 밀릴 수 있는가"
            description="로드맵은 드리프트 될 레인을 가리킬 때만 유용합니다."
          >
            <ul className="note-list">
              {(scopedAlerts.items.length
                ? scopedAlerts.items
                : [
                    {
                      title: "얼럿 없음",
                      detail: "지금 밀릴 수 있다는 신호가 포착되지 않았습니다.",
                      tone: "green",
                    },
                  ]
              ).map((item) => (
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
            kicker="Shipping feed"
            title="최근 릴리스 모션"
            description="머지된 PR·마일스톤 이동·프로젝트 업데이트가 로드맵 옆에 붙어 있어야 계획이 현실에서 멀어지지 않습니다."
          >
            <div className="timeline">
              {scopedShipping.items.slice(0, 6).map((item) => (
                <div className="timeline-item" key={`${item.title}-${item.time}`}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.tone}>
                      {item.repository || item.time}
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <span className="muted tiny">{item.time}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </SinceLastVisitProvider>
  );
}
