"use client";

import React from 'react';
import { guidanceDailyWindow, selectGuidanceCard } from '@com-moon/guru-guidance';
import { Button, Card, SegmentedControl } from '../hub-primitives';
import { GuidanceSource } from '../guidance-source';
import './mentor-shelf.css';

const HIDDEN_KEY = 'mlp.mentorShelfHidden';
const DOMAINS = [
  { key: 'sales', label: '세일즈' },
  { key: 'marketing', label: '마케팅' },
  { key: 'content', label: '콘텐츠' },
];
export function MentorShelf({ onGuidanceAsk, onNavigate }) {
  const [domain, setDomain] = React.useState('sales');
  const [guruOffset, setGuruOffset] = React.useState(0);
  const [legendOffset, setLegendOffset] = React.useState(0);
  const [hidden, setHidden] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());
  const [newWindowReady, setNewWindowReady] = React.useState(false);

  React.useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDDEN_KEY) === '1'); } catch {}
  }, []);

  React.useEffect(() => {
    const refreshOnReturn = () => {
      if (document.hidden) return;
      const current = new Date();
      if (guidanceDailyWindow(current).key !== guidanceDailyWindow(now).key) {
        setGuruOffset(0);
        setNewWindowReady(false);
      }
      setNow(current);
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [now]);

  React.useEffect(() => {
    if (newWindowReady) return;
    const windowInfo = guidanceDailyWindow(now);
    const delay = Math.max(0, new Date(windowInfo.nextAt).getTime() - Date.now()) + 100;
    const timer = window.setTimeout(() => {
      if (!document.hidden && guidanceDailyWindow(new Date()).key !== windowInfo.key) setNewWindowReady(true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [now, newWindowReady]);

  const dailyWindow = guidanceDailyWindow(now);
  const guruCard = selectGuidanceCard({ cadence: 'daily', domain, now, offset: guruOffset });
  const legendCard = selectGuidanceCard({ cadence: 'weekly', now, offset: legendOffset });
  const nextTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dailyWindow.nextAt));
  const showCurrentWindow = () => {
    setNow(new Date());
    setGuruOffset(0);
    setNewWindowReady(false);
  };
  const showCards = value => {
    if (value) showCurrentWindow();
    setHidden(!value);
    try { sessionStorage.setItem(HIDDEN_KEY, value ? '0' : '1'); } catch {}
  };
  const chooseDomain = next => {
    setDomain(next);
    setGuruOffset(0);
    if (hidden) showCards(true);
  };

  return <div className="mentor-shelf">
    <header className="mentor-shelf__intro">
      <div>
        <span className="mentor-shelf__eyebrow">MENTOR SHELF</span>
        <h2>필요할 때 꺼내 보는 관점</h2>
        <p>Guru는 실무 자료에서 한 가지 질문을 건네고, Legend는 판단을 다시 보게 합니다. 읽고 지나가거나 직접 물어볼 수 있습니다.</p>
      </div>
      <Button variant="outline" size="md" onClick={() => onNavigate?.('dashboard/agents/chat?agent=guru')}>대화 시작</Button>
    </header>

    <section className="mentor-shelf__section" aria-labelledby="mentor-shelf-today">
      <div className="mentor-shelf__section-head">
        <h3 id="mentor-shelf-today">지금의 서가</h3>
        <span className="mono">{dailyWindow.date} · 서울 기준 09·14·19시 교체</span>
      </div>

      {hidden ? <div className="mentor-shelf__collapsed">
        <span>멘토 카드를 이 세션에서 접었습니다.</span>
        <Button variant="ghost" size="sm" onClick={() => showCards(true)}>다시 보기</Button>
      </div> : <>
        <div className="mentor-shelf__grid">
          <Card role="article" aria-label="오늘의 Guru 카드" className="mentor-shelf__guru">
            <div className="mentor-shelf__card-head">
              <strong>GURU / 실무 관점</strong>
              <span className="mono">{dailyWindow.label} · {newWindowReady ? '새 관점 준비됨' : `다음 ${nextTime}`}</span>
            </div>
            <SegmentedControl label="Guru 분야" options={DOMAINS} value={domain} onChange={chooseDomain} className="mentor-shelf__domains" />
            <h4 aria-live="polite">{guruCard.person}</h4>
            <p className="mentor-shelf__frame">{guruCard.frame}</p>
            <p className="mentor-shelf__copy">{guruCard.text}</p>
            <div className="mentor-shelf__use">
              <strong>써볼 때</strong>
              <p>{guruCard.useWhen}</p>
            </div>
            <div className="mentor-shelf__question">
              <strong>물어볼 질문</strong>
              <p>{guruCard.question}</p>
            </div>
            <GuidanceSource source={guruCard.source} className="mentor-shelf__source" />
            <div className="mentor-shelf__actions">
              {newWindowReady && <Button variant="outline" size="md" onClick={showCurrentWindow}>새 시간대 관점 보기</Button>}
              {onGuidanceAsk && <Button variant="primary" size="md" onClick={() => onGuidanceAsk(guruCard)}>
                {domain === 'sales' ? '영업 Guru에게 질문 쓰기' : '브랜드 멘토에게 질문 쓰기'}
              </Button>}
              <Button variant="outline" size="md" onClick={() => setGuruOffset(value => value + 1)}>다른 관점</Button>
              <Button variant="ghost" size="md" onClick={() => showCards(false)}>이번 세션에서 숨기기</Button>
            </div>
          </Card>

          <Card role="article" aria-label="이번 주 Legend 카드" className="mentor-shelf__legend">
            <div className="mentor-shelf__card-head">
              <strong>LEGEND / 판단 관점</strong>
              <span className="mono">매주 한 장</span>
            </div>
            <div className="mentor-shelf__rule" aria-hidden="true" />
            <h4 aria-live="polite">{legendCard.person}</h4>
            <p className="mentor-shelf__frame">{legendCard.frame}</p>
            <p className="mentor-shelf__legend-copy">{legendCard.text}</p>
            <div className="mentor-shelf__legend-bottom">
              <div className="mentor-shelf__question mentor-shelf__question--legend">
                <strong>생각해 볼 질문</strong>
                <p>{legendCard.question}</p>
              </div>
              <GuidanceSource source={legendCard.source} className="mentor-shelf__source" />
              <Button variant="ghost" size="md" onClick={() => setLegendOffset(value => value + 1)}>다른 Legend 보기 →</Button>
            </div>
          </Card>
        </div>
        <p className="mentor-shelf__foot">Guru 관점은 서울 기준 하루 세 번 준비됩니다. 읽는 동안 자동으로 넘어가지 않으며, 열람과 넘김은 조언·알림·업무를 생성하지 않습니다.</p>
      </>}
    </section>

    <section className="mentor-shelf__browse" aria-labelledby="mentor-shelf-browse">
      <div className="mentor-shelf__section-head">
        <h3 id="mentor-shelf-browse">다른 분야 둘러보기</h3>
        <span>고른 분야의 지금 카드를 펼칩니다</span>
      </div>
      <div className="mentor-shelf__browse-grid">
        {DOMAINS.map((item, index) => <button
          type="button"
          key={item.key}
          className="mentor-shelf__browse-card hub-card-link"
          aria-pressed={domain === item.key && !hidden}
          onClick={() => chooseDomain(item.key)}
        >
          <span className="mono">0{index + 1} / {item.key.toUpperCase()}</span>
          <strong>{selectGuidanceCard({ cadence: 'daily', domain: item.key, now }).person}</strong>
          <span>{item.label} 분야의 지금 관점 보기 →</span>
        </button>)}
      </div>
    </section>
  </div>;
}
