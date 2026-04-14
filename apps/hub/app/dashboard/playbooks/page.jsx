import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";

const playbookFamilies = [
  {
    title: "전달",
    detail: "GitHub PR, 이슈 압력, 빠른 담당 지정이 필요한 일.",
    count: "플레이북 2개",
    tone: "blue",
    href: "/dashboard/work/pms",
  },
  {
    title: "계획",
    detail: "리듬, 로드맵, 주간 리셋 루프.",
    count: "플레이북 1개",
    tone: "muted",
    href: "/dashboard/work/roadmap",
  },
  {
    title: "콘텐츠",
    detail: "브랜드 발행 루프, 큐 분류, 스튜디오 핸드오프 규칙.",
    count: "플레이북 1개",
    tone: "green",
    href: "/dashboard/content/queue",
  },
  {
    title: "매출",
    detail: "리드 후속 대응, 계정 관리, 딜 이동 점검.",
    count: "플레이북 1개",
    tone: "warning",
    href: "/dashboard/revenue/leads",
  },
  {
    title: "복구",
    detail: "로그, 실패, 사람의 빠른 개입이 필요한 일.",
    count: "플레이북 1개",
    tone: "danger",
    href: "/dashboard/evolution/issues",
  },
];

const whatToRunNow = [
  {
    title: "데일리 전달 스윕 실행",
    reason: "열린 PR과 막힌 이슈는 하루가 쪼개지기 전에 먼저 정리해야 합니다.",
    action: "PMS 열기",
    href: "/dashboard/work/pms",
    tone: "blue",
  },
  {
    title: "콘텐츠 발행 리뷰 실행",
    reason: "큐에 있는 에셋은 빠르게 발행으로 넘기거나 다시 범위를 조정해야 합니다.",
    action: "콘텐츠 큐 열기",
    href: "/dashboard/content/queue",
    tone: "green",
  },
  {
    title: "주간 계획 리셋 실행",
    reason: "로드맵 리스크는 일정한 주기로 리뷰할수록 수정하기 쉽습니다.",
    action: "로드맵 열기",
    href: "/dashboard/work/roadmap",
    tone: "muted",
  },
  {
    title: "인시던트 에스컬레이션 실행",
    reason: "로그나 동기화가 이상해 보이면 복구 플레이북이 첫 액션이어야 합니다.",
    action: "로그 열기",
    href: "/dashboard/evolution/logs",
    tone: "danger",
  },
];

const playbookCatalog = [
  {
    title: "Daily Delivery Sweep",
    category: "Delivery",
    cadence: "Daily",
    trigger: "9:00 AM, open PRs, stale reviews, or blocked issues",
    owner: "Delivery lead",
    hook: "GitHub PR + issue feed -> PMS board",
    status: "Active",
    tone: "blue",
    steps: [
      "Check the highest-pressure repo first and verify whether anything is blocking merge.",
      "Assign each open item a clear owner or mark it as waiting on external input.",
      "Send only the decisions that remove ambiguity, not a full status rewrite.",
      "End with the next action written in the board so the lane stays executable.",
    ],
  },
  {
    title: "PR Review Triage",
    category: "Delivery",
    cadence: "Triggered",
    trigger: "PR waiting on review for more than 24 hours",
    owner: "Reviewer on duty",
    hook: "GitHub webhook -> notification -> command center",
    status: "Ready",
    tone: "warning",
    steps: [
      "Sort PRs by blast radius, not by age alone.",
      "Clear quick wins immediately and route heavier changes to the right reviewer.",
      "Escalate if the review queue is hiding a release risk.",
      "Mark the next checkpoint so the PR does not drift back into silence.",
    ],
  },
  {
    title: "Brand Publish Run",
    category: "Content",
    cadence: "Daily / As needed",
    trigger: "A brand has assets in review or ready-for-publish state",
    owner: "Content owner",
    hook: "Content queue -> publish log -> channel handoff",
    status: "Active",
    tone: "green",
    steps: [
      "Confirm the brand and channel before touching the draft.",
      "Check that the copy, reference, and asset set all belong to the same brand context.",
      "Move the item into publish only after the review gate is explicit.",
      "Record the published state so the next run can pick up from reality.",
    ],
  },
  {
    title: "Revenue Follow-Up Sweep",
    category: "Revenue",
    cadence: "Daily",
    trigger: "New leads or stuck deals without a next touch",
    owner: "Revenue lead",
    hook: "CRM queue -> reminder -> follow-up task",
    status: "Planned",
    tone: "warning",
    steps: [
      "Separate quick follow-up items from deeper account work.",
      "Move only the records that have a concrete next step.",
      "Flag anything that needs a human response before the deal can move.",
      "Keep the follow-up list short enough to finish in one pass.",
    ],
  },
  {
    title: "Weekly Planning Reset",
    category: "Planning",
    cadence: "Weekly",
    trigger: "Friday review or roadmap slip risk",
    owner: "PM or owner",
    hook: "Roadmap lane -> milestone review -> week plan",
    status: "Active",
    tone: "muted",
    steps: [
      "Review what moved, what slipped, and what should be deferred.",
      "Rewrite the next week so each lane has one obvious objective.",
      "Move blocked items into a visible follow-up state instead of leaving them implied.",
      "Close with a short decision log for the next planning cycle.",
    ],
  },
  {
    title: "Incident Escalation",
    category: "Recovery",
    cadence: "Triggered",
    trigger: "Logs, syncs, or webhooks fail with no recovery path",
    owner: "Operator on call",
    hook: "Logs -> alert -> manual intervention",
    status: "Critical",
    tone: "danger",
    steps: [
      "Confirm the failure is real and not just a noisy duplicate signal.",
      "Contain the issue by pausing the affected route or queue.",
      "Assign one person to fix it and one person to keep the rest of the system readable.",
      "Capture the resolution pattern so the next incident is cheaper.",
    ],
  },
];

const automationHooks = [
  {
    title: "GitHub events",
    detail: "Pull requests, issues, and milestone movement become delivery signals.",
    tone: "blue",
  },
  {
    title: "Scheduled checks",
    detail: "Daily and weekly runs keep recurring work from slipping out of sight.",
    tone: "muted",
  },
  {
    title: "Manual dispatch",
    detail: "Operator-run commands still matter when the workflow needs judgment.",
    tone: "warning",
  },
  {
    title: "Failure alerts",
    detail: "Anything broken should point into logs, issues, and recovery steps immediately.",
    tone: "danger",
  },
];

const operatingRules = [
  "Every playbook should have one clear trigger and one owner, even if the rest is still a mockup.",
  "If a step cannot be automated, it should still be phrased as an action the operator can do in under a minute.",
  "The page should stay readable at a glance, so each card must show the trigger, the steps, and the handoff point.",
  "Run-now items belong at the top when they are time-sensitive, not buried inside the catalog.",
];

export default function PlaybooksPage() {
  return (
    <div className="app-page">
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">워크 OS</p>
            <h1>플레이북</h1>
            <p className="hero-lede">
              매번 다시 발견하면 안 되는 일을 위한 반복 SOP 화면입니다. 각 플레이북은
              트리거, 담당자, 단계, 자동화 훅을 한곳에 담습니다.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/work/pms">
                PMS 열기
              </Link>
              <Link className="button button-secondary" href="/dashboard/automations/integrations">
                훅 검토
              </Link>
              <Link className="button button-ghost" href="/dashboard/evolution/issues">
                복구 확인
              </Link>
            </div>
          </div>

          <div className="hero-panel">
            <p className="section-kicker">운영 모델</p>
            <h2>카테고리, 트리거, 단계, 담당자, 훅</h2>
            <p>
              이 페이지는 바로 운영에 쓸 수 있는 목업을 목표로 했습니다. 오늘부터 써도 될 만큼 충분하고,
              나중에 자동화로 연결할 만큼 충분히 명확해야 합니다.
            </p>
            <div className="hero-chip-row">
              <span className="chip">반복 SOP</span>
              <span className="chip">MVP 목업</span>
              <span className="chip">사람 + 자동화</span>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="플레이북 요약 지표">
        <SummaryCard
          title="카테고리"
          value={String(playbookFamilies.length)}
          detail="운영 시스템을 정리된 상태로 유지하는 반복 플레이북 묶음입니다."
          badge="구조"
          tone="blue"
        />
        <SummaryCard
          title="플레이북"
          value={String(playbookCatalog.length)}
          detail="바로 실행할 수 있을 정도로 구체적인 MVP 카드입니다."
          badge="카탈로그"
          tone="green"
        />
        <SummaryCard
          title="자동화 훅"
          value={String(automationHooks.length)}
          detail="반복 작업이 기계 보조로 넘어갈 수 있는 핸드오프 지점입니다."
          badge="훅"
          tone="warning"
        />
        <SummaryCard
          title="지금 실행"
          value={String(whatToRunNow.length)}
          detail="가장 먼저 주의를 줘야 하는 플레이북의 짧은 목록입니다."
          badge="우선"
          tone="danger"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="지금 실행"
          title="즉시 실행 플레이북"
          description="이 페이지에서 가장 바로 띄우기 쉬워야 하는 반복 SOP들입니다."
          action={
            <Link className="button button-secondary" href="/dashboard/automations">
              자동화 열기
            </Link>
          }
        >
          <div className="template-grid">
            {whatToRunNow.map((item) => (
              <div className="template-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.reason}</p>
                </div>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.action}
                  </span>
                  <Link className="button button-ghost" href={item.href}>
                    열기
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="카테고리"
          title="플레이북 묶음"
          description="라이브러리는 운영 의도별로 묶여 있어야 맞는 SOP를 바로 찾을 수 있습니다."
        >
          <div className="project-grid">
            {playbookFamilies.map((family) => (
              <article className="project-card" key={family.title}>
                <div className="project-head">
                  <div>
                    <h3>{family.title}</h3>
                    <p>{family.detail}</p>
                  </div>
                  <span className="legend-chip" data-tone={family.tone}>
                    {family.count}
                  </span>
                </div>
                <div className="hero-actions">
                  <Link className="button button-secondary" href={family.href}>
                    레인 열기
                  </Link>
                  <Link className="button button-ghost" href="#catalog">
                    SOP 보기
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="카탈로그"
        title="반복 SOP 플레이북"
        description="각 카드는 운영 맥락, 트리거, 담당자, 훅, 단계별 경로를 함께 보여줍니다."
      >
        <div className="project-grid" id="catalog">
          {playbookCatalog.map((item) => (
            <article className="project-card" key={item.title}>
              <div className="project-head">
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.category} · {item.cadence}
                  </p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.status}
                </span>
              </div>

              <div className="inline-legend">
                <span className="legend-chip" data-tone="muted">
                  {item.category}
                </span>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.cadence}
                </span>
              </div>

              <dl className="detail-stack">
                <div>
                  <dt>트리거</dt>
                  <dd>{item.trigger}</dd>
                </div>
                <div>
                  <dt>담당자</dt>
                  <dd>{item.owner}</dd>
                </div>
                <div>
                  <dt>자동화 훅</dt>
                  <dd>{item.hook}</dd>
                </div>
              </dl>

              <div className="timeline">
                {item.steps.map((step, index) => (
                  <div className="timeline-item" key={`${item.title}-${index}`}>
                    <div className="inline-legend">
                      <span className="legend-chip" data-tone={item.tone}>
                        단계 {index + 1}
                      </span>
                    </div>
                    <strong>{step}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="자동화 훅"
          title="플레이북이 넘겨주는 지점"
          description="SOP 라이브러리가 기본적으로 자라가야 할 연동 지점들입니다."
        >
          <div className="template-grid">
            {automationHooks.map((hook) => (
              <div className="template-row" key={hook.title}>
                <div>
                  <strong>{hook.title}</strong>
                  <p>{hook.detail}</p>
                </div>
                <span className="legend-chip" data-tone={hook.tone}>
                  훅
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="규칙"
          title="라이브러리를 유용하게 유지하는 법"
          description="좋은 플레이북은 짧고, 분명하고, 넘기기 쉬워야 합니다."
        >
          <ul className="note-list">
            {operatingRules.map((rule) => (
              <li className="note-row" key={rule}>
                <div>
                  <strong>{rule}</strong>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
