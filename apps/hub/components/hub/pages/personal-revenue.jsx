"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  SyncBadge,
} from "../hub-primitives";
import { filterDealsByWorkspace } from "../workspace-map";
import { buildPersonalRevenueRoadmap } from "@/lib/personal-revenue-roadmap";

const DRAWER_ID = "personal-revenue-deal-drawer";

const CERTAINTY_ICON = {
  confirmed: "check",
  waiting: "clock",
  likely: "sparkle",
  possible: "signal",
};

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "₩0";
  if (amount >= 1_000_000) return `₩${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₩${Math.round(amount / 1_000)}K`;
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`;
}

function formatFullDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function TimelineLegend() {
  return (
    <div className="personal-revenue-legend" aria-label="매출 확실성 범례">
      {[
        ["confirmed", "확정"],
        ["waiting", "입금 대기"],
        ["likely", "가능성 높음"],
        ["possible", "진행 중"],
      ].map(([key, label]) => (
        <span key={key} className={`personal-revenue-legend-item is-${key}`}>
          <Iconed name={CERTAINTY_ICON[key]} size={13} />
          {label}
        </span>
      ))}
    </div>
  );
}

function RevenueSummary({ summary }) {
  const metrics = [
    { label: "30일 예상 유입", value: formatMoney(summary.expectedInflow), primary: true },
    { label: "확정", value: formatMoney(summary.confirmed) },
    { label: "입금 대기", value: formatMoney(summary.waiting) },
    { label: "가능성 높음", value: formatMoney(summary.likely) },
    { label: "다음 행동 없음", value: `${summary.missingNextAction}건` },
  ];

  return (
    <section className="personal-revenue-summary" aria-label="30일 매출 요약">
      {metrics.map((metric) => (
        <div key={metric.label} className={`personal-revenue-summary-item${metric.primary ? " is-primary" : ""}`}>
          <span>{metric.label}</span>
          <strong className="stat">{metric.value}</strong>
        </div>
      ))}
    </section>
  );
}

function RevenueTimeline({ model, selectedDealId, selectDeal, triggerRefs }) {
  return (
    <section className="personal-revenue-timeline-section" aria-labelledby="personal-revenue-timeline-title">
      <div className="personal-revenue-section-head">
        <div>
          <h3 id="personal-revenue-timeline-title">다가오는 매출 이벤트</h3>
          <p>{model.window.startLabel}부터 {model.window.endLabel}까지 · 예정일 기준</p>
        </div>
        <TimelineLegend />
      </div>

      <div className="personal-revenue-timeline-scroll" tabIndex="0" aria-label="30일 매출 타임라인">
        <div className="personal-revenue-timeline-canvas">
          <div className="personal-revenue-axis" aria-hidden="true" />
          {model.window.ticks.map((tick) => (
            <div
              key={tick.offset}
              className="personal-revenue-tick"
              style={{ "--tick-position": `${tick.position}%` }}
              aria-hidden="true"
            >
              <span>{tick.label}</span>
            </div>
          ))}

          {model.events.map((event, index) => (
            <button
              key={event.id}
              ref={(node) => {
                if (node) triggerRefs.current.set(event.id, node);
                else triggerRefs.current.delete(event.id);
              }}
              type="button"
              className="personal-revenue-event"
              data-certainty={event.certainty.key}
              data-selected={selectedDealId === event.id ? "true" : "false"}
              style={{
                "--event-position": `${event.position}%`,
                "--event-lane": index % 2,
              }}
              onClick={() => selectDeal(event.id)}
              aria-expanded={selectedDealId === event.id}
              aria-controls={selectedDealId === event.id ? DRAWER_ID : undefined}
              aria-label={`${event.name}, ${formatMoney(event.value)}, ${event.closeLabel}, ${event.certainty.label}`}
            >
              <span className="personal-revenue-event-marker" aria-hidden="true">
                <Iconed name={CERTAINTY_ICON[event.certainty.key]} size={14} />
              </span>
              <span className="personal-revenue-event-date mono">{event.closeLabel}</span>
              <strong>{event.name}</strong>
              <span className="stat">{formatMoney(event.value)}</span>
              <span className="personal-revenue-event-certainty">{event.certainty.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function RevenueActions({ model, selectDeal }) {
  return (
    <section className="personal-revenue-actions" aria-labelledby="personal-revenue-actions-title">
      <div className="personal-revenue-actions-title-row">
        <div>
          <h3 id="personal-revenue-actions-title">이번 주에 바꿀 수 있는 금액</h3>
          <p>예정 유입 중 아직 확정되지 않은 상위 행동</p>
        </div>
        <strong className="stat">{formatMoney(model.changeableAmount)}</strong>
      </div>

      <div className="personal-revenue-action-list">
        {model.actions.map((event, index) => (
          <button
            key={event.id}
            type="button"
            className="personal-revenue-action-row"
            onClick={() => selectDeal(event.id)}
          >
            <span className="personal-revenue-action-index mono">{index + 1}</span>
            <span className="personal-revenue-action-copy">
              <strong>{event.action.text}</strong>
              <small>{event.name} · {event.closeLabel}</small>
            </span>
            <span className="personal-revenue-action-value stat">{formatMoney(event.value)}</span>
            <span className={`personal-revenue-action-source is-${event.action.source}`}>{event.action.label}</span>
            <Iconed name="chevronR" size={15} />
          </button>
        ))}
      </div>
    </section>
  );
}

function DealDrawer({ deal, closeDrawer, closeButtonRef, onNavigate }) {
  const openDeal = () => {
    onNavigate?.(`dashboard/revenue/deals?scope=personal&deal=${encodeURIComponent(deal.id)}`);
  };

  return (
    <aside
      id={DRAWER_ID}
      className="personal-revenue-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="personal-revenue-drawer-title"
    >
      <div className="personal-revenue-drawer-head">
        <div>
          <div className="personal-revenue-eyebrow">선택한 딜</div>
          <h3 id="personal-revenue-drawer-title">{deal.name}</h3>
        </div>
        <IconButton
          ref={closeButtonRef}
          icon="x"
          size={44}
          iconSize={18}
          onClick={closeDrawer}
          aria-label="딜 상세 닫기"
        />
      </div>

      <div className="personal-revenue-drawer-value stat">{formatMoney(deal.value)}</div>
      <div className="personal-revenue-drawer-meta">
        <Badge tone="neutral" variant="outline">{deal.certainty.label}</Badge>
        <span>{deal.stageLabel}</span>
        <span>예정 {deal.closeLabel}</span>
      </div>

      <div className="personal-revenue-detail-grid">
        <div>
          <span>예정일</span>
          <strong>{formatFullDate(deal.closeAt)}</strong>
        </div>
        <div>
          <span>최근 접점</span>
          <strong>{Number.isFinite(Number(deal.age)) ? `${deal.age}일 전` : "기록 없음"}</strong>
        </div>
        <div>
          <span>담당</span>
          <strong>{deal.owner === "Me" ? "나" : deal.owner || "미지정"}</strong>
        </div>
      </div>

      <div className={`personal-revenue-next-action is-${deal.action.source}`}>
        <div>
          <span>다음 행동</span>
          <Badge tone="neutral" variant="outline" size="xs">{deal.action.label}</Badge>
        </div>
        <strong>{deal.action.text}</strong>
        {deal.action.source === "recommended" ? (
          <p>원장에 확정된 다음 행동이 없어 현재 단계에 맞춘 권장안을 표시합니다.</p>
        ) : null}
      </div>

      <div className="personal-revenue-drawer-actions">
        <Button variant="primary" size="md" iconRight="arrowRight" onClick={openDeal} style={{ minHeight: 44 }}>
          Deals에서 열기
        </Button>
        <Button variant="outline" size="md" onClick={closeDrawer} style={{ minHeight: 44 }}>
          패널 닫기
        </Button>
      </div>
    </aside>
  );
}

export function PersonalRevenueRoadmap({ ledger, syncState, onNavigate }) {
  const personalDeals = React.useMemo(
    () => filterDealsByWorkspace(ledger?.deals || [], "brand"),
    [ledger?.deals],
  );
  const model = React.useMemo(
    () => buildPersonalRevenueRoadmap(personalDeals, { days: 30 }),
    [personalDeals],
  );
  const [selectedDealId, setSelectedDealId] = React.useState(null);
  const triggerRefs = React.useRef(new Map());
  const closeButtonRef = React.useRef(null);
  const selectedDealIdRef = React.useRef(selectedDealId);
  selectedDealIdRef.current = selectedDealId;

  const selectedDeal = React.useMemo(
    () => model.events.find((event) => event.id === selectedDealId) || null,
    [model.events, selectedDealId],
  );

  const selectDeal = React.useCallback((dealId) => {
    setSelectedDealId(dealId);
  }, []);

  const closeDrawer = React.useCallback(() => {
    const closingId = selectedDealIdRef.current;
    setSelectedDealId(null);
    window.requestAnimationFrame(() => triggerRefs.current.get(closingId)?.focus());
  }, []);

  React.useEffect(() => {
    if (!selectedDealId) return;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selectedDealId]);

  React.useEffect(() => {
    if (!selectedDealId) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer, selectedDealId]);

  React.useEffect(() => {
    if (selectedDealId && !selectedDeal) setSelectedDealId(null);
  }, [selectedDeal, selectedDealId]);

  return (
    <div className={`personal-revenue-page${selectedDeal ? " has-drawer" : ""}`}>
      <main className="personal-revenue-main">
        <header className="personal-revenue-header">
          <div>
            <div className="personal-revenue-eyebrow">Founder cashflow</div>
            <h2>개인 매출</h2>
            <p>{formatFullDate(model.window.startAt)} · 향후 30일 (Asia/Seoul)<SyncBadge state={syncState} /></p>
          </div>
          <div className="personal-revenue-period" aria-label="조회 기간">
            <Iconed name="calendar" size={15} />
            30일
          </div>
        </header>

        <RevenueSummary summary={model.summary} />

        {syncState === "loading" ? (
          <Card className="personal-revenue-state-card">
            <div className="personal-revenue-loading" role="status">매출 원장을 불러오는 중…</div>
          </Card>
        ) : model.events.length === 0 ? (
          <Card className="personal-revenue-state-card" pad={false}>
            <EmptyState
              icon="calendar"
              title="예정일이 있는 개인 딜이 없습니다"
              description={ledger?.source === "supabase"
                ? "개인 딜에 예정일을 지정하면 30일 매출 타임라인과 실행 우선순위가 여기에 나타납니다."
                : "Preview · 연결된 매출 원장에 개인 딜과 예정일이 필요합니다."}
              action={<Button variant="outline" onClick={() => onNavigate?.("dashboard/revenue/deals?scope=personal")}>Deals 열기</Button>}
            />
          </Card>
        ) : (
          <>
            <RevenueTimeline
              model={model}
              selectedDealId={selectedDealId}
              selectDeal={selectDeal}
              triggerRefs={triggerRefs}
            />
            <RevenueActions model={model} selectDeal={selectDeal} />
          </>
        )}
      </main>

      {selectedDeal ? (
        <DealDrawer
          deal={selectedDeal}
          closeDrawer={closeDrawer}
          closeButtonRef={closeButtonRef}
          onNavigate={onNavigate}
        />
      ) : null}
    </div>
  );
}
