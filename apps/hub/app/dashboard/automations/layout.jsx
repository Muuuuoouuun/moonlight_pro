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
  {
    href: "/dashboard/automations/email",
    label: "Email",
    description: "Templates, queue, and outbound delivery",
  },
];

export default function AutomationsLayout({ children }) {
  return (
    <div className="app-page">
      <DashboardSectionNav label="Automations" items={AUTOMATION_NAV_ITEMS} />
      {children}
    </div>
  );
}
