import { DashboardSectionNav } from "@/components/dashboard/section-nav";

const EVOLUTION_NAV_ITEMS = [
  {
    href: "/dashboard/evolution",
    label: "Overview",
    description: "Learning loop and follow-up state",
  },
  {
    href: "/dashboard/evolution/logs",
    label: "Logs",
    description: "Errors, warnings, and ownership",
  },
  {
    href: "/dashboard/evolution/issues",
    label: "Issues",
    description: "Operational risk and mitigation",
  },
  {
    href: "/dashboard/evolution/activity",
    label: "Activity",
    description: "Recent changes across the OS",
  },
];

export default function EvolutionLayout({ children }) {
  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Evolution</p>
        <h1>Logs, issues, and system memory</h1>
        <p>
          This section is the OS memory layer. It keeps failures, follow-ups, and recent changes visible
          so the next version of the system is easier to operate than the last one.
        </p>
      </section>

      <DashboardSectionNav label="Evolution" items={EVOLUTION_NAV_ITEMS} />
      {children}
    </div>
  );
}
