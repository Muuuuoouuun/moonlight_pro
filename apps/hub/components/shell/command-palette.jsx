"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { navigationItems } from "@/lib/dashboard-data";

/**
 * CommandPalette — global ⌘K / Ctrl+K launcher.
 *
 * The hub already has a `/dashboard/command` route for deep search;
 * this modal is the fast-path for "jump to lane" without leaving the
 * current screen. It reads from `navigationItems` so adding a lane in
 * one place lights it up here for free.
 */

function flattenNavigation(items) {
  const rows = [];
  items.forEach((item) => {
    const base = {
      href: item.href,
      label: item.label,
      description: item.description,
      group: item.group || "core",
      parent: null,
    };
    rows.push(base);
    if (Array.isArray(item.children)) {
      item.children.forEach((child) => {
        // Avoid adding the section-root-as-child (overview) duplicate.
        if (child.href === item.href) return;
        rows.push({
          href: child.href,
          label: child.label,
          description: child.description,
          group: item.group || "core",
          parent: item.label,
        });
      });
    }
  });
  return rows;
}

function score(row, query) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const target = [row.label, row.description, row.parent, row.href]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!target.includes(q)) return 0;
  const labelHit = row.label.toLowerCase().includes(q);
  return labelHit ? 2 : 1;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const rows = useMemo(() => flattenNavigation(navigationItems), []);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      // When idle, show a short list (core first, then utility).
      return rows.slice(0, 10);
    }
    return rows
      .map((row) => ({ row, value: score(row, query) }))
      .filter(({ value }) => value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)
      .map(({ row }) => row);
  }, [query, rows]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  // Global keyboard: ⌘K / Ctrl+K opens, Escape closes.
  useEffect(() => {
    const handler = (event) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  // Focus input whenever the dialog opens.
  useEffect(() => {
    if (open && inputRef.current) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Reset active row when filter changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  const jumpTo = (href) => {
    close();
    router.push(href);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = filtered[activeIndex];
      if (target) {
        jumpTo(target.href);
      }
    }
  };

  return (
    <div
      className="cmd-palette"
      role="dialog"
      aria-modal="true"
      aria-label="명령 팔레트"
    >
      <button
        type="button"
        className="cmd-palette__scrim"
        aria-label="명령 팔레트 닫기"
        onClick={close}
      />
      <div className="cmd-palette__panel">
        <div className="cmd-palette__inputwrap">
          <span className="cmd-palette__kicker" aria-hidden="true">
            ⌘K
          </span>
          <input
            ref={inputRef}
            className="cmd-palette__input"
            type="text"
            placeholder="레인, 뷰, 액션 검색… (예: queue, PR, leads)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="명령 팔레트 검색"
            aria-activedescendant={
              filtered[activeIndex] ? `cmd-row-${activeIndex}` : undefined
            }
          />
          <button
            type="button"
            className="cmd-palette__close"
            aria-label="닫기"
            onClick={close}
          >
            ESC
          </button>
        </div>
        <ul className="cmd-palette__list" role="listbox">
          {filtered.length === 0 ? (
            <li className="cmd-palette__empty">일치하는 레인이 없습니다.</li>
          ) : (
            filtered.map((row, index) => (
              <li
                key={row.href}
                id={`cmd-row-${index}`}
                role="option"
                aria-selected={index === activeIndex ? "true" : "false"}
              >
                <button
                  type="button"
                  className="cmd-palette__row"
                  data-active={index === activeIndex ? "true" : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => jumpTo(row.href)}
                >
                  <span className="cmd-palette__row-label">
                    {row.parent ? (
                      <span className="cmd-palette__row-parent">{row.parent}</span>
                    ) : null}
                    <strong>{row.label}</strong>
                  </span>
                  {row.description ? (
                    <span className="cmd-palette__row-desc">{row.description}</span>
                  ) : null}
                  <span className="cmd-palette__row-hint">{row.href}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <footer className="cmd-palette__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            이동
          </span>
          <span>
            <kbd>↵</kbd>
            선택
          </span>
          <span>
            <kbd>ESC</kbd>
            닫기
          </span>
        </footer>
      </div>
    </div>
  );
}
