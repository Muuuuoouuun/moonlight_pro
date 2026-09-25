"use client";

import React from 'react';
import { guidanceDailyWindow, guidancePeriodKey, selectGuidanceCard } from '@com-moon/guru-guidance';
import { Iconed } from './hub-icons';
import './guidance-inline-tip.css';

export function nextInlineTipRefreshAt(variant, now = new Date()) {
  if (variant !== 'overview') return new Date(guidanceDailyWindow(now).nextAt);
  // The weekly key is Monday in Seoul. The following Monday 00:00 KST is
  // Sunday 15:00 UTC; Korea has no daylight-saving transition.
  const monday = guidancePeriodKey('weekly', now);
  return new Date(Date.parse(`${monday}T00:00:00Z`) + 7 * 86_400_000 - 9 * 3_600_000);
}

export function guidanceInlineTipModel(variant, now = new Date()) {
  const overview = variant === 'overview';
  const card = overview
    ? selectGuidanceCard({ cadence: 'weekly', now })
    : selectGuidanceCard({ cadence: 'daily', domain: 'sales', now });
  return {
    card,
    kind: overview ? 'LEGEND' : 'GURU',
    label: overview ? '이번 주의 읽는 관점' : '이번 시간대의 실무 관점',
    href: `dashboard/agents/chat?card=${encodeURIComponent(card.id)}`,
  };
}

export function GuidanceInlineTip({ variant, onNavigate, now: fixedNow }) {
  const [now, setNow] = React.useState(() => fixedNow || new Date());

  React.useEffect(() => {
    if (fixedNow) return undefined;
    const refresh = () => {
      if (!document.hidden) setNow(new Date());
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fixedNow]);

  React.useEffect(() => {
    if (fixedNow) return undefined;
    const delay = Math.max(0, nextInlineTipRefreshAt(variant, now).getTime() - Date.now());
    const timer = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [fixedNow, now, variant]);

  const { card, kind, label, href } = guidanceInlineTipModel(variant, now);
  return <aside className="guidance-inline-tip-wrap" aria-label={label}>
    <button
      type="button"
      className="guidance-inline-tip hub-card-link"
      aria-label={`${kind} 자료 요약 · ${card.person} · ${card.text} · 상세 보기`}
      onClick={() => onNavigate?.(href)}
    >
      <span className="guidance-inline-tip__kind mono">{kind}<span className="guidance-inline-tip__kind-detail"> · 자료 요약</span></span>
      <span className="guidance-inline-tip__copy">{card.text}</span>
      <span className="guidance-inline-tip__person">{card.person}</span>
      <span className="guidance-inline-tip__arrow" aria-hidden="true"><Iconed name="arrowRight" size={15} /></span>
    </button>
  </aside>;
}
