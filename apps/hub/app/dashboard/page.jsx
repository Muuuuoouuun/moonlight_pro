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
        kicker="GitHub"
        title="Delivery cockpit entry"
        description="GitHub-backed PMS and roadmap are discoverable from the hub home before you enter the Work OS lanes."
        action={
          <Link className="button button-secondary" href="/dashboard/work/pms">
            Open GitHub PMS
          </Link>
        }
      >
        <div className="project-grid">
          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>PMS pulse</h3>
                <p>Execution pressure, review queue, and blocked work.</p>
              </div>
              <span className="legend-chip" data-tone="blue">
                MVP
              </span>
            </div>
            <div className="inline-legend">
              <span className="legend-chip" data-tone="warning">
                Review requests
              </span>
              <span className="legend-chip" data-tone="danger">
                Blockers
              </span>
              <span className="legend-chip" data-tone="green">
                Shipping
              </span>
            </div>
            <dl className="detail-stack">
              <div>
                <dt>Surface</dt>
                <dd>Open issues, PRs needing review, overdue follow-up, and stale work.</dd>
              </div>
              <div>
                <dt>Best for</dt>
                <dd>Daily delivery checks and quick operator decisions.</dd>
              </div>
            </dl>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/work/pms">
                Open PMS
              </Link>
              <Link className="button button-secondary" href="/dashboard/work">
                View Work OS
              </Link>
            </div>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>Roadmap view</h3>
                <p>Milestones, horizon planning, and delivery risk.</p>
              </div>
              <span className="legend-chip" data-tone="blue">
                Now / Next / Later
              </span>
            </div>
            <div className="inline-legend">
              <span className="legend-chip">Milestones</span>
              <span className="legend-chip" data-tone="warning">
                Slip risk
              </span>
              <span className="legend-chip" data-tone="muted">
                Backlog
              </span>
            </div>
            <dl className="detail-stack">
              <div>
                <dt>Surface</dt>
                <dd>Roadmap milestones, release horizons, and unresolved dependencies.</dd>
              </div>
              <div>
                <dt>Best for</dt>
                <dd>Planning the next delivery window and keeping scope visible.</dd>
              </div>
            </dl>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/work/roadmap">
                Open Roadmap
              </Link>
              <Link className="button button-secondary" href="/dashboard/work/pms">
                Compare with PMS
              </Link>
            </div>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>Integration setup</h3>
                <p>Connection state, sync health, and repo mapping.</p>
              </div>
              <span className="legend-chip" data-tone="muted">
                GitHub
              </span>
            </div>
            <div className="inline-legend">
              <span className="legend-chip" data-tone="green">
                Connected
              </span>
              <span className="legend-chip" data-tone="warning">
                Pending
              </span>
              <span className="legend-chip" data-tone="danger">
                Error
              </span>
            </div>
            <dl className="detail-stack">
              <div>
                <dt>Surface</dt>
                <dd>Repo registration, sync cadence, and webhook intake health.</dd>
              </div>
              <div>
                <dt>Best for</dt>
                <dd>Wiring GitHub into the delivery model without changing the shell.</dd>
              </div>
            </dl>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/automations/integrations">
                Open Integrations
              </Link>
              <Link className="button button-secondary" href="/dashboard/evolution/logs">
                Check Logs
              </Link>
            </div>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>Signal flow</h3>
                <p>How GitHub events become hub objects.</p>
              </div>
              <span className="legend-chip" data-tone="green">
                Mockup
              </span>
            </div>
            <div className="inline-legend">
              <span className="legend-chip" data-tone="blue">
                Issues
              </span>
              <span className="legend-chip" data-tone="blue">
                PRs
              </span>
              <span className="legend-chip" data-tone="blue">
                Milestones
              </span>
            </div>
            <dl className="detail-stack">
              <div>
                <dt>Flow</dt>
                <dd>GitHub event intake feeds the PMS pulse, then promotes milestone data into roadmap.</dd>
              </div>
              <div>
                <dt>Operator action</dt>
                <dd>Use the hub home to jump into the right lane before the day fragments.</dd>
              </div>
            </dl>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/automations/integrations">
                Review Setup
              </Link>
              <Link className="button button-secondary" href="/dashboard/work/roadmap">
                Open Delivery Plan
              </Link>
            </div>
          </article>
        </div>
      </SectionCard>

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
