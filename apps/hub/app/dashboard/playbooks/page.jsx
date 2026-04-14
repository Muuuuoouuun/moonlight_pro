import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";

const playbookFamilies = [
  {
    title: "Delivery",
    detail: "GitHub PRs, issue pressure, and work that needs a fast owner.",
    count: "2 playbooks",
    tone: "blue",
    href: "/dashboard/work/pms",
  },
  {
    title: "Planning",
    detail: "Rhythm, roadmap, and the weekly reset loop.",
    count: "1 playbook",
    tone: "muted",
    href: "/dashboard/work/roadmap",
  },
  {
    title: "Content",
    detail: "Brand publish loops, queue triage, and studio handoff rules.",
    count: "1 playbook",
    tone: "green",
    href: "/dashboard/content/queue",
  },
  {
    title: "Revenue",
    detail: "Lead follow-up, account care, and deal movement checks.",
    count: "1 playbook",
    tone: "warning",
    href: "/dashboard/revenue/leads",
  },
  {
    title: "Recovery",
    detail: "Logs, failures, and anything that needs a human fast.",
    count: "1 playbook",
    tone: "danger",
    href: "/dashboard/evolution/issues",
  },
];

const whatToRunNow = [
  {
    title: "Run the Daily Delivery Sweep",
    reason: "Open PRs and blocked issues should be sorted before the day fragments.",
    action: "Open PMS",
    href: "/dashboard/work/pms",
    tone: "blue",
  },
  {
    title: "Run Content Publish Review",
    reason: "Queued assets should either move to publish or be re-scoped quickly.",
    action: "Open Content Queue",
    href: "/dashboard/content/queue",
    tone: "green",
  },
  {
    title: "Run the Weekly Planning Reset",
    reason: "Roadmap risk stays easier to correct when the lane is reviewed on schedule.",
    action: "Open Roadmap",
    href: "/dashboard/work/roadmap",
    tone: "muted",
  },
  {
    title: "Run Incident Escalation",
    reason: "If logs or syncs look off, the recovery playbook should be the first move.",
    action: "Open Logs",
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
            <p className="eyebrow">Work OS</p>
            <h1>Playbooks</h1>
            <p className="hero-lede">
              A recurring SOP surface for work that should not be rediscovered every time. Each playbook
              carries the trigger, the owner, the steps, and the automation hook in one place.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/work/pms">
                Open PMS
              </Link>
              <Link className="button button-secondary" href="/dashboard/automations/integrations">
                Review Hooks
              </Link>
              <Link className="button button-ghost" href="/dashboard/evolution/issues">
                Check Recovery
              </Link>
            </div>
          </div>

          <div className="hero-panel">
            <p className="section-kicker">Operating model</p>
            <h2>Categories, triggers, steps, owners, and hooks</h2>
            <p>
              The page is designed as a live-useful mockup: good enough to operate from today, clear
              enough to wire into automation later.
            </p>
            <div className="hero-chip-row">
              <span className="chip">Recurring SOP</span>
              <span className="chip">MVP mockup</span>
              <span className="chip">Human + automation</span>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="Playbook summary metrics">
        <SummaryCard
          title="Families"
          value={String(playbookFamilies.length)}
          detail="Recurring playbook groups that keep the operating system organized."
          badge="Structure"
          tone="blue"
        />
        <SummaryCard
          title="Playbooks"
          value={String(playbookCatalog.length)}
          detail="MVP cards that describe the work in enough detail to act on it."
          badge="Catalog"
          tone="green"
        />
        <SummaryCard
          title="Automation hooks"
          value={String(automationHooks.length)}
          detail="The handoff points where recurring work can become machine-assisted."
          badge="Hooks"
          tone="warning"
        />
        <SummaryCard
          title="Run now"
          value={String(whatToRunNow.length)}
          detail="Shortlist of the playbooks that deserve attention first."
          badge="Priority"
          tone="danger"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="What to run now"
          title="Immediate playbook shortlist"
          description="These are the recurring SOPs that should be easiest to launch from the page."
          action={
            <Link className="button button-secondary" href="/dashboard/automations">
              Open Automations
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
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Categories"
          title="Playbook families"
          description="The library should be grouped by operating intent so the right SOP is easy to find."
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
                    Open lane
                  </Link>
                  <Link className="button button-ghost" href="#catalog">
                    View SOPs
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Catalog"
        title="Recurring SOP playbooks"
        description="Each card shows the operating context, the trigger, the owner, the hook, and the step-by-step path."
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
                  <dt>Trigger</dt>
                  <dd>{item.trigger}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{item.owner}</dd>
                </div>
                <div>
                  <dt>Automation Hook</dt>
                  <dd>{item.hook}</dd>
                </div>
              </dl>

              <div className="timeline">
                {item.steps.map((step, index) => (
                  <div className="timeline-item" key={`${item.title}-${index}`}>
                    <div className="inline-legend">
                      <span className="legend-chip" data-tone={item.tone}>
                        Step {index + 1}
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
          kicker="Automation hooks"
          title="Where playbooks hand off"
          description="These are the default integration points the SOP library should grow into."
        >
          <div className="template-grid">
            {automationHooks.map((hook) => (
              <div className="template-row" key={hook.title}>
                <div>
                  <strong>{hook.title}</strong>
                  <p>{hook.detail}</p>
                </div>
                <span className="legend-chip" data-tone={hook.tone}>
                  Hook
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Rules"
          title="How to keep the library useful"
          description="The best playbooks stay short, explicit, and easy to hand off."
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
