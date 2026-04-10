import { DashboardSectionNav } from "@/components/dashboard/section-nav";

const WORK_NAV_ITEMS = [
  {
    href: "/dashboard/work",
    label: "Overview",
    description: "Projects, cadence, and decisions",
  },
  {
    href: "/dashboard/work/projects",
    label: "Projects",
    description: "Portfolio movement and blockers",
  },
  {
    href: "/dashboard/work/rhythm",
    label: "Rhythm",
    description: "Cadence blocks and weekly reset",
  },
  {
    href: "/dashboard/work/decisions",
    label: "Decisions",
    description: "Calls, review notes, and follow-through",
  },
];

export default function WorkLayout({ children }) {
  return (
    <div className="app-page">
      <DashboardSectionNav label="Work OS" items={WORK_NAV_ITEMS} />

      {children}
    </div>
  );
}
