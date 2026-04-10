"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardSectionNav({ label, items }) {
  const pathname = usePathname();

  return (
    <nav className="section-nav-bar" aria-label={label}>
      <p className="section-nav-title">{label}</p>
      <div className="section-nav-list">
        {items.map((item) => {
          const hasNestedItems = items.some(
            (candidate) => candidate.href !== item.href && candidate.href.startsWith(`${item.href}/`),
          );
          const active = hasNestedItems
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              className="section-nav-link"
              data-active={active ? "true" : "false"}
              href={item.href}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
