"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  loadRecentRoutes,
  persistRecentRoutes,
  updateRecentRoutes,
} from "@/lib/recent-routes";

const MAX_VISIBLE_ITEMS = 10;

function normalizeItems(items) {
  const seen = new Set();

  return (items || []).reduce((acc, item) => {
    const href = item?.href?.trim();
    if (!href || seen.has(href)) {
      return acc;
    }

    seen.add(href);
    acc.push({
      href,
      label: item.label || href,
      description: item.description || "",
      section: item.section || "Route",
      keywords: item.keywords || "",
    });
    return acc;
  }, []);
}

export function CommandPalette({ items, isOpen, onOpenChange }) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef(null);
  const itemRefs = useRef([]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentRoutes, setRecentRoutes] = useState([]);

  const normalizedItems = useMemo(() => normalizeItems(items), [items]);
  const recentItems = useMemo(
    () =>
      recentRoutes
        .map((href) => normalizedItems.find((item) => item.href === href))
        .filter(Boolean),
    [recentRoutes, normalizedItems],
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      const recentSet = new Set(recentItems.map((item) => item.href));
      return [
        ...recentItems,
        ...normalizedItems.filter((item) => !recentSet.has(item.href)),
      ].slice(0, MAX_VISIBLE_ITEMS);
    }

    return normalizedItems
      .filter((item) =>
        [item.label, item.description, item.section, item.keywords]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .slice(0, MAX_VISIBLE_ITEMS);
  }, [normalizedItems, query, recentItems]);

  useEffect(() => {
    setRecentRoutes(loadRecentRoutes());
  }, []);

  useEffect(() => {
    const currentItem = normalizedItems.find((item) => item.href === pathname);
    if (!currentItem) {
      return;
    }

    setRecentRoutes((currentRoutes) => {
      const nextRoutes = updateRecentRoutes(currentRoutes, currentItem.href);
      persistRecentRoutes(nextRoutes);
      return nextRoutes;
    });
  }, [normalizedItems, pathname]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setActiveIndex(0);

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveIndex((currentIndex) => {
      if (visibleItems.length === 0) {
        return 0;
      }

      return currentIndex > visibleItems.length - 1 ? 0 : currentIndex;
    });
  }, [isOpen, visibleItems.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    itemRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    onOpenChange(false);
  }, [pathname]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isCommandShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (isCommandShortcut) {
        event.preventDefault();
        onOpenChange(!isOpen);
        return;
      }

      if (!isOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((currentIndex) =>
          visibleItems.length === 0 ? 0 : (currentIndex + 1) % visibleItems.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((currentIndex) =>
          visibleItems.length === 0
            ? 0
            : (currentIndex - 1 + visibleItems.length) % visibleItems.length,
        );
        return;
      }

      if (event.key === "Enter") {
        const activeItem = visibleItems[activeIndex];
        if (!activeItem) {
          return;
        }

        event.preventDefault();
        setRecentRoutes((currentRoutes) => {
          const nextRoutes = updateRecentRoutes(currentRoutes, activeItem.href);
          persistRecentRoutes(nextRoutes);
          return nextRoutes;
        });
        onOpenChange(false);
        router.push(activeItem.href);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, isOpen, onOpenChange, router, visibleItems]);

  function handleSelect(item) {
    setRecentRoutes((currentRoutes) => {
      const nextRoutes = updateRecentRoutes(currentRoutes, item.href);
      persistRecentRoutes(nextRoutes);
      return nextRoutes;
    });
    onOpenChange(false);
    router.push(item.href);
  }

  if (!isOpen) {
    return null;
  }

  const recentSet = new Set(recentItems.map((item) => item.href));

  return (
    <div className="hub-command" role="dialog" aria-modal="true" aria-label="Quick jump">
      <button
        type="button"
        className="hub-command__backdrop"
        aria-label="Close quick jump"
        onClick={() => onOpenChange(false)}
      />

      <div className="hub-command__panel">
        <div className="hub-command__head">
          <div>
            <p className="hub-command__kicker">Quick Jump</p>
            <h2>바로 가고 바로 열기</h2>
          </div>
          <span className="hub-command__hint">⌘/Ctrl + K</span>
        </div>

        <label className="hub-command__field" htmlFor="hub-command-input">
          <span className="hub-command__field-label">검색</span>
          <input
            id="hub-command-input"
            ref={inputRef}
            className="hub-command__input"
            type="text"
            placeholder="예: email, work, pms, studio"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="hub-command__results" role="listbox" aria-label="Quick jump results">
          {visibleItems.length ? (
            visibleItems.map((item, index) => (
              <button
                key={item.href}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                className="hub-command__item"
                data-active={index === activeIndex ? "true" : undefined}
                data-current={pathname === item.href ? "true" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(item)}
              >
                <div className="hub-command__item-meta">
                  <span className="hub-command__item-section">
                    {!query && recentSet.has(item.href) ? "Recent" : item.section}
                  </span>
                  {pathname === item.href ? (
                    <span className="hub-command__item-badge">Current</span>
                  ) : null}
                </div>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </button>
            ))
          ) : (
            <div className="hub-command__empty">
              <strong>맞는 화면을 못 찾았습니다.</strong>
              <p>검색어를 줄이거나 Work, Email, PMS 같이 짧은 단어로 다시 찾아보세요.</p>
            </div>
          )}
        </div>

        <div className="hub-command__foot">
          <span>Enter 열기</span>
          <span>↑↓ 이동</span>
          <span>Esc 닫기</span>
        </div>
      </div>
    </div>
  );
}
