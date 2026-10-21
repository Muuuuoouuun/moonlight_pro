"use client";

import React from 'react';
import { guidanceDailyWindow, guidancePeriodKey, selectGuidanceCard } from '@com-moon/guru-guidance';
import { Iconed } from './hub-icons';
import './guidance-inline-tip.css';

const HOME_DOMAINS = ['sales', 'marketing', 'content'];

// 홈에서 지금 보는 확인할 것 카드의 대상 종류 → 그 일에 맞는 Guru 분야(7g, 2026-10-19).
// 고객·거래 계열은 세일즈, 콘텐츠는 콘텐츠. 그 밖의 대상은 시간대 순환을 그대로 쓴다.
const CONTEXT_DOMAINS = Object.freeze({
  deal: 'sales', lead: 'sales', 'lead-group': 'sales', account: 'sales', content: 'content',
});

export function guidanceContextDomain(context) {
  return CONTEXT_DOMAINS[context?.type] || null;
}

function homeGuidanceCard(now) {
  const { date, slot } = guidanceDailyWindow(now);
  const turn = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000) * 3 + slot;
  const source = turn % 4;
  return source === 3
    ? selectGuidanceCard({ cadence: 'weekly', now, offset: Math.floor(turn / 4) })
    : selectGuidanceCard({ cadence: 'daily', domain: HOME_DOMAINS[source], now });
}

export function nextInlineTipRefreshAt(variant, now = new Date()) {
  if (variant !== 'overview') return new Date(guidanceDailyWindow(now).nextAt);
  // The weekly key is Monday in Seoul. The following Monday 00:00 KST is
  // Sunday 15:00 UTC; Korea has no daylight-saving transition.
  const monday = guidancePeriodKey('weekly', now);
  return new Date(Date.parse(`${monday}T00:00:00Z`) + 7 * 86_400_000 - 9 * 3_600_000);
}

export function guidanceInlineTipModel(variant, now = new Date(), context = null) {
  const overview = variant === 'overview';
  const home = variant === 'home';
  const contextDomain = home ? guidanceContextDomain(context) : null;
  const card = contextDomain ? selectGuidanceCard({ cadence: 'daily', domain: contextDomain, now })
    : home ? homeGuidanceCard(now) : overview
    ? selectGuidanceCard({ cadence: 'weekly', now })
    : selectGuidanceCard({ cadence: 'daily', domain: 'sales', now });
  return {
    card,
    kind: home ? '한 줄 팁' : overview ? 'LEGEND' : 'GURU',
    label: home ? '오늘의 한 줄 팁' : overview ? '이번 주의 읽는 관점' : '이번 시간대의 실무 관점',
    href: `dashboard/agents/chat?card=${encodeURIComponent(card.id)}`,
    // 카드는 지금 보는 일의 분야에서 고른 것이지 그 기록을 읽고 만든 조언이 아니다 — 이름표가 그 차이를 말한다.
    contextLabel: contextDomain && context?.label ? `${context.label} 카드에 맞춘 관점` : null,
  };
}

export function GuidanceInlineTip({ variant, context = null, onNavigate, now: fixedNow }) {
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

  const { card, kind, label, href, contextLabel } = guidanceInlineTipModel(variant, now, context);
  return <aside className="guidance-inline-tip-wrap" aria-label={label}>
    <button
      type="button"
      className={`guidance-inline-tip hub-card-link${variant === 'home' ? ' guidance-inline-tip--home' : ''}`}
      aria-label={`${kind} 자료 요약 · ${card.person} · ${card.text} · 상세 보기`}
      onClick={() => onNavigate?.(href)}
    >
      <span className="guidance-inline-tip__kind">
        <span>{kind}<span className="guidance-inline-tip__kind-detail"> · 자료 요약</span></span>
        {contextLabel ? <span className="guidance-inline-tip__context">{contextLabel}</span> : null}
      </span>
      <span className="guidance-inline-tip__copy">{card.text}</span>
      <span className="guidance-inline-tip__person">{card.person}</span>
      <span className="guidance-inline-tip__arrow" aria-hidden="true"><Iconed name="arrowRight" size={15} /></span>
    </button>
  </aside>;
}
