import { DashboardSectionNav } from "@/components/dashboard/section-nav";

const REVENUE_NAV_ITEMS = [
  {
    href: "/dashboard/revenue",
    label: "Overview",
    description: "Leads, deals, and cases at a glance",
  },
  {
    href: "/dashboard/revenue/leads",
    label: "Leads",
    description: "Qualification and follow-up",
  },
  {
    href: "/dashboard/revenue/deals",
    label: "Deals",
    description: "Stage movement and close signals",
  },
  {
    href: "/dashboard/revenue/accounts",
    label: "Accounts",
    description: "Customer state and account health",
  },
  {
    href: "/dashboard/revenue/cases",
    label: "Cases",
    description: "Operational blockers and closure",
  },
];

export default function RevenueLayout({ children }) {
  return (
    <div className="app-page">
      <DashboardSectionNav label="Revenue" items={REVENUE_NAV_ITEMS} />

      {children}
    </div>
  );
}
