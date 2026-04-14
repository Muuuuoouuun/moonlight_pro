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
  return new Intl.DateTimeFormat("en-US", {
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
        "The current project signal should be checked before the day picks up speed.",
      owner: "Work OS",
      tone: "warning",
    },
    {
      title: checks.find((item) => item.title.toLowerCase().includes("webhook"))?.title ?? "Webhook intake",
      detail:
        checks.find((item) => item.title.toLowerCase().includes("webhook"))?.detail ??
        "Validate the engine path before relying on fresh signals.",
      owner: "Automations",
      tone: "blue",
    },
    {
      title: repoWatchRows[0]?.contextLabel ? `${repoWatchRows[0].contextLabel} local repo` : activity[0]?.title ?? "Closeout gap",
      detail:
        repoWatchRows[0]?.repository
          ? `${repoWatchRows[0].repository} is currently ${repoWatchRows[0].statusLabel}. ${repoWatchRows[0].detail}`
          : activity[0]?.detail ??
            "Capture the last visible change so the morning brief does not lose the next action.",
      owner: repoWatchRows[0]?.contextLabel || "Evolution",
      tone: repoWatchRows[0]?.statusTone || "muted",
    },
  ];

  const approvals = [
    {
      title: "Milestone refresh approval",
      detail:
        updates[0]?.detail ?? "Confirm the highest-priority project update before the queue expands.",
      owner: "Work OS",
      tone: buildPriorityTone(0),
    },
    {
      title: "Webhook smoke test sign-off",
      detail:
        checks.find((item) => item.title.toLowerCase().includes("webhook"))?.detail ??
        "Keep the intake path visible and easy to validate.",
      owner: "Automations",
      tone: buildPriorityTone(1),
    },
    {
      title: repoWatchRows[0]?.contextLabel ? `${repoWatchRows[0].contextLabel} repo sync` : "Content publish pass",
      detail: repoWatchRows[0]?.repository
        ? `${repoWatchRows[0].repository} should be ${repoWatchRows[0].aheadCount > 0 ? "pushed" : repoWatchRows[0].behindCount > 0 ? "pulled" : "cleaned up"} before the next work block.`
        : "Release the next public piece or push it back into review with a clear reason.",
      owner: repoWatchRows[0]?.contextLabel || "Content",
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
            <h1>Morning operator brief</h1>
            <p className="hero-lede">
              A compact surface for the first scan of the day. It puts focus, risk, approvals, and
              next actions in one place so the morning starts with direction instead of noise.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/work/pms">
                Open PMS
              </Link>
              <Link className="button button-secondary" href="/dashboard/work">
                Open Work OS
              </Link>
              <Link className="button button-ghost" href="/dashboard/automations/integrations">
                Check Integrations
              </Link>
            </div>
          </div>

          <div className="hero-panel">
            <p className="section-kicker">Brief status</p>
            <h2>{briefLabel}</h2>
            <p>
              Start here, resolve the highest-leverage decision, then drop into the lane that needs
              movement first. The page is intentionally short and scan-friendly.
            </p>
            <div className="hero-chip-row">
              <span className="chip">Morning scan</span>
              <span className="chip">High signal</span>
              <span className="chip">Operator mode</span>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="Daily brief summary metrics">
        <SummaryCard
          title="Today Focus"
          value={String(focusCount)}
          detail="The main items that should frame the first work block."
          badge="Focus"
          tone="green"
        />
        <SummaryCard
          title="Risk Watch"
          value={String(riskCount)}
          detail="Signals that could interrupt the morning if they go unaddressed."
          badge="Watch"
          tone="warning"
        />
        <SummaryCard
          title="Pending Approvals"
          value={String(approvalCount)}
          detail="Decisions or sign-offs that should not sit hidden in the queue."
          badge="Decide"
          tone="blue"
        />
        <SummaryCard
          title="Cross-Lane Feed"
          value={String(feedCount)}
          detail="Recent movement across work, automation, and system checks."
          badge="Live"
          tone="muted"
        />
        <SummaryCard
          title="Project Repos"
          value={String(repoCount)}
          detail="Local git repositories currently mapped into the operating shell."
          badge="Mapped"
          tone="green"
        />
      </section>

      <SectionCard
        kicker="Today Focus"
        title="What should move first"
        description="Keep the first block short: choose the move that unlocks the rest of the day."
        action={
          <Link className="button button-secondary" href="/dashboard/work">
            Open Work OS
          </Link>
        }
      >
        <div className="project-grid">
          {focusItems.map((item, index) => (
            <article className="project-card" key={item.title}>
              <div className="project-head">
                <div>
                  <h3>{item.title}</h3>
                  <p>Focus {String(index + 1).padStart(2, "0")}</p>
                </div>
                <span className="legend-chip" data-tone={buildPriorityTone(index)}>
                  Priority
                </span>
              </div>
              <p className="check-detail">{item.detail}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="Risk watch"
          title="What could interrupt the morning"
          description="This is the short list of things most likely to create drift, delay, or hidden rework."
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
          kicker="Pending approvals"
          title="Decision queue"
          description="Anything that needs a human sign-off should stay visible until it is either approved or pushed back."
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
          kicker="Cross-lane feed"
          title="Recent movement across the OS"
          description="Use this feed to see if work, automation, or the system itself changed since the last scan."
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
          kicker="Next 3 actions"
          title="What to do next"
          description="These actions are intentionally small enough to execute before the day fragments."
        >
          <div className="template-grid">
            {nextActions.map((item) => (
              <div className="template-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <Link className="button button-secondary" href={item.href}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Project repo watch"
        title="Local branch and sync posture"
        description="This keeps the morning grounded in the actual repo state, not only dashboard summaries."
      >
        <div className="template-grid">
          {repoWatchRows.map((item) => (
            <div className="template-row" key={item.contextValue}>
              <div>
                <strong>{item.contextLabel}</strong>
                <p>{item.repository || "No remote repository detected yet."}</p>
                <p>{item.detail}</p>
              </div>
              <div className="inline-legend">
                <span className="legend-chip" data-tone={item.statusTone}>
                  {item.statusLabel}
                </span>
                <span className="legend-chip" data-tone="muted">
                  {item.branch || "no branch"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
