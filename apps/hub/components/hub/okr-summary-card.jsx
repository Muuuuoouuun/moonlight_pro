"use client";

import React from "react";
import Link from "next/link";
import { Card, EmptyState, Progress, Skeleton, TruthBadge } from "./hub-primitives";
import { useGoals } from "./use-goals";
import { GOAL_WORK_BASE, goalHref, measurementLabel } from "@/lib/goal-client";
import { goalCheckRows } from "@/lib/goal-input-ux";
import "./okr-summary-card.css";

/**
 * 현황에 띄우는 OKR·KPI 요약 — 진행 중 목표의 핵심 지표 몇 줄과 "근거 확인 필요" 수.
 *
 * 추적의 본체는 내 작업 › OKR·KPI(`dashboard/work/goals`)이고, 이 카드는 같은 `useGoals` 읽기를
 * 한 번 더 보여 줄 뿐이다(2026-09-23 운영자 "위치는 내 작업 하위로, 현황에도 띄우기").
 * 읽기 상태는 목표 화면과 같은 truth(§5.3) — error/preview를 "목표 없음"으로 위장하지 않는다.
 */

const MAX_ROWS = 4;

function progressLabel(metric) {
  const state = metric.progress?.state;
  if (state === "achieved") return "기준 달성";
  if (state === "partial") return "일부 근거";
  if (state === "target_unset") return "목표 미설정";
  if (state === "unmeasured" || !metric.measurement) return "미측정";
  return "진행 중";
}

export function OkrSummaryCard() {
  const model = useGoals("");
  const openHref = goalHref(null, "all", { base: GOAL_WORK_BASE });
  const checkHref = goalHref(null, "all", { base: GOAL_WORK_BASE, check: true });
  const readable = model.status === "live" || model.status === "partial";
  const rows = readable ? goalCheckRows(model, { status: "active" }) : [];
  const activeObjectives = readable ? model.objectives.filter((o) => o.status === "active").length : 0;
  const needsEvidence = rows.filter((r) => r.needsEvidence).length;

  return (
    <Card>
      <div className="okr-summary__head">
        <div>
          <div className="okr-summary__title">OKR·KPI</div>
          <div className="okr-summary__sub">
            {readable
              ? <>진행 중 목표 <span className="num">{activeObjectives}</span> · 지표 <span className="num">{rows.length}</span>{needsEvidence > 0 ? <> · 근거 확인 필요 <span className="num">{needsEvidence}</span></> : null}</>
              : "목표와 핵심 지표의 현재 값"}
          </div>
        </div>
        <div className="okr-summary__actions">
          {model.status !== "live" && model.status !== "loading" && <TruthBadge state={model.status} />}
          <Link className="hub-row okr-summary__link" href={openHref}>OKR·KPI 열기 →</Link>
        </div>
      </div>

      {model.status === "loading" && <Skeleton lines={3} height={16} label="OKR·KPI 불러오는 중" />}

      {(model.status === "error" || model.status === "preview") && (
        <p className="okr-summary__note">
          {model.status === "error"
            ? "목표 기록을 읽지 못했습니다. 지표가 없는 상태로 판단하지 않습니다."
            : "목표 저장소가 연결되면 핵심 지표가 여기에 뜹니다."}
        </p>
      )}

      {readable && rows.length === 0 && (
        <EmptyState
          icon="signal"
          title={activeObjectives ? "측정 지표를 정해 주세요" : "진행 중인 목표가 없습니다"}
          description="목표와 결과 지표를 정하면 이번 기간의 값이 여기에 뜹니다."
          action={<Link className="hub-row okr-summary__link" href={openHref}>목표 만들러 가기 →</Link>}
          style={{ minHeight: 140 }}
        />
      )}

      {rows.length > 0 && (
        <ul className="okr-summary__list">
          {rows.slice(0, MAX_ROWS).map(({ objective, metric, needsEvidence: missing }) => {
            const value = Number.isFinite(metric.progress?.value) ? metric.progress.value : null;
            return (
              <li key={metric.id} className="okr-summary__row">
                <div className="okr-summary__identity">
                  <span className="okr-summary__metric">{metric.name}</span>
                  <span className="okr-summary__objective">{objective.title}</span>
                </div>
                <div className="okr-summary__value">
                  <span className="stat">{measurementLabel(metric)}</span>
                  <span className="okr-summary__target">
                    {metric.direction === "range" ? `기준 ${metric.targetMin ?? "—"}–${metric.targetMax ?? "—"}` : `목표 ${metric.target ?? "—"}`} {metric.unit}
                  </span>
                </div>
                <div className="okr-summary__state">
                  <span>{missing ? "근거 확인 필요" : progressLabel(metric)}</span>
                  {value !== null && !missing && <Progress value={value} tone="neutral" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > MAX_ROWS && (
        <Link className="hub-row okr-summary__more" href={checkHref}>지표 {rows.length - MAX_ROWS}개 더 · 빠른 체크로 보기 →</Link>
      )}
    </Card>
  );
}
