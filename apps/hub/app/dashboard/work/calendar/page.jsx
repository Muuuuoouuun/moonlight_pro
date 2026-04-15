import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { GoogleCalendarConnectForm } from "@/components/forms/google-calendar-connect-form";
import { GoogleCalendarEventForm } from "@/components/forms/google-calendar-event-form";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getWorkCalendarPageData } from "@/lib/server-data";

const CALENDAR_TIMEZONE = "Asia/Seoul";
const HORIZON_DAYS = 14;

function formatDayKey(value) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: CALENDAR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatWeekday(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: CALENDAR_TIMEZONE,
    weekday: "short",
  }).format(value);
}

function formatMonth(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: CALENDAR_TIMEZONE,
    month: "short",
  }).format(value);
}

function formatDayNumber(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: CALENDAR_TIMEZONE,
    day: "numeric",
  }).format(value);
}

function buildHorizonDays() {
  const base = new Date();
  base.setHours(12, 0, 0, 0);

  return Array.from({ length: HORIZON_DAYS }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);

    return {
      key: formatDayKey(date),
      weekday: index === 0 ? "오늘" : index === 1 ? "내일" : formatWeekday(date),
      month: formatMonth(date),
      day: formatDayNumber(date),
    };
  });
}

function scheduleSelector(item) {
  return [item.title, item.detail, item.project, item.source, item.kind];
}

function progressSelector(item) {
  return [item.title, item.detail, item.project, item.source, item.kind];
}

function cadenceSelector(item) {
  return [item.title, item.detail, item.rhythm];
}

function resolveCalendarMessage(value) {
  if (Array.isArray(value)) {
    return resolveCalendarMessage(value[0]);
  }

  if (value === "connected") {
    return {
      tone: "green",
      title: "Google Calendar 연결이 완료되었습니다",
      detail: "OAuth 연결이 끝났습니다. 이제 외부 Google 이벤트가 공용 일정으로 함께 들어옵니다.",
    };
  }

  if (value === "oauth-denied" || value === "connect-failed" || value === "missing-google-config") {
    return {
      tone: "danger",
      title: "캘린더 연결을 점검해야 합니다",
      detail:
        value === "missing-google-config"
          ? "허브 환경 변수에 GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET가 없습니다."
          : "Google Calendar 연결이 정상적으로 끝나지 않았습니다. 연결 절차를 다시 시도하고 연동 기록을 확인하세요.",
    };
  }

  if (value === "missing-code") {
    return {
      tone: "warning",
      title: "OAuth 콜백 코드가 없습니다",
      detail: "Google이 인증 코드 없이 돌아왔습니다. 연결 절차를 다시 시도하세요.",
    };
  }

  return null;
}

function getDayTone(items) {
  if (!items.length) {
    return "muted";
  }

  if (items.some((item) => item.isOverdue || item.tone === "danger")) {
    return "danger";
  }

  if (items.some((item) => item.tone === "warning")) {
    return "warning";
  }

  if (items.some((item) => item.tone === "blue")) {
    return "blue";
  }

  return "green";
}

const CONNECTION_STATUS_LABEL = {
  connected: "연결됨",
  pending: "대기",
  disconnected: "미연결",
  ready: "준비",
  error: "오류",
};

function getConnectionStatusLabel(status) {
  return CONNECTION_STATUS_LABEL[status] || status;
}

export default async function WorkCalendarPage({ searchParams }) {
  const {
    scheduleEvents,
    progressEvents,
    cadenceRows,
    sourceStats,
    githubConnection,
    githubTotals,
    googleCalendarConnection,
    hasGoogleCalendarData,
    hasGitHubData,
  } = await getWorkCalendarPageData();
  const defaultWorkspaceId =
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    "";
  const params = (await searchParams) ?? {};
  const selectedProject = resolveWorkContext(params?.project);
  const calendarMessage = resolveCalendarMessage(params?.calendar);
  const scopedSchedule = scopeMappedItemsByWorkContext(
    scheduleEvents,
    selectedProject.value,
    scheduleSelector,
  );
  const scopedProgress = scopeMappedItemsByWorkContext(
    progressEvents,
    selectedProject.value,
    progressSelector,
  );
  const scopedCadence = scopeMappedItemsByWorkContext(
    cadenceRows,
    selectedProject.value,
    cadenceSelector,
  );
  const todayKey = formatDayKey(new Date());
  const horizonDays = buildHorizonDays();
  const horizonKeys = new Set(horizonDays.map((item) => item.key));
  const overdueItems = scopedSchedule.items.filter((item) => item.isOverdue);
  const upcomingItems = scopedSchedule.items.filter((item) => !item.isOverdue && item.dateKey >= todayKey);
  const horizonItems = upcomingItems.filter((item) => horizonKeys.has(item.dateKey));
  const horizonMap = new Map();

  horizonItems.forEach((item) => {
    const group = horizonMap.get(item.dateKey) || [];
    group.push(item);
    horizonMap.set(item.dateKey, group);
  });

  const scheduleAgenda = [...overdueItems, ...upcomingItems].slice(0, 10);
  const scopeNote =
    selectedProject.value === "all"
      ? "프로젝트, 마일스톤, 케이던스, 콘텐츠 발행 시점, GitHub 마일스톤 날짜를 한 화면에서 함께 봅니다."
      : scopedSchedule.isFallback && scopedProgress.isFallback && scopedCadence.isFallback
        ? `${selectedProject.label} 범위가 선택되었지만 날짜 기준 프로젝트 연결이 더 풍부해지기 전까지 일부 일정 행은 공용 레인을 함께 사용합니다.`
        : `${selectedProject.label} 일정 맥락이 현재 화면에 반영되어 있습니다.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">워크 OS</p>
        <h1>캘린더와 공용 일정 보기</h1>
        <p>
          이 캘린더는 기한, 마일스톤, 케이던스 블록, 발행 시점, 진행 변화를 한데 모아
          무엇이 다가오고, 무엇이 밀렸고, 무엇이 이미 움직였는지 보이게 만듭니다.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="캘린더 요약 지표">
        <SummaryCard
          title="다음 14일"
          value={String(horizonItems.length)}
          detail="현재 캘린더 지평선 안에 들어온 일정 수입니다."
          badge="일정"
          tone="blue"
        />
        <SummaryCard
          title="기한 초과"
          value={String(overdueItems.length)}
          detail="원래 일정을 이미 지나 버린 항목 수입니다."
          badge="리스크"
          tone="danger"
        />
        <SummaryCard
          title="케이던스 블록"
          value={String(scopedCadence.items.length)}
          detail="반복 리듬 항목을 공용 일정 레인 안에서 계속 보이게 유지합니다."
          badge="리듬"
          tone="warning"
        />
        <SummaryCard
          title="진행 신호"
          value={String(scopedProgress.items.length)}
          detail="최근 업데이트, 의사결정, 커밋, 발행 움직임을 집계합니다."
          badge="움직임"
          tone={hasGitHubData ? "green" : "muted"}
        />
      </section>

      {calendarMessage ? (
        <div className="status-note" data-tone={calendarMessage.tone}>
          <strong>{calendarMessage.title}</strong>
          <p>{calendarMessage.detail}</p>
        </div>
      ) : null}

      <div className="split-grid">
        <SectionCard
          kicker="연결"
          title="공용 일정 신호 현황"
          description="프로젝트, 작업, 마일스톤, 발행 이벤트, 외부 일정이 현재 캘린더 레인에 얼마나 연결되어 있는지 보여줍니다."
        >
          <div className="metric-grid">
            <article className="mini-metric">
              <span>프로젝트 기한</span>
              <strong>{sourceStats.projectDueCount}</strong>
              <p>공용 캘린더에 현재 연결된 프로젝트 단위 기한입니다.</p>
            </article>
            <article className="mini-metric">
              <span>작업 기한</span>
              <strong>{sourceStats.taskDueCount}</strong>
              <p>명시적인 기한이 붙은 액션 단위 약속입니다.</p>
            </article>
            <article className="mini-metric">
              <span>마일스톤</span>
              <strong>{sourceStats.milestoneCount}</strong>
              <p>로드맵 지평선을 만드는 허브와 GitHub의 마일스톤 날짜입니다.</p>
            </article>
            <article className="mini-metric">
              <span>공용 발행</span>
              <strong>{sourceStats.publishCount}</strong>
              <p>업무 일정 옆에서 함께 보이는 대기 또는 완료 발행 이벤트입니다.</p>
            </article>
            <article className="mini-metric">
              <span>외부 이벤트</span>
              <strong>{sourceStats.externalEventCount}</strong>
              <p>공용 일정 지평선에 합쳐진 Google Calendar 이벤트입니다.</p>
            </article>
          </div>
          <p className="footnote">
            {githubTotals.repositoryCount}개 저장소와 {hasGoogleCalendarData ? "실시간" : "대기"} Google Calendar 신호가 이 화면에 반영되고 있습니다.
          </p>
        </SectionCard>

        <SectionCard
          kicker="케이던스"
          title="공용 반복 일정"
          description="미팅, 리뷰 블록, 데일리 체크가 계속 보이도록 캘린더 바깥의 반복 프레임으로 케이던스를 사용합니다."
        >
          <div className="check-grid">
            {(scopedCadence.items.length
              ? scopedCadence.items
              : [
                  {
                    title: "아직 기록된 케이던스 블록이 없습니다",
                    rhythm: "대기",
                    detail: "허브 안에 운영 리듬이 기록되면 반복 체크가 여기에 표시됩니다.",
                    statusTone: "muted",
                    statusLabel: "대기",
                  },
                ]
            ).map((item) => (
              <article className="check-card" key={`${item.title}-${item.rhythm}`}>
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
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="연동"
          title="Google Calendar 연결"
          description="공용 일정 레인에서 Google Calendar를 읽고 쓰기 위한 연결 상태를 관리합니다."
        >
          <div className="template-grid">
            <div className="template-row">
              <div>
                <strong>연결 방식</strong>
                <p>Google Calendar는 OAuth를 사용하고, 이후 읽기/쓰기 이벤트는 공용 연동 기록을 통과합니다.</p>
              </div>
              <span className="legend-chip" data-tone={googleCalendarConnection.tone}>
                {getConnectionStatusLabel(googleCalendarConnection.status)}
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>대상 캘린더</strong>
                <p>{googleCalendarConnection.calendarId}</p>
              </div>
            </div>
          </div>
          <GoogleCalendarConnectForm
            defaultWorkspaceId={defaultWorkspaceId}
            defaultCalendarId={googleCalendarConnection.calendarId}
            detail="Samsung Calendar 사용자는 같은 Google Calendar를 삼성 캘린더 앱에 동기화해 동일한 이벤트를 볼 수 있습니다."
            status={googleCalendarConnection.status}
          />
          <p className="footnote">
            Samsung Calendar의 직접 웹 API는 아직 연결되어 있지 않습니다. 지원 경로는 Galaxy 기기에서 같은 Google Calendar를 동기화해 생성·수정된 이벤트가 삼성 캘린더에도 보이게 하는 방식입니다.
          </p>
        </SectionCard>

        <SectionCard
          kicker="조정"
          title="공용 일정 생성 및 수정"
          description="이 폼은 Google Calendar에 직접 기록합니다. 새 이벤트를 만들려면 event ID를 비워 두고, 기존 이벤트를 수정하려면 값을 채워 넣습니다."
        >
          <GoogleCalendarEventForm
            defaultWorkspaceId={defaultWorkspaceId}
            defaultCalendarId={googleCalendarConnection.calendarId}
          />
        </SectionCard>
      </div>

      <SectionCard
        kicker="지평선"
        title="2주 공용 캘린더"
        description="다가오는 기한, 마일스톤, 발행 시점을 한눈에 묶습니다. 각 날짜 카드는 가장 강한 일정 신호를 먼저 보여줍니다."
      >
        <div className="calendar-grid">
          {horizonDays.map((day) => {
            const items = horizonMap.get(day.key) || [];
            const tone = getDayTone(items);

            return (
              <article
                className="calendar-day-card"
                data-tone={tone}
                data-has-events={items.length ? "true" : "false"}
                key={day.key}
              >
                <div className="calendar-day-head">
                  <div className="calendar-day-label">
                    <span>{day.weekday}</span>
                    <strong>{day.month}</strong>
                  </div>
                  <div className="calendar-day-number">
                    <strong>{day.day}</strong>
                    <span>{items.length}개 항목</span>
                  </div>
                </div>

                <div className="calendar-event-list">
                  {items.length ? (
                    items.slice(0, 3).map((item) => (
                      <div className="calendar-event-item" key={`${day.key}-${item.kind}-${item.title}`}>
                        <div className="inline-legend">
                          <span className="legend-chip" data-tone={item.tone}>
                            {item.kind}
                          </span>
                        </div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                        <span className="muted tiny">
                          {item.project} · {item.time}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="calendar-empty">
                      <strong>비어 있는 날</strong>
                      <p>아직 이 날짜에 연결된 공용 일정 항목이 없습니다.</p>
                    </div>
                  )}
                </div>

                {items.length > 3 ? <p className="footnote">+{items.length - 3}개 더 있음</p> : null}
              </article>
            );
          })}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="아젠다"
          title="다음으로 주목할 것"
          description="기한 초과 항목이 먼저 올라오고, 이후 일정은 날짜순으로 이어집니다."
        >
          <div className="calendar-agenda">
            {(scheduleAgenda.length
              ? scheduleAgenda
              : [
                  {
                    title: "아직 캘린더 항목이 없습니다",
                    detail: "기한, 마일스톤, 대기 중 발행이 기록되면 여기에 표시됩니다.",
                    time: "대기 중",
                    kind: "캘린더",
                    tone: "muted",
                    project: "공용 레인",
                    source: "공용",
                  },
                ]
            ).map((item) => (
              <article className="calendar-agenda-row" key={`${item.kind}-${item.title}-${item.time}`}>
                <div className="calendar-agenda-head">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.kind}
                  </span>
                </div>
                <div className="calendar-agenda-meta">
                  <span>{item.project}</span>
                  <span>{item.time}</span>
                  <span>{item.source}</span>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="진행"
          title="캘린더 위 최근 움직임"
          description="캘린더가 계획만이 아니라 실제 움직임까지 보여주도록, 진행 이력은 일정 옆에 붙어 있어야 합니다."
        >
          <div className="timeline">
            {(scopedProgress.items.length
              ? scopedProgress.items
              : [
                  {
                    title: "아직 포착된 진행 신호가 없습니다",
                    detail: "프로젝트 업데이트, 의사결정, 커밋, 발행 움직임은 연결된 시스템이 기록을 남기기 시작하면 여기에 표시됩니다.",
                    time: "대기 중",
                    tone: "muted",
                    kind: "진행",
                    project: "공용 레인",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.kind}-${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.kind}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <span className="muted tiny">
                  {item.project} · {item.time}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
