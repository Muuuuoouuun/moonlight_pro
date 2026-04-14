import { DashboardSectionNav } from "@/components/dashboard/section-nav";
import { CONTENT_BRANDS } from "@/lib/dashboard-contexts";

const CONTENT_NAV_ITEMS = [
  {
    href: "/dashboard/content",
    label: "Overview",
    description: "Pipeline health and publishing cadence",
  },
  {
    href: "/dashboard/content/queue",
    label: "Queue",
    description: "Ideas, briefs, and review states",
  },
  {
    href: "/dashboard/content/studio",
    label: "Studio",
    description: "Card-news drafting workspace",
  },
  {
    href: "/dashboard/content/assets",
    label: "Assets",
    description: "Outputs, files, and reusable source material",
  },
  {
    href: "/dashboard/content/publish",
    label: "Publish",
    description: "Distribution history and channel status",
  },
];

export default function ContentLayout({ children }) {
  return (
    <div className="app-page">
      <DashboardSectionNav
        label="Content"
        items={CONTENT_NAV_ITEMS}
        context={{
          label: "Brand Context",
          queryKey: "brand",
          defaultValue: CONTENT_BRANDS[0].value,
          items: CONTENT_BRANDS,
        }}
      />

      {children}
    </div>
  );
}
