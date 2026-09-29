"use client";

import React from 'react';
import { blankReviewDraft } from '@/lib/daily-review-state';
import { reviewCue, savedMessage, weekProgress, zonedClock } from '@/lib/daily-review-rhythm';
import { Iconed } from './hub-icons';
import { IconButton, useToast } from './hub-primitives';
import { useDailyReviewLauncher } from './daily-review-provider';
import { ENERGY_LABELS } from './pages/daily-review-labels';
import { ReviewWeekStrip } from './daily-review-weekstrip';
import { EnergyMoon } from './energy-moon';

export { ReviewWeekStrip };

// 오늘·홈의 "하루 마무리" 한 줄(2026-09-23 지속 루프 설계 §4.3, 2차 §11). 규칙은 reviewCue가 소유하고
// 여기서는 그리기만 한다. 전부 중립 — ○(queued)·✓(done)·시계(waiting) 글리프와 직접 라벨, 경고색 없음(§5.2·§5.3).
// 최근 기록을 못 읽었거나(preview·error) 말할 게 없으면 아무것도 그리지 않는다.

function useClock(timezone) {
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
  const toast = useToast();
  const model = launcher?.model;
  const clock = useClock(model?.timezone);
  const [savingEnergy, setSavingEnergy] = React.useState(null);
  if (!launcher || !model || model.source !== 'live' || !clock || !model.todayKey) return null;
  // 서버의 오늘과 기기의 오늘이 다르면(자정 직후) 다시 읽을 때까지 말하지 않는다.
  if (clock.dateKey !== model.todayKey) return null;
  const cue = reviewCue({ todayKey: model.todayKey, hour: clock.hour, recent: model.recent });
  if (!cue) return null;
  const week = weekProgress(model.todayKey, model.recent);
  const weekText = week ? `이번 주 ${week.recorded}/${week.workdays}일` : '';

  // 한 번 탭으로 에너지만 저장(§11 2차) — 오늘 날짜를 보고 있고, 저장된 기록·쓰던 초안이 없을 때만.
  // 그 밖(다른 날을 보는 중·초안 있음)에는 팝업을 열어 기존 초안·충돌 계약을 그대로 탄다.
  const quickSave = cue.kind === 'evening' && model.date === model.todayKey && !model.review && !model.dirty && !model.busy;

  async function saveEnergy(energy) {
    if (savingEnergy !== null || !quickSave) return;
    setSavingEnergy(energy);
    try {
      const result = await model.save({ ...blankReviewDraft(model.todayKey), energy });
      if (result?.state === 'saved') {
        toast.success(savedMessage(model.todayKey, model.recent, result.review), {
          action: { label: '메모 더하기', onClick: () => launcher.openReview(model.todayKey) },
        });
      } else {
        // 실패·충돌 — 입력은 초안으로 남아 있다. 팝업이 원인과 재시도를 말한다.
        launcher.openReview(model.todayKey);
      }
    } finally { setSavingEnergy(null); }
  }

  const copy = cue.kind === 'done'
    ? { icon: 'check', title: '오늘 기록함', meta: cue.energy ? `에너지 ${cue.energy} · ${ENERGY_LABELS[cue.energy - 1]}` : '', action: '수정' }
    : cue.kind === 'backfill'
      ? { icon: 'clock', title: '어제 기록이 비어 있어요', meta: '지금 남겨도 그날 기록이 돼요', action: '어제 남기기' }
      : { icon: 'moon', title: '하루 마무리', meta: quickSave ? '오늘 에너지는?' : '에너지 하나만 남겨도 돼요', action: quickSave ? '메모까지' : '남기기' };

  return <div className={['daily-review-cue', className].filter(Boolean).join(' ')} data-kind={cue.kind} role="group" aria-label="하루 리뷰">
    <button type="button" className="daily-review-cue-main hub-row"
      aria-label={`하루 리뷰 · ${copy.title}${copy.meta ? ` · ${copy.meta}` : ''}${weekText ? ` · ${weekText}` : ''} · ${copy.action}`}
      onClick={() => launcher.openReview(cue.date)}>
      <Iconed name={copy.icon} size={15} />
      <span className="daily-review-cue-copy"><span>{copy.title}</span>{copy.meta && <span className="daily-review-cue-meta">{copy.meta}</span>}{quickSave && <span className="daily-review-cue-scale">1 지침 · 5 활기</span>}</span>
      {!quickSave && <span className="daily-review-cue-action">{copy.action}<Iconed name="chevronR" size={12} /></span>}
    </button>
    {quickSave && <span className="daily-review-cue-energy" role="group" aria-label="에너지 바로 저장, 1 많이 지침부터 5 활기참까지">
      {[1, 2, 3, 4, 5].map((energy) => <button key={energy} type="button" className="daily-review-cue-energy-btn mono"
        aria-label={`에너지 ${energy} ${ENERGY_LABELS[energy - 1]}로 저장`} aria-busy={savingEnergy === energy || undefined}
        disabled={savingEnergy !== null} onClick={() => saveEnergy(energy)}><EnergyMoon level={energy} size={16} /><span>{energy}</span></button>)}
    </span>}
    <ReviewWeekStrip week={week} />
  </div>;
}

// 상단바의 하루 리뷰 버튼(§12) — 어느 화면에서든 오늘 기록을 연다. 기록한 날은 작은 ✓가 붙고
// 이름(tooltip·aria-label)도 바뀐다 — 점 하나의 색으로만 말하지 않는다(§5.2).
export function DailyReviewTopButton({ className }) {
  const launcher = useDailyReviewLauncher();
  if (!launcher) return null;
  const { model, openReview } = launcher;
  const recorded = model.source === 'live' && Array.isArray(model.recent) && model.recent.some((entry) => entry.reviewDate === model.todayKey);
  const label = recorded ? '하루 리뷰 · 오늘 기록함' : '하루 리뷰 남기기';
  return <span className={['daily-review-topbtn', className].filter(Boolean).join(' ')} data-recorded={recorded || undefined}>
    <IconButton icon="brief" tooltip={label} onClick={() => openReview(model.todayKey)} />
    {recorded && <span className="daily-review-topbtn-check" aria-hidden="true"><Iconed name="check" size={9} /></span>}
  </span>;
}
