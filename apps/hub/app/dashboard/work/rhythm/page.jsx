import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { RoutineCheckForm } from "@/components/forms/routine-check-form";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getPmsPageData } from "@/lib/server-data";

const STATUS_LABEL = {
  done: "완료",
  pending: "대기",
  blocked: "막힘",
};

function getStatusLabel(status) {
  return STATUS_LABEL[status] || status;
}

export default async function WorkRhythmPage({ searchParams }) {
  const { pmsBoard, weeklyReview, taskQueue } = await getPmsPageData();
  const defaultWorkspaceId =
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    "";
  const params = (await searchParams) ?? {};
  const selectedProject = resolveWorkContext(params?.project);
  const scopedChecks = scopeMappedItemsByWorkContext(
    pmsBoard,
    selectedProject.value,
    (item) => [item.title, item.detail, item.rhythm],
  );
  const scopedReview = scopeMappedItemsByWorkContext(
    weeklyReview,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );
  const scopedTasks = scopeMappedItemsByWorkContext(
    taskQueue,
    selectedProject.value,
    (item) => [item.title, item.detail, item.project],
  );

  const doneChecks = scopedChecks.items.filter((item) => item.status === "done").length;
  const pendingChecks = scopedChecks.items.filter((item) => item.status === "pending").length;
  const blockedChecks = scopedChecks.items.filter((item) => item.status === "blocked").length;
  const scopeNote =
    selectedProject.value === "all"
      ? "모든 프로젝트의 케이던스 블록을 한 번에 함께 봅니다."
      : scopedChecks.isFallback && scopedReview.isFallback && scopedTasks.isFallback
        ? `${selectedProject.label} 범위가 선택되었지만 프로젝트 단위 케이던스 태깅이 더 풍부해지기 전까지 일부 리듬 행은 공용으로 보입니다.`
        : `${selectedProject.label} 리듬이 현재 리뷰 레인을 이끌고 있습니다.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">워크 OS</p>
        <h1>리듬 블록과 주간 리셋</h1>
        <p>
          리듬은 OS의 케이던스 레이어입니다. 체크포인트와 리뷰 프롬프트를 명시해 운영자가
          반응형 작업으로 흘러가지 않도록 붙잡아 둡니다.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="리듬 요약 지표">
        <SummaryCard title="완료" value={String(doneChecks)} detail="닫힌 케이던스 블록 수입니다." badge="완료" />
        <SummaryCard
          title="대기"
          value={String(pendingChecks)}
          detail="다음 의도적인 패스를 기다리는 항목입니다."
          badge="리듬"
          tone="warning"
        />
        <SummaryCard
          title="막힘"
          value={String(blockedChecks)}
          detail="개입 없이는 움직일 수 없는 케이던스 항목입니다."
          badge="주의"
          tone="danger"
        />
        <SummaryCard
          title="리셋 프롬프트"
          value={String(scopedReview.items.length)}
          detail="주간 리셋 루프를 위한 짧은 프롬프트 수입니다."
          badge="리뷰"
          tone="muted"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="기록"
          title="리듬 체크 남기기"
          description="OS에서 직접 케이던스 체크를 남겨 리듬 레이어가 이론이 아니라 실제 운영 기록으로 남게 합니다."
        >
          <RoutineCheckForm defaultWorkspaceId={defaultWorkspaceId} />
        </SectionCard>

        <div className="split-grid">
        <SectionCard
          kicker="케이던스"
          title="오늘의 체크포인트"
          description="각 블록은 시간, 목적, 상태가 함께 보여야 합니다."
        >
          <div className="check-grid">
            {scopedChecks.items.map((item) => (
              <article className="check-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.rhythm}</p>
                  </div>
                  <span
                    className="legend-chip"
                    data-tone={item.statusTone}
                  >
                    {getStatusLabel(item.statusLabel)}
                  </span>
                </div>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="리뷰"
          title="주간 리셋 프롬프트"
          description="주간 패스를 돌려 프로젝트 움직임과 운영 판단을 다시 맞춥니다."
        >
          <ul className="note-list">
            {scopedReview.items.map((item) => (
              <li className="note-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
        </div>
      </div>

      <SectionCard
        kicker="태스크"
        title="이 리듬이 다음으로 움직여야 할 것"
        description="케이던스는 지금 바로 움직여야 할 구체적인 태스크를 가리킬 때 유용합니다."
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
    </div>
  );
}
