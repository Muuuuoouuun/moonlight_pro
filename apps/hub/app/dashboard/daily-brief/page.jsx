import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  activityFeed as fallbackActivityFeed,
  commandCenterQueue as fallbackCommandCenterQueue,
  projectUpdates as fallbackProjectUpdates,
  systemChecks as fallbackSystemChecks,
  todayFocus as fallbackTodayFocus,
} from "@/lib/dashboard-data";
import { getDashboardPageData, getLocalProjectRepositoryData } from "@/lib/server-data";

const BRIEF_TIMEZONE = "Asia/Seoul";

function formatBriefDate(value = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: BRIEF_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(value);
}

function pickItems(primary, fallback) {
  return primary?.length ? primary : fallback;
}

function buildPriorityTone(index) {
  if (index === 0) {
    return "warning";
  }

  if (index === 1) {
    return "blue";
  }

  return "muted";
}

function buildCrossLaneFeed(updates, checks, activity) {
  const feed = [];

  updates.slice(0, 2).forEach((item) => {
    feed.push({
      lane: "Work OS",
      title: item.title,
      detail: item.detail,
      time: item.time,
      tone: item.tone,
    });
  });

  checks.slice(0, 2).forEach((item) => {
    feed.push({
      lane: "System",
      title: item.title,
      detail: item.detail,
      time: item.value,
      tone: item.value === "Online" || item.value === "Tracked" || item.value === "Ready" ? "green" : "blue",
    });
  });

  activity.slice(0, 2).forEach((item) => {
    feed.push({
      lane: "Hub",
      title: item.title,
      detail: item.detail,
      time: item.time,
      tone: "muted",
    });
  });

  return feed.slice(0, 5);
}

export default async function DailyBriefPage() {
  const localRepositoryData = getLocalProjectRepositoryData();
  const { activityFeed, projectUpdates, systemChecks, todayFocus } = await getDashboardPageData();

  const focusItems = pickItems(todayFocus, fallbackTodayFocus);
  const updates = pickItems(projectUpdates, fallbackProjectUpdates);
  const checks = pickItems(systemChecks, fallbackSystemChecks);
  const activity = pickItems(activityFeed, fallbackActivityFeed);
  const commandQueue = pickItems(fallbackCommandCenterQueue, fallbackCommandCenterQueue);
  const repoAttentionItems = localRepositoryData.projects.filter(
    (item) => item.dirtyCount > 0 || item.aheadCount > 0 || item.behindCount > 0,
  );
  const repoWatchRows = (repoAttentionItems.length ? repoAttentionItems : localRepositoryData.projects).slice(0, 4);

  const riskItems = [
    {
      title: updates.find((item) => item.tone === "warning")?.title ?? "Project lane drift",
      detail:
        updates.find((item) => item.tone === "warning")?.detail ??
        "하루가 속도를 내기 전에 현재 프로젝트 신호를 먼저 확인해야 합니다.",
      owner: "워크 OS",
      tone: "warning",
    },
    {
      title: checks.find((item) => item.title.toLowerCase().includes("webhook"))?.title ?? "웹훅 인입",
      detail:
        checks.find((item) => item.title.toLowerCase().includes("webhook"))?.detail ??
        "새 신호를 믿기 전에 엔진 경로부터 검증해야 합니다.",
      owner: "자동화",
      tone: "blue",
    },
    {
      title: repoWatchRows[0]?.contextLabel ? `${repoWatchRows[0].contextLabel} 로컬 저장소` : activity[0]?.title ?? "마감 공백",
      detail:
        repoWatchRows[0]?.repository
          ? `${repoWatchRows[0].repository} 상태는 현재 ${repoWatchRows[0].statusLabel}입니다. ${repoWatchRows[0].detail}`
          : activity[0]?.detail ??
            "가장 최근 변화를 남겨서 아침 브리프가 다음 액션을 잃지 않게 만듭니다.",
      owner: repoWatchRows[0]?.contextLabel || "개선",
      tone: repoWatchRows[0]?.statusTone || "muted",
    },
  ];

  const approvals = [
    {
      title: "마일스톤 갱신 승인",
      detail:
        updates[0]?.detail ?? "큐가 커지기 전에 우선순위가 가장 높은 프로젝트 업데이트를 확정합니다.",
      owner: "워크 OS",
      tone: buildPriorityTone(0),
    },
    {
      title: "웹훅 스모크 테스트 승인",
      detail:
        checks.find((item) => item.title.toLowerCase().includes("webhook"))?.detail ??
        "인입 경로가 눈에 보이고 검증하기 쉬운 상태를 유지합니다.",
      owner: "자동화",
      tone: buildPriorityTone(1),
    },
    {
      title: repoWatchRows[0]?.contextLabel ? `${repoWatchRows[0].contextLabel} 저장소 동기화` : "콘텐츠 발행 확인",
      detail: repoWatchRows[0]?.repository
        ? `${repoWatchRows[0].repository} 저장소는 다음 작업 블록 전에 ${repoWatchRows[0].aheadCount > 0 ? "푸시" : repoWatchRows[0].behindCount > 0 ? "풀" : "정리"}가 필요합니다.`
        : "다음 공개 콘텐츠를 발행하거나, 이유를 분명히 적고 다시 리뷰로 돌립니다.",
      owner: repoWatchRows[0]?.contextLabel || "콘텐츠",
      tone: repoWatchRows[0]?.statusTone || buildPriorityTone(2),
    },
  ];

  const crossLaneFeed = buildCrossLaneFeed(updates, checks, activity);
  const nextActions = [
    ...repoWatchRows.slice(0, 2).map((item) => ({
      title: `${item.contextLabel} repo check`,
      detail: `${item.repository || item.contextLabel} · ${item.detail}`,
      href: `/dashboard/work/management?project=${item.contextValue}`,
    })),
    ...commandQueue.slice(0, 3).map((item, index) => ({
      title: item.title,
      detail: item.detail,
      href:
        index === 0
          ? "/dashboard/work/pms"
          : index === 1
            ? "/dashboard/automations/integrations"
            : "/dashboard/evolution/logs",
    })),
  ].slice(0, 3);

  const briefLabel = formatBriefDate();
  const focusCount = focusItems.length;
  const riskCount = riskItems.length;
  const approvalCount = approvals.length;
  const feedCount = crossLaneFeed.length;
  const repoCount = localRepositoryData.totals.connectedRepositoryCount;

  return (
    <div className="app-page">
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Daily Brief</p>
            <h1>아침 운영 브리프</h1>
            <p className="hero-lede">
              하루 첫 스캔을 위한 압축된 화면입니다. 집중, 리스크, 승인 대기, 다음 액션을
              한곳에 모아서 아침이 소음이 아니라 방향으로 시작되게 합니다.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/work/pms">
                PMS 열기
              </Link>
              <Link className="button button-secondary" href="/dashboard/work">
                워크 OS 열기
              </Link>
              <Link className="button button-ghost" href="/dashboard/automations/integrations">
                연동 확인
              </Link>
            </div>
          </div>

          <div className="hero-panel">
            <p className="section-kicker">브리프 상태</p>
            <h2>{briefLabel}</h2>
            <p>
              여기서 시작해 영향력이 가장 큰 결정을 먼저 정리하고, 가장 먼저 움직여야 할
              레인으로 들어가면 됩니다. 페이지는 의도적으로 짧고 훑기 쉽게 만들었습니다.
            </p>
            <div className="hero-chip-row">
              <span className="chip">아침 스캔</span>
              <span className="chip">고신호</span>
              <span className="chip">운영 모드</span>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="데일리 브리프 요약 지표">
        <SummaryCard
          title="오늘의 집중"
          value={String(focusCount)}
          detail="첫 작업 블록의 기준이 되어야 하는 핵심 항목들입니다."
          badge="집중"
          tone="green"
        />
        <SummaryCard
          title="리스크 감시"
          value={String(riskCount)}
          detail="손보지 않으면 아침 흐름을 끊을 수 있는 신호들입니다."
          badge="감시"
          tone="warning"
        />
        <SummaryCard
          title="승인 대기"
          value={String(approvalCount)}
          detail="큐 안에 숨어 있으면 안 되는 판단과 사인오프입니다."
          badge="판단"
          tone="blue"
        />
        <SummaryCard
          title="레인 간 피드"
          value={String(feedCount)}
          detail="워크, 자동화, 시스템 점검 전반의 최근 움직임입니다."
          badge="실시간"
          tone="muted"
        />
        <SummaryCard
          title="프로젝트 저장소"
          value={String(repoCount)}
          detail="현재 운영 셸에 매핑된 로컬 git 저장소 수입니다."
          badge="매핑"
          tone="green"
        />
      </section>

      <SectionCard
        kicker="오늘의 집중"
        title="가장 먼저 움직일 것"
        description="첫 블록은 짧게 유지하고, 나머지 하루를 여는 액션 하나를 고릅니다."
        action={
          <Link className="button button-secondary" href="/dashboard/work">
            워크 OS 열기
          </Link>
        }
      >
        <div className="project-grid">
          {focusItems.map((item, index) => (
            <article className="project-card" key={item.title}>
              <div className="project-head">
                <div>
                  <h3>{item.title}</h3>
                  <p>집중 {String(index + 1).padStart(2, "0")}</p>
                </div>
                <span className="legend-chip" data-tone={buildPriorityTone(index)}>
                  우선
                </span>
              </div>
              <p className="check-detail">{item.detail}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="리스크 감시"
          title="아침 흐름을 끊을 수 있는 것"
          description="드리프트, 지연, 숨은 재작업을 만들 가능성이 큰 항목만 짧게 남겼습니다."
        >
          <ul className="note-list">
            {riskItems.map((item) => (
              <li className="note-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.owner}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          kicker="승인 대기"
          title="판단 큐"
          description="사람의 사인오프가 필요한 일은 승인되거나 되돌려질 때까지 계속 보여야 합니다."
        >
          <div className="template-grid">
            {approvals.map((item) => (
              <div className="template-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.owner}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="레인 간 피드"
          title="OS 전반의 최근 움직임"
          description="지난 스캔 이후 워크, 자동화, 시스템 자체에 변화가 있었는지 이 피드에서 봅니다."
        >
          <div className="timeline">
            {crossLaneFeed.map((item) => (
              <div className="timeline-item" key={`${item.lane}-${item.title}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.lane}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {item.time}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="다음 세 가지 액션"
          title="바로 다음에 할 일"
          description="하루가 흩어지기 전에 바로 실행할 수 있을 만큼 작은 액션만 남겼습니다."
        >
          <div className="template-grid">
            {nextActions.map((item) => (
              <div className="template-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <Link className="button button-secondary" href={item.href}>
                  열기
                </Link>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="프로젝트 저장소 감시"
        title="로컬 브랜치와 동기화 상태"
        description="대시보드 요약뿐 아니라 실제 저장소 상태를 기준으로 아침 판단을 잡습니다."
      >
        <div className="template-grid">
          {repoWatchRows.map((item) => (
            <div className="template-row" key={item.contextValue}>
              <div>
                <strong>{item.contextLabel}</strong>
                <p>{item.repository || "아직 원격 저장소가 감지되지 않았습니다."}</p>
                <p>{item.detail}</p>
              </div>
              <div className="inline-legend">
                <span className="legend-chip" data-tone={item.statusTone}>
                  {item.statusLabel}
                </span>
                <span className="legend-chip" data-tone="muted">
                  {item.branch || "브랜치 없음"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
