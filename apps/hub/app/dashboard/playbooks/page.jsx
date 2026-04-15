import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";

const playbookFamilies = [
  {
    title: "배포",
    detail: "GitHub PR, 이슈 압박, 빠른 오너 지정이 필요한 작업.",
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
    detail: "리드 후속 대응, 계정 관리, 거래 진행 점검.",
    count: "플레이북 1개",
    tone: "warning",
    href: "/dashboard/revenue/leads",
  },
  {
    title: "복구",
    detail: "로그, 실패, 그리고 빠르게 사람이 개입해야 하는 일.",
    count: "플레이북 1개",
    tone: "danger",
    href: "/dashboard/evolution/issues",
  },
];

const whatToRunNow = [
  {
    title: "일일 배포 점검 실행",
    reason: "열린 PR과 막힌 이슈는 하루가 쪼개지기 전에 먼저 정리합니다.",
    action: "PMS 열기",
    href: "/dashboard/work/pms",
    tone: "blue",
  },
  {
    title: "콘텐츠 발행 검토 실행",
    reason: "대기 중인 에셋은 발행으로 넘기거나 빠르게 재정의해야 합니다.",
    action: "콘텐츠 큐 열기",
    href: "/dashboard/content/queue",
    tone: "green",
  },
  {
    title: "주간 계획 리셋 실행",
    reason: "정해진 타이밍에 로드맵을 보면 위험을 더 쉽게 바로잡을 수 있습니다.",
    action: "로드맵 열기",
    href: "/dashboard/work/roadmap",
    tone: "muted",
  },
  {
    title: "장애 에스컬레이션 실행",
    reason: "로그나 동기화가 이상하면 복구 플레이북이 첫 번째 선택이어야 합니다.",
    action: "로그 열기",
    href: "/dashboard/evolution/logs",
    tone: "danger",
  },
];

const playbookCatalog = [
  {
    title: "일일 배포 점검",
    category: "배포",
    cadence: "매일",
    trigger: "오전 9시, 열린 PR, 오래된 리뷰, 막힌 이슈",
    owner: "배포 담당",
    hook: "GitHub PR + 이슈 피드 -> PMS 보드",
    status: "진행 중",
    tone: "blue",
    steps: [
      "가장 압박이 큰 저장소부터 확인하고 머지를 막는 요소가 있는지 봅니다.",
      "열린 항목마다 오너를 명확히 지정하거나 외부 입력 대기 상태로 표시합니다.",
      "전체 상황 보고보다 모호함을 없애는 결정만 전달합니다.",
      "다음 행동을 보드에 남겨 레인이 계속 실행 가능하게 유지합니다.",
    ],
  },
  {
    title: "PR 리뷰 분류",
    category: "배포",
    cadence: "트리거 시",
    trigger: "리뷰 대기 시간이 24시간을 넘긴 PR",
    owner: "당번 리뷰어",
    hook: "GitHub 웹훅 -> 알림 -> 커맨드 센터",
    status: "준비됨",
    tone: "warning",
    steps: [
      "PR은 오래된 순서가 아니라 영향 범위가 큰 순서로 정렬합니다.",
      "빠르게 끝낼 수 있는 건 즉시 처리하고 큰 변경은 맞는 리뷰어에게 보냅니다.",
      "리뷰 큐가 릴리스 위험을 숨기고 있으면 즉시 에스컬레이션합니다.",
      "다음 체크포인트를 남겨 PR이 다시 묵묵부답 상태로 돌아가지 않게 합니다.",
    ],
  },
  {
    title: "브랜드 발행 실행",
    category: "콘텐츠",
    cadence: "매일 / 필요 시",
    trigger: "브랜드 에셋이 검토 중이거나 발행 준비 상태일 때",
    owner: "콘텐츠 담당",
    hook: "콘텐츠 큐 -> 발행 로그 -> 채널 핸드오프",
    status: "진행 중",
    tone: "green",
    steps: [
      "초안을 건드리기 전에 브랜드와 채널을 먼저 확인합니다.",
      "카피, 레퍼런스, 에셋이 모두 같은 브랜드 문맥인지 점검합니다.",
      "검토 게이트가 분명해진 뒤에만 발행으로 넘깁니다.",
      "발행 상태를 기록해 다음 실행이 실제 상태에서 이어지게 합니다.",
    ],
  },
  {
    title: "매출 후속 대응 점검",
    category: "매출",
    cadence: "매일",
    trigger: "다음 터치가 없는 신규 리드나 멈춘 거래",
    owner: "매출 담당",
    hook: "CRM 큐 -> 리마인더 -> 후속 태스크",
    status: "예정",
    tone: "warning",
    steps: [
      "빠른 후속 항목과 더 깊은 계정 작업을 분리합니다.",
      "구체적인 다음 단계가 있는 기록만 넘깁니다.",
      "거래가 움직이기 전에 사람이 응답해야 하는 항목은 표시합니다.",
      "한 번에 끝낼 수 있을 정도로 후속 리스트를 짧게 유지합니다.",
    ],
  },
  {
    title: "주간 계획 리셋",
    category: "계획",
    cadence: "주간",
    trigger: "금요일 리뷰 또는 로드맵 밀림 위험",
    owner: "PM 또는 오너",
    hook: "로드맵 레인 -> 마일스톤 리뷰 -> 주간 계획",
    status: "진행 중",
    tone: "muted",
    steps: [
      "무엇이 움직였고 무엇이 밀렸는지, 무엇을 미뤄야 하는지 확인합니다.",
      "다음 주는 각 레인마다 하나의 분명한 목표가 보이게 다시 씁니다.",
      "막힌 항목은 암시만 두지 말고 보이는 후속 상태로 옮깁니다.",
      "다음 계획 사이클을 위한 짧은 결정 로그로 마무리합니다.",
    ],
  },
  {
    title: "장애 에스컬레이션",
    category: "복구",
    cadence: "트리거 시",
    trigger: "로그, 동기화, 웹훅이 실패했고 복구 경로가 없을 때",
    owner: "당번 운영자",
    hook: "로그 -> 알림 -> 수동 개입",
    status: "치명",
    tone: "danger",
    steps: [
      "실패가 실제인지, 단순 중복 노이즈가 아닌지 확인합니다.",
      "영향받은 경로나 큐를 멈춰 문제를 먼저 봉쇄합니다.",
      "한 사람은 수정에, 다른 한 사람은 나머지 시스템 가독성 유지에 배정합니다.",
      "해결 패턴을 기록해 다음 장애 비용을 낮춥니다.",
    ],
  },
];

const automationHooks = [
  {
    title: "GitHub 이벤트",
    detail: "Pull request, 이슈, 마일스톤 이동이 배포 신호가 됩니다.",
    tone: "blue",
  },
  {
    title: "예약 점검",
    detail: "일간·주간 실행으로 반복 업무가 시야 밖으로 밀리지 않게 합니다.",
    tone: "muted",
  },
  {
    title: "수동 디스패치",
    detail: "판단이 필요한 흐름에서는 운영자가 직접 내리는 명령이 여전히 중요합니다.",
    tone: "warning",
  },
  {
    title: "장애 알림",
    detail: "무언가 깨졌다면 즉시 로그, 이슈, 복구 단계로 연결되어야 합니다.",
    tone: "danger",
  },
];

const operatingRules = [
  "모든 플레이북은 나머지가 아직 목업이어도 분명한 트리거와 오너를 가져야 합니다.",
  "자동화할 수 없는 단계도 운영자가 1분 안에 할 수 있는 행동으로 적어야 합니다.",
  "카드는 트리거, 단계, 핸드오프 지점을 모두 보여줘야 한눈에 읽힙니다.",
  "즉시 실행 항목은 시급할 때만 상단에 두고, 카탈로그 속에 묻히게 두지 않습니다.",
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
              매번 다시 발명하지 않아도 되는 반복 SOP 표면입니다. 각 플레이북에는 트리거,
              오너, 단계, 자동화 훅이 한곳에 모입니다.
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
            <h2>카테고리, 트리거, 단계, 오너, 훅</h2>
            <p>
              오늘 바로 운영해도 될 만큼 실용적이고, 나중에 자동화로 이어 붙이기에도 충분히
              명확한 목업입니다.
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
          title="가족군"
          value={String(playbookFamilies.length)}
          detail="운영 체계를 정리해 주는 반복 플레이북 그룹입니다."
          badge="구조"
          tone="blue"
        />
        <SummaryCard
          title="플레이북"
          value={String(playbookCatalog.length)}
          detail="바로 행동할 수 있을 정도로 충분히 설명된 MVP 카드입니다."
          badge="카탈로그"
          tone="green"
        />
        <SummaryCard
          title="자동화 훅"
          value={String(automationHooks.length)}
          detail="반복 업무가 기계 지원으로 넘어가는 핸드오프 지점입니다."
          badge="연결"
          tone="warning"
        />
        <SummaryCard
          title="지금 실행"
          value={String(whatToRunNow.length)}
          detail="가장 먼저 봐야 할 플레이북만 추린 목록입니다."
          badge="우선"
          tone="danger"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="지금 실행"
          title="즉시 실행할 플레이북"
          description="이 페이지에서 가장 쉽게 바로 실행할 수 있어야 하는 반복 SOP만 모았습니다."
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
          title="플레이북 가족군"
          description="운영 의도별로 묶어두면 맞는 SOP를 훨씬 쉽게 찾을 수 있습니다."
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
        description="각 카드는 운영 문맥, 트리거, 오너, 훅, 단계별 경로를 보여줍니다."
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
                  <dt>오너</dt>
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
          title="플레이북이 넘겨지는 지점"
          description="SOP 라이브러리가 기본적으로 연결해 나가야 할 통합 지점들입니다."
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
          description="좋은 플레이북은 짧고, 명시적이고, 넘기기 쉬워야 합니다."
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
