"use client";

import React from 'react';
import { guidancePeriodKey, selectGuidanceCard } from '@com-moon/guru-guidance';
import './guru-guidance-card.css';

const HIDDEN_KEY = 'mlp.guruGuidanceHidden';
const DOMAIN_LABELS = { sales: '세일즈', marketing: '마케팅', content: '콘텐츠' };

export function GuruGuidanceCard({ domain = 'sales', compact = false, allowDomains = false, onAsk, onBrowse }) {
  const [selectedDomain, setSelectedDomain] = React.useState(domain);
  const [cadence, setCadence] = React.useState('daily');
  const [offset, setOffset] = React.useState(0);
  const [hidden, setHidden] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDDEN_KEY) === '1'); } catch {}
    const refreshDate = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener('visibilitychange', refreshDate);
    window.addEventListener('focus', refreshDate);
    return () => {
      document.removeEventListener('visibilitychange', refreshDate);
      window.removeEventListener('focus', refreshDate);
    };
  }, []);

  const card = selectGuidanceCard({ cadence, domain: selectedDomain, now, offset });
  const period = guidancePeriodKey(cadence, now);
  const chooseCadence = value => { setCadence(value); setOffset(0); onBrowse?.(); };
  const chooseDomain = value => { setSelectedDomain(value); setOffset(0); onBrowse?.(); };
  const setVisibility = visible => {
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
    <section className={`guru-guidance${compact ? ' guru-guidance--compact' : ''}`} aria-label={cadence === 'daily' ? '오늘의 Guru 관점' : '이번 주의 Legend 관점'}>
      {!compact && <div className="guru-guidance__selectors">
        <div className="guru-guidance__group" aria-label="카드 종류">
          <button type="button" aria-pressed={cadence === 'daily'} onClick={() => chooseCadence('daily')}>매일 · Guru</button>
          <button type="button" aria-pressed={cadence === 'weekly'} onClick={() => chooseCadence('weekly')}>매주 · Legend</button>
        </div>
        {allowDomains && cadence === 'daily' && <div className="guru-guidance__group" aria-label="실무 분야">
          {Object.entries(DOMAIN_LABELS).map(([key, label]) => <button key={key} type="button" aria-pressed={selectedDomain === key} onClick={() => chooseDomain(key)}>{label}</button>)}
        </div>}
      </div>}
      <div className="guru-guidance__card">
        <div className="guru-guidance__top">
          <span>{cadence === 'daily' ? '오늘의 실무 관점' : '이번 주의 판단 관점'}</span>
          <span className="mono">{period} · {offset ? '직접 넘겨본 카드' : cadence === 'daily' ? '매일 교체' : '매주 교체'}</span>
        </div>
        <div className="guru-guidance__domain">{card.domain === 'perspective' ? 'Legend' : DOMAIN_LABELS[card.domain]}</div>
        <h3>{card.person}</h3>
        <p className="guru-guidance__text">{card.text}</p>
        {!compact && <div className="guru-guidance__use"><span>써볼 때</span><p>{card.useWhen}</p></div>}
        <p className="guru-guidance__source">자료 요약 · {card.source.title} · {card.source.section}</p>
        <div className="guru-guidance__actions">
          {onAsk && card.domain === 'sales' && <button type="button" className="guru-guidance__ask" onClick={() => onAsk(card)}>이 관점으로 묻기</button>}
          <button type="button" onClick={() => { setOffset(value => value + 1); onBrowse?.(); }}>다른 카드 보기</button>
          <button type="button" onClick={() => setVisibility(false)}>이 세션에서 숨기기</button>
        </div>
      </div>
      {!compact && <p className="guru-guidance__foot">화면을 보고 있는 동안 자동으로 넘어가지 않습니다. 카드를 읽어도 업무는 생성되지 않습니다.</p>}
    </section>
  );
}
