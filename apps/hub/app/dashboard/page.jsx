import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { navigationItems } from "@/lib/dashboard-data";
import { getDashboardPageData } from "@/lib/server-data";

export default async function DashboardPage() {
  const { activityFeed, projectUpdates, summaryStats, systemChecks, todayFocus, webhookEndpoints } =
    await getDashboardPageData();

  return (
    <div className="app-page">
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Private OS</p>
            <h1>Com_Moon Hub</h1>
            <p className="hero-lede">
              A focused control room for sales, content, operations, and the self-evolution loop.
              The shell keeps the work visible, the next action obvious, and the workflow easy to extend.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/content/studio">
                Open Content Studio
              </Link>
              <Link className="button button-secondary" href="/dashboard/work">
                Open Work OS
              </Link>
              <Link className="button button-ghost" href="/dashboard/evolution/logs">
                Review Logs
              </Link>
            </div>
          </div>

          <div className="hero-panel">
            <p className="section-kicker">Today&apos;s operating mode</p>
            <h2>Stable shell, clear lanes, ready for live wiring</h2>
            <p>
              This screen is intentionally opinionated: one place to see what matters, what is blocked,
              and where the next action should go.
            </p>
            <div className="hero-chip-row">
              <span className="chip">PWA ready</span>
              <span className="chip">Mobile first</span>
              <span className="chip">Classin Green</span>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="Hub summary metrics">
        {summaryStats.map((stat) => (
          <SummaryCard key={stat.title} {...stat} />
        ))}
      </section>

      <SectionCard
        kicker="Sections"
        title="OS lanes"
        description="The hub is organized into five operating lanes so the next decision has a home before the day gets noisy."
      >
        <div className="project-grid">
          {navigationItems
            .filter((item) => item.href !== "/dashboard")
            .map((item) => (
              <article className="project-card" key={item.href}>
                <div className="project-head">
                  <div>
                    <h3>{item.label}</h3>
                    <p>{item.description}</p>
                  </div>
                  <Link className="button button-secondary" href={item.href}>
                    Open
                  </Link>
                </div>
                <p className="check-detail">
                  {item.children?.length
                    ? `${item.children.length} focused tabs keep this lane compact and reviewable.`
                    : "Start here to get an operating summary of the whole OS."}
                </p>
              </article>
            ))}
        </div>
      </SectionCard>

      <section className="dashboard-grid">
        <div className="stack">
          <SectionCard
            kicker="Recent activity"
            title="Workspace pulse"
            description="Recent movement across projects, automations, and log capture."
          >
            <ul className="activity-list">
              {activityFeed.map((item) => (
                <li key={`${item.title}-${item.time}`} className="activity-row">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className="muted tiny">{item.time}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            kicker="Focus"
            title="Today&apos;s priority stack"
            description="Keep the day small enough to execute, but visible enough to steer."
          >
            <ul className="task-list">
              {todayFocus.map((item) => (
                <li key={item.title} className="task-item">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            kicker="Projects"
            title="Progress movement"
            description="Keep project momentum visible enough that blockers cannot hide behind busyness."
          >
            <ul className="activity-list">
              {projectUpdates.map((item) => (
                <li key={item.title} className="activity-row">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.time}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="stack">
          <SectionCard
            kicker="System"
            title="Live shell checks"
            description="The app is structured to grow into a real private OS without changing the frame."
          >
            <div className="metric-grid">
              {systemChecks.map((item) => (
                <div className="mini-metric" key={item.title}>
                  <span>{item.title}</span>
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Webhooks"
            title="Engine watch"
            description="Webhook routes are part of the operating surface because broken intake means broken momentum."
          >
            <div className="template-grid">
              {webhookEndpoints.map((item) => (
                <div className="template-row" key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.note}</p>
                  </div>
                  <span className="endpoint-pill">
                    <span>{item.method}</span>
                    <code>{item.path}</code>
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
