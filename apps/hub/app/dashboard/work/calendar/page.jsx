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
      weekday: index === 0 ? "Today" : index === 1 ? "Tomorrow" : formatWeekday(date),
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
      title: "Google Calendar connected",
      detail: "OAuth connection is complete. External Google events can now flow into the shared schedule.",
    };
  }

  if (value === "oauth-denied" || value === "connect-failed" || value === "missing-google-config") {
    return {
      tone: "danger",
      title: "Calendar connection needs attention",
      detail:
        value === "missing-google-config"
          ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing in the hub env."
          : "Google Calendar connection did not complete cleanly. Retry the connect flow and check the integration ledger.",
    };
  }

  if (value === "missing-code") {
    return {
      tone: "warning",
      title: "Missing OAuth callback code",
      detail: "Google returned without an authorization code. Retry the connection flow.",
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
  const selectedProject = resolveWorkContext(searchParams?.project);
  const calendarMessage = resolveCalendarMessage(searchParams?.calendar);
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
      ? "Projects, milestones, cadence, content publish timing, and GitHub milestone dates are visible together."
      : scopedSchedule.isFallback && scopedProgress.isFallback && scopedCadence.isFallback
        ? `${selectedProject.label} is selected, but some calendar rows still rely on the shared lane until date-linked project references are richer.`
        : `${selectedProject.label} calendar context is active.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>Calendar and shared schedule view</h1>
        <p>
          This calendar pulls together due dates, milestones, cadence blocks, publish timing, and
          progress motion so the team can see what is coming, what slipped, and what already moved.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="Calendar summary metrics">
        <SummaryCard
          title="Next 14 Days"
          value={String(horizonItems.length)}
          detail="Scheduled items currently landing in the calendar horizon."
          badge="Schedule"
          tone="blue"
        />
        <SummaryCard
          title="Overdue"
          value={String(overdueItems.length)}
          detail="Due items that have already slipped past their intended date."
          badge="Risk"
          tone="danger"
        />
        <SummaryCard
          title="Cadence Blocks"
          value={String(scopedCadence.items.length)}
          detail="Recurring rhythm rows kept visible inside the shared calendar lane."
          badge="Rhythm"
          tone="warning"
        />
        <SummaryCard
          title="Progress Signals"
          value={String(scopedProgress.items.length)}
          detail="Recent updates, decisions, commits, and publish motion."
          badge="Motion"
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
          kicker="Connection"
          title={githubConnection.title}
          description={githubConnection.detail}
        >
          <div className="metric-grid">
            <article className="mini-metric">
              <span>Projects Due</span>
              <strong>{sourceStats.projectDueCount}</strong>
              <p>Project-level due dates currently mapped into the shared calendar.</p>
            </article>
            <article className="mini-metric">
              <span>Tasks Due</span>
              <strong>{sourceStats.taskDueCount}</strong>
              <p>Action-level commitments with explicit due timing.</p>
            </article>
            <article className="mini-metric">
              <span>Milestones</span>
              <strong>{sourceStats.milestoneCount}</strong>
              <p>Hub and GitHub milestone dates that shape the roadmap horizon.</p>
            </article>
            <article className="mini-metric">
              <span>Shared Pushes</span>
              <strong>{sourceStats.publishCount}</strong>
              <p>Queued or completed publish events visible alongside work schedules.</p>
            </article>
            <article className="mini-metric">
              <span>External Events</span>
              <strong>{sourceStats.externalEventCount}</strong>
              <p>Google Calendar events merged into the shared schedule horizon.</p>
            </article>
          </div>
          <p className="footnote">
            {githubTotals.repositoryCount} repos and {hasGoogleCalendarData ? "live" : "pending"} Google calendar
            signals are contributing to this view.
          </p>
        </SectionCard>

        <SectionCard
          kicker="Cadence"
          title="Shared recurring schedule"
          description="Use cadence as the repeating frame around the calendar so meetings, review blocks, and daily checks stay visible."
        >
          <div className="check-grid">
            {(scopedCadence.items.length
              ? scopedCadence.items
              : [
                  {
                    title: "No cadence blocks recorded yet",
                    rhythm: "Pending",
                    detail: "Routine checks will appear here once the operating rhythm is logged inside the hub.",
                    statusTone: "muted",
                    statusLabel: "pending",
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
          kicker="Connect"
          title={googleCalendarConnection.title}
          description={googleCalendarConnection.detail}
        >
          <div className="template-grid">
            <div className="template-row">
              <div>
                <strong>Connection mode</strong>
                <p>Google Calendar uses OAuth, then event reads and writes flow through the shared integration ledger.</p>
              </div>
              <span className="legend-chip" data-tone={googleCalendarConnection.tone}>
                {googleCalendarConnection.status}
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>Calendar target</strong>
                <p>{googleCalendarConnection.calendarId}</p>
              </div>
            </div>
          </div>
          <GoogleCalendarConnectForm
            defaultWorkspaceId={defaultWorkspaceId}
            defaultCalendarId={googleCalendarConnection.calendarId}
            detail="Samsung Calendar users can surface the same events by syncing this Google calendar in the Samsung Calendar app."
            status={googleCalendarConnection.status}
          />
          <p className="footnote">
            Samsung Calendar direct web API is not wired here. The supported path is syncing the same Google calendar
            on the Galaxy device so created or adjusted events show up in Samsung Calendar too.
          </p>
        </SectionCard>

        <SectionCard
          kicker="Adjust"
          title="Create or adjust shared schedule"
          description="This form writes directly to Google Calendar. Leave the event ID empty to create a new event, or fill it to patch an existing one."
        >
          <GoogleCalendarEventForm
            defaultWorkspaceId={defaultWorkspaceId}
            defaultCalendarId={googleCalendarConnection.calendarId}
          />
        </SectionCard>
      </div>

      <SectionCard
        kicker="Horizon"
        title="Two-week shared calendar"
        description="This board keeps upcoming due dates, milestones, and publish timing in one scan. Each day card shows the strongest schedule signal first."
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
                    <span>{items.length} items</span>
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
                      <strong>Open day</strong>
                      <p>No shared schedule items are mapped here yet.</p>
                    </div>
                  )}
                </div>

                {items.length > 3 ? <p className="footnote">+{items.length - 3} more items</p> : null}
              </article>
            );
          })}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="Agenda"
          title="What needs attention next"
          description="Overdue items float to the top, then upcoming commitments follow in date order."
        >
          <div className="calendar-agenda">
            {(scheduleAgenda.length
              ? scheduleAgenda
              : [
                  {
                    title: "No calendar items yet",
                    detail: "Once due dates, milestones, or queued publishes are recorded, they will appear here.",
                    time: "Pending",
                    kind: "Calendar",
                    tone: "muted",
                    project: "Shared lane",
                    source: "Shared",
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
          kicker="Progress"
          title="Recent motion on the calendar"
          description="Progress history belongs next to scheduled work so the calendar shows not just plans, but actual movement."
        >
          <div className="timeline">
            {(scopedProgress.items.length
              ? scopedProgress.items
              : [
                  {
                    title: "No progress signals captured yet",
                    detail: "Project updates, decisions, commits, and publish motion will appear here once the linked systems write to the ledger.",
                    time: "Pending",
                    tone: "muted",
                    kind: "Progress",
                    project: "Shared lane",
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
