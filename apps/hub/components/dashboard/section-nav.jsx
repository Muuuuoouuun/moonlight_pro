"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function normalizeValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[._/()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function DashboardSectionNav({ label, items, context }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function buildHref(href, overrides = {}) {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(overrides).forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
        return;
      }

      params.set(key, value);
    });

    const query = params.toString();
    return query ? `${href}?${query}` : href;
  }

  const currentContext = context
    ? context.items.find((item) => normalizeValue(item.value) === normalizeValue(searchParams.get(context.queryKey))) ||
      context.items[0]
    : null;

  return (
    <div className="section-nav-stack">
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
                href={buildHref(item.href)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {context && currentContext ? (
        <section className="section-context-bar" aria-label={context.label}>
          <div className="section-context-head">
            <div>
              <p className="section-context-kicker">{context.label}</p>
              <strong className="section-context-current">{currentContext.label}</strong>
            </div>
            <p className="section-context-note">{currentContext.description}</p>
          </div>

          <div className="context-switcher">
            {context.items.map((item) => (
              <Link
                key={item.value}
                className="context-link"
                data-active={item.value === currentContext.value ? "true" : "false"}
                href={buildHref(pathname, {
                  [context.queryKey]: item.value === context.defaultValue ? null : item.value,
                })}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
