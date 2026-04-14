import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getPmsPageData, getProjectsPageData } from "@/lib/server-data";

function countProjects(projectPortfolio, predicate) {
  return projectPortfolio.filter(predicate).length;
}

export default async function WorkOverviewPage({ searchParams }) {
  const [{ projectPortfolio, projectUpdates, taskQueue }, { pmsBoard, weeklyReview }] = await Promise.all([
    getProjectsPageData(),
    getPmsPageData(),
  ]);
  const selectedProject = resolveWorkContext(searchParams?.project);
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
    (item) => [item.title, item.detail, item.rhythm],
  );
  const scopedReview = scopeMappedItemsByWorkContext(
    weeklyReview,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );

  const activeProjects = countProjects(scopedProjects.items, (project) => project.status === "active");
  const blockedProjects = countProjects(
    scopedProjects.items,
    (project) =>
      project.status === "blocked" ||
      project.risk === "Critical" ||
      project.risk.toLowerCase().includes("blocked"),
  );
  const cadenceBlocks = scopedRhythm.items.length;
  const resetPrompts = scopedReview.items.length;
  const scopeNote =
    selectedProject.value === "all"
      ? "모든 프로젝트 레인이 함께 보입니다."
      : scopedProjects.isFallback && scopedTasks.isFallback && scopedUpdates.isFallback
        ? `${selectedProject.label} 범위를 선택했지만, 정확한 프로젝트 매핑이 연결되기 전까지는 공용 레인 데이터를 함께 보여줍니다.`
        : `${selectedProject.label} 컨텍스트로 현재 워크 화면을 고정했습니다.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>프로젝트, 리듬, 의사결정</h1>
        <p>
          워크 레인은 활성 프로젝트, 반복 리뷰, 의사결정의 후속 실행이 바로 행동으로
          이어질 정도로 보이게 유지합니다. 허브가 상태 전시관이 되지 않게 하는 화면입니다.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="워크 OS 요약 지표">
        <SummaryCard
          title="활성 프로젝트"
          value={String(activeProjects)}
          detail="현재 포트폴리오가 믿을 수 있을 만큼 집중된 상태입니다."
          badge="실행"
        />
        <SummaryCard
          title="리듬 블록"
          value={String(cadenceBlocks)}
          detail="반복 점검이 하루 속에 숨어 있지 않고 명시적으로 드러납니다."
          badge="리듬"
          tone="muted"
        />
        <SummaryCard
          title="리셋 프롬프트"
          value={String(resetPrompts)}
          detail="주간 리뷰 신호가 워크 레인이 표류하지 않게 잡아줍니다."
          badge="리뷰"
          tone="blue"
        />
        <SummaryCard
          title="위험 레인"
          value={String(blockedProjects)}
          detail="막혔거나 위험한 작업은 소음이 되기 전에 먼저 드러나야 합니다."
          badge="집중"
          tone="warning"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="프로젝트"
          title="포트폴리오 움직임"
          description="실시간 프로젝트 보드는 마일스톤, 다음 액션, 리스크를 한 번에 읽게 해줍니다."
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
                    <dt>작업 레인</dt>
                    <dd>{project.taskSummary}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="작업"
          title="실행 큐"
          description="작업은 리듬 레인이 추상적 의도가 아니라 구체적인 다음 움직임과 연결되게 만듭니다."
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
          kicker="최근 움직임"
          title="최근 바뀐 것"
          description="업데이트는 시간표시만이 아니라 다음 움직임을 함께 담을 때 의미가 있습니다."
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
