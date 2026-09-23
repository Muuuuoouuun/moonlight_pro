"use client";

import React from 'react';
import { reviewCue, weekProgress, zonedClock } from '@/lib/daily-review-rhythm';
import { Iconed } from './hub-icons';
import { useDailyReviewLauncher } from './daily-review-provider';
import { ENERGY_LABELS } from './pages/daily-review-labels';

// 오늘·홈의 "하루 마무리" 한 줄(2026-09-23 지속 루프 설계 §4.3). 규칙은 reviewCue가 소유하고
// 여기서는 그리기만 한다. 전부 중립 — ○(queued)·✓(done) 글리프와 직접 라벨, 경고색 없음(§5.2·§5.3).
// 최근 기록을 못 읽었거나(preview·error) 말할 게 없으면 아무것도 그리지 않는다.
function useHour(timezone) {
  const [clock, setClock] = React.useState(null);
  React.useEffect(() => {
    const tick = () => setClock(zonedClock(new Date(), timezone));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [timezone]);
  return clock;
}

export function DailyReviewCue({ className }) {
  const launcher = useDailyReviewLauncher();
  const model = launcher?.model;
  const clock = useHour(model?.timezone);
  if (!launcher || !model || model.source !== 'live' || !clock || !model.todayKey) return null;
  // 서버의 오늘과 기기의 오늘이 다르면(자정 직후) 다시 읽을 때까지 말하지 않는다.
  if (clock.dateKey !== model.todayKey) return null;
  const cue = reviewCue({ todayKey: model.todayKey, hour: clock.hour, recent: model.recent });
  if (!cue) return null;
  const week = weekProgress(model.todayKey, model.recent);
  const weekText = week ? `이번 주 ${week.recorded}/${week.workdays}일` : '';

  const copy = cue.kind === 'done'
    ? { icon: 'check', title: '오늘 기록함', meta: [cue.energy ? `에너지 ${cue.energy} · ${ENERGY_LABELS[cue.energy - 1]}` : '', weekText].filter(Boolean).join(' · '), action: '수정' }
    : cue.kind === 'backfill'
      ? { icon: 'clock', title: '어제 기록이 비어 있어요', meta: '지금 남겨도 그날 기록이 돼요', action: '어제 남기기' }
      : { icon: 'moon', title: '하루 마무리', meta: ['에너지 하나만 남겨도 돼요', weekText].filter(Boolean).join(' · '), action: '남기기' };

  return <button type="button" className={['daily-review-cue', 'hub-row', className].filter(Boolean).join(' ')} data-kind={cue.kind}
    aria-label={`하루 리뷰 · ${copy.title}${copy.meta ? ` · ${copy.meta}` : ''} · ${copy.action}`}
    onClick={() => launcher.openReview(cue.date)}>
    <Iconed name={copy.icon} size={15} />
    <span className="daily-review-cue-copy"><span>{copy.title}</span>{copy.meta && <span className="daily-review-cue-meta">{copy.meta}</span>}</span>
    <span className="daily-review-cue-action">{copy.action}<Iconed name="chevronR" size={12} /></span>
  </button>;
}
