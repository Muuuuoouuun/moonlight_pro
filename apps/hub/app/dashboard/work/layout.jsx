import { DashboardSectionNav } from "@/components/dashboard/section-nav";
import { WORK_CONTEXTS } from "@/lib/dashboard-contexts";

const WORK_NAV_ITEMS = [
  {
    href: "/dashboard/work",
    label: "Overview",
    description: "Projects, shipping pulse, and execution focus",
  },
  {
    href: "/dashboard/work/projects",
    label: "Projects",
    description: "Portfolio movement and blockers",
  },
  {
    href: "/dashboard/work/pms",
    label: "PMS",
    description: "GitHub delivery pulse and operator control",
  },
  {
    href: "/dashboard/work/roadmap",
    label: "Roadmap",
    description: "Milestones, release lanes, and risk",
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
      <DashboardSectionNav
        label="Work OS"
        items={WORK_NAV_ITEMS}
        context={{
          label: "Project Context",
          queryKey: "project",
          defaultValue: WORK_CONTEXTS[0].value,
          items: WORK_CONTEXTS,
        }}
      />

      {children}
    </div>
  );
}
