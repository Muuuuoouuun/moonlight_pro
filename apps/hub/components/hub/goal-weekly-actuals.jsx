"use client";
import React from 'react';
import { Button, EmptyState, ScrollShadowX, SegmentedControl, Skeleton, TruthBadge } from './hub-primitives';
import { toZonedDateKey } from '@/lib/rhythm-calendar';
import { weeklyActualsModel, weeklyPeriods } from '@/lib/weekly-report-fields';
import './goals.css';

// 주간 실측 — 주간 리포트와 같은 정의로 지난 주들을 나란히 본다(2026-09-20 §7.1 "목표치는 실측 뒤").
// 목표값을 제안하거나 저장하지 않는다. 주마다 따로 읽어 한 주의 실패가 다른 주의 숫자를 지우지 않는다.
const WEEKS = 4;
const SCOPES = [{ key: 'personal', label: '개인' }, { key: 'company', label: 'ClassIn' }];
const shortDate = value => value.slice(5).replace('-', '.');
const seoulToday = () => toZonedDateKey(new Date(), 'Asia/Seoul');
// 한 주가 늦어도 표 전체가 스켈레톤에 묶이지 않도록 주마다 끊는다(목표 읽기와 같은 20초).
const WEEK_TIMEOUT_MS = 20000;

async function readWeek(scope, period, signal) {
  const params = new URLSearchParams({ scope, periodStart: period.periodStart, periodEnd: period.periodEnd, goals: '0' });
  try {
    const response = await fetch(`/api/hub/weekly-report?${params}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(WEEK_TIMEOUT_MS)]) });
    const data = await response.json().catch(() => null);
    return response.ok && data ? data : { status: 'error' };
  } catch (error) {
    if (signal.aborted) throw error;
    return { status: 'error' };
  }
}

export function GoalWeeklyActuals({ scope: pageScope, onCreate }) {
  const [pickedScope, setPickedScope] = React.useState('personal');
  const scope = pageScope || pickedScope;
  const [today, setToday] = React.useState(seoulToday);
  const periods = React.useMemo(() => weeklyPeriods({ scope, today, count: WEEKS }), [scope, today]);
  const [attempt, setAttempt] = React.useState(0);
  // 응답은 요청 키와 함께 둔다 — 범위가 바뀐 첫 렌더에 이전 범위의 값이 새 주 열에 그려지지 않게.
  const requestKey = `${scope}|${today}|${attempt}`;
  const [loaded, setLoaded] = React.useState({ key: '', reports: [] });
  React.useEffect(() => {
    const controller = new AbortController();
    periods.forEach((period, index) => {
      readWeek(scope, period, controller.signal).then(report => {
        if (!controller.signal.aborted) setLoaded(current => {
          const next = current.key === requestKey ? [...current.reports] : [];
          next[index] = report;
          return { key: requestKey, reports: next };
        });
      }).catch(() => {});
    });
    return () => controller.abort();
  }, [scope, periods, requestKey]);
  const reports = loaded.key === requestKey ? loaded.reports : [];
  const model = weeklyActualsModel({ scope, periods, reports });
  const reload = () => { setToday(seoulToday()); setAttempt(value => value + 1); };
  const defined = model.rows.filter(row => row.definition);

  return <section className="goal-weekly" aria-label="주간 실측" aria-busy={model.state === 'loading'}>
    <div className="goal-toolbar">
      {!pageScope && <SegmentedControl label="주간 실측 소속" value={scope} options={SCOPES} onChange={setPickedScope} />}
      <TruthBadge state={model.state} />
      <span className="goal-muted">{scope === 'company' ? '목요일' : '월요일'}에 시작하는 7일 · 끝난 날만 · Asia/Seoul</span>
      <Button disabled={model.state === 'loading'} onClick={reload}>새로고침</Button>
    </div>
    {model.state === 'loading' ? <Skeleton lines={6} height={16} label="주간 실측 불러오는 중" />
      : model.state === 'preview' ? <EmptyState title="측정 기록 연결이 필요합니다" description="연결하면 지난 주들의 실측을 같은 정의로 나란히 볼 수 있습니다." />
      : model.state === 'error' ? <EmptyState title="주간 실측을 읽지 못했습니다" description="숫자 없이 목표를 정하지 말고 다시 불러오세요." action={<Button variant="outline" onClick={reload}>다시 불러오기</Button>} />
      : <ScrollShadowX><table className="goal-weekly-table" aria-label={`${scope === 'company' ? 'ClassIn' : '개인'} 주간 실측 · 최근 ${model.columns.length}개 기간`}>
        <thead><tr>
          <th scope="col">지표</th>
          {model.columns.map(column => <th scope="col" key={column.periodStart}>
            <span className="mono">{shortDate(column.periodStart)}–{shortDate(column.periodEnd)}</span>
            <span className="goal-weekly-note">{column.current ? `이번 주 · ${column.days}일` : '7일'}</span>
            {column.state === 'partial' && <TruthBadge state="partial" label="일부" />}
            {column.state === 'error' && <TruthBadge state="error" label="읽기 실패" />}
          </th>)}
        </tr></thead>
        <tbody>{model.rows.map(row => <tr key={row.key}>
          <th scope="row">{row.label}</th>
          {row.cells.map((cell, index) => <td key={model.columns[index].periodStart}>
            {cell.text === null ? <span className="mono goal-weekly-empty" role="img" aria-label="미측정">—</span>
              : <><span className="mono">{cell.text}</span>{cell.rate !== null && <span className="num goal-weekly-rate">{cell.rate}%</span>}</>}
          </td>)}
        </tr>)}</tbody>
      </table></ScrollShadowX>}
    {['live', 'partial'].includes(model.state) && <>
      <p className="goal-muted">‘—’는 0이 아니라 확인하지 못한 값입니다. 이번 주는 어제까지의 누적이라 완료된 주와 직접 비교하지 마세요.</p>
      {model.missingGroups.length > 0 && <ul className="goal-weekly-missing" aria-label="확인하지 못한 원천">{model.missingGroups.map(group => <li key={group.labels.join('|')}>{group.labels.join(' · ')} 확인 못 함 · <span className="mono">{group.periods.map(([start, end]) => `${shortDate(start)}–${shortDate(end)}`).join(', ')}</span></li>)}</ul>}
      {defined.length > 0 && <details className="goal-options"><summary>집계 정의</summary><dl className="goal-weekly-definitions">{defined.map(row => <div key={row.key}><dt>{row.label}</dt><dd>{row.definition}</dd></div>)}</dl></details>}
    </>}
    <div className="goal-actions"><p className="goal-muted">목표값은 자동으로 정하지 않습니다. 2주 이상 실측을 본 뒤 목표와 지표를 직접 만드세요.</p>{onCreate && <Button variant="outline" onClick={onCreate}>목표 만들기</Button>}</div>
  </section>;
}
