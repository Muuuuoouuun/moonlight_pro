"use client";

import React from "react";
import Link from "next/link";
import { Button, Card, EmptyState, Skeleton, TruthBadge } from "./hub-primitives";
import { useGoals } from "./use-goals";
import { GOAL_WORK_BASE, goalHref, measurementLabel } from "@/lib/goal-client";
import { formatPaceNumber, metricFreshnessLabel } from "@/lib/goal-concepts";
import { goalSummary } from "@/lib/goal-summary";
import { ObjectiveTrack, WeekCells } from "./goal-progress";
import "./okr-summary-card.css";


// 내 작업 › OKR·KPI와 같은 읽기·점수·주간 칸을 쓴다. KPI에는 점수 막대를 붙이지 않는다.
export function OkrSummaryCard() {
  const model = useGoals("");
  return <OkrSummaryView model={model} />;
}

export function OkrSummaryView({ model }) {
  const openHref = goalHref(null, "all", { base: GOAL_WORK_BASE });
  const readable = model.status === "live" || model.status === "partial";
  const summary = React.useMemo(() => goalSummary(model), [model.objectives, model.metrics, model.observations, model.links, model.failedSources, model.truncatedSources, model.status]);

  return <Card>
    <div className="okr-summary__head">
      <div><div className="okr-summary__title">OKR·KPI</div><div className="okr-summary__sub">{readable ? <>진행 중 목표 <span className="num">{summary.activeCount}</span> · 결과와 이번 주 행동</> : "목표와 지킬 선의 현재 상태"}</div></div>
      <div className="okr-summary__actions">
        {model.status !== "live" && model.status !== "loading" && <TruthBadge state={model.status} />}
        <Link className="hub-row okr-summary__link" href={openHref}>OKR·KPI 열기 →</Link>
      </div>
    </div>
    {model.status === "loading" && <Skeleton lines={3} height={16} label="OKR·KPI 불러오는 중" />}
    {(model.status === "error" || model.status === "preview") && <div className="okr-summary__feedback">
      <p className="okr-summary__note">{model.status === "error" ? "목표 기록을 읽지 못했습니다. 다시 확인해 주세요." : "목표 저장소가 연결되면 결과와 이번 주 행동이 여기에 뜹니다."}</p>
      <Button variant="ghost" size="sm" disabled={model.refreshing} onClick={model.refresh}>다시 확인</Button>
    </div>}
    {readable && summary.activeCount === 0 && <EmptyState icon="signal" title={summary.objectiveState === 'live' && model.status === 'live' ? "진행 중인 목표가 없습니다" : "목표·지표 목록을 모두 확인하지 못했습니다"} description="읽기 상태와 목표 기간을 확인해 주세요." action={<Link className="hub-row okr-summary__link" href={openHref}>목표 만들러 가기 →</Link>} style={{ minHeight: 140 }} />}
    {readable && summary.activeCount > 0 && <>
      {summary.metricState !== 'live' && <div className="okr-summary__feedback" role="status"><TruthBadge state={summary.metricState} /><span>지표를 모두 확인하지 못했습니다.</span><Button variant="ghost" size="sm" disabled={model.refreshing} onClick={model.refresh}>다시 확인</Button></div>}
      <ul className="okr-summary__list">{summary.objectives.map(({ objective, today, period, score, drivers, milestone }) => <li key={objective.id} className="okr-summary__objective">
        <div className="okr-summary__objective-head"><Link className="hub-row okr-summary__objective-link" href={goalHref(objective.id, objective.scope, { base: GOAL_WORK_BASE })}>{objective.title}</Link><span className="stat okr-summary__score">{score.score === null ? '—' : score.score.toFixed(2)}</span></div>
        <p className="okr-summary__sub">{objective.scope === 'company' ? 'ClassIn' : '개인'} · {objective.periodStart}–{objective.periodEnd} · {period.phase === 'ended' ? '기간 종료 · 채점 확인' : period.phase === 'upcoming' ? '시작 전' : 'KR 진행 점수'}{score.unscored > 0 ? ` · 미측정 ${score.unscored}` : ''} · 바닥 0.7 · 천장 미등록</p>
        <ObjectiveTrack score={score.score} period={period} />
        {drivers.map(({ metric, pace, cells }) => <div key={metric.id} className="okr-summary__driver">
          <div className="okr-summary__driver-head"><span>{metric.name}</span><span className="mono">{pace?.weeklyPace ? `관측 차이 ${pace.weekDone === null ? '—' : formatPaceNumber(pace.weekDone)}${metric.unit || ''} · 균등 몫 약 ${formatPaceNumber(pace.weekQuota)}${metric.unit || ''}` : measurementLabel(metric)}</span></div>
          <span className="okr-summary__sub">{metric.sourceKey === 'manual' ? '직접 기록' : '자동 집계'} · {metricFreshnessLabel(metric, today, objective.timezone)}</span>
          {cells.length > 0 && <WeekCells cells={cells} unit={metric.unit} label={`${metric.name} 주별 균등 페이스 · 누적 관측 차이`} />}
        </div>)}
        {milestone && <p className={`okr-summary__milestone${milestone.daysLeft < 0 ? ' okr-summary__milestone--late' : ''}`}>다음: {milestone.entityTitle || '연결된 할 일'} · <span className="mono">{milestone.dueKey.slice(5)}</span>{milestone.daysLeft < 0 ? ' · 기한 지남' : ''}</p>}
      </li>)}</ul>
      <div className="okr-summary__foot"><span>{summary.metricState === 'error' || summary.objectiveState === 'error' ? 'KPI 확인 필요' : <>KPI 선 밖 <span className="num">{summary.kpis.outside}</span>{summary.kpis.unmeasured > 0 ? ` · 확인 필요 ${summary.kpis.unmeasured}` : ''}{summary.metricState === 'partial' ? ' · 일부 지표 기준' : ''}</>}</span>{summary.activeCount > summary.objectives.length && <span>목표 {summary.activeCount - summary.objectives.length}개는 본체에서 확인</span>}{summary.linkState !== 'live' && <span>마일스톤 확인 필요</span>}</div>
    </>}
  </Card>;
}
