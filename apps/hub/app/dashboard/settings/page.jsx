import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  boolFilter,
  countRows,
  fetchRows,
  formatTimestamp,
  getDashboardPageData,
  getLocalProjectRepositoryData,
  inFilter,
} from "@/lib/server-data";

export const dynamic = "force-dynamic";

function isSet(value) {
  return Boolean(value && String(value).trim());
}

function countLabel(value) {
  return value == null ? "MVP" : String(value);
}

function countTone(value) {
  if (value == null) {
    return "warning";
  }

  return value > 0 ? "green" : "muted";
}

function envTone(value) {
  return isSet(value) ? "green" : "danger";
}

function envLabel(value) {
  return isSet(value) ? "Configured" : "Missing";
}

function stateLabel(value) {
  if (value == null) {
    return "Fallback";
  }

  if (value > 0) {
    return "Live";
  }

  return "Empty";
}

export default async function SettingsPage() {
  const localRepositoryData = getLocalProjectRepositoryData();
  const [
    dashboardData,
    integrationConnections,
    connectedConnections,
    pendingConnections,
    errorConnections,
    webhookCount,
    activeApiKeys,
    secretRotations,
    syncRuns,
    failedSyncRuns,
    exportFailures,
    unresolvedErrors,
    projectCount,
    contentCount,
    leadCount,
  ] = await Promise.all([
    getDashboardPageData(),
    countRows("integration_connections"),
    countRows("integration_connections", [["status", "eq.connected"]]),
    countRows("integration_connections", [["status", "eq.pending"]]),
    countRows("integration_connections", [["status", "eq.error"]]),
    countRows("webhook_endpoints"),
    countRows("api_keys", [["is_active", boolFilter(true)]]),
    countRows("secret_rotations"),
    countRows("sync_runs"),
    countRows("sync_runs", [["status", "eq.failure"]]),
    countRows("export_logs", [["status", "eq.failed"]]),
    countRows("error_logs", [["resolved", boolFilter(false)]]),
    countRows("projects", [["status", inFilter(["active", "blocked"])]]),
    countRows("content_items"),
    countRows("leads", [["status", inFilter(["new", "qualified", "nurturing"])]]),
  ]);

  const recentSyncRuns = await fetchRows("sync_runs", { limit: 4, order: "started_at.desc" });
  const recentExports = await fetchRows("export_logs", { limit: 4, order: "created_at.desc" });

  const envChecks = [
    { title: "Supabase URL", detail: "Database read path for live posture checks.", value: process.env.SUPABASE_URL },
    {
      title: "Supabase role key",
      detail: "Required for read-only row counts and delivery health.",
      value: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    },
    {
      title: "GitHub token",
      detail: "Used for GitHub-backed PMS and roadmap visibility.",
      value: process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GH_TOKEN,
    },
    {
      title: "GitHub repos",
      detail: "Repository map for the delivery cockpit.",
      value: process.env.GITHUB_REPOSITORIES,
    },
    {
      title: "Projects root",
      detail: "Local project root used to auto-map workspace repositories.",
      value: process.env.COM_MOON_PROJECTS_ROOT || "/Users/bigmac_moon/Desktop/Projects",
    },
    {
      title: "Engine URL",
      detail: "Used when the shell can see health and route posture.",
      value: process.env.COM_MOON_ENGINE_URL || process.env.NEXT_PUBLIC_APP_URL,
    },
    {
      title: "Runtime",
      detail: "Settings page is rendering from the live server runtime.",
      value: process.env.NODE_ENV || "development",
    },
  ];

  const envReadyCount = envChecks.filter((item) => isSet(item.value)).length;
  const liveSourceCount = [projectCount, contentCount, leadCount, webhookCount, syncRuns].filter(
    (value) => value != null,
  ).length;
  const safeguardCount = [activeApiKeys, secretRotations, exportFailures, unresolvedErrors].filter(
    (value) => value != null,
  ).length;

  const sourceRows = [
    {
      title: "Projects",
      count: projectCount,
      detail: "Active and blocked work stay visible for delivery planning.",
      note: "Work OS",
    },
    {
      title: "Content items",
      count: contentCount,
      detail: "Drafts, reviews, and published rows feed the content lanes.",
      note: "Content",
    },
    {
      title: "Leads",
      count: leadCount,
      detail: "Working funnel rows surface revenue motion before it goes stale.",
      note: "Revenue",
    },
    {
      title: "Webhook endpoints",
      count: webhookCount,
      detail: "Intake routes stay explicit so integrations are easy to audit.",
      note: "Automations",
    },
    {
      title: "Sync runs",
      count: syncRuns,
      detail: "Sync activity shows whether the engine is actually moving data.",
      note: "Engine",
    },
  ];

  const safeguardRows = [
    {
      title: "Secret rotation audit",
      detail: `${countLabel(secretRotations)} rotation records captured for this workspace.`,
      tone: countTone(secretRotations),
    },
    {
      title: "Active API keys",
      detail: `${countLabel(activeApiKeys)} keys remain active for integrations and internal tools.`,
      tone: countTone(activeApiKeys),
    },
    {
      title: "Export trail",
      detail: `${countLabel(exportFailures)} failed export records need review before release work resumes.`,
      tone: exportFailures == null ? "warning" : exportFailures > 0 ? "danger" : "green",
    },
    {
      title: "Open errors",
      detail: `${countLabel(unresolvedErrors)} unresolved error logs remain in the learning loop.`,
      tone: unresolvedErrors == null ? "warning" : unresolvedErrors > 0 ? "danger" : "green",
    },
  ];

  const liveRoutes = dashboardData.webhookEndpoints?.slice(0, 4) || [];
  const systemChecks = dashboardData.systemChecks || [];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Environment, config, and operating safeguards</h1>
        <p>
          This page is the shell&apos;s control room for posture checks. It shows what is configured,
          what is ready to wire, which data sources are live, and where the machine still needs guardrails.
        </p>
        <p className="page-context">
          <strong>{`${envReadyCount}/${envChecks.length} env checks ready`}</strong>
          <span>
            {dashboardData.systemChecks?.length
              ? `${dashboardData.systemChecks.length} live shell checks are readable right now.`
              : "System checks fall back to mockup state until live health is reachable."}
          </span>
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/dashboard/automations/integrations">
            Open Integrations
          </Link>
          <Link className="button button-secondary" href="/dashboard/evolution/logs">
            Review Logs
          </Link>
          <Link className="button button-ghost" href="/dashboard/work/pms">
            Open PMS
          </Link>
        </div>
      </section>

      <section className="summary-grid" aria-label="Settings summary metrics">
        <SummaryCard
          title="Environment"
          value={`${envReadyCount}/${envChecks.length}`}
          detail="Read-only env posture for the hub shell and GitHub delivery lane."
          badge="Configured"
          tone={envReadyCount === envChecks.length ? "green" : "warning"}
        />
        <SummaryCard
          title="Integrations"
          value={countLabel(connectedConnections)}
          detail="Connected integrations are the first sign that the system is ready."
          badge={countLabel(integrationConnections)}
          tone={connectedConnections == null ? "warning" : "blue"}
        />
        <SummaryCard
          title="Project repos"
          value={String(localRepositoryData.totals.connectedRepositoryCount)}
          detail="Local repositories mapped from the Projects workspace into the hub shell."
          badge={String(localRepositoryData.totals.trackedProjectCount)}
          tone="green"
        />
        <SummaryCard
          title="Data sources"
          value={countLabel(liveSourceCount)}
          detail="Projects, content, revenue, webhook, and sync lanes are readable."
          badge="Live"
          tone={liveSourceCount > 0 ? "green" : "warning"}
        />
        <SummaryCard
          title="Safeguards"
          value={countLabel(safeguardCount)}
          detail="Secrets, exports, and error handling stay visible before they spread."
          badge="Guarded"
          tone={unresolvedErrors > 0 || exportFailures > 0 ? "warning" : "green"}
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Environment"
          title="Config posture"
          description="The settings screen should show what the shell can already trust, not just what still needs to be wired."
        >
          <div className="template-grid">
            {envChecks.map((item) => (
              <div className="template-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={envTone(item.value)}>
                  {envLabel(item.value)}
                </span>
              </div>
            ))}
          </div>

          <div className="timeline" style={{ marginTop: "1rem" }}>
            {systemChecks.length ? (
              systemChecks.map((item) => (
                <div className="timeline-item" key={item.title}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone="blue">
                      Live check
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <span className="muted tiny">{item.value}</span>
                </div>
              ))
            ) : (
              <div className="timeline-item">
                <strong>Health route pending</strong>
                <p>The shell is still waiting on a live engine health signal.</p>
                <span className="muted tiny">Mockup</span>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Integrations"
          title="Readiness and intake"
          description="This lane answers a simple question: which connections are active enough to trust in a delivery cycle?"
        >
          <div className="project-grid">
            <article className="project-card">
              <div className="project-head">
                <div>
                  <h3>Connection posture</h3>
                  <p>GitHub, engine, and internal sync routes.</p>
                </div>
                <span className="legend-chip" data-tone="blue">
                  {countLabel(connectedConnections)}/{countLabel(integrationConnections)}
                </span>
              </div>
              <dl className="detail-stack">
                <div>
                  <dt>Connected</dt>
                  <dd>{countLabel(connectedConnections)} integration connections are active.</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd>{countLabel(pendingConnections)} integrations still need setup or mapping.</dd>
                </div>
                <div>
                  <dt>Errors</dt>
                  <dd>{countLabel(errorConnections)} connections need inspection before the next run.</dd>
                </div>
                <div>
                  <dt>Failed syncs</dt>
                  <dd>{countLabel(failedSyncRuns)} runs still need follow-up.</dd>
                </div>
              </dl>
            </article>

            <article className="project-card">
              <div className="project-head">
                <div>
                  <h3>Route snapshot</h3>
                  <p>Webhooks and syncs visible in the shell.</p>
                </div>
                <span className="legend-chip" data-tone={countTone(webhookCount)}>
                  {stateLabel(webhookCount)}
                </span>
              </div>
              <div className="timeline">
                {liveRoutes.length ? (
                  liveRoutes.map((item) => (
                    <div className="timeline-item" key={item.name}>
                      <div className="inline-legend">
                        <span className="legend-chip" data-tone={item.tone || "blue"}>
                          {item.status}
                        </span>
                      </div>
                      <strong>{item.name}</strong>
                      <p>{item.note}</p>
                    </div>
                  ))
                ) : (
                  <div className="timeline-item">
                    <strong>No webhook routes yet</strong>
                    <p>Routes will appear here once the integration layer is registered.</p>
                    <span className="muted tiny">Mockup</span>
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className="timeline" style={{ marginTop: "1rem" }}>
            {(recentSyncRuns?.length ? recentSyncRuns : []).slice(0, 4).map((item) => (
              <div className="timeline-item" key={item.id || `${item.status}-${item.started_at}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.status === "success" ? "green" : item.status === "failure" ? "danger" : "warning"}>
                    {item.status}
                  </span>
                </div>
                <strong>{item.connection_id ? `Sync run ${item.connection_id}` : "Sync run"}</strong>
                <p>{item.error_message || "Run captured for intake visibility."}</p>
                <span className="muted tiny">{formatTimestamp(item.finished_at || item.started_at)}</span>
              </div>
            ))}
            {!recentSyncRuns?.length ? (
              <div className="timeline-item">
                <strong>Sync history waiting for data</strong>
                <p>Once a sync fires, the latest run will appear here with status and time.</p>
                <span className="muted tiny">Mockup</span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="Data sources"
          title="Source state and coverage"
          description="Settings should make it obvious which sources are live, which are partially wired, and which are still mockups."
        >
          <div className="project-grid">
            {sourceRows.map((item) => (
              <article className="project-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.note}</p>
                  </div>
                  <span className="legend-chip" data-tone={countTone(item.count)}>
                    {stateLabel(item.count)}
                  </span>
                </div>
                <p className="summary-value" style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>
                  {countLabel(item.count)}
                </p>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Projects"
          title="Workspace repository mapping"
          description="These local repos are the fastest way to bind Work OS contexts to real project work and GitHub remotes."
        >
          <div className="template-grid">
            {localRepositoryData.projects.map((item) => (
              <div className="template-row" key={item.contextValue}>
                <div>
                  <strong>{item.contextLabel}</strong>
                  <p>{item.repository || "No remote repository detected yet."}</p>
                  <p>{item.detail}</p>
                  <p>{item.path}</p>
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

      <div className="split-grid">
        <SectionCard
          kicker="Safeguards"
          title="Operating contract"
          description="The page should encode the rules that keep the shell safe even when integrations or data go missing."
        >
          <ul className="note-list">
            {safeguardRows.map((item) => (
              <li className="note-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.tone === "danger" ? "Attention" : item.tone === "warning" ? "Review" : "Ready"}
                </span>
              </li>
            ))}
          </ul>

          <div className="template-grid" style={{ marginTop: "1rem" }}>
            <div className="template-row">
              <div>
                <strong>Read-only by default</strong>
                <p>Settings should inspect posture without mutating production state.</p>
              </div>
              <span className="legend-chip" data-tone="green">
                On
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>Redacted secrets</strong>
                <p>Only readiness, never raw credential values, should be visible here.</p>
              </div>
              <span className="legend-chip" data-tone="green">
                On
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>Fallback mode</strong>
                <p>When live data is missing, the mockup lane keeps the operator oriented.</p>
              </div>
              <span className="legend-chip" data-tone="warning">
                Ready
              </span>
            </div>
          </div>

          <div className="timeline" style={{ marginTop: "1rem" }}>
            {(recentExports?.length ? recentExports : []).map((item) => (
              <div className="timeline-item" key={item.id || `${item.status}-${item.created_at}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.status === "completed" ? "green" : item.status === "failed" ? "danger" : "warning"}>
                    {item.status}
                  </span>
                </div>
                <strong>{item.export_type || "Export"}</strong>
                <p>{item.status === "failed" ? "Export failed and needs operator review." : "Export activity was captured for auditability."}</p>
                <span className="muted tiny">{formatTimestamp(item.created_at)}</span>
              </div>
            ))}
            {!recentExports?.length ? (
              <div className="timeline-item">
                <strong>No export logs yet</strong>
                <p>Once export actions exist, this lane will show the newest audit entry.</p>
                <span className="muted tiny">Mockup</span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Mockup"
        title="Future settings surfaces"
        description="These are the next controls to grow into once the basic posture screen is stable."
      >
        <div className="project-grid">
          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>Access and roles</h3>
                <p>Who can see, edit, approve, or export from the shell.</p>
              </div>
              <span className="legend-chip" data-tone="blue">
                Planned
              </span>
            </div>
            <p className="check-detail">This should eventually govern admin actions, approvals, and restricted panels.</p>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>Backup and export</h3>
                <p>Snapshot, restore, and data portability controls.</p>
              </div>
              <span className="legend-chip" data-tone="blue">
                Planned
              </span>
            </div>
            <p className="check-detail">Exports should stay logged and restore paths should be obvious before they are needed.</p>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>Alert routing</h3>
                <p>Where sync failures, webhook errors, and unresolved logs go next.</p>
              </div>
              <span className="legend-chip" data-tone="warning">
                MVP
              </span>
            </div>
            <p className="check-detail">Start with the shell, then grow notifications once the core loops are reliable.</p>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>Policy packs</h3>
                <p>Safe operating defaults for content, integrations, and delivery.</p>
              </div>
              <span className="legend-chip" data-tone="muted">
                Spec
              </span>
            </div>
            <p className="check-detail">A policy pack can turn repeat judgment calls into reusable guardrails.</p>
          </article>
        </div>
      </SectionCard>
    </div>
  );
}
