"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;

  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

function getNextSelection(items, selectedId, direction) {
  if (!items.length) {
    return null;
  }

  const currentIndex = items.findIndex((item) => item.id === selectedId);

  if (currentIndex === -1) {
    return direction > 0 ? items[0].id : items[items.length - 1].id;
  }

  const nextIndex = (currentIndex + direction + items.length) % items.length;
  return items[nextIndex].id;
}

function resolveActionLinks(item) {
  if (item?.links?.length) {
    return item.links;
  }

  if (!item?.href) {
    return [];
  }

  return [
    {
      href: item.href,
      label: item.action || "열기",
      variant: "primary",
    },
  ];
}

function Group({ label, description, items, selectedId, onSelect }) {
  return (
    <section className="operations-workbench__group">
      <div className="operations-workbench__group-head">
        <div>
          <strong>{label}</strong>
          <p>{description}</p>
        </div>
        <span className="hub-command__hint">{items.length}</span>
      </div>

      <div className="operations-workbench__list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="operations-workbench__item"
            data-active={selectedId === item.id ? "true" : "false"}
            aria-pressed={selectedId === item.id ? "true" : "false"}
            onClick={() => onSelect(item.id)}
          >
            <div className="operations-workbench__item-head">
              <div className="operations-workbench__item-copy">
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <div className="operations-workbench__item-chips">
                {item.statusLabel ? (
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.statusLabel}
                  </span>
                ) : null}
                {item.freshnessLabel ? (
                  <span className="legend-chip" data-tone={item.freshnessTone || "muted"}>
                    {item.freshnessLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="operations-workbench__item-foot">
              <span>{item.scope}</span>
              <span>{item.nextStep}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function OperationsWorkbench({ attentionItems, queueItems }) {
  const router = useRouter();
  const combinedItems = [...attentionItems, ...queueItems];
  const [selectedId, setSelectedId] = useState(combinedItems[0]?.id ?? null);

  useEffect(() => {
    if (!combinedItems.length) {
      setSelectedId(null);
      return;
    }

    if (selectedId == null) {
      return;
    }

    if (!combinedItems.some((item) => item.id === selectedId)) {
      setSelectedId(combinedItems[0].id);
    }
  }, [combinedItems, selectedId]);

  const selectedItem = combinedItems.find((item) => item.id === selectedId) || null;
  const links = resolveActionLinks(selectedItem);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!combinedItems.length || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedId((current) => getNextSelection(combinedItems, current, 1));
        return;
      }

      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedId((current) => getNextSelection(combinedItems, current, -1));
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedId(null);
        return;
      }

      if (
        event.key === "Enter" &&
        selectedItem?.href &&
        !(event.target instanceof HTMLElement && event.target.closest("a, button"))
      ) {
        event.preventDefault();
        router.push(selectedItem.href);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [combinedItems, router, selectedItem]);

  return (
    <div className="operations-workbench">
      <div className="operations-workbench__lists">
        <Group
          label="Needs Attention"
          description="실패, 승인 대기, 연결 막힘처럼 사람이 바로 봐야 하는 항목입니다."
          items={attentionItems}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <Group
          label="Live Queue"
          description="지금 움직이는 AI, 오더, 런, 대화를 큐처럼 훑고 바로 엽니다."
          items={queueItems}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <aside className="operations-detail-panel" data-empty={selectedItem ? "false" : "true"}>
        {selectedItem ? (
          <>
            <div className="operations-detail-panel__head">
              <div>
                <p className="section-kicker">Quick Detail</p>
                <h3>{selectedItem.title}</h3>
                <p>{selectedItem.scope}</p>
              </div>
              <span className="hub-command__hint">Enter 열기</span>
            </div>

            <div className="inline-legend">
              {selectedItem.statusLabel ? (
                <span className="legend-chip" data-tone={selectedItem.tone}>
                  {selectedItem.statusLabel}
                </span>
              ) : null}
              {selectedItem.freshnessLabel ? (
                <span
                  className="legend-chip"
                  data-tone={selectedItem.freshnessTone || "muted"}
                >
                  {selectedItem.freshnessLabel}
                </span>
              ) : null}
            </div>

            <p className="operations-detail-panel__summary">{selectedItem.detail}</p>

            <div className="status-note" data-tone={selectedItem.tone}>
              <strong>Next move</strong>
              <p>{selectedItem.nextStep}</p>
            </div>

            <dl className="detail-stack">
              <div>
                <dt>Lane</dt>
                <dd>{selectedItem.scope}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{selectedItem.statusLabel || "Open"}</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{selectedItem.freshnessLabel || "관찰"}</dd>
              </div>
              <div>
                <dt>Shortcut</dt>
                <dd>J / K 이동 · Enter 열기 · Esc 닫기</dd>
              </div>
            </dl>

            <div className="hero-actions">
              {links.map((link) => (
                <Link
                  key={`${selectedItem.id}-${link.href}-${link.label}`}
                  className={`button button-${link.variant || "secondary"}`}
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="operations-detail-panel__empty">
            <p className="section-kicker">Quick Detail</p>
            <h3>항목을 선택하면 여기서 바로 확인합니다.</h3>
            <p>
              왼쪽 리스트에서 항목을 누르거나 <span className="hub-command__hint">J / K</span>로 이동하고{" "}
              <span className="hub-command__hint">Enter</span>로 관련 화면을 바로 열 수 있습니다.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
