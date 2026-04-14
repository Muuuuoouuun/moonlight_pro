import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getPlanTrackerPageData } from "@/lib/server-data";

const STATUS_TONE = {
  ahead: "green",
  "on-track": "blue",
  watch: "warning",
  behind: "danger",
  completed: "muted",
};

const STATUS_LABEL = {
  ahead: "ahead",
  "on-track": "on track",
  watch: "watch",
  behind: "behind",
  completed: "done",
};

const SEVERITY_TONE = {
  danger: "danger",
  warning: "warning",
  info: "blue",
};

function clamp(value, min = 0, max = 100) {
  if (Number.isNaN(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function formatVariance(days) {
  if (days === 0) return "0 일";
  if (days < 0) return `${days} 일 (빠름)`;
  return `+${days} 일 지연`;
}

function PlanProgressBar({ planned, actual, status }) {
  const plannedClamped = clamp(planned);
  const actualClamped = clamp(actual);
  const statusTone = STATUS_TONE[status] ?? "blue";

  return (
    <div className="plan-progress" data-tone={statusTone}>
      <div
        className="plan-progress-fill"
        style={{ width: `${actualClamped}%` }}
        aria-hidden="true"
      />
      <div
        className="plan-progress-target"
        style={{ left: `${plannedClamped}%` }}
        data-label={`계획 ${plannedClamped}%`}
        aria-hidden="true"
      />
      <span className="visually-hidden">
        actual {actualClamped}% / planned {plannedClamped}%
      </span>
    </div>
  );
}

export default async function WorkPlanPage() {
  const {
    planSnapshot,
    planSummary,
    planPhases,
    planProjects,
    planMilestones,
    planDriftItems,
  } = await getPlanTrackerPageData();

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS · Plan tracker</p>
        <h1>계획 vs 현재 — 운영 현황판</h1>
        <p>
          마스터 로드맵의 페이즈·마일스톤과 현재 진척을 한 화면에서 비교합니다. 변동(drift)이 어디에서
          발생하고 있는지, 무엇이 가장 먼저 풀려야 하는지가 즉시 보이도록 구성된 운영자용 스냅샷입니다.
        </p>
        <p className="page-context">
          <strong>As of {planSnapshot.asOf}</strong>
          <span>출처 · {planSnapshot.source}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="Plan tracker summary">
        {planSummary.map((metric) => (
          <SummaryCard key={metric.title} {...metric} />
        ))}
      </section>

      <SectionCard
        kicker="Phases"
        title="Hub OS 페이즈 진척"
        description="각 페이즈는 마스터 로드맵에 정의된 계획선(흰색 마커) 대비 현재 진척(채워진 막대)으로 비교됩니다."
      >
        <div className="plan-phase-grid">
          {planPhases.map((phase) => (
            <article className="plan-phase-card" key={phase.id}>
              <div className="plan-phase-head">
                <div>
                  <p className="plan-phase-label">{phase.label}</p>
                  <h3>{phase.title}</h3>
                </div>
                <span className="legend-chip" data-tone={STATUS_TONE[phase.status] ?? "muted"}>
                  {STATUS_LABEL[phase.status] ?? phase.status}
                </span>
              </div>

              <PlanProgressBar
                planned={phase.plannedPct}
                actual={phase.actualPct}
                status={phase.status}
              />

              <div className="plan-phase-metrics">
                <div>
                  <span>실측</span>
                  <strong>{phase.actualPct}%</strong>
                </div>
                <div>
                  <span>계획</span>
                  <strong>{phase.plannedPct}%</strong>
                </div>
                <div>
                  <span>편차</span>
                  <strong className="variance-chip" data-tone={STATUS_TONE[phase.status] ?? "muted"}>
                    {formatVariance(phase.varianceDays)}
                  </strong>
                </div>
              </div>

              <dl className="plan-phase-dates">
                <div>
                  <dt>계획 마감</dt>
                  <dd>{phase.plannedEnd}</dd>
                </div>
                <div>
                  <dt>예상 마감</dt>
                  <dd>{phase.actualEnd}</dd>
                </div>
              </dl>

              <p className="plan-phase-scope">{phase.scope}</p>
              <p className="plan-phase-note">{phase.note}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        kicker="Projects"
        title="프로젝트별 스코어카드"
        description="현재 추적 중인 프로젝트의 계획 대비 진척과 예상 마감 편차입니다."
      >
        <div className="plan-table" role="table" aria-label="Project plan vs current">
          <div className="plan-table-head" role="row">
            <span role="columnheader">Project</span>
            <span role="columnheader">Owner</span>
            <span role="columnheader">진척</span>
            <span role="columnheader">계획 마감</span>
            <span role="columnheader">예상 마감</span>
            <span role="columnheader">편차</span>
            <span role="columnheader">다음 마일스톤</span>
          </div>
          {planProjects.map((project) => (
            <div className="plan-table-row" key={project.id} role="row">
              <div role="cell" className="plan-table-cell plan-table-name">
                <strong>{project.name}</strong>
                {project.blocker ? (
                  <p className="check-detail">막힘 · {project.blocker}</p>
                ) : (
                  <p className="check-detail">막힘 없음</p>
                )}
              </div>
              <div role="cell" className="plan-table-cell">
                <span className="muted">{project.owner}</span>
              </div>
              <div role="cell" className="plan-table-cell plan-table-progress">
                <PlanProgressBar
                  planned={project.plannedPct}
                  actual={project.actualPct}
                  status={project.status}
                />
                <span className="muted tiny">
                  {project.actualPct}% / 계획 {project.plannedPct}%
                </span>
              </div>
              <div role="cell" className="plan-table-cell">
                <span>{project.plannedDate}</span>
              </div>
              <div role="cell" className="plan-table-cell">
                <span>{project.expectedDate}</span>
              </div>
              <div role="cell" className="plan-table-cell">
                <span
                  className="variance-chip"
                  data-tone={STATUS_TONE[project.status] ?? "muted"}
                >
                  {formatVariance(project.varianceDays)}
                </span>
              </div>
              <div role="cell" className="plan-table-cell">
                <span>{project.nextMilestone}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="Milestones"
          title="마일스톤 변동 타임라인"
          description="가장 큰 지연부터 위로 정렬됩니다. 빠르게 끝난 항목은 아래쪽에 모입니다."
        >
          <div className="timeline">
            {planMilestones.map((milestone) => (
              <div className="timeline-item" key={milestone.id}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={STATUS_TONE[milestone.status] ?? "muted"}
                  >
                    {formatVariance(milestone.varianceDays)}
                  </span>
                  <span className="muted tiny">{milestone.project}</span>
                </div>
                <strong>{milestone.title}</strong>
                <p>
                  계획 <strong>{milestone.plannedDate}</strong> → 실측{" "}
                  <strong>{milestone.actualDate}</strong>
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Drift watch"
          title="지금 풀어야 할 변동"
          description="가장 큰 막힘부터 — 카드 하나하나가 다음 한 수를 가지고 있도록."
        >
          <ul className="note-list">
            {planDriftItems.map((item) => (
              <li className="note-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <p className="check-detail">
                    <strong>다음 한 수</strong> · {item.nextMove}
                  </p>
                </div>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={SEVERITY_TONE[item.severity] ?? "muted"}
                  >
                    {item.severity}
                  </span>
                  {item.href ? (
                    <Link className="button button-ghost" href={item.href}>
                      Jump
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
