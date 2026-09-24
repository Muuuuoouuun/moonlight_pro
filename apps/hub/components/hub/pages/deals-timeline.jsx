"use client";

// 거래 탭의 "언제" 보기(기본)와 "지역" 보기 — 운영자 승인 목업 3(2026-09-24).
// 확실성 리본 · 멈춘 거래 줄 · 시간 칸(이번 주/다음 주/나중에/날짜 미정) · 카드 선택 시 하단 독.
// "단계" 보기(기존 칸반)는 pages/revenue.jsx의 Deals가 그대로 그린다. 상태(딜 목록·낙관 반영·
// 되돌리기·편집 드로어·키보드 선택)는 Deals가 소유하고, 여기는 그리기와 이 보기 전용 상호작용만 맡는다.
// 판정(칸·확실성·약속·멈춤·예상일 프리셋)은 lib/deal-timeline.js가 소유한다.

import React from "react";
import { Button, CertaintyBadge, EmptyState, IconButton, Kbd, LifecycleBadge, Skeleton, TruthBadge, useToast } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { ContactRecordDrawer } from "../contact-record-form";
import { UNDO_WINDOW_MS } from "../use-undoable-action";
import { STALLED_DAYS } from "@/lib/deal-stages";
import {
  MAX_DANGER_RAILS,
  closeDatePresets,
  dateInputValue,
  dealCustomerKey,
  formatDayLabel,
  formatWon,
  isoFromDateInput,
  kstDayNumber,
  laneDropDate,
  sameCloseDay,
} from "@/lib/deal-timeline";
import "./deals-timeline.css";

// 지역 보기는 기존 매출 히트맵을 그대로 쓴다. 지도 모양 데이터가 커서 정적 import로 거래 청크에
// 끌어오지 않고, 보기를 고를 때만 불러온다(히트맵 모듈도 ./revenue를 import하는 순환을 피한다).
const RevenueHeatmapView = React.lazy(() => import("./revenue-heatmap").then((m) => ({ default: m.RevenueHeatmap })));

const CERTAINTY_MARK = { confirmed: "●", recommended: "◇", unknown: "?" };
const STALL_PILL_LIMIT = 4;

// 입력 중이거나 드로어·팔레트 같은 레이어가 떠 있으면 페이지 단축키는 양보한다
// (use-crm-keyboard.js의 shouldYield와 같은 규칙).
function shouldYieldKeys() {
  if (typeof document === "undefined") return true;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return true;
  return Boolean(document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]'));
}

const isLocalId = (id) => String(id).toLowerCase().startsWith("local-");

export function DealsRegionView({ onNavigate }) {
  return (
    <div className="deals-region">
      <React.Suspense fallback={<Skeleton lines={4} height={48} label="지역 보기 불러오는 중" />}>
        <RevenueHeatmapView onNavigate={onNavigate} />
      </React.Suspense>
    </div>
  );
}

function CertaintyRibbon({ month, filter, onToggle }) {
  const drawn = month.segments.filter((segment) => segment.amount > 0);
  return (
    <section className="fx-card deals-tl-ribbon" aria-label={`${month.monthLabel} 확실성별 금액`}>
      {drawn.length > 0 ? (
        // 막대는 금액 비례의 그림이다. 거르기는 아래 라벨 버튼이 맡고(키보드·스크린리더),
        // 막대 조각 클릭은 같은 동작의 마우스 지름길이다.
        <div className="deals-tl-bar" data-filtered={filter ? "true" : undefined} aria-hidden="true">
          {drawn.map((segment) => (
            <span
              key={segment.key}
              className="deals-tl-bar__seg"
              data-certainty={segment.key}
              data-on={filter === segment.key ? "true" : undefined}
              style={{ flexGrow: segment.amount }}
              title={`${segment.label} ${formatWon(segment.amount)}`}
              onClick={() => onToggle(segment.key)}
            />
          ))}
        </div>
      ) : (
        <div className="deals-tl-bar deals-tl-bar--empty" aria-hidden="true" />
      )}
      <div className="deals-tl-legend" role="group" aria-label="확실성으로 거르기">
        {month.segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            className="deals-tl-legend__item"
            data-certainty={segment.key}
            aria-pressed={filter === segment.key}
            onClick={() => onToggle(segment.key)}
          >
            <span className="deals-tl-legend__label">
              <span className="deals-tl-swatch" data-certainty={segment.key} aria-hidden="true" />
              {segment.key !== "confirmed" && <span aria-hidden="true">{CERTAINTY_MARK[segment.key]} </span>}
              {segment.label}
            </span>
            <span className="stat deals-tl-legend__amount">{formatWon(segment.amount)}</span>
            <span className="deals-tl-legend__count">{segment.count}건</span>
          </button>
        ))}
      </div>
      <p className="deals-tl-ribbon__caption">
        예상일이 {month.monthLabel}인 거래 <span className="num">{month.count}</span>건 기준
        {filter && <> · 라벨을 다시 누르면 전부 보여요</>}
      </p>
    </section>
  );
}

function StalledStrip({ items, describe, onAsk }) {
  const shown = items.slice(0, STALL_PILL_LIMIT);
  const rest = items.length - shown.length;
  return (
    <section className="deals-tl-stall" aria-label="멈춘 거래">
      <Iconed name="pause" size={15} style={{ color: "var(--fg-muted)" }} />
      <p className="deals-tl-stall__text">
        멈춘 거래 <span className="num">{items.length}</span>
        <small>{STALLED_DAYS}일 이상 기록이 없어요</small>
      </p>
      <ul className="deals-tl-stall__list">
        {shown.map((item) => (
          <li key={item.id} className="deals-tl-pill">
            <span>{describe(item.deal).org} · <span className="mono">{item.deal.age}일</span></span>
            <Button variant="ghost" size="xs" disabled={isLocalId(item.id)} onClick={() => onAsk(item)}>한 줄 물어보기</Button>
          </li>
        ))}
        {rest > 0 && <li className="deals-tl-stall__more">외 <span className="num">{rest}</span>건</li>}
      </ul>
    </section>
  );
}

function StageSteps({ stages, index }) {
  return (
    <span className="deals-tl-steps" aria-hidden="true">
      {stages.map((stage, i) => (
        <i key={stage.key} data-step={i < index ? "done" : i === index ? "current" : undefined} />
      ))}
    </span>
  );
}

function DealTimeCard({ item, stages, describe, selected, rail, dragging, onActivate, onDragStart, onDragEnd }) {
  const { deal, certainty, lifecycle, promise } = item;
  const { org, who } = describe(deal);
  const amountLabel = item.amount ? formatWon(item.amount) : "₩ ?";
  const promiseLabel = promise ? `다음 약속 ${promise.text}${promise.dueLabel ? ` ${promise.dueLabel}` : ""}` : "다음 약속 없음";
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      className="deals-tl-card"
      data-deal-card={deal.id}
      data-certainty={certainty.key}
      data-selected={selected ? "true" : undefined}
      data-rail={rail ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      aria-pressed={selected}
      aria-label={`${org}, ${item.amount ? amountLabel : "금액 미정"}, ${certainty.label}${lifecycle ? ` · ${lifecycle.label}` : ""}, ${item.stageLabel}, ${promiseLabel}`}
      onClick={() => onActivate(item, false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate(item, true);
        }
      }}
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={onDragEnd}
    >
      <div className="deals-tl-card__top">
        <div className="deals-tl-card__id">
          <div className="deals-tl-card__org">{org}</div>
          {who && <div className="deals-tl-card__who">{who}</div>}
        </div>
        <span className="stat deals-tl-card__amount" data-unknown={item.amount ? undefined : "true"}>{amountLabel}</span>
      </div>
      <StageSteps stages={stages} index={item.stageIndex} />
      <div className="deals-tl-card__row">
        <span className="deals-tl-card__badges">
          <CertaintyBadge state={certainty.key} label={certainty.label} />
          {lifecycle && <LifecycleBadge state={lifecycle.key} label={lifecycle.label} />}
        </span>
        <span className="deals-tl-card__stage">{item.stageLabel}</span>
      </div>
      <div className="deals-tl-card__next">
        {promise ? (
          <>
            <span className="deals-tl-card__promise">{promise.text}</span>
            {promise.dueLabel && (
              <span className={promise.overdue ? "deals-tl-card__late" : "mono deals-tl-card__due"}>
                {promise.overdue && !rail && <Iconed name="clock" size={11} />}
                {promise.dueLabel}
              </span>
            )}
          </>
        ) : (
          <span className="deals-tl-card__none">다음 약속 없음</span>
        )}
      </div>
      {item.closeOverdue && (
        <div className="deals-tl-card__slip">
          <Iconed name="clock" size={11} /> 예상일 {item.closeLabel} 지남
        </div>
      )}
    </div>
  );
}

function DealDock({ item, stages, describe, customerKey, primaryRef, onClose, onRecord, onAdvance, onMoveDate, onEdit, onOpenCustomer }) {
  const [dateOpen, setDateOpen] = React.useState(false);
  const presets = React.useMemo(() => closeDatePresets(new Date()), []);
  const { deal, certainty, lifecycle, promise } = item;
  const { org } = describe(deal);
  const nextStage = stages[item.stageIndex + 1] || null;
  const local = isLocalId(item.id);
  React.useEffect(() => { setDateOpen(false); }, [item.id]);

  return (
    <section
      className="deals-tl-dock"
      role="region"
      aria-label={`선택한 거래 — ${org}`}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose(true);
      }}
    >
      <div className="deals-tl-dock__head">
        <b className="deals-tl-dock__org">{org}</b>
        <CertaintyBadge state={certainty.key} label={certainty.label} />
        {lifecycle && <LifecycleBadge state={lifecycle.key} label={lifecycle.label} />}
        <span className="stat deals-tl-dock__amount" data-unknown={item.amount ? undefined : "true"}>
          {item.amount ? formatWon(item.amount) : "₩ ?"}
        </span>
        <IconButton icon="edit" tooltip="거래 편집 (E)" onClick={onEdit} />
        <IconButton icon="x" tooltip="닫기 (Esc)" onClick={() => onClose(true)} />
      </div>
      <ol className="deals-tl-stepper" aria-label="단계">
        {stages.map((stage, i) => (
          <li
            key={stage.key}
            data-step={i < item.stageIndex ? "done" : i === item.stageIndex ? "current" : undefined}
            aria-current={i === item.stageIndex ? "step" : undefined}
          >
            <i aria-hidden="true" />
            <span>{stage.label}</span>
          </li>
        ))}
      </ol>
      <p className="deals-tl-dock__next">
        다음 약속 · <b>{promise?.text || "없음"}</b>
        {promise?.dueLabel && (
          <span className={promise.overdue ? "deals-tl-card__late" : "mono deals-tl-card__due"}> {promise.dueLabel}</span>
        )}
        <span className="deals-tl-dock__close"> · 예상일 <span className="mono">{item.closeLabel || "미정"}</span></span>
      </p>
      <div className="deals-tl-dock__acts">
        <Button ref={primaryRef} variant="primary" size="sm" disabled={local} title={local ? "거래를 저장한 뒤 기록할 수 있어요" : undefined} onClick={onRecord}>
          연락 기록 <Kbd>R</Kbd>
        </Button>
        {nextStage && (
          <Button variant="secondary" size="sm" onClick={() => onAdvance(nextStage.key)}>
            단계 올리기 ▸ {nextStage.label}
          </Button>
        )}
        <Button variant="ghost" size="sm" icon="calendar" aria-expanded={dateOpen} onClick={() => setDateOpen((open) => !open)}>
          예상일 바꾸기
        </Button>
        {customerKey && (
          <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={onOpenCustomer}>고객 열기</Button>
        )}
      </div>
      {dateOpen && (
        <div className="deals-tl-dock__dates" role="group" aria-label="예상일 바꾸기">
          {presets.map((preset) => (
            <Button
              key={preset.key}
              variant="outline"
              size="xs"
              active={preset.iso ? sameCloseDay(deal.closeAt, preset.iso) : !deal.closeAt}
              title={preset.dateLabel}
              onClick={() => onMoveDate(preset.iso, preset.dateLabel)}
            >
              {preset.label}
            </Button>
          ))}
          <label className="deals-tl-dock__date">
            <span>날짜</span>
            <input
              type="date"
              className="hub-input"
              defaultValue={dateInputValue(deal.closeAt)}
              key={`${item.id}-${deal.closeAt || "none"}`}
              onChange={(e) => {
                // 연도를 타이핑하는 중간값(0002-…)에 저장이 예약되지 않게 20xx만 받는다.
                if (!/^20\d{2}-/.test(e.target.value)) return;
                const iso = isoFromDateInput(e.target.value);
                if (iso) onMoveDate(iso, formatDayLabel(kstDayNumber(iso)));
              }}
            />
          </label>
        </div>
      )}
    </section>
  );
}

export function DealsTimeline({
  timeline,
  stages,
  ledger,
  syncState,
  selectedId,
  onSelect,
  onMoveDate,
  onAdvanceStage,
  onEdit,
  onCreate,
  canCreate = true,
  onNavigate,
  onReload,
}) {
  const toast = useToast();
  const [filter, setFilter] = React.useState(null);
  const [dragId, setDragId] = React.useState(null);
  const [overLane, setOverLane] = React.useState(null);
  const [record, setRecord] = React.useState(null); // { target, preset?, draft?, error? }
  const draggedRef = React.useRef(false);
  const dockPrimaryRef = React.useRef(null);
  const focusDockRef = React.useRef(false);

  const contactByCompany = React.useMemo(() => {
    const map = new Map();
    for (const contact of ledger?.contacts || []) {
      if (contact.companyId && !map.has(contact.companyId)) map.set(contact.companyId, contact);
    }
    return map;
  }, [ledger?.contacts]);

  const describe = React.useCallback((deal) => {
    const org = deal.companyName || deal.name || "이름 없는 거래";
    const contact = deal.companyId ? contactByCompany.get(deal.companyId) : null;
    const person = contact ? [contact.name, contact.title].filter(Boolean).join(" ") : null;
    const who = [person, deal.name && deal.name !== org ? deal.name : null].filter(Boolean).join(" · ");
    return { org, who };
  }, [contactByCompany]);

  const itemsById = React.useMemo(() => new Map(timeline.ordered.map((item) => [item.id, item])), [timeline.ordered]);
  const selectedItem = selectedId != null ? itemsById.get(selectedId) || null : null;
  const customerKey = selectedItem ? dealCustomerKey(selectedItem.deal, { leads: ledger?.leads, accounts: ledger?.accounts }) : null;

  const closeDock = React.useCallback((restoreFocus = false) => {
    const id = selectedId;
    onSelect(null);
    if (!restoreFocus || id == null || typeof document === "undefined") return;
    requestAnimationFrame(() => {
      document.querySelector(`[data-deal-card="${CSS.escape(String(id))}"]`)?.focus();
    });
  }, [onSelect, selectedId]);

  const activate = (item, viaKeyboard) => {
    if (draggedRef.current) return;
    if (selectedId === item.id) {
      closeDock(viaKeyboard);
      return;
    }
    focusDockRef.current = viaKeyboard;
    onSelect(item.id);
  };

  // 키보드로 연 독은 첫 행동(연락 기록)으로 초점을 옮긴다. 마우스로 연 독은 초점을 뺏지 않는다.
  React.useEffect(() => {
    if (!selectedItem || !focusDockRef.current) return;
    focusDockRef.current = false;
    requestAnimationFrame(() => dockPrimaryRef.current?.focus());
  }, [selectedItem]);

  const openRecord = React.useCallback((item, preset) => {
    if (isLocalId(item.id)) {
      toast.info("거래를 저장한 뒤 기록할 수 있어요.");
      return;
    }
    const { org } = describe(item.deal);
    setRecord({
      target: { kind: "deal", id: item.id, name: org, companyId: item.deal.companyId || null },
      preset: preset || null,
    });
  }, [describe, toast]);

  // R — 독이 열려 있을 때 연락 기록.
  React.useEffect(() => {
    if (!selectedItem || record) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "r" && e.key !== "R") return;
      if (shouldYieldKeys()) return;
      e.preventDefault();
      openRecord(selectedItem);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItem, record, openRecord]);

  // 독 바깥을 누르면 닫는다. 카드·독·드로어/팔레트(dialog)·토스트 안의 클릭은 제외.
  React.useEffect(() => {
    if (!selectedItem) return undefined;
    const onDown = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (target.closest(".deals-tl-dock, [data-deal-card], .hub-toast-viewport")) return;
      onSelect(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selectedItem, onSelect]);

  const moveTo = (item, iso, dateLabel) => {
    const { org } = describe(item.deal);
    onMoveDate(item.id, iso, `${org} · 예상일 ${iso ? `→ ${dateLabel}` : "미정으로"}`);
  };

  const finishDrag = () => {
    setDragId(null);
    setOverLane(null);
    // 칸을 옮기면 원래 카드가 dragend 전에 언마운트될 수 있다 — 드롭에서도 드래그를 풀고,
    // 뒤따르는 click만 이번 이벤트 턴 동안 무시한다(칸반 finishDealDrag와 같은 계약).
    setTimeout(() => { draggedRef.current = false; }, 0);
  };

  const dropOn = (lane) => {
    const item = dragId != null ? itemsById.get(dragId) : null;
    finishDrag();
    if (!item || item.lane === lane.key) return;
    const target = laneDropDate(lane.key);
    moveTo(item, target.iso, target.dateLabel);
  };

  const visible = (item) => !filter || item.certainty.key === filter;
  const sumOf = (items) => items.reduce((sum, item) => sum + item.amount, 0);

  const renderCard = (item) => (
    <DealTimeCard
      key={item.id}
      item={item}
      stages={stages}
      describe={describe}
      selected={selectedId === item.id}
      rail={timeline.railIds.has(item.id)}
      dragging={dragId === item.id}
      onActivate={activate}
      onDragStart={(e, dragged) => {
        draggedRef.current = true;
        setDragId(dragged.id);
        try {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(dragged.id));
        } catch { /* 일부 브라우저는 dataTransfer 쓰기를 막는다 — 상태만으로 충분하다 */ }
      }}
      onDragEnd={finishDrag}
    />
  );

  let body;
  if (timeline.count === 0) {
    body = syncState === "preview" ? (
      <div className="fx-card deals-tl-empty">
        <TruthBadge state="preview" />
        <p>Supabase가 연결되지 않아 거래 기록을 읽지 않았어요. 연결되면 예상일에 따라 칸이 채워집니다.</p>
      </div>
    ) : (
      <div className="fx-card deals-tl-empty">
        <EmptyState
          icon="deals"
          title="진행 중인 거래가 없어요"
          description="거래를 등록하면 예상일에 따라 이번 주 · 다음 주 · 나중에 · 날짜 미정 칸에 놓입니다."
          action={canCreate ? <Button variant="secondary" size="sm" icon="plus" onClick={onCreate}>거래 등록</Button> : undefined}
          style={{ minHeight: 180 }}
        />
      </div>
    );
  } else {
    body = (
      <div className="deals-tl-lanes">
        {timeline.lanes.map((lane) => {
          const laneItems = lane.items.filter(visible);
          return (
            <section
              key={lane.key}
              className="deals-tl-lane"
              data-current={lane.current ? "true" : undefined}
              data-over={overLane === lane.key ? "true" : undefined}
              aria-labelledby={`deals-lane-${lane.key}`}
              onDragOver={(e) => {
                if (dragId == null) return;
                e.preventDefault();
                if (overLane !== lane.key) setOverLane(lane.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOverLane((cur) => (cur === lane.key ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(lane);
              }}
            >
              <header className="deals-tl-lane__head">
                <h3 id={`deals-lane-${lane.key}`}>
                  {lane.current && <span className="deals-tl-now" aria-hidden="true" />}
                  {lane.title}
                </h3>
                <small>{lane.rangeLabel}</small>
                <span className="stat deals-tl-lane__total">{formatWon(sumOf(laneItems))}</span>
              </header>
              <div className="deals-tl-cards">
                {lane.key === "later"
                  ? lane.groups.map((group) => {
                    const groupItems = group.items.filter(visible);
                    if (!groupItems.length) return null;
                    return (
                      <React.Fragment key={group.key}>
                        <p className="fx-eyebrow deals-tl-group">{group.label} · {formatWon(sumOf(groupItems))}</p>
                        {groupItems.map(renderCard)}
                      </React.Fragment>
                    );
                  })
                  : laneItems.map(renderCard)}
                {laneItems.length === 0 && (
                  <p className="deals-tl-drop-hint">{dragId != null ? "여기로 옮기기" : "비어 있어요"}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="deals-tl" data-dock-open={selectedItem ? "true" : undefined}>
      <CertaintyRibbon month={timeline.month} filter={filter} onToggle={(key) => setFilter((cur) => (cur === key ? null : key))} />
      {timeline.stalled.length > 0 && (
        <StalledStrip items={timeline.stalled} describe={describe} onAsk={(item) => openRecord(item, { kind: "kakao" })} />
      )}
      {timeline.overdueCount > MAX_DANGER_RAILS && (
        <p className="deals-tl-overdue" role="status">
          <Iconed name="clock" size={13} /> 약속이 지난 거래 <span className="num">{timeline.overdueCount}</span>건
        </p>
      )}
      {body}

      {selectedItem && (
        <DealDock
          item={selectedItem}
          stages={stages}
          describe={describe}
          customerKey={customerKey}
          primaryRef={dockPrimaryRef}
          onClose={closeDock}
          onRecord={() => openRecord(selectedItem)}
          onAdvance={(stageKey) => onAdvanceStage(selectedItem.id, stageKey)}
          onMoveDate={(iso, dateLabel) => moveTo(selectedItem, iso, dateLabel)}
          onEdit={() => onEdit(selectedItem.id)}
          onOpenCustomer={() => onNavigate?.(`dashboard/revenue/customers?customer=${encodeURIComponent(customerKey)}`)}
        />
      )}

      {record && (
        <ContactRecordDrawer
          target={record.target}
          preset={record.preset || undefined}
          draft={record.draft || null}
          initialError={record.error || ""}
          onSaved={() => { window.setTimeout(() => onReload?.(), UNDO_WINDOW_MS + 250); }}
          onPersisted={() => toast.success(`기록됨 · ${record.target.name}`)}
          onFailed={({ message, form }) => {
            toast.error(`기록하지 못했습니다 · ${record.target.name} — ${message}`);
            setRecord((cur) => cur || { ...record, draft: form, error: message });
          }}
          onClose={() => setRecord(null)}
        />
      )}
    </div>
  );
}
