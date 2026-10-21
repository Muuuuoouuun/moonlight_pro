"use client";

import React from "react";
import Link from "next/link";
import { Iconed } from "../hub-icons";
import { Button, Card, EmptyState, Skeleton, TruthBadge } from "../hub-primitives";
import { GlyphLabel, GoalGlyph, kpiRowsFor } from "../goal-glance";
import { GOAL_WORK_BASE, goalHref, goalSectionState } from "@/lib/goal-client";
import {
  KPI_HEALTH_LABEL,
  PACE_TONE_LABEL,
  daysSinceObservation,
  formatPaceNumber,
  keyResultPace,
  keyResultProgress,
  keyResultTone,
  metricFreshnessLabel,
  objectivePeriod,
  objectiveProgress,
  splitObjectiveMetrics,
} from "@/lib/goal-concepts";
import "./overview-goal-lens.css";

// 현황 · 목표 렌즈(10c "목표가 첫 화면", 2026-10-21 운영자 확정).
// 지키는 선(KPI) 한 줄 → 목표·핵심 결과 게이지 → 고른 목표에 이번 주 들어온 기록 · 멈춘 핵심 결과 · 이번 주 활동.
// 규칙은 내 작업 › OKR·KPI와 같은 goal-concepts를 그대로 읽는다. 모르는 값을 0으로 채우지 않는다.

// 내 작업 › OKR·KPI와 같은 글리프(✓ 선 안 · ▲ 선 밖 · ◐ 일부 근거 · ○ 미측정). 색은 선 밖에만.
const KPI_GLYPH = { inside: "✓", outside: "▲", partial: "◐", unmeasured: "○", unset: "○" };
const STALE_DAYS = 7;
// Card는 패딩·모서리를 인라인으로 정한다 — 클래스로는 이기지 못하므로 style로 넘긴다.
const PANEL_STYLE = { padding: 18, borderRadius: "var(--r-xl)" };
const CHECKIN_STYLE = { padding: "12px 14px 12px 20px", borderRadius: 999 };
const seoulDay = (date, timezone = "Asia/Seoul") => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
const shortDay = key => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
const percent = value => (Number.isFinite(value) ? Math.round(value) : null);

// 월요일 시작 이번 주의 시작일(YYYY-MM-DD).
function weekStartKey(todayKey) {
  const day = new Date(`${todayKey}T00:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

function Gauge({ value, marker, size = "md", label }) {
  const known = Number.isFinite(value);
  return (
    <span
      className={`ogl-gauge ogl-gauge--${size}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(value) : undefined}
      aria-valuetext={[known ? `${Math.round(value)}%` : "측정 전", Number.isFinite(marker) ? `기간 경과 ${Math.round(marker)}%` : null].filter(Boolean).join(" · ")}
    >
      <i className="ogl-gauge__fill" style={{ width: `${known ? Math.min(100, value) : 0}%` }} />
      {Number.isFinite(marker) && <span className="ogl-gauge__tick" style={{ left: `${Math.min(100, marker)}%` }} aria-hidden="true" />}
    </span>
  );
}

function buildGoals(model) {
  const observationsByMetric = new Map();
  for (const observation of model.observations) {
    const rows = observationsByMetric.get(observation.metricId) || [];
    rows.push(observation);
    observationsByMetric.set(observation.metricId, rows);
  }
  return model.objectives.filter(objective => objective.status === "active").map(objective => {
    const timezone = objective.timezone || "Asia/Seoul";
    const today = seoulDay(new Date(), timezone);
    const weekStart = weekStartKey(today);
    const period = objectivePeriod(objective, today);
    const { keyResults } = splitObjectiveMetrics(model.metrics, objective.id);
    const krs = keyResults.map(metric => {
      const rows = observationsByMetric.get(metric.id) || [];
      const pace = keyResultPace(metric, objective, rows, today);
      const since = daysSinceObservation(rows, today);
      return {
        metric,
        progress: keyResultProgress(metric),
        tone: keyResultTone(metric, pace, period),
        freshness: metricFreshnessLabel(metric, today, timezone),
        // 직접 기록하는 KR만 체크인이 필요하다 — 자동 집계는 사람이 적을 값이 없다.
        stale: metric.sourceKey === "manual" && (since === null || since > STALE_DAYS),
        since,
      };
    });
    const ids = new Set(keyResults.map(metric => metric.id));
    const records = model.observations
      .filter(item => ids.has(item.metricId) && Number.isFinite(Date.parse(item.observedAt)) && seoulDay(new Date(item.observedAt), timezone) >= weekStart)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
      .map(item => ({ item, metric: keyResults.find(metric => metric.id === item.metricId), day: seoulDay(new Date(item.observedAt), timezone) }));
    return { objective, today, period, krs, progress: objectiveProgress(keyResults), elapsed: period.elapsed === null ? null : period.elapsed * 100, records };
  });
}

function recordValue({ item, metric }) {
  if (item.coverage === "unmeasured" || !Number.isFinite(item.value)) return "미측정";
  return `${formatPaceNumber(item.value)}${metric?.unit || ""}${item.coverage === "partial" ? " · 일부" : ""}`;
}

function WeekActivity({ ledger, status, onLens }) {
  const days = Array.isArray(ledger?.activitySeries) ? ledger.activitySeries.slice(-7) : [];
  const sum = key => days.reduce((total, day) => total + (Number(day?.[key]) || 0), 0);
  // 다른 원천(자동화 등)이 일부만 읽혀도 일별 활동은 읽힌다 — 숫자는 보이고 일부 데이터임을 밝힌다.
  const known = (status === "live" || status === "partial") && days.length > 0;
  return (
    <Card style={PANEL_STYLE} className="ogl-panel ogl-panel--activity">
      <div className="ogl-panel__head"><span className="ogl-panel__title">이번 주 전체 활동</span><span className="ogl-panel__meta">최근 7일</span></div>
      <div className="ogl-activity">
        {known ? (
          <>
            <span>작업 <b className="num">{sum("work")}</b></span>
            <span>결정 <b className="num">{sum("decisions")}</b></span>
            <span>발행 <b className="num">{sum("content")}</b></span>
            {status === "partial" && <TruthBadge state="partial" />}
          </>
        ) : (
          <span className="ogl-muted">{status === "loading" ? "활동 기록 불러오는 중" : <>활동 기록 <TruthBadge state={status === "live" ? "partial" : status} /></>}</span>
        )}
        <span className="ogl-grow" />
        <Button variant="ghost" size="sm" iconRight="arrowRight" onClick={onLens}>집계로</Button>
      </div>
    </Card>
  );
}

export function OverviewGoalLens({ model, ledger, ledgerStatus, onLens }) {
  const readable = model.status === "live" || model.status === "partial";
  const goals = React.useMemo(() => (readable ? buildGoals(model) : []), [readable, model.objectives, model.metrics, model.observations]);
  const [selectedId, setSelectedId] = React.useState(null);
  const selected = goals.find(goal => goal.objective.id === selectedId) || goals[0] || null;
  const kpiRows = React.useMemo(() => (readable ? kpiRowsFor(model, goals.map(goal => goal.objective), null) : []), [readable, goals, model]);
  const metricState = readable ? goalSectionState(model, "operating_metrics") : model.status;
  const kpiHref = goalHref(null, "all", { kpi: true, base: GOAL_WORK_BASE });
  const openHref = goalHref(null, "all", { base: GOAL_WORK_BASE });

  if (model.status === "loading") {
    return <Card><Skeleton lines={4} height={18} label="목표 불러오는 중" /></Card>;
  }
  if (!readable) {
    return (
      <Card className="ogl-feedback">
        <TruthBadge state={model.status} />
        <p>{model.status === "error" ? "목표 기록을 읽지 못했습니다. 다시 확인해 주세요." : "목표 저장소가 연결되면 목표와 지킬 선이 여기에 뜹니다."}</p>
        <Button variant="ghost" size="sm" disabled={model.refreshing} onClick={model.refresh}>다시 확인</Button>
      </Card>
    );
  }
  if (goals.length === 0) {
    return (
      <EmptyState
        icon="signal"
        title={model.status === "live" ? "진행 중인 목표가 없습니다" : "목표 목록을 모두 확인하지 못했습니다"}
        description="목표를 만들면 진행 상황이 여기에 보입니다."
        action={<div className="ogl-row-actions"><Link className="hub-btn hub-btn--primary ogl-link-btn" href={goalHref(null, "all", { create: true, base: GOAL_WORK_BASE })}>목표 만들기</Link><Button variant="ghost" size="sm" onClick={onLens}>집계 보기</Button></div>}
        style={{ minHeight: 220 }}
      />
    );
  }

  const outside = kpiRows.filter(row => row.health === "outside").length;
  const stale = selected.krs.filter(kr => kr.stale);
  const checkHref = goalHref(selected.objective.id, selected.objective.scope, { check: true, base: GOAL_WORK_BASE });

  return (
    <div className="ogl">
      <div className="ogl-kpi-line" aria-label="지키는 선 · KPI">
        <span className="ogl-kpi-line__label">지키는 선</span>
        {kpiRows.length ? kpiRows.map(({ metric, health }) => {
          const measured = metric.measurement?.coverage !== "unmeasured" && Number.isFinite(metric.measurement?.value);
          return (
            <span key={metric.id} className={`ogl-kpi-chip${health === "outside" ? " ogl-kpi-chip--out" : ""}`} title={`${metric.name} · ${KPI_HEALTH_LABEL[health]}`}>
              <span className="ogl-kpi-chip__glyph" aria-hidden="true"><GoalGlyph glyph={KPI_GLYPH[health]} size={12} /></span>
              <span>{metric.name}</span>
              <b className="num">{measured ? `${formatPaceNumber(metric.measurement.value)}${metric.unit || ""}` : "—"}</b>
              <span className="ogl-sr">{KPI_HEALTH_LABEL[health]}</span>
            </span>
          );
        }) : <span className="ogl-muted">{metricState !== "live" ? "KPI 목록을 모두 확인하지 못했습니다" : "지킬 선(KPI)이 아직 없습니다"}</span>}
        {outside > 0 && <span className="ogl-kpi-line__count">선 밖 <b className="num">{outside}</b></span>}
        <span className="ogl-grow" />
        <Link className="hub-row ogl-link" href={kpiRows.length ? kpiHref : openHref}>OKR·KPI 열기 →</Link>
      </div>

      <div className="ogl-cols">
        <div className="ogl-stack">
          {goals.map(goal => {
            const on = goal.objective.id === selected.objective.id;
            const progress = percent(goal.progress);
            const recordCount = goal.records.length;
            return (
              <button key={goal.objective.id} type="button" className={`ogl-goal${on ? " ogl-goal--on" : ""}`} aria-pressed={on} onClick={() => setSelectedId(goal.objective.id)}>
                <span className="ogl-goal__head">
                  <span className="ogl-goal__title">{goal.objective.title}</span>
                  <span className="stat ogl-goal__pct">{progress === null ? "—" : progress}{progress !== null && <small>%</small>}</span>
                </span>
                <Gauge value={goal.progress} marker={goal.elapsed} label={`${goal.objective.title} 바닥까지 진행률`} />
                <span className="ogl-goal__meta">
                  바닥까지 {progress === null ? "측정 전" : `${progress}%`} · 기간 경과 {percent(goal.elapsed) ?? "—"}% · 이번 주 들어온 기록 <b className="num">{recordCount}</b>
                </span>
                <span className="ogl-krs">
                  {goal.krs.length ? goal.krs.map(kr => (
                    <span key={kr.metric.id} className="ogl-kr">
                      <span className="ogl-kr__name">{kr.metric.name}</span>
                      <Gauge value={kr.progress} marker={goal.elapsed} size="sm" label={`${kr.metric.name} 진행률`} />
                      <span className="num ogl-kr__pct">{percent(kr.progress) === null ? "—" : `${percent(kr.progress)}%`}</span>
                      <span className="ogl-chip"><GlyphLabel text={PACE_TONE_LABEL[kr.tone]} size={11} /></span>
                      <span className="ogl-kr__last">{kr.freshness}</span>
                    </span>
                  )) : <span className="ogl-muted">약속선이 있는 핵심 결과가 아직 없습니다</span>}
                </span>
              </button>
            );
          })}
          <Card style={CHECKIN_STYLE} className="ogl-checkin">
            <Iconed name="calendar" size={16} />
            <span className="ogl-checkin__text">주간 체크인 · <span className="ogl-muted">값이 필요한 핵심 결과 <b className="num">{stale.length}</b></span></span>
            <Link className="hub-btn hub-btn--secondary ogl-link-btn" href={checkHref}>체크인 열기 →</Link>
          </Card>
        </div>

        <div className="ogl-stack">
          <Card style={PANEL_STYLE} className="ogl-panel ogl-panel--grow">
            <div className="ogl-panel__head"><span className="ogl-panel__title">이 목표에 들어온 기록 · 이번 주</span><span className="ogl-panel__meta"><span className="num">{selected.records.length}</span>건</span></div>
            {selected.records.length ? (
              <ul className="ogl-records">
                {selected.records.slice(0, 8).map(record => (
                  <li key={record.item.id || `${record.item.metricId}-${record.item.observedAt}`} className="ogl-record">
                    <Iconed name={record.item.sourceKey === "manual" ? "edit" : "refresh"} size={14} />
                    <span className="ogl-record__kind">{record.item.sourceKey === "manual" ? "기록" : "집계"}</span>
                    <span className="ogl-record__text">{record.metric?.name || "핵심 결과"} · {recordValue(record)}</span>
                    <span className="mono ogl-record__at">{shortDay(record.day)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="ogl-muted ogl-panel__empty">이번 주에 이 목표로 들어온 기록이 아직 없습니다.</p>}
          </Card>

          <Card style={PANEL_STYLE} className="ogl-panel">
            <div className="ogl-panel__head"><span className="ogl-panel__title">멈춘 핵심 결과</span><span className="ogl-panel__meta">{STALE_DAYS}일 넘게 기록 없음</span></div>
            {stale.length ? (
              <ul className="ogl-stale">
                {stale.map(kr => (
                  <li key={kr.metric.id} className="ogl-stale__row">
                    <span className="ogl-stale__icon" aria-hidden="true"><Iconed name="pause" size={13} /></span>
                    <span className="ogl-stale__body"><b>{kr.metric.name}</b><span>{kr.since === null ? "아직 기록 없음" : `마지막 기록 ${kr.since}일 전`}{kr.tone !== "wait" ? ` · ${PACE_TONE_LABEL[kr.tone]}` : ""}</span></span>
                    <Link className="hub-btn hub-btn--secondary ogl-link-btn ogl-link-btn--sm" href={goalHref(selected.objective.id, selected.objective.scope, { check: true, base: GOAL_WORK_BASE })}>체크인 적기</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="ogl-muted ogl-panel__empty"><Iconed name="check" size={13} /> 모든 핵심 결과에 최근 기록이 있습니다</p>}
          </Card>

          <WeekActivity ledger={ledger} status={ledgerStatus} onLens={onLens} />
        </div>
      </div>
    </div>
  );
}

// 머리줄의 "기간 N% 지남" — 고른 목표가 없으면 문구를 비운다.
export function goalLensEyebrow(model) {
  if (model.status !== "live" && model.status !== "partial") return null;
  const objective = model.objectives.find(item => item.status === "active");
  if (!objective) return null;
  const today = seoulDay(new Date(), objective.timezone || "Asia/Seoul");
  const period = objectivePeriod(objective, today);
  const month = Number(today.slice(5, 7));
  return period.elapsed === null ? `${month}월` : `${month}월 · 기간 ${Math.round(period.elapsed * 100)}% 지남`;
}
