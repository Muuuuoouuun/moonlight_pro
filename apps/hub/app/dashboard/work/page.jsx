import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import {
  getProjectsPageData,
  getWorkCalendarPageData,
  getWorkPmsPageData,
} from "@/lib/server-data";
import { buildWorkContextHref } from "@/lib/work-context-bridge";

function countProjects(projectPortfolio, predicate) {
  return projectPortfolio.filter(predicate).length;
}

function updateSelector(item) {
  return [item.title, item.detail];
}

function taskSelector(item) {
  return [item.title, item.detail, item.project];
}

function reviewSelector(item) {
  return [item.title, item.detail];
}

function pmsSelector(item) {
  return [item.title, item.detail, item.rhythm];
}

function alertSelector(item) {
  return [item.title, item.detail];
}

function scheduleSelector(item) {
  return [item.title, item.detail, item.project, item.source, item.kind];
}

function isBlockedProject(project) {
  return (
    project.status === "blocked" ||
    project.risk === "Critical" ||
    project.risk.toLowerCase().includes("blocked")
  );
}

function buildWorkflowStages({
  selectedProject,
  activeProjects,
  blockedProjects,
  scopedUpdates,
  scopedTasks,
  scopedRhythm,
  scopedReview,
  scopedAlerts,
  scopedSchedule,
  milestoneHorizonCount,
  githubTotals,
  hasGitHubData,
  googleCalendarConnection,
}) {
  const blockedTaskCount = scopedTasks.items.filter((item) => item.status === "blocked").length;
  const redSignals = blockedTaskCount + scopedAlerts.items.filter((item) => item.tone === "danger").length;
  const watchSignals = scopedAlerts.items.filter((item) => item.tone === "warning").length;
  const scheduleCount = scopedSchedule.items.filter((item) => !item.isOverdue).length;
  const mergedThisWeek = githubTotals.mergedPullCount || 0;
  const openPullCount = githubTotals.openPullCount || 0;
  const reviewCount = scopedReview.items.length;

  return [
    {
      key: "capture",
      order: "01",
      kicker: "포착",
      title: "신호를 먼저 잡는다",
      tone: scopedUpdates.items.length ? "blue" : "muted",
      statusLabel: scopedUpdates.items.length ? "실시간" : "한산함",
      metricValue: String(scopedUpdates.items.length).padStart(2, "0"),
      metricLabel: "새 업데이트",
      question: "오늘 실제로 움직인 것은 무엇인가?",
      signal:
        scopedUpdates.items[0]?.detail ||
        "아직 새 업데이트가 없습니다. 이 단계가 비어 있으면 뒤 단계는 전부 추측이 됩니다.",
      handoff: "프로젝트 보드에서 다음 액션 한 줄로 다시 고정합니다.",
      primaryLink: { label: "프로젝트 열기", href: buildWorkContextHref("/dashboard/work/projects", selectedProject.value) },
      secondaryLink: { label: "최근 변화", href: buildWorkContextHref("/dashboard/work", selectedProject.value) },
    },
    {
      key: "triage",
      order: "02",
      kicker: "정리",
      title: "어디에 개입할지 정한다",
      tone: redSignals > 0 ? "danger" : watchSignals > 0 ? "warning" : "green",
      statusLabel: redSignals > 0 ? "개입 필요" : watchSignals > 0 ? "주시" : "안정",
      metricValue: String(redSignals).padStart(2, "0"),
      metricLabel: "위험 신호",
      question: "지금 당장 끼어들어야 할 레인은 어디인가?",
      signal:
        scopedAlerts.items[0]?.detail ||
        scopedTasks.items.find((item) => item.status === "blocked")?.detail ||
        "위험 신호가 아직 짧게 관리되고 있습니다.",
      handoff: "PMS에서 블로커, 리뷰어 큐, PR 압력을 한 번에 압축해서 봅니다.",
      primaryLink: { label: "PMS 열기", href: buildWorkContextHref("/dashboard/work/pms", selectedProject.value) },
      secondaryLink: { label: "관리 화면", href: buildWorkContextHref("/dashboard/work/management", selectedProject.value) },
    },
    {
      key: "shape",
      order: "03",
      kicker: "형성",
      title: "마일스톤을 지평선에 올린다",
      tone: milestoneHorizonCount > 0 ? "warning" : activeProjects > 0 ? "blue" : "muted",
      statusLabel: milestoneHorizonCount > 0 ? "기한 임박" : activeProjects > 0 ? "진행 중" : "미정리",
      metricValue: String(milestoneHorizonCount).padStart(2, "0"),
      metricLabel: "근접 마일스톤",
      question: "이번 판단 구역 안으로 들어온 마일스톤은 몇 개인가?",
      signal:
        milestoneHorizonCount > 0
          ? `${milestoneHorizonCount}개의 마일스톤이 다음 일정 판단 구역 안에 들어와 있습니다.`
          : "근거리 마일스톤이 없으면 로드맵은 넓게 보이지만 실행은 흐려집니다.",
      handoff: "로드맵에서 지금 / 다음 / 나중을 다시 정렬해 시간 압력을 드러냅니다.",
      primaryLink: { label: "로드맵 열기", href: buildWorkContextHref("/dashboard/work/roadmap", selectedProject.value) },
      secondaryLink: { label: "계획 추적", href: buildWorkContextHref("/dashboard/work/plan", selectedProject.value) },
    },
    {
      key: "execute",
      order: "04",
      kicker: "실행",
      title: "작업 레인을 움직인다",
      tone: blockedProjects > 0 ? "warning" : activeProjects > 0 ? "green" : "muted",
      statusLabel: blockedProjects > 0 ? "압력" : activeProjects > 0 ? "가동 중" : "대기",
      metricValue: String(activeProjects).padStart(2, "0"),
      metricLabel: "가동 레인",
      question: "실행 중인 프로젝트가 실제 태스크와 붙어 있는가?",
      signal:
        scopedTasks.items[0]?.detail ||
        "실행 큐가 비어 있습니다. 다음 행동이 태스크로 내려오지 않으면 보드는 포스터가 됩니다.",
      handoff: "프로젝트 카드에서 다음 액션과 태스크 레인을 같은 문장으로 묶습니다.",
      primaryLink: { label: "실행 큐", href: buildWorkContextHref("/dashboard/work/projects", selectedProject.value) },
      secondaryLink: { label: "캘린더", href: buildWorkContextHref("/dashboard/work/calendar", selectedProject.value) },
    },
    {
      key: "ship",
      order: "05",
      kicker: "출고",
      title: "배송 증거를 남긴다",
      tone: openPullCount > 0 ? "blue" : mergedThisWeek > 0 ? "green" : hasGitHubData ? "warning" : "muted",
      statusLabel: openPullCount > 0 ? "리뷰 큐" : mergedThisWeek > 0 ? "출고됨" : "증거 부족",
      metricValue: String(mergedThisWeek).padStart(2, "0"),
      metricLabel: "이번 주 머지",
      question: "지금까지의 움직임이 실제 배송 증거로 남았는가?",
      signal:
        hasGitHubData
          ? `${openPullCount}개의 열린 PR과 ${mergedThisWeek}개의 이번 주 머지가 배송 레인을 지탱하고 있습니다.`
          : "GitHub 연결이 아직 약하면 배송 증거가 보이지 않습니다.",
      handoff: "PMS와 릴리스에서 머지 압력과 출고 증거를 같은 흐름으로 확인합니다.",
      primaryLink: { label: "릴리스 열기", href: buildWorkContextHref("/dashboard/work/releases", selectedProject.value) },
      secondaryLink: { label: "출고 펄스", href: buildWorkContextHref("/dashboard/work/pms?view=ship", selectedProject.value) },
    },
    {
      key: "sync-reset",
      order: "06",
      kicker: "동기화 + 리셋",
      title: "일정과 회고로 닫는다",
      tone:
        googleCalendarConnection.status === "connected"
          ? "green"
          : scheduleCount > 0 || reviewCount > 0
            ? "warning"
            : "muted",
      statusLabel:
        googleCalendarConnection.status === "connected"
          ? "동기화됨"
          : scheduleCount > 0 || reviewCount > 0
            ? "수동 루프"
            : "미연결",
      metricValue: String(reviewCount).padStart(2, "0"),
      metricLabel: "리셋 프롬프트",
      question: "오늘의 움직임이 내일의 일정과 리뷰 루프로 이어지는가?",
      signal:
        scopedReview.items[0]?.detail ||
        scopedRhythm.items[0]?.detail ||
        "리뷰와 캘린더가 비어 있으면 같은 판단을 계속 다시 하게 됩니다.",
      handoff: "캘린더와 리듬 화면에서 내일의 스케줄과 이번 주 리뷰를 닫습니다.",
      primaryLink: { label: "캘린더 열기", href: buildWorkContextHref("/dashboard/work/calendar", selectedProject.value) },
      secondaryLink: { label: "리듬 열기", href: buildWorkContextHref("/dashboard/work/rhythm", selectedProject.value) },
    },
  ];
}

function buildWorkflowSurfaceCards({
  selectedProject,
  activeProjects,
  blockedProjects,
  scopedTasks,
  scopedAlerts,
  milestoneHorizonCount,
  githubTotals,
  upcomingScheduleCount,
  scopedReview,
}) {
  return [
    {
      key: "projects",
      title: "프로젝트",
      question: "무엇이 움직이고 있고 다음 행동은 무엇인가?",
      metric: `${activeProjects}개 진행`,
      detail: `${blockedProjects}개 막힘 · ${scopedTasks.items.length}개 대기 작업`,
      tone: blockedProjects > 0 ? "warning" : "green",
      href: buildWorkContextHref("/dashboard/work/projects", selectedProject.value),
    },
    {
      key: "pms",
      title: "PMS",
      question: "리뷰 병목과 출고 압력은 어디에 쌓이는가?",
      metric: `${githubTotals.openPullCount || 0} open PRs`,
      detail: `${scopedAlerts.items.length} alert signals visible`,
      tone: scopedAlerts.items.some((item) => item.tone === "danger") ? "danger" : "blue",
      href: buildWorkContextHref("/dashboard/work/pms", selectedProject.value),
    },
    {
      key: "roadmap",
      title: "로드맵",
      question: "시간 압력이 걸린 마일스톤은 무엇인가?",
      metric: `${milestoneHorizonCount}개 근접`,
      detail: "지금 / 다음 / 나중 지평선 보드",
      tone: milestoneHorizonCount > 0 ? "warning" : "muted",
      href: buildWorkContextHref("/dashboard/work/roadmap", selectedProject.value),
    },
    {
      key: "calendar",
      title: "캘린더",
      question: "오늘 이후 14일 안에 무엇이 도착하는가?",
      metric: `${upcomingScheduleCount}개 예정`,
      detail: "기한, 마일스톤, 발행 시점, 외부 이벤트",
      tone: upcomingScheduleCount > 0 ? "blue" : "muted",
      href: buildWorkContextHref("/dashboard/work/calendar", selectedProject.value),
    },
    {
      key: "releases",
      title: "릴리스",
      question: "배송 증거는 무엇으로 남았는가?",
      metric: `${githubTotals.mergedPullCount || 0}개 머지`,
      detail: "릴리스 태그 또는 자동 변경 로그",
      tone: (githubTotals.mergedPullCount || 0) > 0 ? "green" : "muted",
      href: buildWorkContextHref("/dashboard/work/releases", selectedProject.value),
    },
    {
      key: "reset",
      title: "리듬 + 의사결정",
      question: "이번 루프에서 무엇을 배우고 무엇을 고정하는가?",
      metric: `${scopedReview.items.length}개 프롬프트`,
      detail: "리셋 프롬프트, 케이던스 체크, 운영자 판단",
      tone: scopedReview.items.length > 0 ? "blue" : "warning",
      href: buildWorkContextHref("/dashboard/work/rhythm", selectedProject.value),
    },
  ];
}

function buildWorkflowWalkthrough({
  selectedProject,
  scopedUpdates,
  scopedTasks,
  scopedAlerts,
  scopedSchedule,
  scopedReview,
  githubTotals,
}) {
  const blockedTask = scopedTasks.items.find((item) => item.status === "blocked");
  const nextTask = scopedTasks.items[0];
  const nextSchedule = scopedSchedule.items.find((item) => !item.isOverdue);

  return [
    {
      key: "morning-signal",
      time: "08:30",
      tone: "blue",
      title: "신호 포착",
      detail: scopedUpdates.items[0]?.detail || "새 프로젝트 업데이트를 먼저 읽고 오늘의 변화를 확인합니다.",
      label: "프로젝트",
      href: buildWorkContextHref("/dashboard/work/projects", selectedProject.value),
    },
    {
      key: "triage-red",
      time: "09:10",
      tone: blockedTask || scopedAlerts.items.some((item) => item.tone === "danger") ? "danger" : "warning",
      title: "우선순위 재정렬",
      detail:
        blockedTask?.detail ||
        scopedAlerts.items[0]?.detail ||
        "블록 신호가 없으면 오늘 개입이 필요한 레인을 다시 짧게 확인합니다.",
      label: "PMS",
      href: buildWorkContextHref("/dashboard/work/pms", selectedProject.value),
    },
    {
      key: "shape-lane",
      time: "10:40",
      tone: "warning",
      title: "지평선 점검",
      detail:
        nextSchedule?.detail ||
        "캘린더와 로드맵에서 가까운 마일스톤과 마감일을 한 화면에서 맞춥니다.",
      label: "로드맵",
      href: buildWorkContextHref("/dashboard/work/roadmap", selectedProject.value),
    },
    {
      key: "execution-window",
      time: "13:30",
      tone: "green",
      title: "실행 블록",
      detail:
        nextTask?.detail ||
        "오후 실행 블록에서는 다음 액션을 바로 태스크/프로젝트 레인으로 내립니다.",
      label: "관리",
      href: buildWorkContextHref("/dashboard/work/management", selectedProject.value),
    },
    {
      key: "shipping-proof",
      time: "17:20",
      tone: (githubTotals.mergedPullCount || 0) > 0 ? "blue" : "muted",
      title: "출고 증거",
      detail:
        (githubTotals.mergedPullCount || 0) > 0
          ? `${githubTotals.mergedPullCount}개의 머지가 이번 주 배송 증거로 남았습니다.`
          : "아직 머지/릴리스 증거가 부족하면 오늘의 움직임이 배송으로 닫히지 않았다는 뜻입니다.",
      label: "릴리스",
      href: buildWorkContextHref("/dashboard/work/releases", selectedProject.value),
    },
    {
      key: "reset-loop",
      time: "18:10",
      tone: scopedReview.items.length > 0 ? "green" : "warning",
      title: "리셋과 이월",
      detail:
        scopedReview.items[0]?.detail ||
        "리듬과 결정 화면에서 오늘 남긴 판단을 내일의 루프로 넘깁니다.",
      label: "리듬",
      href: buildWorkContextHref("/dashboard/work/rhythm", selectedProject.value),
    },
  ];
}

export default async function WorkOverviewPage({ searchParams }) {
  const [
    { projectPortfolio, projectUpdates, taskQueue },
    {
      pmsBoard,
      weeklyReview,
      githubAlerts,
      githubTotals,
      hasGitHubData,
    },
    {
      scheduleEvents,
      googleCalendarConnection,
    },
  ] = await Promise.all([
    getProjectsPageData(),
    getWorkPmsPageData(),
    getWorkCalendarPageData(),
  ]);
  const params = (await searchParams) ?? {};
  const selectedProject = resolveWorkContext(params?.project);
  const scopedProjects = scopeMappedItemsByWorkContext(
    projectPortfolio,
    selectedProject.value,
    (project) => [project.title, project.owner, project.milestone, project.nextAction, project.risk, project.taskLead],
  );
  const scopedUpdates = scopeMappedItemsByWorkContext(
    projectUpdates,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );
  const scopedTasks = scopeMappedItemsByWorkContext(
    taskQueue,
    selectedProject.value,
    (item) => [item.title, item.detail, item.project],
  );
  const scopedRhythm = scopeMappedItemsByWorkContext(
    pmsBoard,
    selectedProject.value,
    pmsSelector,
  );
  const scopedReview = scopeMappedItemsByWorkContext(
    weeklyReview,
    selectedProject.value,
    reviewSelector,
  );
  const scopedAlerts = scopeMappedItemsByWorkContext(
    githubAlerts,
    selectedProject.value,
    alertSelector,
  );
  const scopedSchedule = scopeMappedItemsByWorkContext(
    scheduleEvents,
    selectedProject.value,
    scheduleSelector,
  );

  const activeProjects = countProjects(scopedProjects.items, (project) => project.status === "active");
  const blockedProjects = countProjects(
    scopedProjects.items,
    (project) => isBlockedProject(project),
  );
  const cadenceBlocks = scopedRhythm.items.length;
  const resetPrompts = scopedReview.items.length;
  const milestoneHorizonCount = scopedSchedule.items.filter(
    (item) => !item.isOverdue && (item.kind === "Milestone" || item.kind === "GitHub milestone"),
  ).length;
  const upcomingScheduleCount = scopedSchedule.items.filter((item) => !item.isOverdue).length;
  const workflowStages = buildWorkflowStages({
    selectedProject,
    activeProjects,
    blockedProjects,
    scopedUpdates,
    scopedTasks,
    scopedRhythm,
    scopedReview,
    scopedAlerts,
    scopedSchedule,
    milestoneHorizonCount,
    githubTotals,
    hasGitHubData,
    googleCalendarConnection,
  });
  const workflowSurfaces = buildWorkflowSurfaceCards({
    selectedProject,
    activeProjects,
    blockedProjects,
    scopedTasks,
    scopedAlerts,
    milestoneHorizonCount,
    githubTotals,
    upcomingScheduleCount,
    scopedReview,
  });
  const workflowWalkthrough = buildWorkflowWalkthrough({
    selectedProject,
    scopedUpdates,
    scopedTasks,
    scopedAlerts,
    scopedSchedule,
    scopedReview,
    githubTotals,
  });
  const scopeNote =
    selectedProject.value === "all"
      ? "모든 프로젝트 레인이 한 화면에서 함께 보입니다."
      : scopedProjects.isFallback && scopedTasks.isFallback && scopedUpdates.isFallback
        ? `${selectedProject.label} 범위가 선택되었지만 프로젝트 이름 매핑이 더 정교해지기 전까지 일부 실시간 행은 공용 레인을 함께 사용합니다.`
        : `${selectedProject.label} 맥락이 현재 워크 화면에 고정되어 있습니다.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">워크 OS</p>
        <h1>프로젝트, 리듬, 의사결정</h1>
        <p>
          워크 레인은 활성 프로젝트, 반복 리뷰, 결정의 후속 이행이 충분히 보이게 유지되도록 설계합니다.
          허브를 상태 전시관으로 만들지 않으면서도 바로 행동할 수 있게 하는 것이 목표입니다.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="워크 OS 요약 지표">
        <SummaryCard
          title="진행 프로젝트"
          value={String(activeProjects)}
          detail="현재 포트폴리오가 믿을 만하게 유지될 만큼 일이 집중되어 있습니다."
          badge="실행"
        />
        <SummaryCard
          title="케이던스 블록"
          value={String(cadenceBlocks)}
          detail="루틴 체크포인트가 하루 속에 숨지 않고 명시적으로 드러납니다."
          badge="리듬"
          tone="muted"
        />
        <SummaryCard
          title="리셋 프롬프트"
          value={String(resetPrompts)}
          detail="주간 리뷰 단서가 워크 레인이 흐트러지지 않도록 붙잡아 둡니다."
          badge="리뷰"
          tone="blue"
        />
        <SummaryCard
          title="위험 레인"
          value={String(blockedProjects)}
          detail="막혔거나 임계 상태의 작업은 소음이 되기 전에 먼저 떠올라야 합니다."
          badge="포커스"
          tone="warning"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="워크플로 리허설"
          title="A to Z 운영 리허설"
          description="신호를 포착하고, 레인을 고르고, 마일스톤을 세우고, 실행을 움직이고, 출고 증거를 확인한 뒤, 일정과 리뷰로 루프를 닫는 전체 운영 흐름입니다."
        >
          <div className="workflow-sim__hero">
            <div className="workflow-sim__intro">
              <p className="workflow-sim__eyebrow">운영 스크립트</p>
              <h3>하나의 레인, 여섯 번의 handoff, 사각지대는 최소화.</h3>
              <p>
                이제 선택한 워크 맥락은 요약 페이지가 아니라 완전한 리허설 보드처럼 읽힙니다.
                각 블록은 다른 질문에 답하고, 각 handoff는 다음 화면으로 자연스럽게 이어집니다.
              </p>
            </div>
            <div className="workflow-sim__legend">
              <span className="legend-chip" data-tone="blue">신호</span>
              <span className="legend-chip" data-tone="danger">개입</span>
              <span className="legend-chip" data-tone="warning">시간 압력</span>
              <span className="legend-chip" data-tone="green">리셋 루프</span>
            </div>
          </div>

          <div className="workflow-sim__rail">
            {workflowStages.map((stage) => (
              <article className="workflow-sim__step" data-tone={stage.tone} key={stage.key}>
                <div className="workflow-sim__step-index">{stage.order}</div>
                <div className="workflow-sim__step-body">
                  <div className="workflow-sim__step-head">
                    <div>
                      <p className="workflow-sim__step-kicker">{stage.kicker}</p>
                      <h3>{stage.title}</h3>
                    </div>
                    <span className="legend-chip" data-tone={stage.tone}>
                      {stage.statusLabel}
                    </span>
                  </div>
                  <div className="workflow-sim__metric">
                    <strong>{stage.metricValue}</strong>
                    <span>{stage.metricLabel}</span>
                  </div>
                  <p className="workflow-sim__question">{stage.question}</p>
                  <p className="workflow-sim__signal">{stage.signal}</p>
                  <div className="workflow-sim__foot">
                    <p>{stage.handoff}</p>
                    <div className="workflow-sim__links">
                      <Link href={stage.primaryLink.href}>{stage.primaryLink.label}</Link>
                      <Link href={stage.secondaryLink.href}>{stage.secondaryLink.label}</Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="split-grid">
          <SectionCard
            kicker="화면 맵"
            title="어떤 화면이 어떤 질문에 답하는가"
            description="이 모의 워크플로가 완전히 출고되었다면, 운영자는 하루 동안 이 화면 맵을 따라 움직이게 됩니다."
          >
            <div className="workflow-surface-grid">
              {workflowSurfaces.map((surface) => (
                <Link className="workflow-surface-card" data-tone={surface.tone} href={surface.href} key={surface.key}>
                  <div className="workflow-surface-card__head">
                    <strong>{surface.title}</strong>
                    <span className="legend-chip" data-tone={surface.tone}>
                      {surface.metric}
                    </span>
                  </div>
                  <p className="workflow-surface-card__question">{surface.question}</p>
                  <p className="workflow-surface-card__detail">{surface.detail}</p>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="하루 리허설"
            title="한 명의 운영자 루프"
            description="아침 신호 포착부터 저녁 리셋까지, 워크 OS를 이 하루 리듬 위에 설계하고 있습니다."
          >
            <div className="workflow-day">
              {workflowWalkthrough.map((item) => (
                <article className="workflow-day__item" data-tone={item.tone} key={item.key}>
                  <span className="workflow-day__time">{item.time}</span>
                  <div className="workflow-day__body">
                    <div className="workflow-day__head">
                      <strong>{item.title}</strong>
                      <Link href={item.href}>{item.label}</Link>
                    </div>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          kicker="프로젝트"
          title="포트폴리오 흐름"
          description="실시간 프로젝트 보드는 마일스톤, 다음 액션, 리스크를 한 번에 읽히게 유지합니다."
        >
          <div className="project-grid">
            {scopedProjects.items.map((project) => (
              <article className="project-card" key={project.title}>
                <div className="project-head">
                  <div>
                    <h3>{project.title}</h3>
                    <p>{project.owner}</p>
                  </div>
                  <span
                    className="legend-chip"
                    data-tone={project.statusTone}
                  >
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
                    <dt>마일스톤</dt>
                    <dd>{project.milestone}</dd>
                  </div>
                  <div>
                    <dt>다음 액션</dt>
                    <dd>{project.nextAction}</dd>
                  </div>
                  <div>
                    <dt>리스크</dt>
                    <dd>{project.risk}</dd>
                  </div>
                  <div>
                    <dt>태스크 레인</dt>
                    <dd>{project.taskSummary}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="태스크"
          title="실행 큐"
          description="태스크는 리듬 레인을 추상적 의도가 아니라 구체적인 다음 움직임에 붙잡아 둡니다."
        >
          <ul className="task-list">
            {scopedTasks.items.map((item) => (
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

        <SectionCard
          kicker="최근 변화"
          title="방금 무엇이 달라졌는가"
          description="업데이트가 단순 타임스탬프가 아니라 다음 움직임을 품고 있을 때 진행의 의미가 살아납니다."
        >
          <div className="timeline">
            {scopedUpdates.items.map((item) => (
              <div className="timeline-item" key={item.title}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
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
    </div>
  );
}
