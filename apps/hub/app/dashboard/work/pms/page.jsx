import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { HubSyncBadge } from "@/components/dashboard/hub-sync-badge";
import { WorkContextBridge } from "@/components/dashboard/work-context-bridge";
import {
  NewSinceDot,
  SinceLastVisitProvider,
} from "@/components/dashboard/since-last-visit";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getLocalProjectRepositoryData, getProjectsPageData, getWorkPmsPageData } from "@/lib/server-data";
import {
  buildWorkContextHref,
  formatWorkMetric,
  getVisibleWorkContexts,
  scopeStrictWorkItems,
  sumWorkValues,
} from "@/lib/work-context-bridge";

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

function buildPmsSignalCards({ bundles = [], alerts = [], checks = [], tasks = [], mergedThisWeek = 0 }) {
  const openPullCount = sumWorkValues(bundles.map((item) => item.openPulls.length));
  const draftPullCount = sumWorkValues(
    bundles.map((item) => item.openPulls.filter((pull) => pull.draft).length),
  );
  const openIssueCount = sumWorkValues(bundles.map((item) => item.issues.length));
  const recentCommitCount = sumWorkValues(bundles.map((item) => item.commits.length));
  const blockedTaskCount = tasks.filter((item) => item.status === "blocked").length;
  const dangerAlertCount = alerts.filter((item) => item.tone === "danger").length;
  const warningAlertCount = alerts.filter((item) => item.tone === "warning").length;

  return [
    {
      key: "blockers",
      tone: "danger",
      kicker: "Red Point",
      title: "Immediate intervention",
      value: String(dangerAlertCount + blockedTaskCount).padStart(2, "0"),
      label: dangerAlertCount
        ? `${dangerAlertCount} danger alert${dangerAlertCount === 1 ? "" : "s"} visible`
        : blockedTaskCount
          ? `${blockedTaskCount} blocked task${blockedTaskCount === 1 ? "" : "s"} visible`
          : "No red lane right now",
      detail:
        alerts.find((item) => item.tone === "danger")?.detail ||
        tasks.find((item) => item.status === "blocked")?.detail ||
        "Nothing is flashing red in the current PMS surface.",
    },
    {
      key: "review",
      tone: "warning",
      kicker: "Amber Point",
      title: "Review pressure",
      value: String(openPullCount).padStart(2, "0"),
      label: draftPullCount
        ? `${draftPullCount} draft PR${draftPullCount === 1 ? "" : "s"} still need finish`
        : warningAlertCount
          ? `${warningAlertCount} watch signal${warningAlertCount === 1 ? "" : "s"} visible`
          : "Review queue is controlled",
      detail:
        draftPullCount > 0
          ? "Draft PRs are where momentum most often slows down. Finish or kill them fast."
          : "Open PR load is visible, but not currently spilling into a red zone.",
    },
    {
      key: "motion",
      tone: "blue",
      kicker: "Blue Point",
      title: "Shipping motion",
      value: String(recentCommitCount).padStart(2, "0"),
      label: `${mergedThisWeek} merge${mergedThisWeek === 1 ? "" : "s"} landed this week`,
      detail:
        recentCommitCount > 0
          ? "Commits and merges are still feeding the board, so this lane reads as active rather than decorative."
          : "No recent repository motion is visible. The board may look healthy while delivery is quiet.",
    },
    {
      key: "cadence",
      tone: "green",
      kicker: "Green Point",
      title: "Cadence memory",
      value: String(checks.length).padStart(2, "0"),
      label: checks.length
        ? `${checks.length} ritual check${checks.length === 1 ? "" : "s"} are keeping the loop visible`
        : "Cadence layer is still empty",
      detail:
        checks.length > 0
          ? `${openIssueCount} open issue${openIssueCount === 1 ? "" : "s"} are now framed by an explicit review rhythm instead of pure inbox pressure.`
          : "No cadence signal is recorded yet. Add one review or reset loop before the week blurs.",
    },
  ];
}

function buildPmsLaneRows(bundles = []) {
  return (bundles || [])
    .filter((bundle) => bundle.repository)
    .slice(0, 4)
    .map((bundle) => {
      const repo = (bundle.repository || "").split("/")[1] || bundle.repository || "Repository";
      const openPullCount = bundle.openPulls.length;
      const openIssueCount = bundle.issues.length;
      const draftPullCount = bundle.openPulls.filter((item) => item.draft).length;
      const milestone = bundle.milestones[0];
      const totalIssues = milestone ? milestone.open_issues + milestone.closed_issues : openIssueCount;
      const progress = milestone
        ? totalIssues
          ? Math.round((milestone.closed_issues / totalIssues) * 100)
          : 0
        : openPullCount
          ? 64
          : openIssueCount
            ? 38
            : 84;

      let tone = "green";
      let status = "quiet";

      if (openIssueCount > 8) {
        tone = "danger";
        status = "issue pressure";
      } else if (draftPullCount > 0) {
        tone = "warning";
        status = "draft handoff";
      } else if (openPullCount > 0) {
        tone = "blue";
        status = "shipping";
      }

      return {
        repo,
        tone,
        status,
        progress,
        meta: `${openPullCount} PR · ${openIssueCount} issue · ${bundle.commits.length} commit`,
        lead:
          bundle.openPulls[0]?.title ||
          milestone?.title ||
          bundle.issues[0]?.title ||
          "No immediate queue visible",
      };
    });
}

function projectSelector(item) {
  return [item.title, item.owner, item.milestone, item.nextAction, item.risk, item.taskLead];
}

function taskSelector(item) {
  return [item.title, item.detail, item.project];
}

function checkSelector(item) {
  return [item.title, item.detail, item.rhythm];
}

function repoSelector(item) {
  return [item.title, item.owner, item.milestone, item.nextAction, item.risk, item.taskLead];
}

function alertSelector(item) {
  return [item.title, item.detail];
}

function bundleSelector(bundle) {
  return [
    bundle.repository,
    bundle.repo?.name,
    bundle.repo?.full_name,
    bundle.repo?.description,
    ...bundle.milestones.map((item) => item.title),
    ...bundle.openPulls.map((item) => item.title),
    ...bundle.issues.map((item) => item.title),
    ...bundle.commits.slice(0, 6).map((item) => item.commit?.message),
  ];
}

function buildPmsBridgeRows({
  selectedContextValue,
  projectPortfolio,
  taskQueue,
  pmsBoard,
  githubRepoCards,
  githubAlerts,
  githubBundles,
  localRepositories,
}) {
  const localRepositoryByContext = new Map(
    (localRepositories || []).map((item) => [item.contextValue, item]),
  );

  return getVisibleWorkContexts(selectedContextValue).map((context) => {
    const projects = scopeStrictWorkItems(projectPortfolio, context.value, projectSelector);
    const tasks = scopeStrictWorkItems(taskQueue, context.value, taskSelector);
    const checks = scopeStrictWorkItems(pmsBoard, context.value, checkSelector);
    const repoCards = scopeStrictWorkItems(githubRepoCards, context.value, repoSelector);
    const alerts = scopeStrictWorkItems(githubAlerts, context.value, alertSelector);
    const bundles = scopeStrictWorkItems(githubBundles, context.value, bundleSelector);
    const localRepository = localRepositoryByContext.get(context.value);
    const openPullCount = sumWorkValues(bundles.map((item) => item.openPulls.length));
    const openIssueCount = sumWorkValues(bundles.map((item) => item.issues.length));
    const recentCommitCount = sumWorkValues(bundles.map((item) => item.commits.length));
    const blockerCount =
      tasks.filter((item) => item.status === "blocked").length +
      alerts.filter((item) => item.tone === "warning" || item.tone === "danger").length +
      projects.filter((item) => item.status === "blocked").length;

    let statusTone = localRepository?.statusTone || "muted";
    let statusLabel = localRepository?.statusLabel || "idle";

    if (blockerCount > 0 || localRepository?.statusTone === "danger") {
      statusTone = "danger";
      statusLabel = blockerCount > 0 ? "blocked" : localRepository?.statusLabel || "attention";
    } else if (openIssueCount > 8 || localRepository?.statusTone === "warning") {
      statusTone = "warning";
      statusLabel = openIssueCount > 8 ? "pressure" : localRepository?.statusLabel || "watch";
    } else if (openPullCount > 0 || recentCommitCount > 0) {
      statusTone = "blue";
      statusLabel = "shipping";
    } else if (checks.length > 0 || repoCards.length > 0) {
      statusTone = "green";
      statusLabel = "steady";
    }

    const headline =
      alerts[0]?.title ||
      (openPullCount > 0
        ? `${openPullCount} PR${openPullCount === 1 ? "" : "s"} and ${recentCommitCount} recent commits are active`
        : checks.length > 0
          ? `${checks.length} cadence check${checks.length === 1 ? "" : "s"} are backing this lane`
          : "PMS needs one live repo or review signal to stay honest");
    const detail = [
      repoCards[0]?.nextAction ||
        projects[0]?.nextAction ||
        "Keep the next repo move and the next operating decision attached to the same lane.",
      localRepository?.repository
        ? `${localRepository.repository} · ${localRepository.detail}`
        : "Local workspace mapping is still missing for this context.",
    ].join(" ");

    return {
      key: context.value,
      label: context.label,
      description: context.description,
      statusTone,
      statusLabel,
      headline,
      detail,
      metrics: [
        { label: "PRs", value: formatWorkMetric(openPullCount), tone: openPullCount ? "blue" : "muted" },
        { label: "Issues", value: formatWorkMetric(openIssueCount), tone: openIssueCount ? "warning" : "muted" },
        { label: "Commits", value: formatWorkMetric(recentCommitCount), tone: recentCommitCount ? "green" : "muted" },
        { label: "Cadence", value: formatWorkMetric(checks.length), tone: checks.length ? "blue" : "muted" },
      ],
      links: [
        { label: "Projects", href: buildWorkContextHref("/dashboard/work/projects", context.value) },
        { label: "Roadmap", href: buildWorkContextHref("/dashboard/work/roadmap", context.value) },
        { label: "Management", href: buildWorkContextHref("/dashboard/work/management", context.value) },
      ],
    };
  });
}

export default async function WorkPmsPage({ searchParams }) {
  const [{ projectPortfolio }, pmsData] = await Promise.all([
    getProjectsPageData(),
    getWorkPmsPageData(),
  ]);
  const localRepositoryData = getLocalProjectRepositoryData();
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
  } = pmsData;
  const params = (await searchParams) ?? {};
  const selectedProject = resolveWorkContext(params?.project);
  const activeTab = resolveActiveTab(params);

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
  const scopedBundles = scopeMappedItemsByWorkContext(
    githubBundles,
    selectedProject.value,
    bundleSelector,
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

  const focus = deriveFocusCards(scopedBundles.items, scopedAlerts.items, scopedRepoCards.items);
  const signalCards = buildPmsSignalCards({
    bundles: scopedBundles.items,
    alerts: scopedAlerts.items,
    checks: scopedChecks.items,
    tasks: scopedTasks.items,
    mergedThisWeek: focus.mergedThisWeek,
  });
  const laneRows = buildPmsLaneRows(scopedBundles.items);

  const dangerAlertCount = scopedAlerts.items.filter((item) => item.tone === "danger").length;
  const slipCandidate = focus.blocker ? 1 : 0;
  const bridgeRows = buildPmsBridgeRows({
    selectedContextValue: selectedProject.value,
    projectPortfolio,
    taskQueue,
    pmsBoard,
    githubRepoCards,
    githubAlerts,
    githubBundles,
    localRepositories: localRepositoryData.projects,
  });
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
              data-rim={dangerAlertCount ? "danger" : "default"}
            >
              <span className="hub-kpi-strip__label">블록 신호</span>
              <span className="hub-kpi-strip__value">
                {String(dangerAlertCount).padStart(2, "0")}
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

          <div className="hub-pms__signal-wall">
            <article className="hub-pms__signal-board hub-rim" data-rim={dangerAlertCount ? "danger" : "alert"}>
              <div className="hub-pms__signal-board-head">
                <div>
                  <p className="hub-pms__micro-kicker">Color map</p>
                  <h2>운영 포인트 배치</h2>
                  <p>빨강은 즉시 개입, 황색은 리뷰 병목, 파랑은 배송 전환, 녹색은 리듬 유지 구역입니다.</p>
                </div>
                <span className="legend-chip" data-tone={hasGitHubData ? "blue" : "muted"}>
                  PMS color logic
                </span>
              </div>
              <div className="hub-pms__signal-spectrum">
                {signalCards.map((item) => (
                  <article className="hub-pms__signal-card" data-tone={item.tone} key={item.key}>
                    <div className="hub-pms__signal-card-head">
                      <span className="hub-pms__signal-dot" data-tone={item.tone} />
                      <div>
                        <p>{item.kicker}</p>
                        <h3>{item.title}</h3>
                      </div>
                    </div>
                    <strong>{item.value}</strong>
                    <span className="hub-pms__signal-label">{item.label}</span>
                    <p>{item.detail}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="hub-pms__lane-radar hub-rim" data-rim={slipCandidate ? "alert" : "default"}>
              <div className="hub-pms__lane-radar-head">
                <div>
                  <p className="hub-pms__micro-kicker">Lane radar</p>
                  <h2>리포별 색 분포</h2>
                  <p>레포마다 어떤 색이 우세한지 한 줄씩 보여줘서, 어디에 손을 넣을지 먼저 정렬합니다.</p>
                </div>
              </div>
              {laneRows.length ? (
                <div className="hub-pms__lane-list">
                  {laneRows.map((row) => (
                    <article className="hub-pms__lane-row" data-tone={row.tone} key={row.repo}>
                      <div className="hub-pms__lane-row-head">
                        <div className="hub-pms__lane-row-title">
                          <span className="hub-pms__signal-dot" data-tone={row.tone} />
                          <strong>{row.repo}</strong>
                        </div>
                        <span className="legend-chip" data-tone={row.tone}>
                          {row.status}
                        </span>
                      </div>
                      <p className="hub-pms__lane-row-lead">{row.lead}</p>
                      <div className="hub-pms__lane-row-meta">
                        <span>{row.meta}</span>
                        <span>{row.progress}% confidence</span>
                      </div>
                      <div className="hub-pms__lane-track" aria-hidden="true">
                        <span data-tone={row.tone} style={{ width: `${row.progress}%` }} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="hub-pms__lane-empty">
                  <strong>GitHub lane not visible yet</strong>
                  <p>리포 연결이 들어오면 이곳에 레포별 색 분포와 배송 온도가 나타납니다.</p>
                </div>
              )}
            </article>
          </div>

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

        <SectionCard
          kicker="Connections"
          title="Delivery lane bridge"
          description="Projects, PMS, and roadmap now share one context deck so the active lane stays intact when you jump across views."
        >
          <WorkContextBridge rows={bridgeRows} />
        </SectionCard>

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
                <div className="hub-pms__repo-grid">
                  {scopedRepoCards.items.slice(0, 4).map((project) => (
                    <article className="hub-pms__repo-card" data-tone={project.statusTone} key={project.title}>
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

                      <div className="hub-pms__repo-pills">
                        <span className="legend-chip" data-tone={project.statusTone}>
                          {project.taskSummary}
                        </span>
                        <span className="legend-chip" data-tone={project.risk === "Controlled" ? "green" : "warning"}>
                          {project.risk}
                        </span>
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
                <div className="hub-pms__cadence-grid">
                  {scopedChecks.items.slice(0, 6).map((item) => (
                    <article className="hub-pms__cadence-card" data-tone={item.statusTone} key={item.title}>
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
                <ul className="hub-pms__queue-list">
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
                    <li className="hub-pms__queue-item" data-tone={item.statusTone} key={`${item.title}-${item.project}`}>
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
