import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { HubSyncBadge } from "@/components/dashboard/hub-sync-badge";
import {
  NewSinceDot,
  SinceLastVisitProvider,
} from "@/components/dashboard/since-last-visit";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getWorkPmsPageData } from "@/lib/server-data";

const PMS_TABS = [
  { value: "ship", labelKey: "Ship Pulse" },
  { value: "cadence", labelKey: "Cadence" },
  { value: "queue", labelKey: "Queue" },
];

function resolveActiveTab(searchParams) {
  const raw = searchParams?.view;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return PMS_TABS.find((tab) => tab.value === candidate)?.value || "ship";
}

/**
 * Layer A helper — pick a single "blocker" and a single "next" card from
 * the raw repo bundles. These drive the 5-second focus split above the
 * fold. Falls back to null so the UI can show an empty state.
 */
function deriveFocusCards(bundles = [], alerts = [], repoCards = []) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  // Blocker: first draft PR, or the oldest open PR, or a danger-toned alert.
  let blocker = null;
  for (const bundle of bundles) {
    const repoLabel = (bundle.repository || "").split("/")[1] || bundle.repository;
    const draft = bundle.openPulls?.find((item) => item.draft);
    if (draft) {
      const updated = draft.updated_at ? new Date(draft.updated_at).getTime() : now;
      const staleDays = Math.max(0, Math.round((now - updated) / (24 * 60 * 60 * 1000)));
      blocker = {
        title: draft.title || `PR #${draft.number}`,
        repo: repoLabel,
        meta: `PR #${draft.number} · draft · ${staleDays}일 대기`,
        url: draft.html_url,
      };
      break;
    }
  }
  if (!blocker) {
    const dangerAlert = alerts.find((item) => item.tone === "danger");
    if (dangerAlert) {
      blocker = { title: dangerAlert.title, repo: "GitHub", meta: dangerAlert.detail, url: null };
    }
  }

  // Next transition: the soonest GitHub milestone with open issues.
  let nextMove = null;
  for (const bundle of bundles) {
    const repoLabel = (bundle.repository || "").split("/")[1] || bundle.repository;
    const milestone = (bundle.milestones || []).find((item) => item.open_issues > 0);
    if (milestone) {
      const total = milestone.open_issues + milestone.closed_issues;
      const progress = total ? Math.round((milestone.closed_issues / total) * 100) : 0;
      const dueMs = milestone.due_on ? new Date(milestone.due_on).getTime() : null;
      const days = dueMs ? Math.round((dueMs - now) / (24 * 60 * 60 * 1000)) : null;
      nextMove = {
        title: milestone.title || "Untitled milestone",
        repo: repoLabel,
        meta:
          days == null
            ? `${milestone.closed_issues}/${total} 이슈 완료`
            : days < 0
              ? `${Math.abs(days)}일 초과 · ${milestone.closed_issues}/${total}`
              : `D-${days} · ${milestone.closed_issues}/${total}`,
        progress,
        url: milestone.html_url,
      };
      break;
    }
  }
  if (!nextMove && repoCards.length) {
    const top = repoCards[0];
    nextMove = {
      title: top.nextAction || top.milestone || "Next step",
      repo: top.title,
      meta: top.taskSummary || top.risk || "",
      progress: top.progress || 0,
      url: null,
    };
  }

  // Weekly motion: count merged PRs in the last 7 days across all bundles.
  let mergedThisWeek = 0;
  bundles.forEach((bundle) => {
    (bundle.mergedPulls || []).forEach((pull) => {
      const mergedMs = pull.merged_at ? new Date(pull.merged_at).getTime() : 0;
      if (mergedMs && now - mergedMs <= weekMs) {
        mergedThisWeek += 1;
      }
    });
  });

  return { blocker, nextMove, mergedThisWeek };
}

export default async function WorkPmsPage({ searchParams }) {
  const {
    pmsBoard,
    weeklyReview,
    taskQueue,
    githubConnection,
    githubBundles,
    githubRepoCards,
    githubActivityRows,
    githubAlerts,
    githubSyncRows,
    githubTotals,
    githubLastSyncAt,
    hasGitHubData,
  } = await getWorkPmsPageData();

  const selectedProject = resolveWorkContext(searchParams?.project);
  const activeTab = resolveActiveTab(searchParams);

  const scopedRepoCards = scopeMappedItemsByWorkContext(
    githubRepoCards,
    selectedProject.value,
    (item) => [item.title, item.owner, item.milestone, item.nextAction, item.risk, item.taskLead],
  );
  const scopedActivity = scopeMappedItemsByWorkContext(
    githubActivityRows,
    selectedProject.value,
    (item) => [item.title, item.detail, item.repository],
  );
  const scopedAlerts = scopeMappedItemsByWorkContext(
    githubAlerts,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );
  const scopedChecks = scopeMappedItemsByWorkContext(
    pmsBoard,
    selectedProject.value,
    (item) => [item.title, item.detail, item.rhythm],
  );
  const scopedTasks = scopeMappedItemsByWorkContext(
    taskQueue,
    selectedProject.value,
    (item) => [item.title, item.detail, item.project],
  );
  const scopedReview = scopeMappedItemsByWorkContext(
    weeklyReview,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );

  const focus = deriveFocusCards(githubBundles, scopedAlerts.items, scopedRepoCards.items);

  const danagerAlertCount = scopedAlerts.items.filter((item) => item.tone === "danger").length;
  const slipCandidate = focus.blocker ? 1 : 0;
  const syncTone =
    githubConnection?.tone === "danger"
      ? "danger"
      : githubConnection?.tone === "warning"
        ? "warning"
        : "green";

  const scopeNote =
    selectedProject.value === "all"
      ? "모든 프로젝트 컨텍스트가 한 배송 상황판에 노출됩니다."
      : scopedRepoCards.isFallback && scopedActivity.isFallback
        ? `${selectedProject.label} 선택됨 · GitHub 리포-프로젝트 매핑이 아직 공용 레인으로 폴백됩니다.`
        : `${selectedProject.label} 배송 컨텍스트가 활성화됐습니다.`;

  const withParam = (nextView) => {
    const params = new URLSearchParams();
    if (selectedProject.value && selectedProject.value !== "all") {
      params.set("project", selectedProject.value);
    }
    params.set("view", nextView);
    return `/dashboard/work/pms?${params.toString()}`;
  };

  return (
    <SinceLastVisitProvider scope="pms">
      <div className="app-page">
        {/* ── Page head ─────────────────────────────────────────── */}
        <section className="page-head">
          <p className="eyebrow">Work OS</p>
          <h1>PMS 상황판</h1>
          <p>
            GitHub 작업 이력·PR 압력·이슈 흐름·케이던스 체크를 한 운영 표면으로 압축합니다.
            더 많은 상태가 아니라 더 작고 선명한 제어 루프가 목표입니다.
          </p>
          <div className="page-head-meta">
            <HubSyncBadge syncAt={githubLastSyncAt} tone={syncTone} label="Last sync" />
            <p className="page-context">
              <strong>{selectedProject.label}</strong>
              <span>{scopeNote}</span>
            </p>
          </div>
        </section>

        {/* ── Layer A · 5-second answer ───────────────────────── */}
        <section aria-label="Delivery heat strip">
          <ul className="hub-kpi-strip">
            <li className="hub-kpi-strip__cell hub-rim" data-rim={hasGitHubData ? "default" : "muted"}>
              <span className="hub-kpi-strip__label">열린 PR</span>
              <span className="hub-kpi-strip__value">
                {String(githubTotals.openPullCount).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                리뷰·머지 판단을 기다림
              </span>
            </li>
            <li
              className="hub-kpi-strip__cell hub-rim"
              data-rim={danagerAlertCount ? "danger" : "default"}
            >
              <span className="hub-kpi-strip__label">블록 신호</span>
              <span className="hub-kpi-strip__value">
                {String(danagerAlertCount).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                danger 티어 얼럿
              </span>
            </li>
            <li className="hub-kpi-strip__cell hub-rim" data-rim="default">
              <span className="hub-kpi-strip__label">이번 주 머지</span>
              <span className="hub-kpi-strip__value">
                {String(focus.mergedThisWeek).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                최근 7일 기준 · 배송 모멘텀
              </span>
            </li>
            <li
              className="hub-kpi-strip__cell hub-rim"
              data-rim={slipCandidate ? "alert" : "default"}
            >
              <span className="hub-kpi-strip__label">슬립 후보</span>
              <span className="hub-kpi-strip__value">
                {String(slipCandidate).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                지금 밀릴 수 있는 항목
              </span>
            </li>
          </ul>

          <div className="hub-pms__focus-grid">
            <article
              className="hub-pms__focus-card hub-rim"
              data-variant="blocker"
              data-rim="danger"
              data-empty={focus.blocker ? undefined : "true"}
            >
              <p className="hub-pms__focus-kicker">
                🟥 지금 막힌 것
                {focus.blocker?.url ? <NewSinceDot at={Date.now()} label="NOW" /> : null}
              </p>
              {focus.blocker ? (
                <>
                  <h2 className="hub-pms__focus-title">{focus.blocker.title}</h2>
                  <p className="hub-pms__focus-meta">{focus.blocker.meta}</p>
                  <div className="hub-pms__focus-foot">
                    <span>{focus.blocker.repo}</span>
                    {focus.blocker.url ? (
                      <Link href={focus.blocker.url} target="_blank" rel="noreferrer noopener">
                        GitHub 열기 →
                      </Link>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="hub-pms__focus-title">블록 신호 없음</h2>
                  <p className="hub-pms__focus-meta">
                    지금 즉시 개입이 필요한 드래프트 PR 이나 danger 알럿이 없습니다.
                  </p>
                  <div className="hub-pms__focus-foot">
                    <span>모든 레인 정상</span>
                  </div>
                </>
              )}
            </article>

            <article
              className="hub-pms__focus-card hub-rim"
              data-variant="next"
              data-rim="alert"
              data-empty={focus.nextMove ? undefined : "true"}
            >
              <p className="hub-pms__focus-kicker">⬚ 다음 전환</p>
              {focus.nextMove ? (
                <>
                  <h2 className="hub-pms__focus-title">{focus.nextMove.title}</h2>
                  <p className="hub-pms__focus-meta">{focus.nextMove.meta}</p>
                  <div className="hub-pms__focus-foot">
                    <div className="hub-pms__progress" aria-hidden="true">
                      <span style={{ width: `${focus.nextMove.progress ?? 0}%` }} />
                    </div>
                    <span>{focus.nextMove.progress ?? 0}%</span>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="hub-pms__focus-title">다음 전환 후보 없음</h2>
                  <p className="hub-pms__focus-meta">
                    열린 마일스톤이 비어 있습니다. 로드맵 레인을 먼저 확인하세요.
                  </p>
                  <div className="hub-pms__focus-foot">
                    <span>&nbsp;</span>
                    <Link href="/dashboard/work/roadmap">로드맵 열기 →</Link>
                  </div>
                </>
              )}
            </article>
          </div>
        </section>

        {/* ── Layer B · 디테일 탭 ─────────────────────────────── */}
        <section aria-label="PMS detail tabs">
          <div className="hub-pms__tabs" role="tablist">
            {PMS_TABS.map((tab) => (
              <Link
                key={tab.value}
                className="hub-pms__tab"
                data-active={activeTab === tab.value ? "true" : undefined}
                role="tab"
                aria-selected={activeTab === tab.value}
                href={withParam(tab.value)}
                scroll={false}
              >
                {tab.labelKey}
              </Link>
            ))}
          </div>

          <div className="hub-pms__tab-panel" role="tabpanel">
            {activeTab === "ship" ? (
              <SectionCard
                kicker="Ship Pulse"
                title="Repository shipping motion"
                description="어떤 리포가 움직이고, 무엇이 막혀 있고, 다음 조치가 무엇인지 한 번에."
              >
                <div className="project-grid">
                  {scopedRepoCards.items.slice(0, 4).map((project) => (
                    <article className="project-card" key={project.title}>
                      <div className="project-head">
                        <div>
                          <h3>{project.title}</h3>
                          <p>{project.owner}</p>
                        </div>
                        <span className="legend-chip" data-tone={project.statusTone}>
                          {project.statusLabel}
                        </span>
                      </div>

                      <div className="progress-row">
                        <div className="progress-track" aria-hidden="true">
                          <span style={{ width: `${project.progress}%` }} />
                        </div>
                        <strong>{project.progress}%</strong>
                      </div>

                      <dl className="detail-stack">
                        <div>
                          <dt>Milestone</dt>
                          <dd>{project.milestone}</dd>
                        </div>
                        <div>
                          <dt>Next Action</dt>
                          <dd>{project.nextAction}</dd>
                        </div>
                        <div>
                          <dt>Risk</dt>
                          <dd>{project.risk}</dd>
                        </div>
                        <div>
                          <dt>Latest Signal</dt>
                          <dd>{project.taskLead}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>

                <div className="timeline" style={{ marginTop: 18 }}>
                  {(scopedActivity.items.length
                    ? scopedActivity.items.slice(0, 5)
                    : [
                        {
                          title: "No GitHub activity yet",
                          detail: "토큰/리포 연결이 들어오면 이곳에 커밋·PR·이슈 변경이 흐르기 시작합니다.",
                          time: "Pending",
                          tone: "muted",
                          repository: "GitHub",
                        },
                      ]
                  ).map((item) => (
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
            ) : null}

            {activeTab === "cadence" ? (
              <SectionCard
                kicker="Cadence"
                title="케이던스 체크와 후속 이행"
                description="GitHub 는 리뷰 리추얼을 더 날카롭게 만들 뿐, 대체하지 않습니다."
              >
                <div className="check-grid">
                  {scopedChecks.items.slice(0, 6).map((item) => (
                    <article className="check-card" key={item.title}>
                      <div className="project-head">
                        <div>
                          <h3>{item.title}</h3>
                          <p>{item.rhythm}</p>
                        </div>
                        <span className="legend-chip" data-tone={item.statusTone}>
                          {item.statusLabel}
                        </span>
                      </div>
                      <p className="check-detail">{item.detail}</p>
                    </article>
                  ))}
                </div>
                <ul className="note-list" style={{ marginTop: 18 }}>
                  {scopedReview.items.slice(0, 3).map((item) => (
                    <li className="note-row" key={item.title}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            {activeTab === "queue" ? (
              <SectionCard
                kicker="Queue"
                title="실행 대기 상위"
                description="운영자가 다음으로 집중해야 할 상위 5개 태스크만 여기 노출됩니다."
              >
                <ul className="task-list">
                  {(scopedTasks.items.length
                    ? scopedTasks.items.slice(0, 5)
                    : [
                        {
                          title: "큐가 비어 있습니다",
                          detail: "블록된 태스크가 없거나 Supabase 연결 이전입니다.",
                          project: "Hub",
                          statusTone: "muted",
                          statusLabel: "empty",
                        },
                      ]
                  ).map((item) => (
                    <li className="task-item" key={`${item.title}-${item.project}`}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </div>
                      <div className="inline-legend">
                        <span className="legend-chip" data-tone="muted">
                          {item.project}
                        </span>
                        <span className="legend-chip" data-tone={item.statusTone}>
                          {item.statusLabel}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}
          </div>
        </section>

        {/* ── Layer C · 주변 컨텍스트 ─────────────────────────── */}
        <SectionCard
          kicker="Sync ledger"
          title={githubConnection.title}
          description={githubConnection.detail}
        >
          <div className="timeline">
            {(githubSyncRows.length
              ? githubSyncRows.slice(0, 3)
              : [
                  {
                    title: "아직 sync 레저가 기록되지 않았습니다",
                    detail: "실시간 GitHub 읽기는 동작 중이지만 동기화 자동화가 아직 없을 수 있습니다.",
                    time: "Pending",
                    tone: "warning",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone || "muted"}>
                    {item.time}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </SinceLastVisitProvider>
  );
}
