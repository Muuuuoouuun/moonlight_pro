"use client";

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isDailyReviewDate } from '@/lib/daily-review';
import { zonedClock } from '@/lib/daily-review-rhythm';
import { DailyReviewComposer } from './pages/daily-review-composer';
import { useDailyReview } from './pages/use-daily-review';
// 팝업과 오늘·홈의 cue 행이 어느 페이지에서든 그려지므로 스타일도 셸에서 읽는다.
import './pages/daily-review.css';

// 하루 리뷰 팝업을 셸로 올린다(2026-09-23 지속 루프 설계 §4.1·§4.2).
// - model은 하나: 페이지·팝업·오늘/홈 cue가 같은 초안·revision·충돌 상태를 본다.
// - `?review=today|YYYY-MM-DD`는 어느 대시보드 경로에서든 팝업을 1회 열고 쿼리를 소거한다(§8.1 딥링크).
const DailyReviewContext = React.createContext(null);

export function useDailyReviewLauncher() {
  return React.useContext(DailyReviewContext);
}

export function DailyReviewProvider({ children }) {
  const model = useDailyReview();
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname() || '/dashboard';
  const searchParams = useSearchParams();
  const requested = searchParams.get('review');
  const consumed = React.useRef(null);
  const { chooseDate, busy, source, todayKey, timezone, refresh } = model;

  const openReview = React.useCallback((date) => {
    if (isDailyReviewDate(date)) chooseDate(date);
    setOpen(true);
  }, [chooseDate]);
  const closeReview = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!requested) { consumed.current = null; return; }
    if (consumed.current === requested || source === 'loading') return;
    consumed.current = requested;
    const date = requested === 'today' ? (todayKey || zonedClock(new Date(), timezone).dateKey) : requested;
    if (isDailyReviewDate(date)) openReview(date);
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('review');
    const query = rest.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [requested, source, todayKey, timezone, openReview, searchParams, pathname, router]);

  // 탭을 켜 둔 채 날짜가 바뀌면(자정·다음 날 아침) 돌아왔을 때 한 번 다시 읽는다 — cue가 어제 기준으로 남지 않게.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || open || busy || !todayKey) return;
      if (zonedClock(new Date(), timezone).dateKey !== todayKey) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [open, busy, todayKey, timezone, refresh]);

  return <DailyReviewContext.Provider value={{ model, open, openReview, closeReview }}>
    {children}
    {open && <DailyReviewComposer key={model.date} model={model} onClose={closeReview} />}
  </DailyReviewContext.Provider>;
}
