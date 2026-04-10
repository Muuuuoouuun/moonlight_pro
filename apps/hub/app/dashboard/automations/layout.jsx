import { DashboardSectionNav } from "@/components/dashboard/section-nav";

const AUTOMATION_NAV_ITEMS = [
  {
    href: "/dashboard/automations",
    label: "Overview",
    description: "Machine health and recent output",
  },
  {
    href: "/dashboard/automations/runs",
    label: "Runs",
    description: "Execution pulse and dispatch queue",
  },
  {
    href: "/dashboard/automations/webhooks",
    label: "Webhooks",
    description: "Endpoint catalog and intake events",
  },
  {
    href: "/dashboard/automations/integrations",
    label: "Integrations",
    description: "Connected systems and sync health",
  },
];

export default function AutomationsLayout({ children }) {
  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Automations</p>
        <h1>Automation control plane</h1>
        <p>
          This section keeps the machine visible. Runs, routes, and sync health stay in one surface so
          the operator can spot trouble before it quietly breaks the loop.
        </p>
      </section>

      <DashboardSectionNav label="Automations" items={AUTOMATION_NAV_ITEMS} />
      {children}
    </div>
  );
}
