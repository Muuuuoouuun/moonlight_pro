"use client";

import React from 'react';
import { guidanceDailyWindow, guidancePeriodKey, selectGuidanceCard } from '@com-moon/guru-guidance';
import { GuidanceSource } from './guidance-source';
import './guru-guidance-card.css';

const HIDDEN_KEY = 'mlp.guruGuidanceHidden';
const DOMAIN_LABELS = { sales: '세일즈', marketing: '마케팅', content: '콘텐츠' };

export function GuruGuidanceCard({ domain = 'sales', contextKey, compact = false, allowDomains = false, onAsk, onBrowse }) {
  const [selectedDomain, setSelectedDomain] = React.useState(domain);
  const [cadence, setCadence] = React.useState('daily');
  const [offset, setOffset] = React.useState(0);
  const [hidden, setHidden] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());
  const [newWindowReady, setNewWindowReady] = React.useState(false);

  React.useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDDEN_KEY) === '1'); } catch {}
  }, []);

  React.useEffect(() => {
    const refreshDate = () => {
      if (document.hidden) return;
      const current = new Date();
      if (guidanceDailyWindow(current).key !== guidanceDailyWindow(now).key) {
        setOffset(0);
        setNewWindowReady(false);
      }
      setNow(current);
    };
    document.addEventListener('visibilitychange', refreshDate);
    window.addEventListener('focus', refreshDate);
    return () => {
      document.removeEventListener('visibilitychange', refreshDate);
      window.removeEventListener('focus', refreshDate);
    };
  }, [now]);

  React.useEffect(() => {
    if (hidden || cadence !== 'daily' || newWindowReady) return;
    const windowInfo = guidanceDailyWindow(now);
    const delay = Math.max(0, new Date(windowInfo.nextAt).getTime() - Date.now()) + 100;
    const timer = window.setTimeout(() => {
      if (!document.hidden && guidanceDailyWindow(new Date()).key !== windowInfo.key) setNewWindowReady(true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [hidden, cadence, now, newWindowReady]);

  const dailyWindow = guidanceDailyWindow(now);
  const card = selectGuidanceCard({ cadence, domain: selectedDomain, contextKey, now, offset });
  const period = cadence === 'daily' ? dailyWindow.date : guidancePeriodKey('weekly', now);
  const nextTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dailyWindow.nextAt));
  const showCurrentWindow = () => {
    setNow(new Date());
    setOffset(0);
    setNewWindowReady(false);
  };
  const chooseCadence = value => { setCadence(value); setOffset(0); onBrowse?.(); };
  const chooseDomain = value => { setSelectedDomain(value); setOffset(0); onBrowse?.(); };
  const setVisibility = visible => {
    if (visible) {
      setNow(new Date());
      setOffset(0);
      setNewWindowReady(false);
    }
    setHidden(!visible);
    onBrowse?.();
    try { sessionStorage.setItem(HIDDEN_KEY, visible ? '0' : '1'); } catch {}
  };

  if (hidden) {
    return <div className={`guru-guidance guru-guidance--hidden${compact ? ' guru-guidance--compact' : ''}`}>
      <span>Guru 카드를 이 세션에서 숨겼습니다.</span>
      <button type="button" onClick={() => setVisibility(true)}>다시 보기</button>
    </div>;
  }

  return (
    <section className={`guru-guidance${compact ? ' guru-guidance--compact' : ''}`} aria-label={cadence === 'daily' ? '현재의 Guru 관점' : '이번 주의 Legend 관점'}>
      {!compact && <div className="guru-guidance__selectors">
        <div className="guru-guidance__group" aria-label="카드 종류">
          <button type="button" aria-pressed={cadence === 'daily'} onClick={() => chooseCadence('daily')}>하루 세 번 · Guru</button>
          <button type="button" aria-pressed={cadence === 'weekly'} onClick={() => chooseCadence('weekly')}>매주 · Legend</button>
        </div>
        {allowDomains && cadence === 'daily' && <div className="guru-guidance__group" aria-label="실무 분야">
          {Object.entries(DOMAIN_LABELS).map(([key, label]) => <button key={key} type="button" aria-pressed={selectedDomain === key} onClick={() => chooseDomain(key)}>{label}</button>)}
        </div>}
      </div>}
      <div className="guru-guidance__card">
        <div className="guru-guidance__top">
          <span>{cadence === 'daily' ? '지금의 실무 관점' : '이번 주의 판단 관점'}</span>
          <span className="mono">{period} · {offset ? '직접 넘겨본 카드' : cadence === 'daily' ? `${dailyWindow.label} · ${newWindowReady ? '새 관점 준비됨' : `다음 ${nextTime}`}` : '매주 교체'}</span>
        </div>
        <div className="guru-guidance__domain">{card.domain === 'perspective' ? 'Legend' : DOMAIN_LABELS[card.domain]}</div>
        <h3>{card.person}</h3>
        <p className="guru-guidance__text">{card.text}</p>
        {!compact && <div className="guru-guidance__use"><span>써볼 때</span><p>{card.useWhen}</p></div>}
        <GuidanceSource source={card.source} className="guru-guidance__source" />
        <div className="guru-guidance__actions">
          {cadence === 'daily' && newWindowReady && <button type="button" onClick={showCurrentWindow}>새 시간대 관점 보기</button>}
          {onAsk && card.domain === 'sales' && <button type="button" className="guru-guidance__ask" onClick={() => onAsk(card)}>이 관점으로 묻기</button>}
          <button type="button" onClick={() => { setOffset(value => value + 1); onBrowse?.(); }}>다른 카드 보기</button>
          <button type="button" onClick={() => setVisibility(false)}>이 세션에서 숨기기</button>
        </div>
      </div>
      {!compact && <p className="guru-guidance__foot">Guru 관점은 서울 기준 09·14·19시에 준비됩니다. 읽는 동안 자동으로 넘어가지 않으며, 열람은 업무를 생성하지 않습니다.</p>}
    </section>
  );
}
