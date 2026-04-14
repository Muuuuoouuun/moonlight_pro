"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { navigationItems } from "@/lib/dashboard-data";
import { loadRecentRoutes } from "@/lib/recent-routes";

function buildRouteDirectory(items) {
  const seen = new Set();
  const directory = [];

  for (const item of items) {
    if (!seen.has(item.href)) {
      seen.add(item.href);
      directory.push({
        href: item.href,
        title: item.label,
        detail: item.description,
        section: item.group === "utility" ? "Utility" : "Core",
      });
    }

    for (const child of item.children || []) {
      if (seen.has(child.href)) {
        continue;
      }

      seen.add(child.href);
      directory.push({
        href: child.href,
        title: child.label,
        detail: child.description,
        section: item.label,
      });
    }
  }

  return directory;
}

export function RecentRoutesPanel() {
  const pathname = usePathname();
  const [recentRoutes, setRecentRoutes] = useState([]);
  const routeDirectory = useMemo(() => buildRouteDirectory(navigationItems), []);

  const recentItems = useMemo(
    () =>
      recentRoutes
        .filter((href) => href !== pathname)
        .map((href) => routeDirectory.find((item) => item.href === href))
        .filter(Boolean)
        .slice(0, 4),
    [pathname, recentRoutes, routeDirectory],
  );

  useEffect(() => {
    setRecentRoutes(loadRecentRoutes());
  }, [pathname]);

  if (!recentItems.length) {
    return (
      <div className="timeline">
        <div className="timeline-item">
          <strong>최근 방문 화면이 아직 없습니다.</strong>
          <p>허브를 조금 더 둘러보면 자주 오가는 동선이 이곳에 바로 올라옵니다.</p>
          <div className="hero-actions">
            <Link className="button button-secondary" href="/dashboard/work">
              Open Work OS
            </Link>
            <Link className="button button-ghost" href="/dashboard/daily-brief">
              Open brief
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="project-grid">
      {recentItems.map((item) => (
        <article className="project-card" key={item.href}>
          <div className="project-head">
            <div>
              <h3>{item.title}</h3>
              <p>{item.section}</p>
            </div>
            <span className="legend-chip" data-tone="blue">
              Recent
            </span>
          </div>
          <p className="check-detail">{item.detail}</p>
          <div className="hero-actions">
            <Link className="button button-secondary" href={item.href}>
              Re-open
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
