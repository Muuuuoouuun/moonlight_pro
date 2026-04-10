import { DashboardSectionNav } from "@/components/dashboard/section-nav";

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
      <section className="page-head">
        <p className="eyebrow">Content</p>
        <h1>Editorial workspace and publish loop</h1>
        <p>
          This section turns content into a visible production system. The work stays split into
          queue, studio, assets, and publish so the next piece always has a clear path forward.
        </p>
      </section>

      <DashboardSectionNav label="Content" items={CONTENT_NAV_ITEMS} />

      {children}
    </div>
  );
}
